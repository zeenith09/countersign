import { createHash, randomUUID } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PrismaClient } from "../../src/generated/prisma/client";
import { decideAction } from "../../src/lib/actions/decide-action";
import { appendAuditEntry, verifyAuditChain, verifyChain, verifyLegacyAuditChain } from "../../src/lib/audit/chain";
import { POST } from "../../src/app/api/actions/[id]/decision/route";
import { handleActionSubmission } from "../../src/lib/actions/submit-action";
import { toolRegistry } from "../../src/lib/tools";

const expectedEndpoint = "ep-lively-heart-b54javzi";
const testTimeout = 45_000;

function testConnection(): string {
  const value = process.env.DATABASE_URL_TEST;
  if (!value) throw new Error("DATABASE_URL_TEST is required.");
  const url = new URL(value);
  const hostname = url.hostname.toLowerCase();
  if (process.env.CI === "true" && hostname === "127.0.0.1" && url.port === "5432" && url.pathname === "/countersign_test") {
    return value;
  }
  if (!hostname.endsWith(".neon.tech") || hostname.split(".")[0].replace(/-pooler$/, "") !== expectedEndpoint) {
    throw new Error("DATABASE_URL_TEST does not target the configured test endpoint.");
  }
  return value;
}

describe.skipIf(process.env.RUN_DECISION_DB_TESTS !== "1")("decision integration on isolated Postgres schemas", () => {
  let admin: PrismaClient;
  let client: PrismaClient;
  let schema: string;
  let schemaCreated: boolean;

  beforeEach(async () => {
    const connectionString = testConnection();
    schema = `decision_test_${randomUUID().replaceAll("-", "")}`;
    schemaCreated = false;
    admin = new PrismaClient({ adapter: new PrismaPg({ connectionString }, { schema: "public" }) });
    await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
    schemaCreated = true;
    await admin.$executeRawUnsafe(`CREATE TYPE "${schema}".action_status AS ENUM ('pending', 'approved', 'denied', 'auto_allowed', 'blocked')`);
    await admin.$executeRawUnsafe(`CREATE TYPE "${schema}".decision_outcome AS ENUM ('approved', 'denied')`);
    await admin.$executeRawUnsafe(`
      CREATE TABLE "${schema}".actions (
        id UUID PRIMARY KEY, agent_id TEXT NOT NULL, tool TEXT NOT NULL,
        parameters JSONB NOT NULL, agent_reasoning TEXT NOT NULL,
        status "${schema}".action_status NOT NULL DEFAULT 'pending',
        policy_rule_matched TEXT, created_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP
      )`);
    await admin.$executeRawUnsafe(`
      CREATE TABLE "${schema}".decisions (
        id UUID PRIMARY KEY, action_id UUID NOT NULL UNIQUE REFERENCES "${schema}".actions(id),
        reviewer TEXT NOT NULL, outcome "${schema}".decision_outcome NOT NULL,
        reason TEXT NOT NULL, edited_parameters JSONB,
        decided_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP
      )`);
    await admin.$executeRawUnsafe(`
      CREATE TABLE "${schema}".audit_log (
        id UUID PRIMARY KEY, sequence BIGINT NOT NULL UNIQUE, event_type TEXT NOT NULL,
        payload JSONB NOT NULL, prev_hash CHAR(64), hash CHAR(64) NOT NULL,
        created_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP
      )`);
    client = new PrismaClient({ adapter: new PrismaPg({ connectionString }, { schema }) });
  }, testTimeout);

  afterEach(async () => {
    if (client) await client.$disconnect();
    if (admin) {
      try {
        if (schemaCreated) await admin.$executeRawUnsafe(`DROP SCHEMA "${schema}" CASCADE`);
      } finally {
        await admin.$disconnect();
      }
    }
  }, testTimeout);

  async function pendingAction() {
    return client.action.create({ data: {
      id: randomUUID(), agentId: "test", tool: "issue_refund",
      parameters: { z: 1, a: { y: 2, b: [3, 1] } }, agentReasoning: "test", status: "pending",
    } });
  }

  it("stores each submitted action with its original parameters and matching audit outcome", async () => {
    const submissions = [
      { tool: "issue_refund", parameters: { amount: 500, nested: { unchanged: true } }, status: 201, outcome: "allow", rule: "other-refunds-allowed", actionStatus: "auto_allowed" },
      { tool: "issue_refund", parameters: { amount: 501, nested: { unchanged: true } }, status: 201, outcome: "needs_approval", rule: "refund-over-500", actionStatus: "pending" },
      { tool: "unsupported_test_tool", parameters: { nested: { unchanged: true } }, status: 403, outcome: "block", rule: "unsupported_tool", actionStatus: "blocked" },
    ] as const;
    const refund = vi.spyOn(toolRegistry, "issue_refund").mockReturnValue({ mocked: true, tool: "issue_refund" });
    try {
      for (const submission of submissions) {
        const request = new Request("http://localhost/api/actions", {
          method: "POST",
          body: JSON.stringify({
            agentId: "test-agent",
            agentReasoning: "test submission",
            tool: submission.tool,
            parameters: submission.parameters,
          }),
        });
        const response = await handleActionSubmission(request, () => client);
        expect(response.status).toBe(submission.status);
        const body = await response.json();
        expect(body).toMatchObject({ outcome: submission.outcome, ruleId: submission.rule, status: submission.actionStatus });
        const action = await client.action.findUniqueOrThrow({ where: { id: body.actionId } });
        expect(action.parameters).toEqual(submission.parameters);
        const entry = await client.auditLog.findFirstOrThrow({ where: { payload: { path: ["action_id"], equals: body.actionId } } });
        expect(entry.eventType).toBe("action_submitted");
        expect(entry.payload).toMatchObject({
          action_id: body.actionId,
          parameters: submission.parameters,
          outcome: submission.outcome,
          policy_rule_matched: submission.rule,
        });
      }
      expect(refund).toHaveBeenCalledOnce();
      expect(await client.action.count()).toBe(3);
      const entries = await client.auditLog.findMany({ orderBy: { sequence: "asc" } });
      expect(entries).toHaveLength(3);
      expect(verifyChain(entries)).toEqual({ ok: true });
    } finally {
      refund.mockRestore();
    }
  }, testTimeout);

  it("rolls back a submission and does not execute its tool if auditing fails", async () => {
    await admin.$executeRawUnsafe(`ALTER TABLE "${schema}".audit_log ADD CONSTRAINT reject_submission CHECK (event_type <> 'action_submitted')`);
    const refund = vi.spyOn(toolRegistry, "issue_refund");
    const logError = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const response = await handleActionSubmission(new Request("http://localhost/api/actions", {
        method: "POST",
        body: JSON.stringify({ agentId: "test-agent", agentReasoning: "test", tool: "issue_refund", parameters: { amount: 500 } }),
      }), () => client);
      expect(response.status).toBe(500);
      expect(refund).not.toHaveBeenCalled();
      expect(await client.action.count()).toBe(0);
      expect(await client.auditLog.count()).toBe(0);
    } finally {
      refund.mockRestore();
      logError.mockRestore();
    }
  }, testTimeout);

  it("allows exactly one reviewer and writes one decision and audit entry", async () => {
    const action = await pendingAction();
    const results = await Promise.all([
      decideAction(action.id, "reviewer one", "approved", "reviewed", client),
      decideAction(action.id, "reviewer two", "denied", "reviewed", client),
    ]);
    expect(results.map((result) => result.kind).sort()).toEqual(["conflict", "ok"]);
    const decisions = await client.decision.findMany();
    const entries = await client.auditLog.findMany({ orderBy: { sequence: "asc" } });
    expect(decisions).toHaveLength(1);
    expect(entries).toHaveLength(1);
    expect((await client.action.findUniqueOrThrow({ where: { id: action.id } })).status).toBe(decisions[0].outcome);
    expect(entries[0].prevHash?.trimEnd()).toBe("GENESIS");
    expect(entries[0].sequence).toBe(BigInt(1));
    expect(verifyAuditChain(entries)).toBe(true);
    expect(verifyAuditChain([{ ...entries[0], createdAt: new Date(entries[0].createdAt.getTime() + 1) }])).toBe(false);
  }, testTimeout);

  it("stores edited approval parameters separately and keeps the audit chain valid", async () => {
    const original = { amount: 750, currency: "USD", orderId: "ORDER-1" };
    const response = await handleActionSubmission(new Request("http://localhost/api/actions", {
      method: "POST",
      body: JSON.stringify({ agentId: "test", agentReasoning: "review", tool: "issue_refund", parameters: original }),
    }), () => client);
    expect(response.status).toBe(201);
    const { actionId } = await response.json();
    const edited = { amount: 500, currency: "USD", orderId: "ORDER-1" };
    const result = await decideAction(actionId, "reviewer", "approved", "reviewed", client, edited);
    expect(result).toMatchObject({ kind: "ok", outcome: "approved", parameters: edited });
    expect((await client.action.findUniqueOrThrow({ where: { id: actionId } })).parameters).toEqual(original);
    expect((await client.decision.findUniqueOrThrow({ where: { actionId } })).editedParameters).toEqual(edited);
    const entries = await client.auditLog.findMany({ orderBy: { sequence: "asc" } });
    expect(entries).toHaveLength(2);
    expect(entries[0].payload).toMatchObject({ parameters: original });
    expect(entries[1].payload).toMatchObject({ edited_parameters: edited });
    expect(verifyChain(entries)).toEqual({ ok: true });
  }, testTimeout);

  it("rejects invalid edits without changing action, decision, or audit rows", async () => {
    const action = await pendingAction();
    const result = await decideAction(action.id, "reviewer", "approved", "reason", client,
      { amount: "invalid", currency: "USD", orderId: "ORDER-1" });
    expect(result.kind).toBe("invalid_edit");
    const stored = await client.action.findUniqueOrThrow({ where: { id: action.id } });
    expect(stored.status).toBe("pending");
    expect(stored.parameters).toEqual(action.parameters);
    expect(await client.decision.count()).toBe(0);
    expect(await client.auditLog.count()).toBe(0);
  }, testTimeout);

  it("stores edited email parameters without changing the original email", async () => {
    const original = { to: "customer@example.com", subject: "Original", body: "Original body" };
    const action = await client.action.create({ data: {
      id: randomUUID(), agentId: "test", tool: "send_email",
      parameters: original, agentReasoning: "review", status: "pending",
    } });
    const edited = { to: "support@countersign.example", subject: "Updated", body: "Updated body" };
    expect(await decideAction(action.id, "reviewer", "approved", "reason", client, edited))
      .toMatchObject({ kind: "ok", parameters: edited });
    expect((await client.action.findUniqueOrThrow({ where: { id: action.id } })).parameters).toEqual(original);
    expect((await client.decision.findUniqueOrThrow({ where: { actionId: action.id } })).editedParameters).toEqual(edited);
    expect(verifyChain(await client.auditLog.findMany())).toEqual({ ok: true });
  }, testTimeout);

  it("rejects edits on denials without writing a decision", async () => {
    const action = await pendingAction();
    const result = await decideAction(action.id, "reviewer", "denied", "reason", client,
      { amount: 25, currency: "USD", orderId: "ORDER-1" });
    expect(result.kind).toBe("invalid_edit");
    expect((await client.action.findUniqueOrThrow({ where: { id: action.id } })).status).toBe("pending");
    expect(await client.decision.count()).toBe(0);
    expect(await client.auditLog.count()).toBe(0);
  }, testTimeout);

  it("accepts only one concurrent reviewer edit and leaves original parameters unchanged", async () => {
    const action = await pendingAction();
    const first = { amount: 25, currency: "USD", orderId: "ORDER-1" };
    const second = { amount: 30, currency: "USD", orderId: "ORDER-2" };
    const results = await Promise.all([
      decideAction(action.id, "reviewer one", "approved", "reason", client, first),
      decideAction(action.id, "reviewer two", "approved", "reason", client, second),
    ]);
    expect(results.map((result) => result.kind).sort()).toEqual(["conflict", "ok"]);
    const winner = results.find((result) => result.kind === "ok");
    expect(winner?.kind).toBe("ok");
    const decisions = await client.decision.findMany();
    expect(decisions).toHaveLength(1);
    if (winner?.kind !== "ok") throw new Error("Expected one winning decision.");
    expect(decisions[0].editedParameters).toEqual(winner.parameters);
    expect((await client.action.findUniqueOrThrow({ where: { id: action.id } })).parameters).toEqual(action.parameters);
    const entries = await client.auditLog.findMany();
    expect(entries).toHaveLength(1);
    expect(entries[0].payload).toMatchObject({ edited_parameters: winner.parameters });
    expect(verifyChain(entries)).toEqual({ ok: true });
  }, testTimeout);

  it("returns not_found and conflict without writing decisions or audit entries", async () => {
    const action = await pendingAction();
    await client.action.update({ where: { id: action.id }, data: { status: "denied" } });
    const invalid = await POST(new Request("http://localhost/api/actions/id/decision", {
      method: "POST",
      body: JSON.stringify({ reviewer: "reviewer", outcome: "approved" }),
    }), { params: Promise.resolve({ id: action.id }) });
    expect(invalid.status).toBe(400);
    expect((await decideAction(randomUUID(), "reviewer", "approved", "reason", client)).kind).toBe("not_found");
    expect((await decideAction(action.id, "reviewer", "approved", "reason", client)).kind).toBe("conflict");
    expect(await client.decision.count()).toBe(0);
    expect(await client.auditLog.count()).toBe(0);
  }, testTimeout);

  it("serializes audit appends for decisions on different actions", async () => {
    const first = await pendingAction();
    const second = await pendingAction();
    const results = await Promise.all([
      decideAction(first.id, "reviewer one", "approved", "reviewed", client),
      decideAction(second.id, "reviewer two", "denied", "reviewed", client),
    ]);
    expect(results.map((result) => result.kind)).toEqual(["ok", "ok"]);
    const entries = await client.auditLog.findMany({ orderBy: { sequence: "asc" } });
    expect(entries.map((entry) => entry.sequence)).toEqual([BigInt(1), BigInt(2)]);
    expect(verifyAuditChain(entries)).toBe(true);
  }, testTimeout);

  it("reports the first broken sequence, previous link, or hash", async () => {
    expect(verifyChain([])).toEqual({ ok: true });
    for (const value of ["first", "second", "third"]) {
      await client.$transaction(async (transaction) => {
        await appendAuditEntry(transaction, "verify_test", { value });
      });
    }
    const readEntries = () => client.auditLog.findMany({ orderBy: { sequence: "asc" } });
    const original = await readEntries();
    expect(verifyChain([...original].reverse())).toEqual({ ok: true });

    await client.auditLog.update({ where: { sequence: BigInt(1) }, data: { prevHash: "0".repeat(64) } });
    expect(verifyChain(await readEntries())).toEqual({
      ok: false,
      brokenAtSequence: BigInt(1),
      reason: "bad_prev_hash",
      message: "Previous hash does not match the preceding entry.",
    });
    await client.auditLog.update({ where: { sequence: BigInt(1) }, data: { prevHash: "GENESIS" } });

    await client.auditLog.update({ where: { sequence: BigInt(2) }, data: { payload: { value: "changed" } } });
    expect(verifyChain(await readEntries())).toEqual({
      ok: false,
      brokenAtSequence: BigInt(2),
      reason: "bad_hash",
      message: "Audit entry hash does not match.",
    });
    await client.auditLog.update({ where: { sequence: BigInt(2) }, data: { payload: { value: "second" } } });

    await client.auditLog.update({ where: { sequence: BigInt(2) }, data: { prevHash: "0".repeat(64) } });
    expect(verifyChain(await readEntries())).toEqual({
      ok: false,
      brokenAtSequence: BigInt(2),
      reason: "bad_prev_hash",
      message: "Previous hash does not match the preceding entry.",
    });
    await client.auditLog.update({ where: { sequence: BigInt(2) }, data: { prevHash: original[1].prevHash } });

    await client.auditLog.delete({ where: { sequence: BigInt(2) } });
    expect(verifyChain(await readEntries())).toEqual({
      ok: false,
      brokenAtSequence: BigInt(2),
      reason: "sequence_gap",
      message: "Missing audit entry in sequence.",
    });
  }, testTimeout);

  it("uses READ COMMITTED and rolls back a decision if the audit insert fails", async () => {
    const [isolation] = await client.$transaction(async (transaction) =>
      transaction.$queryRaw<{ transaction_isolation: string }[]>`SHOW transaction_isolation`
    );
    expect(isolation.transaction_isolation).toBe("read committed");
    const action = await pendingAction();
    await admin.$executeRawUnsafe(`ALTER TABLE "${schema}".audit_log ADD CONSTRAINT reject_audit CHECK (event_type <> 'action_decided')`);
    await expect(decideAction(action.id, "reviewer", "approved", "reason", client)).rejects.toThrow();
    expect(await client.decision.count()).toBe(0);
    expect(await client.auditLog.count()).toBe(0);
    expect((await client.action.findUniqueOrThrow({ where: { id: action.id } })).status).toBe("pending");
  }, testTimeout);

  it("returns busy without writes when the decision transaction expires waiting for a row lock", async () => {
    const action = await pendingAction();
    let locked!: () => void;
    let release!: () => void;
    const lockReady = new Promise<void>((resolve) => { locked = resolve; });
    const holdLock = new Promise<void>((resolve) => { release = resolve; });
    const blocker = client.$transaction(async (transaction) => {
      await transaction.action.update({ where: { id: action.id }, data: { agentReasoning: "test" } });
      locked();
      await holdLock;
    }, { maxWait: 15_000, timeout: 50_000 });
    const timer = setTimeout(() => release(), 32_000);
    try {
      await Promise.race([lockReady, blocker]);
      expect((await decideAction(action.id, "reviewer", "approved", "reason", client)).kind).toBe("busy");
    } finally {
      clearTimeout(timer);
      release();
      await blocker;
    }
    expect(await client.decision.count()).toBe(0);
    expect(await client.auditLog.count()).toBe(0);
    expect((await client.action.findUniqueOrThrow({ where: { id: action.id } })).status).toBe("pending");
  }, 70_000);

  it("preserves JSONB canonicalization and the hashed millisecond timestamp", async () => {
    const action = await pendingAction();
    expect((await decideAction(action.id, "reviewer", "approved", "reason", client)).kind).toBe("ok");
    await client.$transaction(async (transaction) => {
      await appendAuditEntry(transaction, "nested_test", { z: 1, a: { y: 2, b: [3, 1] } });
    });
    const entries = await client.auditLog.findMany({ orderBy: { sequence: "asc" } });
    expect(entries[1].payload).toEqual({ z: 1, a: { y: 2, b: [3, 1] } });
    expect(entries[1].createdAt.toISOString()).toMatch(/\.\d{3}Z$/);
    expect(verifyAuditChain(entries)).toBe(true);
    expect(verifyAuditChain([entries[0], { ...entries[1], payload: { reason: "changed" } }])).toBe(false);
    const roundTrip = await client.action.findUniqueOrThrow({ where: { id: action.id } });
    expect(roundTrip.parameters).toEqual({ z: 1, a: { y: 2, b: [3, 1] } });
  }, testTimeout);

  it("hashes the JSONB-normalized payload so it remains verifiable after storage", async () => {
    await client.$transaction(async (transaction) => {
      await appendAuditEntry(transaction, "number_test", { nested: [-0] });
    });
    const entries = await client.auditLog.findMany({ orderBy: { sequence: "asc" } });
    expect(verifyAuditChain(entries)).toBe(true);
  }, testTimeout);

  it("rejects a legacy chain without changing it or committing a decision", async () => {
    const action = await pendingAction();
    const legacyJson = '{"event_type":"legacy","payload":{"a":1},"prev_hash":null,"sequence":"1"}';
    const legacy = await client.auditLog.create({ data: {
      id: randomUUID(), sequence: BigInt(1), eventType: "legacy", payload: { a: 1 },
      prevHash: null, hash: createHash("sha256").update(legacyJson).digest("hex"),
    } });
    expect(verifyLegacyAuditChain([legacy])).toBe(true);
    await expect(decideAction(action.id, "reviewer", "approved", "reason", client))
      .rejects.toThrow("Cannot append to a legacy or unrecognized audit chain.");
    expect(await client.auditLog.findMany()).toEqual([legacy]);
    expect(await client.decision.count()).toBe(0);
    expect((await client.action.findUniqueOrThrow({ where: { id: action.id } })).status).toBe("pending");
  }, testTimeout);
});
