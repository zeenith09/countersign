"use client";

import type { ConsoleActivityItem, ConsoleStatus } from "../../lib/console/contract";
import { filterActivity } from "../../lib/console/view-model";
import { ActivityList } from "../activity/ActivityList";
import { PageLoadingIndicator } from "../activity/PageLoadingIndicator";

export function ActivityPage({
  activity,
  loaded = true,
  filter,
  setFilter,
}: {
  activity: ConsoleActivityItem[];
  loaded?: boolean;
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
      <section className="page-heading" data-reveal>
        <div>
          <p className="eyebrow">Recorded actions</p>
          <h1>Activity history</h1>
          <p>Human decisions and policy outcomes are recorded separately. Showing up to 100 recent actions by submission time.</p>
        </div>
      </section>
      <div className="filter-tabs" role="group" aria-label="Filter activity" data-reveal>
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
      <section className="activity-card" aria-busy={!loaded}>
        <div className="activity-table-head">
          <span>Action</span>
          <span>Outcome</span>
          <span>Decision source</span>
          <span>Time</span>
        </div>
        {!loaded ? (
          <PageLoadingIndicator message="Loading activity history." kind="activity" rows={4} />
        ) : filtered.length === 0 ? (
          <p className="page-empty-state">No activity matches this filter.</p>
        ) : (
          <ActivityList items={filtered} detailed />
        )}
      </section>
    </>
  );
}
