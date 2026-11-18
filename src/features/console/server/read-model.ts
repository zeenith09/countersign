import "server-only";
import type { PrismaClient } from "../../../generated/prisma/client";
import { policy } from "../../../lib/policy/policy";
import { summarizeAction } from "../../actions/action-summary";
import { formatAge } from "../../actions/format-age";
import type { ConsoleSnapshot } from "../contract";

export async function getConsoleReadModel(prisma: PrismaClient): Promise<ConsoleSnapshot> {
  const [pending, counts, recent, audit] = await Promise.all([
    prisma.action.findMany({
      where: { status: "pending" },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    }),
    prisma.action.groupBy({ by: ["status"], _count: { _all: true } }),
    prisma.action.findMany({
      include: { decision: true },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 100,
    }),
    prisma.auditLog.findMany({ orderBy: { sequence: "desc" }, take: 100 }),
  ]);
  const now = Date.now();

  return {
    actions: pending.map((action) => ({
      id: action.id,
      tool: action.tool,
      title: action.tool.replaceAll("_", " "),
      summary: summarizeAction(action.tool, action.parameters),
      reasoning: action.agentReasoning,
      age: formatAge(action.createdAt, now),
      created: action.createdAt.getTime(),
      status: "pending",
      risk: "Risk not assessed",
      rule: action.policyRuleMatched ?? "Unknown (not recorded)",
      ruleDescription: policy.rules.find((rule) => rule.id === action.policyRuleMatched)?.description
        ?? (action.policyRuleMatched === "no_rule_match"
          ? "No policy rule matched; reviewer approval is required."
          : action.policyRuleMatched === "unsupported_tool"
            ? "The submitted tool is not registered and is blocked."
            : "No description available"),
      parameters: action.parameters,
    })),
    counts: Object.fromEntries(counts.map((entry) => [entry.status, entry._count._all])),
    activity: recent.map((action) => ({
      id: action.id,
      title: action.tool.replaceAll("_", " "),
      detail: summarizeAction(action.tool, action.parameters),
      status: action.status,
      actor: action.decision
        ? action.decision.reviewer.trim()
          ? `${action.decision.reviewer.trim()} · Human decision`
          : "No reviewer decision"
        : action.status === "pending"
          ? "Awaiting human decision"
          : "No reviewer decision",
      rule: action.policyRuleMatched ?? "Unknown (not recorded)",
      time: formatAge(action.createdAt, now),
    })),
    audit: audit.map((entry) => ({
      id: entry.id,
      sequence: entry.sequence.toString(),
      event: entry.eventType,
      hash: entry.hash,
      createdAt: entry.createdAt.toISOString(),
      principal: typeof entry.payload === "object" && entry.payload !== null && !Array.isArray(entry.payload)
        ? typeof entry.payload.reviewer === "string" && entry.payload.reviewer.trim()
          ? entry.payload.reviewer.trim()
          : typeof entry.payload.agent_id === "string" && entry.payload.agent_id.trim()
            ? entry.payload.agent_id.trim()
            : "Unknown (not recorded)"
        : "Unknown (not recorded)",
    })),
  };
}
