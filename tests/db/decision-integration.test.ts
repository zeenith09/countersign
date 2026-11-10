import { createHash, randomUUID } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { PrismaClient } from "../../src/generated/prisma/client";
import { decideAction } from "../../src/lib/actions/decide-action";
import { appendAuditEvent, verifyAuditChain, verifyLegacyAuditChain } from "../../src/lib/audit/chain";
import { POST } from "../../src/app/api/actions/[id]/decision/route";

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
      await appendAuditEvent(transaction, "nested_test", { z: 1, a: { y: 2, b: [3, 1] } });
    });
    const entries = await client.auditLog.findMany({ orderBy: { sequence: "asc" } });
    expect(entries[1].payload).toEqual({ z: 1, a: { y: 2, b: [3, 1] } });
    expect(entries[1].createdAt.toISOString()).toMatch(/\.\d{3}Z$/);
    expect(verifyAuditChain(entries)).toBe(true);
    expect(verifyAuditChain([entries[0], { ...entries[1], payload: { reason: "changed" } }])).toBe(false);
    const roundTrip = await client.action.findUniqueOrThrow({ where: { id: action.id } });
    expect(roundTrip.parameters).toEqual({ z: 1, a: { y: 2, b: [3, 1] } });
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
