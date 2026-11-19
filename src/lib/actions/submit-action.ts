import { z } from "zod";
import { Prisma } from "../../generated/prisma/client";
import type { PrismaClient } from "../../generated/prisma/client";
import { databaseTarget, isSeedPayload } from "../../../prisma/seed-identity";
import { storeActionWithAudit } from "./store-action";
import { evaluatePolicy } from "../policy/evaluate";
import { policy } from "../policy/policy";
import { readEnv } from "../config/env.mjs";
import { getPrisma } from "../prisma";
import { toolRegistry } from "../tools";
import {
  actionParametersSchema,
  MAX_AGENT_REASONING_LENGTH,
  validToolParameters,
} from "../tools/parameters";
import { executeMockedTool } from "./execute-mocked-tool";
import {
  HttpError,
  MAX_REQUEST_BODY_BYTES,
  readJsonLimited,
} from "../http/read-json-limited";

const submissionSchema = z.object({
  id: z.uuid().optional(),
  agentId: z.string().min(1).max(100),
  agentReasoning: z.string().min(1).max(MAX_AGENT_REASONING_LENGTH, {
    message: `Agent reasoning must be ${MAX_AGENT_REASONING_LENGTH.toLocaleString("en-US")} characters or fewer.`,
  }),
  tool: z.string().min(1).max(100),
  parameters: actionParametersSchema,
});

function isSupportedTool(tool: string): tool is keyof typeof toolRegistry {
  return Object.prototype.hasOwnProperty.call(toolRegistry, tool);
}

export async function handleActionSubmission(
  request: Request,
  getDatabase: () => PrismaClient = getPrisma,
): Promise<Response> {
  let body: unknown;
  try {
    body = await readJsonLimited(request, MAX_REQUEST_BODY_BYTES);
  } catch (error) {
    if (error instanceof HttpError) return Response.json({ message: error.message }, { status: error.status });
    throw error;
  }

  const parsed = submissionSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({
      message: parsed.error.issues[0]?.message ?? "Invalid action submission.",
    }, { status: 400 });
  }

  const action = parsed.data;
  if (action.id && !isSeedPayload({ ...action, id: action.id })) {
    return Response.json({ message: "Action ID is reserved for its matching seed submission." }, { status: 400 });
  }
  const databaseUrl = readEnv("DATABASE_URL");
  if (action.id && (!databaseUrl ||
      request.headers.get("x-seed-database-target") !== databaseTarget(databaseUrl))) {
    return Response.json({ message: "Seed database does not match the gateway database." }, { status: 400 });
  }
  const supported = isSupportedTool(action.tool);
  const toolParametersValid = supported && validToolParameters(action.tool, action.parameters);
  const decision = !supported
    ? { outcome: "block" as const, rule_id: "unsupported_tool" }
    : !toolParametersValid
      ? { outcome: "block" as const, rule_id: "invalid_parameters" }
      : evaluatePolicy(policy, { tool: action.tool, parameters: action.parameters });

  let stored: { id: string; status: "auto_allowed" | "pending" | "blocked" };
  try {
    stored = await storeActionWithAudit(getDatabase(), {
      ...(action.id ? { id: action.id } : {}),
      agentId: action.agentId,
      agentReasoning: action.agentReasoning,
      tool: action.tool,
      parameters: action.parameters,
    }, decision);
  } catch (error) {
    if (action.id && error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return Response.json({ message: "Seed action ID already exists." }, { status: 409 });
    }
    console.error("Failed to store and audit action submission.");
    return Response.json({ message: "Could not store the action." }, { status: 500 });
  }

  const result = {
    actionId: stored.id,
    outcome: decision.outcome,
    ruleId: decision.rule_id,
    status: stored.status,
  };
  if (decision.outcome === "block") {
    return Response.json({
      ...result,
      message: !supported
        ? "Unsupported tool."
        : decision.rule_id === "invalid_parameters"
          ? "The parameters do not match the tool requirements, so the action is blocked."
          : "Action blocked by policy.",
    }, { status: 403 });
  }
  if (decision.outcome === "needs_approval") {
    return Response.json(result, { status: 201 });
  }
  if (!isSupportedTool(action.tool)) {
    throw new Error("An allowed action must have a supported tool.");
  }

  try {
    const execution = await executeMockedTool(
      stored.id, action.tool, action.parameters, getDatabase,
    );
    if (execution.kind === "invalid_parameters") {
      return Response.json({
        actionId: stored.id,
        message: "Stored action parameters are invalid; the mocked tool was not run.",
      }, { status: 500 });
    }
    return Response.json({ ...result, result: execution.result }, { status: 201 });
  } catch {
    return Response.json({
      actionId: stored.id,
      message: "The mocked tool could not complete.",
    }, { status: 500 });
  }
}
