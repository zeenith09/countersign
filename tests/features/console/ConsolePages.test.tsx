import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { ConsoleAction, ConsoleActivityItem, ConsoleAuditEntry } from "../../../src/lib/console/contract";
import {
  ActivityPage,
} from "../../../src/components/history/HistoryContent";
import { AuditPage } from "../../../src/components/log/AuditContent";
import { OverviewPage } from "../../../src/components/overview/OverviewContent";
import { QueuePage } from "../../../src/components/approval/QueueContent";

const pendingAction: ConsoleAction = {
  id: "action-1",
  tool: "issue_refund",
  title: "issue refund",
  summary: "The agent wants to refund $750 for order ORDER-1005.",
  reasoning: "Customer requested a refund.",
  age: "2 hours ago",
  created: 1,
  status: "pending",
  risk: "Risk not assessed",
  rule: "refund-over-500",
  ruleDescription: "Refunds over $500 require reviewer approval.",
  parameters: { amount: 750, currency: "USD", orderId: "ORDER-1005" },
};

const activity: ConsoleActivityItem[] = [
  { id: "activity-1", title: "issue refund", detail: "Refund request", status: "pending", actor: "Awaiting human decision", time: "Just now" },
];
const activityByStatus: ConsoleActivityItem[] = [
  ...(["pending", "approved", "denied", "auto_allowed", "blocked"] as const).map((status) => ({
    id: `activity-${status}`,
    title: `Action ${status}`,
    detail: `Details for ${status}`,
    status,
    actor: "Test reviewer",
    time: "Just now",
  })),
];

const counts = { pending: 1, approved: 0, denied: 0, auto: 0, blocked: 0 };

describe("console presentation components", () => {
  it("renders pending action cards with rule context and review action", () => {
    const markup = renderToStaticMarkup(
      <QueuePage
        actions={[pendingAction]}
        counts={counts}
        loaded
        sort="oldest"
        onSortChange={vi.fn()}
        onGenerate={vi.fn()}
        onReview={vi.fn()}
        onStatusClick={vi.fn()}
        onNavigate={vi.fn()}
      />,
    );

    expect(markup).toContain("Pending actions");
    expect(markup).toContain("The agent wants to refund $750 for order ORDER-1005.");
    expect(markup).toContain("refund-over-500");
    expect(markup).toContain("Refunds over $500 require reviewer approval.");
    expect(markup).toContain("Review action");
    expect(markup).toContain("1 action requires a human decision");
    expect(markup).toContain('aria-label="Sort pending actions: oldest first"');
  });

  it("renders the empty queue state only after the snapshot is loaded", () => {
    const markup = renderToStaticMarkup(
      <QueuePage
        actions={[]}
        counts={counts}
        loaded
        sort="oldest"
        onSortChange={vi.fn()}
        onGenerate={vi.fn()}
        onReview={vi.fn()}
        onStatusClick={vi.fn()}
        onNavigate={vi.fn()}
      />,
    );

    expect(markup).toContain("Queue is clear");
    expect(markup).toContain("No actions are waiting for human review.");
  });

  it("labels an action without a reviewer decision and keeps its rule separate", () => {
    const markup = renderToStaticMarkup(
      <ActivityPage
        activity={[{
          id: "action-without-reviewer",
          title: "Delete record",
          detail: "A record was deleted.",
          status: "approved",
          actor: "No reviewer decision",
          rule: "delete-record-blocked",
          time: "Just now",
        }]}
        filter="all"
        setFilter={vi.fn()}
      />,
    );

    expect(markup).toContain("<strong>No reviewer decision</strong>");
    expect(markup).toContain("Policy rule: delete-record-blocked");
    expect(markup).not.toContain("<strong>Human decision</strong>");
  });

  it("keeps a loading queue distinct from a loaded empty queue", () => {
    const markup = renderToStaticMarkup(
      <QueuePage
        actions={[]}
        counts={counts}
        loaded={false}
        sort="newest"
        onSortChange={vi.fn()}
        onGenerate={vi.fn()}
        onReview={vi.fn()}
        onStatusClick={vi.fn()}
        onNavigate={vi.fn()}
      />,
    );

    expect(markup).toContain("Loading pending actions.");
    expect(markup).toContain('aria-label="Sort pending actions: newest first"');
    expect(markup).toContain('aria-busy="true"');
    expect(markup).toContain('role="status"');
    expect(markup.match(/class="queue-skeleton-card"/g)).toHaveLength(3);
    expect(markup).not.toContain("Queue is clear");
    expect(markup).not.toContain("class=\"action-card\"");
  });

  it("shows loading indicators for metric counts, overview, activity, and audit data", () => {
    const loadingCounts = { pending: null, approved: null, denied: null, auto: null, blocked: null };
    const queueMarkup = renderToStaticMarkup(
      <QueuePage
        actions={[]}
        counts={loadingCounts}
        loaded={false}
        sort="newest"
        onSortChange={vi.fn()}
        onGenerate={vi.fn()}
        onReview={vi.fn()}
        onStatusClick={vi.fn()}
        onNavigate={vi.fn()}
      />,
    );
    const overviewMarkup = renderToStaticMarkup(
      <OverviewPage
        counts={loadingCounts}
        activity={[]}
        loaded={false}
        onNavigate={vi.fn()}
        onStatusClick={vi.fn()}
      />,
    );
    const activityMarkup = renderToStaticMarkup(
      <ActivityPage activity={[]} loaded={false} filter="all" setFilter={vi.fn()} />,
    );
    const auditMarkup = renderToStaticMarkup(<AuditPage entries={[]} loaded={false} />);

    expect(queueMarkup.match(/class="metric-skeleton"/g)).toHaveLength(5);
    expect(queueMarkup).toContain('aria-label="Pending count loading"');
    expect(overviewMarkup).toContain("Loading recent activity.");
    expect(overviewMarkup).toContain('aria-busy="true"');
    expect(overviewMarkup).toContain("overview-activity-loading");
    expect(overviewMarkup).not.toContain("<p>Loading recent activity.</p>");
    expect(activityMarkup).toContain("Loading activity history.");
    expect(activityMarkup.match(/class="page-loading-row"/g)).toHaveLength(4);
    expect(auditMarkup).toContain("Loading audit log.");
    expect(auditMarkup.match(/class="page-loading-row"/g)).toHaveLength(5);
  });

  it("sorts and renders email, refund, and other-tool cards with distinct summaries", () => {
    const actions: ConsoleAction[] = [
      { ...pendingAction, id: "refund-later", title: "Later refund", created: 3 },
      {
        ...pendingAction,
        id: "email",
        tool: "send_email",
        title: "Send email",
        created: 2,
      },
      {
        ...pendingAction,
        id: "delete",
        tool: "delete_record",
        title: "Delete record",
        created: 1,
      },
    ];
    const markup = renderToStaticMarkup(
      <QueuePage
        actions={actions}
        counts={counts}
        loaded
        sort="newest"
        onSortChange={vi.fn()}
        onGenerate={vi.fn()}
        onReview={vi.fn()}
        onStatusClick={vi.fn()}
        onNavigate={vi.fn()}
      />,
    );

    expect(markup.indexOf("Later refund")).toBeLessThan(markup.indexOf("Send email"));
    expect(markup.indexOf("Send email")).toBeLessThan(markup.indexOf("Delete record"));
    expect(markup).toContain("issue_refund");
    expect(markup).toContain("send_email");
    expect(markup).toContain("delete_record");
  });

  it("renders filtered activity and audit records through their extracted pages", () => {
    const activityMarkup = renderToStaticMarkup(
      <ActivityPage activity={activity} filter="pending" setFilter={vi.fn()} />,
    );
    const auditEntry: ConsoleAuditEntry = {
      id: "audit-1",
      sequence: "10",
      event: "action_submitted",
      hash: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
      createdAt: "2026-11-15T20:00:00.000Z",
      principal: "demo-agent",
    };
    const auditMarkup = renderToStaticMarkup(<AuditPage entries={[auditEntry]} />);
    const overviewMarkup = renderToStaticMarkup(
      <OverviewPage counts={counts} activity={activity} onNavigate={vi.fn()} onStatusClick={vi.fn()} />,
    );

    expect(activityMarkup).toContain("Activity history");
    expect(activityMarkup).toContain('aria-pressed="true"');
    expect(activityMarkup).toContain("Awaiting human decision");
    expect(auditMarkup).toContain("Chain not verified in this view");
    expect(auditMarkup).toContain("#10");
    expect(auditMarkup).toContain("action_submitted");
    expect(overviewMarkup).toContain("Governance workspace");
    expect(overviewMarkup).toContain("Recent activity");
  });

  it("renders all activity decision sources and status filter counts", () => {
    const filteredMarkup = renderToStaticMarkup(
      <ActivityPage activity={activityByStatus} filter="denied" setFilter={vi.fn()} />,
    );
    const allMarkup = renderToStaticMarkup(
      <ActivityPage activity={activityByStatus} filter="all" setFilter={vi.fn()} />,
    );

    expect(filteredMarkup).toContain('aria-pressed="true"');
    expect(filteredMarkup).toContain("Action denied");
    expect(filteredMarkup).not.toContain("Action pending");
    expect(allMarkup).toContain("Human decision");
    expect(allMarkup).toContain("Policy outcome");
    expect(allMarkup).toContain("Awaiting human decision");
    expect(allMarkup).toContain(">5</span>");
  });

  it("renders overview with unavailable counts and an empty audit log", () => {
    const overviewMarkup = renderToStaticMarkup(
      <OverviewPage
        counts={{ pending: null, approved: null, denied: null, auto: null, blocked: null }}
        activity={activityByStatus}
        onNavigate={vi.fn()}
        onStatusClick={vi.fn()}
      />,
    );
    const auditMarkup = renderToStaticMarkup(<AuditPage entries={[]} />);

    expect(overviewMarkup).toContain("Review — pending actions");
    expect(overviewMarkup).toContain("Awaiting human decision");
    expect(overviewMarkup).toContain("Policy outcome");
    expect(auditMarkup).toContain("Audit log");
    expect(auditMarkup).toContain("Latest 100 recorded hash-chained events.");
    expect(auditMarkup).not.toContain("audit-row");
  });
});
