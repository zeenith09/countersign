import Link from "next/link";
import { summarizeAction } from "../../lib/actions/action-summary";
import type { IdentifierAction, IdentifierKind } from "../../lib/actions/identifier-references";

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
