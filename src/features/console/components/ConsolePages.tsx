"use client";

import type {
  ConsoleAction,
  ConsoleActivityItem,
  ConsoleAuditEntry,
  ConsoleStatus,
} from "../contract";
import type { ConsoleCounts, ConsolePage } from "../view-model";
import { filterActivity, sortPendingActions } from "../view-model";
import { Badge, Icon, Metric } from "./ConsoleElements";

export function QueuePage({
  actions,
  counts,
  loaded,
  sort,
  onSortChange,
  onGenerate,
  onReview,
  onStatusClick,
  onNavigate,
}: {
  actions: ConsoleAction[];
  counts: ConsoleCounts;
  loaded: boolean;
  sort: "oldest" | "newest";
  onSortChange: () => void;
  onGenerate: () => void;
  onReview: (action: ConsoleAction) => void;
  onStatusClick: (status: ConsoleStatus) => void;
  onNavigate: (page: ConsolePage) => void;
}) {
  const sortedActions = sortPendingActions(actions, sort);
  return (
    <>
      <section className="page-heading">
        <div>
          <p className="eyebrow">Human review</p>
          <h1>Approval queue</h1>
          <p>Review actions held by policy before any mocked tool can run.</p>
        </div>
        <button className="primary-button desktop-heading-button" onClick={onGenerate}>
          <Icon name="plus" size={17} />
          Generate incoming action
        </button>
      </section>
      <section className="metrics" aria-label="Action counts">
        <Metric label="Pending" value={counts.pending} tone="amber" onClick={() => onStatusClick("pending")} />
        <Metric label="Human-approved" value={counts.approved} tone="green" onClick={() => onStatusClick("approved")} />
        <Metric label="Human-denied" value={counts.denied} tone="red" onClick={() => onStatusClick("denied")} />
        <Metric label="Auto-allowed" value={counts.auto} tone="blue" onClick={() => onStatusClick("auto_allowed")} />
        <Metric label="Blocked" value={counts.blocked} tone="slate" onClick={() => onStatusClick("blocked")} />
      </section>
      <section className="queue-section" aria-labelledby="pending-heading">
        <div className="section-heading">
          <div>
            <h2 id="pending-heading">Pending actions</h2>
            <p>{loaded ? `${actions.length} actions require a human decision` : "Loading pending actions."}</p>
          </div>
          <button
            className="sort-label"
            type="button"
            aria-label={`Sort pending actions: ${sort === "oldest" ? "oldest first" : "newest first"}`}
            onClick={onSortChange}
          >
            {sort === "oldest" ? "Oldest first" : "Newest first"}
            <span aria-hidden="true">{sort === "oldest" ? "↓" : "↑"}</span>
          </button>
        </div>
        {!loaded ? null : actions.length === 0 ? (
          <div className="empty">
            <div className="empty-icon">
              <Icon name="check" />
            </div>
            <h3>Queue is clear</h3>
            <p>No actions are waiting for human review. Check again for new submissions.</p>
          </div>
        ) : (
          <div className="queue-list">
            {sortedActions.map((action) => (
              <article className="action-card" key={action.id} onClick={() => onReview(action)}>
                <div className="card-main">
                  <div className="tool-icon">
                    <Icon
                      name={
                        action.tool === "send_email"
                          ? "arrow"
                          : action.tool.includes("refund")
                            ? "activity"
                            : "bolt"
                      }
                      size={19}
                    />
                  </div>
                  <div className="card-content">
                    <div className="card-title-row">
                      <div>
                        <span className="tool-name">{action.tool}</span>
                        <h3>{action.title}</h3>
                      </div>
                      <Badge status={action.status} />
                    </div>
                    <p className="summary">{action.summary}</p>
                    <div className="reasoning">
                      <span>Agent reasoning</span>
                      <p>{action.reasoning}</p>
                    </div>
                    <div className="card-meta">
                      <span><i /> {action.age}</span>
                      <span>{action.risk}</span>
                      <span className="id-text">{action.id}</span>
                    </div>
                    <div className="policy-row">
                      <Icon name="shield" size={17} />
                      <div>
                        <span>Matched policy</span>
                        <strong>{action.rule}</strong>
                        <p>{action.ruleDescription}</p>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="card-action">
                  <button
                    className="review-button"
                    onClick={(event) => {
                      event.stopPropagation();
                      onReview(action);
                    }}
                  >
                    Review action <Icon name="arrow" size={16} />
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
      <section className="policy-receipt">
        <div className="receipt-icon"><Icon name="shield" /></div>
        <div>
          <h2>Policy outcomes stay out of this queue</h2>
          <p className="policy-receipt-description">
            Auto-allowed and blocked proposals appear in activity history, clearly separated from
            human decisions.
          </p>
        </div>
        <button onClick={() => onNavigate("activity")}>
          View activity <Icon name="arrow" size={15} />
        </button>
      </section>
    </>
  );
}

export function OverviewPage({
  counts,
  activity,
  onNavigate,
  onStatusClick,
}: {
  counts: ConsoleCounts;
  activity: ConsoleActivityItem[];
  onNavigate: (page: ConsolePage) => void;
  onStatusClick: (status: ConsoleStatus) => void;
}) {
  return (
    <>
      <section className="page-heading">
        <div>
          <p className="eyebrow">Governance workspace</p>
          <h1>Overview</h1>
          <p>Human review and deterministic policy outcomes, at a glance.</p>
        </div>
        <button className="secondary-button" onClick={() => onNavigate("queue")}>
          Open approval queue <Icon name="arrow" size={16} />
        </button>
      </section>
      <section className="metrics overview-metrics">
        <Metric label="Pending" value={counts.pending} tone="amber" onClick={() => onStatusClick("pending")} />
        <Metric label="Human-approved" value={counts.approved} tone="green" onClick={() => onStatusClick("approved")} />
        <Metric label="Human-denied" value={counts.denied} tone="red" onClick={() => onStatusClick("denied")} />
        <Metric label="Auto-allowed" value={counts.auto} tone="blue" onClick={() => onStatusClick("auto_allowed")} />
        <Metric label="Blocked" value={counts.blocked} tone="slate" onClick={() => onStatusClick("blocked")} />
      </section>
      <div className="overview-grid">
        <section className="overview-hero">
          <div className="hero-grid" />
          <div className="hero-content">
            <span className="hero-kicker"><i /> Live governance posture</span>
            <h2>Every consequential action has a clear path.</h2>
            <p>
              Policy outcomes stay distinct from human decisions, with database-authoritative status
              and an auditable reason for every review.
            </p>
            <button onClick={() => onNavigate("queue")}>
              Review {counts.pending ?? "—"} pending actions <Icon name="arrow" size={16} />
            </button>
          </div>
        </section>
        <section className="recent-panel">
          <div className="section-heading">
            <div>
              <h2>Recent activity</h2>
              <p>Latest recorded outcomes</p>
            </div>
            <button onClick={() => onNavigate("activity")}>View all</button>
          </div>
          <ActivityList items={activity.slice(0, 5)} />
        </section>
      </div>
    </>
  );
}

export function ActivityPage({
  activity,
  filter,
  setFilter,
}: {
  activity: ConsoleActivityItem[];
  filter: "all" | ConsoleStatus;
  setFilter: (filter: "all" | ConsoleStatus) => void;
}) {
  const filtered = filterActivity(activity, filter);
  const filters: Array<{ key: typeof filter; label: string }> = [
    { key: "all", label: "All activity" },
    { key: "pending", label: "Pending" },
    { key: "approved", label: "Approved" },
    { key: "denied", label: "Denied" },
    { key: "auto_allowed", label: "Auto-allowed" },
    { key: "blocked", label: "Blocked" },
  ];
  return (
    <>
      <section className="page-heading">
        <div>
          <p className="eyebrow">Recorded actions</p>
          <h1>Activity history</h1>
          <p>Human decisions and policy outcomes are recorded separately. Showing up to 100 recent actions by submission time.</p>
        </div>
      </section>
      <div className="filter-tabs" role="group" aria-label="Filter activity">
        {filters.map((item) => (
          <button
            key={item.key}
            aria-pressed={filter === item.key}
            onClick={() => setFilter(item.key)}
          >
            {item.label}
            <span>
              {item.key === "all" ? activity.length : activity.filter((action) => action.status === item.key).length}
            </span>
          </button>
        ))}
      </div>
      <section className="activity-card">
        <div className="activity-table-head">
          <span>Action</span>
          <span>Outcome</span>
          <span>Decision source</span>
          <span>Time</span>
        </div>
        <ActivityList items={filtered} detailed />
      </section>
    </>
  );
}

function ActivityList({ items, detailed = false }: { items: ConsoleActivityItem[]; detailed?: boolean }) {
  return (
    <div className={`activity-list ${detailed ? "detailed" : ""}`}>
      {items.map((item) => (
        <article className="activity-item" key={item.id}>
          <div className={`activity-icon ${item.status}`}>
            <Icon
              name={item.status === "pending" ? "queue" : item.status === "approved" || item.status === "auto_allowed" ? "check" : "x"}
              size={15}
            />
          </div>
          <div className="activity-title">
            <strong>{item.title}</strong>
            <span>{item.detail}</span>
          </div>
          <div className="activity-outcome"><Badge status={item.status} /></div>
          <div className="activity-actor">
            <strong>
              {item.status === "pending"
                ? "Awaiting human decision"
                : item.status === "approved" || item.status === "denied"
                  ? "Human decision"
                  : "Policy outcome"}
            </strong>
            <span>{item.actor}</span>
          </div>
          <time>{item.time}</time>
        </article>
      ))}
    </div>
  );
}

export function AuditPage({ entries }: { entries: ConsoleAuditEntry[] }) {
  return (
    <>
      <section className="page-heading">
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
      <section className="audit-card">
        <div className="audit-head">
          <span>Sequence</span>
          <span>Event</span>
          <span>Principal</span>
          <span>Record hash</span>
          <span>Timestamp</span>
        </div>
        {entries.map((item) => (
          <div className="audit-row" key={item.id}>
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
