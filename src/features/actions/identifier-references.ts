import { connection } from "next/server";
import { notFound } from "next/navigation";
import type { Prisma } from "../../generated/prisma/client";
import { getPrisma } from "../../lib/prisma";

export type IdentifierKind = "order" | "record";
export type IdentifierAction = {
  id: string;
  tool: string;
  parameters: Prisma.JsonValue;
  status: string;
};

function isValidIdentifier(kind: IdentifierKind, id: string): boolean {
  const pattern = kind === "order" ? /^ORDER-[0-9]+$/ : /^RECORD-[0-9]+$/;
  return pattern.test(id) && pattern.exec(id)?.[0] === id;
}

function referencesIdentifier(parameters: Prisma.JsonValue, kind: IdentifierKind, id: string): boolean {
  if (parameters === null || typeof parameters !== "object" || Array.isArray(parameters)) {
    return false;
  }
  const value = kind === "order" ? parameters.orderId : parameters.recordId;
  return value === id;
}

export async function getIdentifierReferences(kind: IdentifierKind, id: string): Promise<IdentifierAction[]> {
  if (!isValidIdentifier(kind, id)) notFound();

  await connection();
  const tool = kind === "order" ? "issue_refund" : "delete_record";
  const actions = await getPrisma().action.findMany({
    where: { tool },
    select: { id: true, tool: true, parameters: true, status: true },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });
  const references = actions.filter((action) => referencesIdentifier(action.parameters, kind, id));
  if (references.length === 0) notFound();
  return references;
}
