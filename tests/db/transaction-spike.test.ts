import { randomInt, randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";
import { PrismaPg } from "@prisma/adapter-pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PrismaClient } from "./generated/client";

const transactionOptions = { maxWait: 15_000, timeout: 30_000 };
const testTimeout = 45_000;

function barrier() {
  let release!: () => void;
  const promise = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { promise, release };
}

async function createClient() {
  if (process.env.RUN_DB_SPIKE !== "1") {
    throw new Error("Set RUN_DB_SPIKE=1 only after confirming the disposable database target.");
  }
  const mode = process.env.SPIKE_DB_MODE ?? "pooled";
  if (mode !== "pooled" && mode !== "direct") {
    throw new Error("SPIKE_DB_MODE must be pooled or direct.");
  }
  const variable = mode === "direct" ? "SPIKE_DIRECT_URL" : "SPIKE_DATABASE_URL";
  const connectionString = process.env[variable];
  if (!connectionString) {
    throw new Error(`${variable} must point to the disposable spike branch.`);
  }
  const { PrismaClient } = await import("./generated/client");
  return new PrismaClient({
    adapter: new PrismaPg({ connectionString }, { schema: "public" }),
  });
}

describe.skipIf(process.env.RUN_DB_SPIKE !== "1")("hosted Postgres transaction spike", () => {
  let prisma: PrismaClient;
  let tableCreated = false;

  beforeAll(async () => {
    prisma = await createClient();
    await prisma.$executeRaw`
      CREATE TABLE public.countersign_transaction_spike (
        id TEXT PRIMARY KEY,
        status TEXT NOT NULL
      )
    `;
    tableCreated = true;
  }, testTimeout);

  afterAll(async () => {
    if (!prisma) return;
    try {
      if (tableCreated) {
        await prisma.$executeRaw`DROP TABLE public.countersign_transaction_spike`;
      }
    } finally {
      await prisma.$disconnect();
    }
  }, testTimeout);

  it("commits successful transactions and rolls back a thrown error", async () => {
    const committedId = randomUUID();
    const rolledBackId = randomUUID();
    const deliberateError = new Error("deliberate rollback");

    await prisma.$transaction(async (tx) => {
      await tx.transactionSpike.create({ data: { id: committedId, status: "committed" } });
    }, transactionOptions);

    await expect(
      prisma.$transaction(async (tx) => {
        await tx.transactionSpike.create({ data: { id: rolledBackId, status: "rolled_back" } });
        throw deliberateError;
      }, transactionOptions),
    ).rejects.toBe(deliberateError);

    expect(await prisma.transactionSpike.findUnique({ where: { id: committedId } })).toEqual({
      id: committedId,
      status: "committed",
    });
    expect(await prisma.transactionSpike.findUnique({ where: { id: rolledBackId } })).toBeNull();
  }, testTimeout);

  it("holds the same advisory transaction lock in only one transaction at a time", async () => {
    const lockKey = BigInt(randomInt(1, 2_147_483_647));
    const firstHasLock = barrier();
    const releaseFirst = barrier();
    const secondTryingLock = barrier();
    let firstPid = 0;
    let secondPid = 0;
    let secondAcquired = false;
    let elapsedMs = 0;

    const first = prisma.$transaction(async (tx) => {
      firstPid = (await tx.$queryRaw<{ pid: number }[]>`SELECT pg_backend_pid() AS pid`)[0].pid;
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(${lockKey}::bigint)::text`;
      firstHasLock.release();
      await releaseFirst.promise;
    }, transactionOptions);

    const second = prisma.$transaction(async (tx) => {
      secondPid = (await tx.$queryRaw<{ pid: number }[]>`SELECT pg_backend_pid() AS pid`)[0].pid;
      await firstHasLock.promise;
      const [attempt] = await tx.$queryRaw<{ acquired: boolean }[]>`
        SELECT pg_try_advisory_xact_lock(${lockKey}::bigint) AS acquired
      `;
      expect(attempt.acquired).toBe(false);
      secondTryingLock.release();
      const started = performance.now();
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(${lockKey}::bigint)::text`;
      elapsedMs = performance.now() - started;
      secondAcquired = true;
    }, transactionOptions);

    try {
      await Promise.race([secondTryingLock.promise, first, second]);
      expect(firstPid).not.toBe(secondPid);
      await expectBlocked(prisma, secondPid, "advisory");
      expect(secondAcquired).toBe(false);
    } finally {
      releaseFirst.release();
      const results = await Promise.allSettled([first, second]);
      for (const result of results) {
        if (result.status === "rejected") throw result.reason;
      }
    }
    expect(secondAcquired).toBe(true);
    console.info(`Advisory lock: backend ${secondPid} waited ${elapsedMs.toFixed(1)} ms`);
  }, testTimeout);

  it("allows only the first concurrent conditional update to claim a pending row", async () => {
    const id = randomUUID();
    await prisma.transactionSpike.create({ data: { id, status: "pending" } });
    const firstUpdated = barrier();
    const releaseFirst = barrier();
    const secondStarted = barrier();
    let firstPid = 0;
    let secondPid = 0;

    const first = prisma.$transaction(async (tx) => {
      firstPid = (await tx.$queryRaw<{ pid: number }[]>`SELECT pg_backend_pid() AS pid`)[0].pid;
      const result = await tx.transactionSpike.updateMany({
        where: { id, status: "pending" },
        data: { status: "approved" },
      });
      firstUpdated.release();
      await releaseFirst.promise;
      return result.count;
    }, transactionOptions);

    const second = prisma.$transaction(async (tx) => {
      secondPid = (await tx.$queryRaw<{ pid: number }[]>`SELECT pg_backend_pid() AS pid`)[0].pid;
      await firstUpdated.promise;
      secondStarted.release();
      return (await tx.transactionSpike.updateMany({
        where: { id, status: "pending" },
        data: { status: "denied" },
      })).count;
    }, transactionOptions);

    const both = Promise.all([first, second]);
    let counts: number[] = [];
    try {
      await Promise.race([secondStarted.promise, first, second]);
      expect(firstPid).not.toBe(secondPid);
      await expectBlocked(prisma, secondPid, "transactionid");
    } finally {
      releaseFirst.release();
      counts = await both;
    }
    expect(counts).toEqual([1, 0]);
    expect(await prisma.transactionSpike.findUnique({ where: { id } })).toEqual({
      id,
      status: "approved",
    });
  }, testTimeout);

  it("uses read committed isolation inside an interactive transaction", async () => {
    const isolation = await prisma.$transaction(async (tx) => {
      const [row] = await tx.$queryRaw<{ transaction_isolation: string }[]>`
        SHOW transaction_isolation
      `;
      return row.transaction_isolation;
    }, transactionOptions);
    expect(isolation).toBe("read committed");
  }, testTimeout);
});

async function expectBlocked(prisma: PrismaClient, pid: number, lockType: string) {
  const deadline = performance.now() + 10_000;
  while (performance.now() < deadline) {
    const [row] = await prisma.$queryRaw<{ blocked: boolean }[]>`
      SELECT EXISTS (
        SELECT 1 FROM pg_locks
        WHERE pid = ${pid} AND locktype = ${lockType} AND NOT granted
      ) AS blocked
    `;
    if (row.blocked) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`Backend ${pid} did not wait for a ${lockType} lock within 10 seconds.`);
}
