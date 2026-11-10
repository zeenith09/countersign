import { createHash, randomUUID } from "node:crypto";
import type { Prisma } from "../../generated/prisma/client";
import { canonicalJson } from "./canonical-json";

const AUDIT_CHAIN_LOCK_KEY = BigInt("0x434f554e54455253");
const GENESIS = "GENESIS";

export type AuditChainEntry = {
  sequence: bigint;
  eventType: string;
  payload: Prisma.JsonValue | Prisma.InputJsonObject;
  prevHash: string | null;
  hash: string;
  createdAt: Date;
};

function hashEntry(entry: AuditChainEntry, legacy = false): string {
  const hashInput = {
    sequence: entry.sequence.toString(),
    event_type: entry.eventType,
    payload: entry.payload,
    prev_hash: entry.prevHash === null ? null : entry.prevHash.trimEnd(),
    ...(!legacy && { created_at: entry.createdAt.toISOString() }),
  };
  return createHash("sha256").update(canonicalJson(hashInput)).digest("hex");
}

export async function appendAuditEntry(
  transaction: Prisma.TransactionClient,
  eventType: string,
  payload: Prisma.InputJsonObject,
): Promise<void> {
  await transaction.$queryRaw`
    SELECT pg_advisory_xact_lock(${AUDIT_CHAIN_LOCK_KEY}::bigint)::text
  `;

  const first = await transaction.auditLog.findFirst({
    orderBy: { sequence: "asc" },
    select: { sequence: true, prevHash: true },
  });
  if (first && (first.sequence !== BigInt(1) || first.prevHash?.trimEnd() !== GENESIS)) {
    throw new Error("Cannot append to a legacy or unrecognized audit chain.");
  }

  const previous = await transaction.auditLog.findFirst({
    orderBy: { sequence: "desc" },
    select: { sequence: true, hash: true },
  });
  // Hash the JSONB representation that verification will read back.
  const [storedPayload] = await transaction.$queryRaw<{ payload: Prisma.InputJsonObject }[]>`
    SELECT ${canonicalJson(payload)}::jsonb AS payload
  `;
  const entry: AuditChainEntry = {
    sequence: (previous?.sequence ?? BigInt(0)) + BigInt(1),
    eventType,
    payload: storedPayload.payload,
    prevHash: previous?.hash ?? GENESIS,
    hash: "",
    createdAt: new Date(),
  };
  entry.hash = hashEntry(entry);

  await transaction.auditLog.create({
    data: {
      id: randomUUID(),
      sequence: entry.sequence,
      eventType: entry.eventType,
      payload: storedPayload.payload,
      prevHash: entry.prevHash,
      hash: entry.hash,
      createdAt: entry.createdAt,
    },
  });
}

export type ChainVerificationResult =
  | { ok: true }
  | {
    ok: false;
    brokenAtSequence: bigint;
    reason: "bad_hash" | "bad_prev_hash" | "sequence_gap";
    message: string;
  };

export function verifyChain(entries: readonly AuditChainEntry[]): ChainVerificationResult {
  return verify(entries, false);
}

export function verifyAuditChain(entries: readonly AuditChainEntry[]): boolean {
  return verifyChain(entries).ok;
}

export function verifyLegacyAuditChain(entries: readonly AuditChainEntry[]): boolean {
  return verify(entries, true).ok;
}

function verify(entries: readonly AuditChainEntry[], legacy: boolean): ChainVerificationResult {
  let expectedSequence = BigInt(1);
  let expectedPreviousHash: string | null = legacy ? null : GENESIS;

  const sortedEntries = [...entries].sort((a, b) =>
    a.sequence < b.sequence ? -1 : a.sequence > b.sequence ? 1 : 0
  );
  for (const entry of sortedEntries) {
    if (entry.sequence < expectedSequence) {
      throw new Error("Audit entries contain a duplicate or invalid sequence.");
    }
    if (entry.sequence > expectedSequence) {
      return {
        ok: false,
        brokenAtSequence: expectedSequence,
        reason: "sequence_gap",
        message: "Missing audit entry in sequence.",
      };
    }
    if ((entry.prevHash === null ? null : entry.prevHash.trimEnd()) !== expectedPreviousHash) {
      return {
        ok: false,
        brokenAtSequence: entry.sequence,
        reason: "bad_prev_hash",
        message: "Previous hash does not match the preceding entry.",
      };
    }
    if (entry.hash !== hashEntry(entry, legacy)) {
      return {
        ok: false,
        brokenAtSequence: entry.sequence,
        reason: "bad_hash",
        message: "Audit entry hash does not match.",
      };
    }
    expectedSequence += BigInt(1);
    expectedPreviousHash = entry.hash;
  }

  return { ok: true };
}
