"use client";

import type { ConsoleAuditEntry } from "../../lib/console/contract";
import { Icon } from "../ui/ConsoleElements";
import { PageLoadingIndicator } from "../activity/PageLoadingIndicator";

export function AuditPage({
  entries,
  loaded = true,
}: {
  entries: ConsoleAuditEntry[];
  loaded?: boolean;
}) {
  return (
    <>
      <section className="page-heading" data-reveal>
        <div>
          <p className="eyebrow">Immutable record</p>
          <h1>Audit log</h1>
          <p>Latest 100 recorded hash-chained events.</p>
        </div>
        <span className="integrity-pill">
          <Icon name="shield" size={15} />
          Chain not verified in this view
        </span>
      </section>
      <section className="audit-card" aria-busy={!loaded}>
        <div className="audit-head" data-reveal>
          <span>Sequence</span>
          <span>Event</span>
          <span>Principal</span>
          <span>Record hash</span>
          <span>Timestamp</span>
        </div>
        {!loaded ? (
          <PageLoadingIndicator message="Loading audit log." kind="audit" rows={5} />
        ) : entries.length === 0 ? (
          <p className="page-empty-state">No audit entries recorded.</p>
        ) : entries.map((item) => (
          <div className="audit-row" data-reveal key={item.id}>
            <code>#{item.sequence}</code>
            <div><strong>{item.event}</strong></div>
            <span>{item.principal}</span>
            <code title={item.hash}>{item.hash.slice(0, 8)}…{item.hash.slice(-4)}</code>
            <time dateTime={item.createdAt}>{new Date(item.createdAt).toLocaleString()}</time>
          </div>
        ))}
      </section>
    </>
  );
}
