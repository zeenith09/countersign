import { randomUUID } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { z } from "zod";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { readEnv } from "../../src/lib/config/env.mjs";
import { PrismaClient } from "../../src/generated/prisma/client";
import { handleActionSubmission } from "../../src/lib/actions/submit-action";
import { verifyAuditChain } from "../../src/lib/audit/chain";
import { assertSpikeTarget } from "./spike-target";

const testTimeout = 45_000;
const responseSchema = z.object({
  actionId: z.uuid(),
  outcome: z.enum(["allow", "needs_approval", "block"]),
  ruleId: z.string(),
  status: z.enum(["auto_allowed", "pending", "blocked"]),
  message: z.string().optional(),
  result: z.unknown().optional(),
});

const submissions = [
  {
    name: "allowed refund at the limit",
    action: {
      agentId: "audit-spike-agent",
      agentReasoning: "Refund the customer at the limit.",
      tool: "issue_refund",
      parameters: { amount: 500, currency: "USD", orderId: "AUDIT-500" },
    },
    httpStatus: 201,
    outcome: "allow",
    status: "auto_allowed",
    ruleId: "other-refunds-allowed",
  },
  {
    name: "refund above the limit",
    action: {
      agentId: "audit-spike-agent",
      agentReasoning: "Request review for a refund above the limit.",
      tool: "issue_refund",
      parameters: { amount: 501, currency: "USD", orderId: "AUDIT-501" },
    },
    httpStatus: 201,
    outcome: "needs_approval",
    status: "pending",
    ruleId: "refund-over-500",
  },
  {
    name: "internal email with untouched submitted parameters",
    action: {
      agentId: "audit-spike-agent",
      agentReasoning: "Send the prepared internal message.",
      tool: "send_email",
      parameters: {
        to: "reviewer@countersign.example",
        subject: "Audit test",
        body: "Fictional test message.",
        recipient_domain: "caller-supplied.example",
      },
    },
    httpStatus: 201,
    outcome: "allow",
    status: "auto_allowed",
    ruleId: "internal-domain-emails-allowed",
  },
  {
    name: "policy-blocked deletion",
    action: {
      agentId: "audit-spike-agent",
      agentReasoning: "Request deletion of a fictional record.",
      tool: "delete_record",
      parameters: { recordId: "AUDIT-DELETE" },
    },
    httpStatus: 403,
    outcome: "block",
    status: "blocked",
    ruleId: "delete-record-blocked",
  },
  {
    name: "unsupported tool",
    action: {
      agentId: "audit-spike-agent",
      agentReasoning: "Attempt an unsupported fictional operation.",
      tool: "unsupported_audit_test_tool",
      parameters: { value: "untouched" },
    },
    httpStatus: 403,
    outcome: "block",
    status: "blocked",
    ruleId: "unsupported_tool",
  },
  {
    name: "supported action with no rule match",
    action: {
      agentId: "audit-spike-agent",
      agentReasoning: "A refund missing its amount must be reviewed.",
      tool: "issue_refund",
      parameters: { currency: "USD", orderId: "AUDIT-NO-RULE" },
    },
    httpStatus: 201,
    outcome: "needs_approval",
    status: "pending",
    ruleId: "no_rule_match",
  },
] as const;

function request(body: unknown): Request {
  return new Request("http://localhost/api/actions", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function getSpikeConnection() {
  if (readEnv("RUN_DB_SPIKE") !== "1") {
    throw new Error("Set RUN_DB_SPIKE=1 only after confirming the isolated spike branch.");
  }
  const mode = readEnv("SPIKE_DB_MODE") ?? "pooled";
  if (mode !== "pooled" && mode !== "direct") {
    throw new Error("SPIKE_DB_MODE must be pooled or direct.");
  }
  const variable = mode === "direct" ? "SPIKE_DIRECT_URL" : "SPIKE_DATABASE_URL";
  const connectionString = readEnv(variable);
  if (!connectionString) {
    throw new Error(`${variable} must point to the isolated spike branch.`);
  }
  assertSpikeTarget(connectionString, variable);
  return connectionString;
}

describe.skipIf(readEnv("RUN_DB_SPIKE") !== "1")("hosted Postgres action audit spike", () => {
  let admin: PrismaClient;
  let prisma: PrismaClient;
  let schemaName = "";
  let schemaCreated = false;

  beforeAll(async () => {
    const connectionString = getSpikeConnection();
    schemaName = `countersign_audit_spike_${randomUUID().replaceAll("-", "")}`;
    admin = new PrismaClient({
      adapter: new PrismaPg({ connectionString }, { schema: "public" }),
    });

    await admin.$executeRawUnsafe(`CREATE SCHEMA "${schemaName}"`);
    schemaCreated = true;
    await admin.$executeRawUnsafe(
      `CREATE TYPE "${schemaName}".action_status AS ENUM ('pending', 'approved', 'denied', 'auto_allowed', 'blocked')`,
    );
    await admin.$executeRawUnsafe(`
      CREATE TABLE "${schemaName}".actions (
        id UUID PRIMARY KEY,
        agent_id TEXT NOT NULL,
        tool TEXT NOT NULL,
        parameters JSONB NOT NULL,
        agent_reasoning TEXT NOT NULL,
        status "${schemaName}".action_status NOT NULL DEFAULT 'pending',
        policy_rule_matched TEXT,
        created_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await admin.$executeRawUnsafe(`
      CREATE TABLE "${schemaName}".audit_log (
        id UUID PRIMARY KEY,
        sequence BIGINT NOT NULL UNIQUE,
        event_type TEXT NOT NULL,
        payload JSONB NOT NULL,
        prev_hash CHAR(64),
        hash CHAR(64) NOT NULL,
        created_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CHECK (payload->>'tool' <> 'force-audit-failure')
      )
    `);

    prisma = new PrismaClient({
      adapter: new PrismaPg({ connectionString }, { schema: schemaName }),
    });
  }, testTimeout);

  afterAll(async () => {
    try {
      if (prisma) await prisma.$disconnect();
    } finally {
      if (admin) {
        try {
          if (schemaCreated) {
            await admin.$executeRawUnsafe(`DROP SCHEMA "${schemaName}" CASCADE`);
          }
        } finally {
          await admin.$disconnect();
        }
      }
    }
  }, testTimeout);

  it("writes exactly one matching, verifiable audit event for every stored submission", async () => {
    const results: Array<{
      outcome: (typeof submissions)[number]["outcome"];
      status: (typeof submissions)[number]["status"];
      ruleId: string;
      actionId: string;
    }> = [];

    for (const submission of submissions) {
      const response = await handleActionSubmission(request(submission.action), () => prisma);
      expect(response.status).toBe(submission.httpStatus);
      const result = responseSchema.parse(await response.json());
      expect(result).toMatchObject({
        outcome: submission.outcome,
        status: submission.status,
        ruleId: submission.ruleId,
      });

      const action = await prisma.action.findUniqueOrThrow({
        where: { id: result.actionId },
      });
      expect(action).toMatchObject({
        agentId: submission.action.agentId,
        agentReasoning: submission.action.agentReasoning,
        tool: submission.action.tool,
        status: submission.status,
        policyRuleMatched: result.ruleId,
      });
      expect(action.parameters).toEqual(submission.action.parameters);
      results.push({
        outcome: result.outcome,
        status: result.status,
        ruleId: result.ruleId,
        actionId: result.actionId,
      });

      const auditEntries = await prisma.auditLog.findMany({
        orderBy: { sequence: "asc" },
      });
      expect(auditEntries).toHaveLength(results.length);
      const lastEntry = auditEntries.at(-1);
      expect(lastEntry?.eventType).toBe("action_submitted");
      expect(lastEntry?.payload).toEqual({
        action_id: result.actionId,
        agent_id: submission.action.agentId,
        tool: submission.action.tool,
        parameters: submission.action.parameters,
        agent_reasoning: submission.action.agentReasoning,
        outcome: result.outcome,
        status: result.status,
        policy_rule_matched: result.ruleId,
      });
      expect(verifyAuditChain(auditEntries)).toBe(true);
    }
  }, testTimeout);

  it("does not store or audit a Zod-invalid submission", async () => {
    const beforeActions = await prisma.action.count();
    const beforeAuditEntries = await prisma.auditLog.count();
    const response = await handleActionSubmission(request({
      agentId: "audit-spike-agent",
      agentReasoning: "Invalid because parameters are not an object.",
      tool: "issue_refund",
      parameters: [],
    }), () => prisma);

    expect(response.status).toBe(400);
    expect(await prisma.action.count()).toBe(beforeActions);
    expect(await prisma.auditLog.count()).toBe(beforeAuditEntries);
  }, testTimeout);

  it("rolls back the action when its audit append fails", async () => {
    const beforeActions = await prisma.action.count();
    const beforeAuditEntries = await prisma.auditLog.count();
    const response = await handleActionSubmission(request({
      agentId: "audit-spike-agent",
      agentReasoning: "Force an audit constraint failure.",
      tool: "force-audit-failure",
      parameters: { value: "test" },
    }), () => prisma);

    expect(response.status).toBe(500);
    expect(await prisma.action.count()).toBe(beforeActions);
    expect(await prisma.auditLog.count()).toBe(beforeAuditEntries);
  }, testTimeout);

  it("serializes concurrent appends into one valid hash chain", async () => {
    const concurrentSubmissions = Array.from({ length: 3 }, (_, index) => ({
      agentId: "audit-spike-agent",
      agentReasoning: `Concurrent audit submission ${index}.`,
      tool: "issue_refund",
      parameters: { amount: 10 + index, currency: "USD", orderId: `AUDIT-CONCURRENT-${index}` },
    }));

    const responses = await Promise.all(
      concurrentSubmissions.map((submission) =>
        handleActionSubmission(request(submission), () => prisma)
      ),
    );
    expect(responses.map((response) => response.status)).toEqual([201, 201, 201]);

    const actions = await prisma.action.findMany({
      where: { agentReasoning: { startsWith: "Concurrent audit submission " } },
    });
    const auditEntries = await prisma.auditLog.findMany({
      orderBy: { sequence: "asc" },
    });
    expect(actions).toHaveLength(concurrentSubmissions.length);
    expect(auditEntries).toHaveLength(submissions.length + concurrentSubmissions.length);
    expect(auditEntries.map((entry) => entry.sequence)).toEqual(
      Array.from({ length: auditEntries.length }, (_, index) => BigInt(index + 1)),
    );
    expect(verifyAuditChain(auditEntries)).toBe(true);
  }, testTimeout);
});
