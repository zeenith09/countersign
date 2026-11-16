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
      rule: action.policyRuleMatched ?? "Not recorded",
      ruleDescription: policy.rules.find((rule) => rule.id === action.policyRuleMatched)?.description
        ?? "No configured rule description is available.",
      parameters: action.parameters,
    })),
    counts: Object.fromEntries(counts.map((entry) => [entry.status, entry._count._all])),
    activity: recent.map((action) => ({
      id: action.id,
      title: action.tool.replaceAll("_", " "),
      detail: summarizeAction(action.tool, action.parameters),
      status: action.status,
      actor: action.decision
        ? `${action.decision.reviewer} · Human decision`
        : action.status === "pending"
          ? "Awaiting human decision"
          : `Policy · ${action.policyRuleMatched ?? "Not recorded"}`,
      time: formatAge(action.createdAt, now),
    })),
    audit: audit.map((entry) => ({
      id: entry.id,
      sequence: entry.sequence.toString(),
      event: entry.eventType,
      hash: entry.hash,
      createdAt: entry.createdAt.toISOString(),
      principal: typeof entry.payload === "object" && entry.payload !== null && !Array.isArray(entry.payload)
        ? typeof entry.payload.reviewer === "string" ? entry.payload.reviewer
          : typeof entry.payload.agent_id === "string" ? entry.payload.agent_id : "Not recorded"
        : "Not recorded",
    })),
  };
}
