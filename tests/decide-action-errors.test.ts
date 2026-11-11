import { afterEach, describe, expect, it, vi } from "vitest";

const { transaction } = vi.hoisted(() => ({ transaction: vi.fn() }));
vi.mock("../src/lib/prisma", () => ({ getPrisma: () => ({ $transaction: transaction }) }));

import { Prisma } from "../src/generated/prisma/client";
import { decideAction } from "../src/lib/actions/decide-action";

function error(code: string, message: string) {
  return new Prisma.PrismaClientKnownRequestError(message, { code, clientVersion: "test" });
}

describe("decision transaction errors", () => {
  afterEach(() => vi.resetAllMocks());

  it.each([
    "Transaction API error: Unable to start a transaction in the given time.",
    "Transaction API error: A query cannot be executed on an expired transaction. The timeout for this transaction was 30000 ms.",
  ])("returns busy for a recognized P2028 timeout", async (message) => {
    transaction.mockRejectedValue(error("P2028", message));
    expect(await decideAction("id", "reviewer", "approved", "reason")).toEqual({ kind: "busy" });
    expect(transaction).toHaveBeenCalledWith(expect.any(Function), { maxWait: 15_000, timeout: 30_000 });
  });

  it.each([
    error("P2028", "Transaction API error: Transaction not found."),
    error("P2002", "Unique constraint failed."),
  ])("propagates other database errors", async (failure) => {
    transaction.mockRejectedValue(failure);
    await expect(decideAction("id", "reviewer", "approved", "reason")).rejects.toBe(failure);
  });
});
