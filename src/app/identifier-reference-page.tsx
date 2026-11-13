import { connection } from "next/server";
import { notFound } from "next/navigation";
import Link from "next/link";
import type { Prisma } from "../generated/prisma/client";
import { getPrisma } from "../lib/prisma";
import { summarizeAction } from "./action-summary";

type IdentifierKind = "order" | "record";
type IdentifierAction = {
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

export function IdentifierReferenceContent({
  kind,
  id,
  references,
}: {
  kind: IdentifierKind;
  id: string;
  references: IdentifierAction[];
}) {
  const label = kind === "order" ? "Order" : "Record";
  return (
    <main className="mx-auto w-full max-w-4xl px-6 py-12">
      <h1 className="text-3xl font-semibold">{label} {id}</h1>
      <p className="mt-2">This read-only page displays mock data.</p>
      <section aria-labelledby="referencing-actions-heading" className="mt-8">
        <h2 id="referencing-actions-heading" className="text-xl font-semibold">
          Actions referencing this {kind}
        </h2>
        <ul className="mt-4 divide-y divide-current border-y">
          {references.map((action) => (
            <li key={action.id} className="py-4">
              <p>{summarizeAction(action.tool, action.parameters)}</p>
              <p className="mt-2">Status: {action.status}</p>
              <Link
                href="/"
                className="mt-2 inline-block underline decoration-2 underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2"
              >
                Open approval console
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
