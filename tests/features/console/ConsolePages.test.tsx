import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { ConsoleAction, ConsoleActivityItem, ConsoleAuditEntry } from "../../../src/features/console/contract";
import {
  ActivityPage,
  AuditPage,
  OverviewPage,
  QueuePage,
} from "../../../src/features/console/components/ConsolePages";

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
    expect(markup).not.toContain("Queue is clear");
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
