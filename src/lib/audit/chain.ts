import { createHash, randomUUID } from "node:crypto";
import type { Prisma } from "../../generated/prisma/client";

const AUDIT_CHAIN_LOCK_KEY = BigInt("0x434f554e54455253");

export type AuditChainEntry = {
  sequence: bigint;
  eventType: string;
  payload: Prisma.JsonValue | Prisma.InputJsonObject;
  prevHash: string | null;
  hash: string;
};

function canonicalJson(value: unknown): string {
  if (
    value === null ||
    typeof value === "boolean" ||
    typeof value === "string"
  ) {
    return JSON.stringify(value);
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new TypeError("Audit JSON cannot contain a non-finite number.");
    }
    return JSON.stringify(value);
  }
  if (typeof value === "bigint") {
    return JSON.stringify(value.toString());
  }
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(",")}]`;
  }
  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value).sort(([left], [right]) =>
      left < right ? -1 : left > right ? 1 : 0
    );
    return `{${entries
      .map(([key, child]) => `${JSON.stringify(key)}:${canonicalJson(child)}`)
      .join(",")}}`;
  }
  throw new TypeError("Audit hash input must be JSON-compatible.");
}

function hashEntry(entry: AuditChainEntry): string {
  const hashInput = {
    sequence: entry.sequence,
    event_type: entry.eventType,
    payload: entry.payload,
    prev_hash: entry.prevHash,
  };
  return createHash("sha256").update(canonicalJson(hashInput)).digest("hex");
}

export async function appendAuditEvent(
  transaction: Prisma.TransactionClient,
  eventType: string,
  payload: Prisma.InputJsonObject,
): Promise<void> {
  await transaction.$queryRaw`
    SELECT pg_advisory_xact_lock(${AUDIT_CHAIN_LOCK_KEY}::bigint)::text
  `;

  const previous = await transaction.auditLog.findFirst({
    orderBy: { sequence: "desc" },
    select: { sequence: true, hash: true },
  });
  const entry: AuditChainEntry = {
    sequence: (previous?.sequence ?? BigInt(0)) + BigInt(1),
    eventType,
    payload,
    prevHash: previous?.hash ?? null,
    hash: "",
  };
  entry.hash = hashEntry(entry);

  await transaction.auditLog.create({
    data: {
      id: randomUUID(),
      sequence: entry.sequence,
      eventType: entry.eventType,
      payload,
      prevHash: entry.prevHash,
      hash: entry.hash,
    },
  });
}

export function verifyAuditChain(entries: readonly AuditChainEntry[]): boolean {
  let expectedSequence = BigInt(1);
  let expectedPreviousHash: string | null = null;

  for (const entry of entries) {
    if (
      entry.sequence !== expectedSequence ||
      entry.prevHash !== expectedPreviousHash ||
      entry.hash !== hashEntry(entry)
    ) {
      return false;
    }
    expectedSequence += BigInt(1);
    expectedPreviousHash = entry.hash;
  }

  return true;
}
