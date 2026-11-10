import { randomUUID } from "node:crypto";
import { Prisma, type PrismaClient } from "../../generated/prisma/client";
import { appendAuditEntry } from "../audit/chain";
import { getPrisma } from "../prisma";
import { validEditedParameters } from "../tools/parameters";

type Outcome = "approved" | "denied";

export type DecisionResult =
  | { kind: "ok"; outcome: Outcome; tool: string; parameters: Prisma.JsonValue }
  | { kind: "not_found" }
  | { kind: "conflict" }
  | { kind: "invalid_edit" }
  | { kind: "busy" };

class InvalidEditError extends Error {}

function isTransactionTimeout(error: unknown): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2028") {
    return false;
  }
  return error.message.includes("Unable to start a transaction in the given time.") ||
    (error.message.includes("expired transaction") && error.message.includes("The timeout for this transaction was"));
}

export async function decideAction(
  actionId: string,
  reviewer: string,
  outcome: Outcome,
  reason: string,
  client: PrismaClient = getPrisma(),
  editedParameters?: Prisma.InputJsonObject,
): Promise<DecisionResult> {
  try {
    return await client.$transaction(async (transaction): Promise<DecisionResult> => {
      const updated = await transaction.action.updateMany({
        where: { id: actionId, status: "pending" },
        data: { status: outcome },
      });
      if (updated.count === 0) {
        const action = await transaction.action.findUnique({ where: { id: actionId }, select: { id: true } });
        return { kind: action ? "conflict" : "not_found" };
      }

      const action = await transaction.action.findUniqueOrThrow({
        where: { id: actionId },
        select: { tool: true, parameters: true },
      });
      if (editedParameters !== undefined &&
          (outcome !== "approved" || !validEditedParameters(action.tool, editedParameters))) {
        throw new InvalidEditError("Edited parameters are invalid for this action.");
      }
      const decision = await transaction.decision.create({
        data: {
          id: randomUUID(), actionId, reviewer, outcome, reason,
          ...(editedParameters !== undefined ? { editedParameters } : {}),
        },
        select: { id: true, editedParameters: true },
      });
      await appendAuditEntry(transaction, "action_decided", {
        action_id: actionId,
        decision_id: decision.id,
        reviewer,
        outcome,
        reason,
        edited_parameters: decision.editedParameters,
      });
      return {
        kind: "ok",
        outcome,
        tool: action.tool,
        parameters: decision.editedParameters ?? action.parameters,
      };
    }, { maxWait: 15_000, timeout: 30_000 });
  } catch (error) {
    if (error instanceof InvalidEditError) return { kind: "invalid_edit" };
    if (isTransactionTimeout(error)) return { kind: "busy" };
    throw error;
  }
}
