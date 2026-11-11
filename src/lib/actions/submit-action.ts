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

const submissionSchema = z.object({
  id: z.uuid().optional(),
  agentId: z.string().min(1),
  agentReasoning: z.string(),
  tool: z.string().min(1),
  parameters: z.custom<Prisma.InputJsonObject>((value) =>
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    z.json().safeParse(value).success
  ),
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
    body = await request.json();
  } catch (error) {
    if (error instanceof SyntaxError) {
      return Response.json({ message: "Invalid action submission." }, { status: 400 });
    }
    throw error;
  }

  const parsed = submissionSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ message: "Invalid action submission." }, { status: 400 });
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
  const decision = supported
    ? evaluatePolicy(policy, { tool: action.tool, parameters: action.parameters })
    : { outcome: "block" as const, rule_id: "unsupported_tool" };

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
    console.error("Failed to store and audit action submission.", error);
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
      message: supported ? "Action blocked by policy." : "Unsupported tool.",
    }, { status: 403 });
  }
  if (decision.outcome === "needs_approval") {
    return Response.json(result, { status: 201 });
  }
  if (!isSupportedTool(action.tool)) {
    throw new Error("An allowed action must have a supported tool.");
  }

  try {
    const toolResult = toolRegistry[action.tool](stored.id);
    return Response.json({ ...result, result: toolResult }, { status: 201 });
  } catch {
    return Response.json({
      actionId: stored.id,
      message: "The mocked tool could not complete.",
    }, { status: 500 });
  }
}
