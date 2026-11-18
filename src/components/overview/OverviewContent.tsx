"use client";

import type { ConsoleActivityItem, ConsoleStatus } from "../../lib/console/contract";
import type { ConsoleCounts, ConsolePage } from "../../lib/console/view-model";
import { Icon, Metric } from "../ui/ConsoleElements";
import { ActivityList } from "../activity/ActivityList";
import { PageLoadingIndicator } from "../activity/PageLoadingIndicator";

export function OverviewPage({
  counts,
  activity,
  loaded = true,
  onNavigate,
  onStatusClick,
}: {
  counts: ConsoleCounts;
  activity: ConsoleActivityItem[];
  loaded?: boolean;
  onNavigate: (page: ConsolePage) => void;
  onStatusClick: (status: ConsoleStatus) => void;
}) {
  return (
    <>
      <section className="page-heading" data-reveal>
        <div>
          <p className="eyebrow">Governance workspace</p>
          <h1>Overview</h1>
          <p>Human review and deterministic policy outcomes, at a glance.</p>
        </div>
        <button className="secondary-button" onClick={() => onNavigate("queue")}>
          Open approval queue <Icon name="arrow" size={16} />
        </button>
      </section>
      <section className="metrics overview-metrics" data-reveal>
        <Metric label="Pending" value={counts.pending} tone="amber" onClick={() => onStatusClick("pending")} />
        <Metric label="Human-approved" value={counts.approved} tone="green" onClick={() => onStatusClick("approved")} />
        <Metric label="Human-denied" value={counts.denied} tone="red" onClick={() => onStatusClick("denied")} />
        <Metric label="Auto-allowed" value={counts.auto} tone="blue" onClick={() => onStatusClick("auto_allowed")} />
        <Metric label="Blocked" value={counts.blocked} tone="slate" onClick={() => onStatusClick("blocked")} />
      </section>
      <div className="overview-grid">
        <section className="overview-hero" data-reveal>
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
        <section className="recent-panel" data-reveal>
          <div className="section-heading">
            <div>
              <h2>Recent activity</h2>
              <p>Latest recorded outcomes</p>
            </div>
            <button onClick={() => onNavigate("activity")}>View all</button>
          </div>
          {!loaded ? (
            <PageLoadingIndicator message="Loading recent activity." kind="activity" rows={3} compact />
          ) : activity.length === 0 ? (
            <p className="page-empty-state">No recent activity.</p>
          ) : (
            <ActivityList items={activity.slice(0, 5)} />
          )}
        </section>
      </div>
    </>
  );
}
