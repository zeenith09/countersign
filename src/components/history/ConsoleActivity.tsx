"use client";

import { useEffect, useState, type ReactNode } from "react";
import { z } from "zod";

const statusSchema = z.enum(["pending", "approved", "denied", "auto_allowed", "blocked"]);
const snapshotSchema = z.object({
  counts: z.array(z.object({ status: statusSchema, _count: z.object({ _all: z.number().int().nonnegative() }) })),
  recent: z.array(z.object({
    id: z.string(),
    tool: z.string(),
    status: statusSchema,
    policyRuleMatched: z.string().nullable(),
    createdAt: z.string(),
    decision: z.object({ reviewer: z.string(), decidedAt: z.string() }).nullable(),
  })),
});

const labels = {
  pending: "Pending",
  approved: "Human-approved",
  denied: "Human-denied",
  auto_allowed: "Auto-allowed",
  blocked: "Blocked",
} as const;
const tones = {
  pending: "amber",
  approved: "green",
  denied: "red",
  auto_allowed: "blue",
  blocked: "slate",
} as const;

export function ConsoleActivity({ pendingCount, children }: { pendingCount: number; children: ReactNode }) {
  const [snapshot, setSnapshot] = useState<z.infer<typeof snapshotSchema> | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const response = await fetch("/api/console", { cache: "no-store", signal: controller.signal });
        if (!response.ok) throw new Error("Console activity request failed.");
        const result = snapshotSchema.safeParse(await response.json());
        if (!result.success) throw new Error("Console activity response was invalid.");
        setSnapshot(result.data);
        setError(false);
      } catch {
        if (!controller.signal.aborted) {
          setSnapshot(null);
          setError(true);
        }
      }
    }
    void load();
    return () => controller.abort();
  }, [pendingCount]);

  return (
    <>
      <section className="metrics" aria-label="Action counts">
        {statusSchema.options.map((status) => (
          <div className="metric" key={status}>
            <div className={`metric-icon ${tones[status]}`} aria-hidden="true">
              {status === "pending" ? "!" : status === "approved" || status === "auto_allowed" ? "✓" : "×"}
            </div>
            <div>
              <strong>{snapshot ? snapshot.counts.find((count) => count.status === status)?._count._all ?? 0 : "—"}</strong>
              <span>{labels[status]}</span>
            </div>
          </div>
        ))}
      </section>
      {children}
      <section id="activity" className="recent-panel console-activity" aria-labelledby="activity-heading">
        <div className="section-heading">
          <div>
            <h2 id="activity-heading">Recent activity</h2>
            <p>Policy outcomes and human decisions, ordered by submission time.</p>
          </div>
        </div>
        {error ? (
          <p role="status">Activity could not be loaded. Refresh the page to try again.</p>
        ) : !snapshot ? (
          <p role="status">Loading action counts and activity.</p>
        ) : snapshot.recent.length === 0 ? (
          <p>No completed actions yet.</p>
        ) : (
          <ul className="activity-list">
            {snapshot.recent.map((action) => (
              <li className="activity-item" key={action.id}>
                <div className={`activity-icon ${action.status}`} aria-hidden="true">
                  {action.status === "approved" || action.status === "auto_allowed" ? "✓" : "×"}
                </div>
                <div className="activity-title">
                  <strong>{action.tool}</strong>
                  <span>{action.policyRuleMatched ?? "Unknown (not recorded)"}</span>
                </div>
                <div className="activity-outcome"><span className={`badge badge-${action.status}`}>{labels[action.status]}</span></div>
                <div className="activity-actor">
                  <strong>{action.decision?.reviewer.trim() ? "Human decision" : "No reviewer decision"}</strong>
                  <span>{action.decision?.reviewer.trim() || "Unknown (not recorded)"}</span>
                </div>
                <time dateTime={action.createdAt}>Submitted {new Date(action.createdAt).toLocaleString()}</time>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
