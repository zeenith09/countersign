import assert from "node:assert/strict";
import { randomInt, randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";
import { PrismaPg } from "@prisma/adapter-pg";
import { readEnv } from "../../src/lib/config/env.mjs";
import { PrismaClient } from "./generated/client";
import { assertSpikeTarget } from "./spike-target";

const transactionOptions = { maxWait: 15_000, timeout: 30_000 };

function barrier() {
  let release!: () => void;
  const promise = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { promise, release };
}

async function waitForLock(prisma: PrismaClient, pid: number, lockType: string) {
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
  throw new Error(`Backend ${pid} did not wait for a ${lockType} lock.`);
}

async function verifyCommitAndRollback(prisma: PrismaClient) {
  const committedId = randomUUID();
  const rolledBackId = randomUUID();
  const deliberateError = new Error("deliberate rollback");
  await prisma.$transaction(async (tx) => {
    await tx.transactionSpike.create({ data: { id: committedId, status: "committed" } });
  }, transactionOptions);
  await assert.rejects(
    prisma.$transaction(async (tx) => {
      await tx.transactionSpike.create({ data: { id: rolledBackId, status: "rolled_back" } });
      throw deliberateError;
    }, transactionOptions),
    (error: unknown) => error === deliberateError,
  );
  assert.deepEqual(await prisma.transactionSpike.findUnique({ where: { id: committedId } }), {
    id: committedId,
    status: "committed",
  });
  assert.equal(await prisma.transactionSpike.findUnique({ where: { id: rolledBackId } }), null);
}

async function verifyAdvisoryLock(prisma: PrismaClient) {
  const lockKey = BigInt(randomInt(1, 2_147_483_647));
  const firstHasLock = barrier();
  const releaseFirst = barrier();
  const secondTrying = barrier();
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
    assert.equal(attempt.acquired, false);
    secondTrying.release();
    const started = performance.now();
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(${lockKey}::bigint)::text`;
    elapsedMs = performance.now() - started;
    secondAcquired = true;
  }, transactionOptions);
  try {
    await Promise.race([secondTrying.promise, first, second]);
    assert.notEqual(firstPid, secondPid);
    await waitForLock(prisma, secondPid, "advisory");
    assert.equal(secondAcquired, false);
  } finally {
    releaseFirst.release();
    const results = await Promise.allSettled([first, second]);
    for (const result of results) {
      if (result.status === "rejected") throw result.reason;
    }
  }
  assert.equal(secondAcquired, true);
  console.log(`PASS advisory lock: waited ${elapsedMs.toFixed(1)} ms on a separate backend`);
}

async function verifyConditionalUpdate(prisma: PrismaClient) {
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
    assert.notEqual(firstPid, secondPid);
    await waitForLock(prisma, secondPid, "transactionid");
  } finally {
    releaseFirst.release();
    counts = await both;
  }
  assert.deepEqual(counts, [1, 0]);
  assert.deepEqual(await prisma.transactionSpike.findUnique({ where: { id } }), {
    id,
    status: "approved",
  });
}

export async function runSpike() {
  if (readEnv("RUN_DB_SPIKE") !== "1") {
    throw new Error("Set RUN_DB_SPIKE=1 only for the isolated spike branch.");
  }
  const mode = readEnv("SPIKE_DB_MODE") ?? "pooled";
  if (mode !== "pooled" && mode !== "direct") {
    throw new Error("SPIKE_DB_MODE must be pooled or direct.");
  }
  const variable = mode === "direct" ? "SPIKE_DIRECT_URL" : "SPIKE_DATABASE_URL";
  const connectionString = readEnv(variable);
  if (!connectionString) throw new Error(`${variable} must point to the spike branch.`);
  assertSpikeTarget(connectionString, variable);
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString }, { schema: "public" }),
  });
  let tableCreated = false;
  try {
    await prisma.$executeRaw`
      CREATE TABLE public.countersign_transaction_spike (
        id TEXT PRIMARY KEY,
        status TEXT NOT NULL
      )
    `;
    tableCreated = true;
    await verifyCommitAndRollback(prisma);
    console.log("PASS interactive commit and rollback");
    await verifyAdvisoryLock(prisma);
    await verifyConditionalUpdate(prisma);
    console.log("PASS concurrent conditional updateMany: counts 1, 0");
    const isolation = await prisma.$transaction(async (tx) => {
      const [row] = await tx.$queryRaw<{ transaction_isolation: string }[]>`
        SHOW transaction_isolation
      `;
      return row.transaction_isolation;
    }, transactionOptions);
    assert.equal(isolation, "read committed");
    console.log("PASS interactive transaction isolation: read committed");
  } finally {
    try {
      if (tableCreated) {
        await prisma.$executeRaw`DROP TABLE public.countersign_transaction_spike`;
      }
    } finally {
      await prisma.$disconnect();
    }
  }
}
