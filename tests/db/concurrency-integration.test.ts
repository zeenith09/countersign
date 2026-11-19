import { randomUUID } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readEnv } from "../../src/lib/config/env.mjs";
import { PrismaClient } from "../../src/generated/prisma/client";
import { POST as decideRoute } from "../../src/app/api/actions/[id]/decision/route";
import { decideAction } from "../../src/lib/actions/decide-action";
import { handleActionSubmission } from "../../src/lib/actions/submit-action";
import { appendAuditEntry, verifyChain } from "../../src/lib/audit/chain";
import { toolRegistry } from "../../src/lib/tools";
import { assertSpikeTarget } from "./spike-target";
import { createActionTestTables } from "./action-test-schema";
import { testConnection } from "./test-target";

const transactionOptions = { maxWait: 15_000, timeout: 30_000 };
const testTimeout = 90_000;
const globalForPrisma = globalThis as typeof globalThis & { prisma?: PrismaClient };
const auditLockKey = BigInt("0x434f554e54455253");

function barrier() {
  let release!: () => void;
  const promise = new Promise<void>((resolve) => { release = resolve; });
  return { promise, release };
}

async function waitForBlockedBackends(
  observer: PrismaClient,
  blockerPid: number,
  matches: (row: { pid: number; query: string; wait_event: string }) => boolean,
  minimum = 2,
) {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    const rows = await observer.$queryRaw<{
      pid: number;
      query: string;
      wait_event: string;
      blockers: number[];
    }[]>`
      SELECT pid, query, wait_event, pg_blocking_pids(pid) AS blockers
      FROM pg_stat_activity
      WHERE datname = current_database() AND wait_event_type = 'Lock'
    `;
    const byPid = new Map(rows.map((row) => [row.pid, row]));
    function reachesBlocker(pid: number, visited = new Set<number>()): boolean {
      if (pid === blockerPid) return true;
      if (visited.has(pid)) return false;
      visited.add(pid);
      return byPid.get(pid)?.blockers.some((next) => reachesBlocker(next, visited)) ?? false;
    }
    const blocked = rows.filter((row) => matches(row) && reachesBlocker(row.pid));
    if (blocked.length >= minimum) return blocked.map((row) => row.pid);
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`Did not observe ${minimum} distinct transactions blocked behind the test lock within 10 seconds.`);
}

function spikeConnection(): string {
  const mode = readEnv("SPIKE_DB_MODE") ?? "pooled";
  if (mode !== "pooled" && mode !== "direct") {
    throw new Error("SPIKE_DB_MODE must be pooled or direct.");
  }
  const variable = mode === "pooled" ? "SPIKE_DATABASE_URL" : "SPIKE_DIRECT_URL";
  const connectionString = readEnv(variable);
  if (!connectionString) throw new Error(`${variable} must point to the isolated spike branch.`);
  assertSpikeTarget(connectionString, variable);
  return connectionString;
}

function decisionRequest(reviewer = "reviewer", outcome: "approved" | "denied" = "approved") {
  return new Request("http://localhost/api/actions/id/decision", {
    method: "POST",
    body: JSON.stringify({ reviewer, outcome, reason: "reviewed" }),
  });
}

describe.skipIf(readEnv("RUN_DB_SPIKE") !== "1" && readEnv("RUN_CONCURRENCY_DB_TESTS") !== "1")("real Postgres concurrency integration", () => {
  let admin: PrismaClient;
  let client: PrismaClient;
  let schema = "";
  let schemaCreated = false;
  let previousPrisma: PrismaClient | undefined;

  beforeEach(async () => {
    const connectionString = readEnv("RUN_CONCURRENCY_DB_TESTS") === "1" ? testConnection() : spikeConnection();
    schema = `countersign_concurrency_${randomUUID().replaceAll("-", "")}`;
    schemaCreated = false;
    previousPrisma = globalForPrisma.prisma;
    admin = new PrismaClient({ adapter: new PrismaPg({ connectionString }, { schema: "public" }) });
    await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
    schemaCreated = true;
    await createActionTestTables(admin, schema);
    client = new PrismaClient({ adapter: new PrismaPg({ connectionString }, { schema }) });
    globalForPrisma.prisma = client;
  }, testTimeout);

  afterEach(async () => {
    globalForPrisma.prisma = previousPrisma;
    vi.restoreAllMocks();
    try {
      if (client) await client.$disconnect();
    } finally {
      if (admin) {
        try {
          if (schemaCreated) await admin.$executeRawUnsafe(`DROP SCHEMA "${schema}" CASCADE`);
        } finally {
          await admin.$disconnect();
        }
      }
    }
  }, testTimeout);

  async function createPendingAction() {
    return client.action.create({ data: {
      id: randomUUID(),
      agentId: "concurrency-test",
      tool: "issue_refund",
      parameters: { amount: 750, orderId: "ORDER-1" },
      agentReasoning: "test",
      status: "pending",
    } });
  }

  it("stores and audits invalid tool parameters as blocked without executing a tool", async () => {
    const tools = (Object.keys(toolRegistry) as (keyof typeof toolRegistry)[])
      .map((tool) => vi.spyOn(toolRegistry, tool));
    const parameters = {
      amount: 500,
      orderId: "ORDER-1",
      unexpected: "preserved",
    };
    const response = await handleActionSubmission(new Request("http://localhost/api/actions", {
      method: "POST",
      body: JSON.stringify({
        agentId: "test",
        agentReasoning: "test",
        tool: "issue_refund",
        parameters,
      }),
    }), () => client);

    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body).toMatchObject({
      outcome: "block",
      ruleId: "invalid_parameters",
      status: "blocked",
    });
    const stored = await client.action.findUniqueOrThrow({ where: { id: body.actionId } });
    expect(stored).toMatchObject({
      tool: "issue_refund",
      parameters,
      status: "blocked",
      policyRuleMatched: "invalid_parameters",
    });
    const entries = await client.auditLog.findMany({ orderBy: { sequence: "asc" } });
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      eventType: "action_submitted",
      payload: {
        action_id: body.actionId,
        parameters,
        outcome: "block",
        policy_rule_matched: "invalid_parameters",
      },
    });
    expect(verifyChain(entries)).toEqual({ ok: true });
    for (const tool of tools) expect(tool).not.toHaveBeenCalled();
  }, testTimeout);

  it("audits and blocks execution after stored parameters are mutated invalid", async () => {
    const action = await client.action.create({ data: {
      id: randomUUID(),
      agentId: "concurrency-test",
      tool: "issue_refund",
      parameters: { amount: 500, orderId: "ORDER-1" },
      agentReasoning: "test",
      status: "pending",
    } });
    await client.action.update({
      where: { id: action.id },
      data: { parameters: { amount: 500, orderId: "order-1" } },
    });
    const tools = (Object.keys(toolRegistry) as (keyof typeof toolRegistry)[])
      .map((tool) => vi.spyOn(toolRegistry, tool));

    const response = await decideRoute(decisionRequest(), {
      params: Promise.resolve({ id: action.id }),
    });

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      actionId: action.id,
      message: "Approved action parameters are invalid; tool was not run.",
    });
    expect((await client.action.findUniqueOrThrow({ where: { id: action.id } })).status)
      .toBe("approved");
    expect(await client.decision.count()).toBe(1);
    const entries = await client.auditLog.findMany({ orderBy: { sequence: "asc" } });
    expect(entries.map((entry) => entry.eventType)).toEqual([
      "action_decided",
      "tool_execution_rejected",
    ]);
    expect(entries[1].payload).toMatchObject({
      action_id: action.id,
      tool: "issue_refund",
      reason: "invalid_parameters",
    });
    expect(verifyChain(entries)).toEqual({ ok: true });
    for (const tool of tools) expect(tool).not.toHaveBeenCalled();
  }, testTimeout);

  it("correlates two action decisions when their responses finish in reverse order", async () => {
    const first = await createPendingAction();
    const second = await createPendingAction();
    const locked = barrier();
    const release = barrier();
    const completion: string[] = [];
    let blockerPid = 0;
    const blocker = client.$transaction(async (transaction) => {
      [blockerPid] = (await transaction.$queryRaw<{ pid: number }[]>`SELECT pg_backend_pid() AS pid`)
        .map((row) => row.pid);
      await transaction.action.update({ where: { id: first.id }, data: { agentReasoning: first.agentReasoning } });
      locked.release();
      await release.promise;
    }, { maxWait: 15_000, timeout: 45_000 });

    try {
      await Promise.race([locked.promise, blocker]);
      const firstResponse = decideRoute(decisionRequest("first reviewer", "approved"), {
        params: Promise.resolve({ id: first.id }),
      }).then((response) => { completion.push(first.id); return response; });
      try {
        await waitForBlockedBackends(admin, blockerPid, (row) =>
          row.query.includes(schema) && row.query.includes("actions"), 1);
        const secondResponse = await decideRoute(decisionRequest("second reviewer", "denied"), {
          params: Promise.resolve({ id: second.id }),
        });
        completion.push(second.id);
        expect(secondResponse.status).toBe(200);
        expect(await secondResponse.json()).toMatchObject({ actionId: second.id, outcome: "denied" });
      } finally {
        release.release();
      }
      const response = await firstResponse;
      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({ actionId: first.id, outcome: "approved" });
      expect(completion).toEqual([second.id, first.id]);
      const decisions = await client.decision.findMany({ orderBy: { reviewer: "asc" } });
      expect(decisions.map(({ actionId, reviewer, outcome }) => ({ actionId, reviewer, outcome }))).toEqual([
        { actionId: first.id, reviewer: "first reviewer", outcome: "approved" },
        { actionId: second.id, reviewer: "second reviewer", outcome: "denied" },
      ]);
      expect((await client.action.findUniqueOrThrow({ where: { id: first.id } })).status).toBe("approved");
      expect((await client.action.findUniqueOrThrow({ where: { id: second.id } })).status).toBe("denied");
      const audit = await client.auditLog.findMany({ orderBy: { sequence: "asc" } });
      expect(audit).toHaveLength(2);
      for (const decision of decisions) {
        expect(audit.filter((entry) => {
          const payload = entry.payload;
          return payload !== null && typeof payload === "object" && !Array.isArray(payload) &&
            payload.action_id === decision.actionId && payload.decision_id === decision.id;
        })).toHaveLength(1);
      }
      expect(verifyChain(audit)).toEqual({ ok: true });
    } finally {
      release.release();
      await blocker;
    }
  }, testTimeout);

  it("allows exactly one of two competing decisions", async () => {
    const action = await createPendingAction();
    const tool = vi.spyOn(toolRegistry, "issue_refund");
    const locked = barrier();
    const release = barrier();
    let blockerPid = 0;
    const blocker = client.$transaction(async (transaction) => {
      [blockerPid] = (await transaction.$queryRaw<{ pid: number }[]>`SELECT pg_backend_pid() AS pid`)
        .map((row) => row.pid);
      await transaction.action.update({ where: { id: action.id }, data: { agentReasoning: action.agentReasoning } });
      locked.release();
      await release.promise;
    }, { maxWait: 15_000, timeout: 45_000 });
    let results: Awaited<ReturnType<typeof decideAction>>[] = [];
    try {
      await Promise.race([locked.promise, blocker]);
      const attempts = Promise.allSettled([
        decideAction(action.id, "reviewer one", "approved", "reviewed", client),
        decideAction(action.id, "reviewer two", "approved", "reviewed", client),
      ]);
      try {
        const blocked = await waitForBlockedBackends(admin, blockerPid, (row) =>
          row.query.includes(schema) && row.query.includes("actions"),
        );
        expect(new Set(blocked).size).toBe(2);
      } finally {
        release.release();
        const settled = await attempts;
        const failures = settled.filter((result) => result.status === "rejected");
        expect(failures).toEqual([]);
        results = settled.flatMap((result) => result.status === "fulfilled" ? [result.value] : []);
      }
    } finally {
      release.release();
      await blocker;
    }

    expect(results.map((result) => result.kind).sort()).toEqual(["conflict", "ok"]);
    expect(tool).not.toHaveBeenCalled();
    const decisions = await client.decision.findMany();
    const entries = await client.auditLog.findMany();
    expect(decisions).toHaveLength(1);
    expect(decisions[0]).toMatchObject({ actionId: action.id, outcome: "approved" });
    expect((await client.action.findUniqueOrThrow({ where: { id: action.id } })).status).toBe("approved");
    expect(entries).toHaveLength(1);
    expect(entries[0].payload).toMatchObject({ action_id: action.id, decision_id: decisions[0].id });
    expect(verifyChain(entries)).toEqual({ ok: true });
  }, testTimeout);

  it("serializes 20 and then 40 concurrent audit transactions without gaps", async () => {
    for (const count of [20, 40]) {
      expect(await client.auditLog.count()).toBe(0);
      const backendPids = new Set<number>();
      const locked = barrier();
      const release = barrier();
      let blockerPid = 0;
      const blocker = admin.$transaction(async (transaction) => {
        const [row] = await transaction.$queryRaw<{ pid: number }[]>`SELECT pg_backend_pid() AS pid`;
        blockerPid = row.pid;
        await transaction.$queryRaw`SELECT pg_advisory_xact_lock(${auditLockKey}::bigint)::text`;
        locked.release();
        await release.promise;
      }, { maxWait: 15_000, timeout: 45_000 });
      let results: PromiseSettledResult<void>[] = [];
      try {
        await Promise.race([locked.promise, blocker]);
        const attempts = Promise.allSettled(Array.from({ length: count }, (_, index) =>
          client.$transaction(async (transaction) => {
            const [row] = await transaction.$queryRaw<{ pid: number }[]>`SELECT pg_backend_pid() AS pid`;
            backendPids.add(row.pid);
            await appendAuditEntry(transaction, "concurrent_test", { index });
          }, transactionOptions),
        ));
        try {
          const blocked = await waitForBlockedBackends(admin, blockerPid, (row) =>
            backendPids.has(row.pid) && row.wait_event === "advisory" && row.query.includes("pg_advisory_xact_lock"),
          );
          expect(new Set(blocked).size).toBeGreaterThanOrEqual(2);
        } finally {
          release.release();
          results = await attempts;
        }
      } finally {
        release.release();
        await blocker;
      }
      const failures = results.filter((result) => result.status === "rejected");
      expect(failures).toEqual([]);
      expect(backendPids.size).toBeGreaterThan(1);
      const entries = await client.auditLog.findMany({ orderBy: { sequence: "asc" } });
      expect(entries).toHaveLength(count);
      expect(entries.map((entry) => entry.sequence)).toEqual(
        Array.from({ length: count }, (_, index) => BigInt(index + 1)),
      );
      expect(entries.map((entry) => entry.payload)).toEqual(expect.arrayContaining(
        Array.from({ length: count }, (_, index) => ({ index })),
      ));
      expect(entries[0].prevHash?.trimEnd()).toBe("GENESIS");
      for (let index = 1; index < entries.length; index++) {
        expect(entries[index].prevHash).toBe(entries[index - 1].hash);
      }
      expect(verifyChain(entries)).toEqual({ ok: true });
      await client.auditLog.deleteMany();
    }
  }, testTimeout);

  it("reports the exact sequence of a payload changed through SQL", async () => {
    for (const index of [1, 2, 3]) {
      await client.$transaction(
        (transaction) => appendAuditEntry(transaction, "tamper_test", { index }),
        transactionOptions,
      );
    }
    const original = await client.auditLog.findMany({ orderBy: { sequence: "asc" } });
    expect(verifyChain(original)).toEqual({ ok: true });
    for (const sequence of [1, 2, 3]) {
      const changed = await admin.$executeRawUnsafe(
        `UPDATE "${schema}".audit_log SET payload = $1::jsonb WHERE sequence = $2`,
        JSON.stringify({ index: 99 }),
        BigInt(sequence),
      );
      expect(changed).toBe(1);
      const entries = await client.auditLog.findMany({ orderBy: { sequence: "asc" } });
      expect(entries).toHaveLength(3);
      expect(entries[sequence - 1].payload).toEqual({ index: 99 });
      expect(verifyChain(entries)).toMatchObject({
        ok: false, brokenAtSequence: BigInt(sequence), reason: "bad_hash",
      });
      const restored = await admin.$executeRawUnsafe(
        `UPDATE "${schema}".audit_log SET payload = $1::jsonb WHERE sequence = $2`,
        JSON.stringify(original[sequence - 1].payload),
        BigInt(sequence),
      );
      expect(restored).toBe(1);
      expect(verifyChain(await client.auditLog.findMany())).toEqual({ ok: true });
    }
  }, testTimeout);

  it("uses read committed isolation on three simultaneous backend connections", async () => {
    const release = barrier();
    const rows: { pid: number; isolation: string }[] = [];
    const transactions = Promise.allSettled(Array.from({ length: 3 }, () =>
      client.$transaction(async (transaction) => {
        const [backend] = await transaction.$queryRaw<{ pid: number }[]>`SELECT pg_backend_pid() AS pid`;
        const [isolation] = await transaction.$queryRaw<{ transaction_isolation: string }[]>`SHOW transaction_isolation`;
        rows.push({ pid: backend.pid, isolation: isolation.transaction_isolation });
        await release.promise;
      }, transactionOptions),
    ));
    try {
      const deadline = Date.now() + 10_000;
      while (rows.length < 3 && Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
      expect(rows).toHaveLength(3);
      expect(new Set(rows.map((row) => row.pid)).size).toBe(3);
      expect(rows.map((row) => row.isolation)).toEqual(["read committed", "read committed", "read committed"]);
    } finally {
      release.release();
      expect((await transactions).filter((result) => result.status === "rejected")).toEqual([]);
    }
  }, testTimeout);

  it("audits an unsupported submission and leaves no partial writes or tool calls on busy", async () => {
    const tools = (Object.keys(toolRegistry) as (keyof typeof toolRegistry)[])
      .map((tool) => vi.spyOn(toolRegistry, tool));
    const parameters = { nested: { value: "unchanged" }, items: [2, 1] };
    const response = await handleActionSubmission(new Request("http://localhost/api/actions", {
      method: "POST",
      body: JSON.stringify({
        agentId: "test", agentReasoning: "test", tool: "unsupported_test_tool", parameters,
      }),
    }), () => client);
    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body).toMatchObject({ outcome: "block", status: "blocked", ruleId: "unsupported_tool" });
    const stored = await client.action.findUniqueOrThrow({ where: { id: body.actionId } });
    expect(stored).toMatchObject({ tool: "unsupported_test_tool", status: "blocked", parameters });
    const before = await client.auditLog.findMany();
    expect(before).toHaveLength(1);
    expect(before[0]).toMatchObject({
      eventType: "action_submitted",
      payload: { action_id: body.actionId, tool: "unsupported_test_tool", parameters, policy_rule_matched: "unsupported_tool" },
    });
    expect(verifyChain(before)).toEqual({ ok: true });
    for (const tool of tools) expect(tool).not.toHaveBeenCalled();

    const action = await createPendingAction();
    let locked!: () => void;
    let release!: () => void;
    const lockReady = new Promise<void>((resolve) => { locked = resolve; });
    const holdLock = new Promise<void>((resolve) => { release = resolve; });
    const blocker = client.$transaction(async (transaction) => {
      await transaction.action.update({ where: { id: action.id }, data: { agentReasoning: action.agentReasoning } });
      locked();
      await holdLock;
    }, { maxWait: 15_000, timeout: 60_000 });
    const timer = setTimeout(release, 45_000);
    try {
      await Promise.race([lockReady, blocker]);
      const busy = await decideRoute(decisionRequest(), { params: Promise.resolve({ id: action.id }) });
      expect(busy.status).toBe(503);
      expect(await busy.json()).toEqual({ message: "Database is busy." });
    } finally {
      clearTimeout(timer);
      release();
      await blocker;
    }
    for (const tool of tools) expect(tool).not.toHaveBeenCalled();
    expect(await client.action.count()).toBe(2);
    expect((await client.action.findUniqueOrThrow({ where: { id: action.id } })).status).toBe("pending");
    expect(await client.decision.count()).toBe(0);
    expect(await client.auditLog.findMany()).toEqual(before);
    expect(verifyChain(await client.auditLog.findMany())).toEqual({ ok: true });
  }, testTimeout);

  it("runs the mocked tool once when concurrent route approvals have one winner", async () => {
    const action = await createPendingAction();
    const tool = vi.spyOn(toolRegistry, "issue_refund").mockReturnValue({ mocked: true, tool: "issue_refund" });
    const responses = await Promise.all([
      decideRoute(decisionRequest(), { params: Promise.resolve({ id: action.id }) }),
      decideRoute(decisionRequest(), { params: Promise.resolve({ id: action.id }) }),
    ]);
    expect(responses.map((response) => response.status).sort()).toEqual([200, 409]);
    expect(tool).toHaveBeenCalledExactlyOnceWith(action.id, action.parameters);
    const retry = await decideRoute(decisionRequest(), { params: Promise.resolve({ id: action.id }) });
    expect(retry.status).toBe(409);
    expect(tool).toHaveBeenCalledExactlyOnceWith(action.id, action.parameters);
    expect(await client.decision.count()).toBe(1);
    const entries = await client.auditLog.findMany();
    expect(entries).toHaveLength(1);
    expect(verifyChain(entries)).toEqual({ ok: true });
  }, testTimeout);
});
