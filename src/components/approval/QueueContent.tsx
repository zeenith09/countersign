"use client";

import type { ConsoleAction, ConsoleStatus } from "../../lib/console/contract";
import type { ConsoleCounts, ConsolePage } from "../../lib/console/view-model";
import { sortPendingActions } from "../../lib/console/view-model";
import { Badge, Icon, Metric } from "../ui/ConsoleElements";

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
      <section className="page-heading" data-reveal>
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
      <section className="metrics" aria-label="Action counts" data-reveal>
        <Metric label="Pending" value={counts.pending} tone="amber" onClick={() => onStatusClick("pending")} />
        <Metric label="Human-approved" value={counts.approved} tone="green" onClick={() => onStatusClick("approved")} />
        <Metric label="Human-denied" value={counts.denied} tone="red" onClick={() => onStatusClick("denied")} />
        <Metric label="Auto-allowed" value={counts.auto} tone="blue" onClick={() => onStatusClick("auto_allowed")} />
        <Metric label="Blocked" value={counts.blocked} tone="slate" onClick={() => onStatusClick("blocked")} />
      </section>
      <section className="queue-section" aria-labelledby="pending-heading" aria-busy={!loaded}>
        <div className="section-heading" data-reveal>
          <div>
            <h2 id="pending-heading">Pending actions</h2>
            <p role={!loaded ? "status" : undefined}>
              {loaded
                ? `${actions.length} ${actions.length === 1 ? "action requires" : "actions require"} a human decision`
                : "Loading pending actions."}
            </p>
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
        {!loaded ? (
          <div className="queue-skeleton-list" aria-hidden="true">
            {[0, 1, 2].map((item) => (
              <div className="queue-skeleton-card" key={item}>
                <span className="queue-skeleton-icon" />
                <div className="queue-skeleton-content">
                  <span className="queue-skeleton-tool" />
                  <span className="queue-skeleton-title" />
                  <span className="queue-skeleton-summary" />
                  <div className="queue-skeleton-meta">
                    <span />
                    <span />
                    <span />
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : actions.length === 0 ? (
          <div className="empty" data-reveal>
            <div className="empty-icon">
              <Icon name="check" />
            </div>
            <h3>Queue is clear</h3>
            <p>No actions are waiting for human review. Check again for new submissions.</p>
          </div>
        ) : (
          <div className="queue-list">
            {sortedActions.map((action) => (
              <article className="action-card" data-reveal key={action.id} onClick={() => onReview(action)}>
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
      <section className="policy-receipt" data-reveal>
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
