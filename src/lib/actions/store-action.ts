import { randomUUID } from "node:crypto";
import type { Prisma, PrismaClient } from "../../generated/prisma/client";
import type { PolicyEvaluation } from "../policy/evaluate";
import { appendAuditEvent } from "../audit/chain";

export async function storeAction(
  client: PrismaClient | Prisma.TransactionClient,
  data: Prisma.ActionCreateInput,
): Promise<{ id: string }> {
  return client.action.create({ data, select: { id: true } });
}

type ActionSubmission = {
  id?: string;
  agentId: string;
  agentReasoning: string;
  tool: string;
  parameters: Prisma.InputJsonObject;
};

type ActionDecision = Pick<PolicyEvaluation, "outcome" | "rule_id">;
type ActionStatus = "auto_allowed" | "pending" | "blocked";

function statusForOutcome(outcome: PolicyEvaluation["outcome"]): ActionStatus {
  switch (outcome) {
    case "allow":
      return "auto_allowed";
    case "needs_approval":
      return "pending";
    case "block":
      return "blocked";
  }
}

export async function storeActionWithAudit(
  client: PrismaClient,
  action: ActionSubmission,
  decision: ActionDecision,
): Promise<{ id: string; status: ActionStatus }> {
  const status = statusForOutcome(decision.outcome);

  return client.$transaction(async (transaction) => {
    const stored = await storeAction(transaction, {
      id: action.id ?? randomUUID(),
      agentId: action.agentId,
      agentReasoning: action.agentReasoning,
      tool: action.tool,
      parameters: action.parameters,
      status,
      policyRuleMatched: decision.rule_id,
    });

    await appendAuditEvent(transaction, "action_submitted", {
      action_id: stored.id,
      agent_id: action.agentId,
      tool: action.tool,
      parameters: action.parameters,
      agent_reasoning: action.agentReasoning,
      outcome: decision.outcome,
      status,
      policy_rule_matched: decision.rule_id,
    });

    return { id: stored.id, status };
  }, { maxWait: 15_000, timeout: 30_000 });
}
