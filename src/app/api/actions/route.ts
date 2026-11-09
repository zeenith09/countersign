import { z } from "zod";
import type { Prisma } from "../../../generated/prisma/client";
import { storeAction } from "../../../lib/actions/store-action";
import { evaluatePolicy } from "../../../lib/policy/evaluate";
import { policy } from "../../../lib/policy/policy";
import { getPrisma } from "../../../lib/prisma";
import { toolRegistry } from "../../../lib/tools";

export const runtime = "nodejs";

const submissionSchema = z.object({
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

export async function POST(request: Request): Promise<Response> {
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
  const supported = isSupportedTool(action.tool);
  const decision = supported
    ? evaluatePolicy(policy, { tool: action.tool, parameters: action.parameters })
    : { outcome: "block" as const, rule_id: "unsupported_tool" };
  const status = decision.outcome === "allow"
    ? "auto_allowed"
    : decision.outcome === "needs_approval" ? "pending" : "blocked";

  let stored: { id: string };
  try {
    stored = await storeAction(getPrisma(), {
      agentId: action.agentId,
      agentReasoning: action.agentReasoning,
      tool: action.tool,
      parameters: action.parameters,
      status,
      policyRuleMatched: decision.rule_id,
    });
  } catch {
    return Response.json({ message: "Could not store the action." }, { status: 500 });
  }

  const result = {
    actionId: stored.id,
    outcome: decision.outcome,
    ruleId: decision.rule_id,
    status,
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
