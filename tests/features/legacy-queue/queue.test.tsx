import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { seedActions } from "../../../prisma/seed-actions";
import { formatAge } from "../../../src/lib/actions/format-age";
import { AssessmentStatus } from "../../../src/components/legacy-queue/QueueDisplay";
import { getConsoleCounts } from "../../../src/lib/console/view-model";
import { QueuePage } from "../../../src/components/approval/QueueContent";
import { consoleSnapshotSchema } from "../../../src/lib/console/contract";
import { policy } from "../../../src/lib/policy/policy";

const { actionFindMany, actionGroupBy, auditFindMany, getPrisma } = vi.hoisted(() => ({
  actionFindMany: vi.fn(),
  actionGroupBy: vi.fn(),
  auditFindMany: vi.fn(),
  getPrisma: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("../../../src/lib/prisma", () => ({ getPrisma }));

import { GET } from "../../../src/app/api/console/route";

const callbacks = {
  onSortChange: vi.fn(),
  onGenerate: vi.fn(),
  onReview: vi.fn(),
  onStatusClick: vi.fn(),
  onNavigate: vi.fn(),
};

describe("approval queue", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it("loads the current console queue and renders pending actions oldest first", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T12:00:00Z"));
    actionFindMany
      .mockResolvedValueOnce([
        {
          id: "later-action",
          tool: seedActions[0].tool,
          parameters: seedActions[0].parameters,
          agentReasoning: "A newer review request.",
          createdAt: new Date("2026-01-01T11:00:00Z"),
          policyRuleMatched: "refund-over-500",
        },
        {
          id: seedActions[0].id,
          tool: seedActions[0].tool,
          parameters: seedActions[0].parameters,
          agentReasoning: seedActions[0].agentReasoning,
          createdAt: new Date("2026-01-01T10:00:00Z"),
          policyRuleMatched: "refund-over-500",
        },
      ])
      .mockResolvedValueOnce([]);
    actionGroupBy.mockResolvedValue([{ status: "pending", _count: { _all: 2 } }]);
    auditFindMany.mockResolvedValue([]);
    getPrisma.mockReturnValue({
      action: { findMany: actionFindMany, groupBy: actionGroupBy },
      auditLog: { findMany: auditFindMany },
    });

    const response = await GET();
    const snapshot = consoleSnapshotSchema.parse(await response.json());
    const markup = renderToStaticMarkup(
      <QueuePage
        actions={snapshot.actions}
        counts={getConsoleCounts(snapshot)}
        loaded
        sort="oldest"
        {...callbacks}
      />,
    );

    expect(response.status).toBe(200);
    expect(actionFindMany).toHaveBeenNthCalledWith(1, {
      where: { status: "pending" },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    });
    expect(markup.indexOf(seedActions[0].id)).toBeLessThan(markup.indexOf("later-action"));
    expect(markup).toContain(seedActions[0].tool);
    expect(markup).toContain(seedActions[0].agentReasoning);
    expect(markup).toContain("2 hours ago");
    expect(markup).toContain("Pending review");
    expect(markup).toContain("Risk not assessed");
    expect(markup).toContain("refund-over-500");
    expect(markup).toContain("Refunds over $500 require reviewer approval.");
    expect(markup).toContain("Review action");
  });

  it("renders the current gateway policy descriptions for every configured rule", async () => {
    actionFindMany
      .mockResolvedValueOnce(policy.rules.map((rule, index) => ({
        id: `${seedActions[0].id}-${index}`,
        tool: rule.tool,
        parameters: rule.tool === "delete_record"
          ? { recordId: "RECORD-1006" }
          : rule.tool === "send_email"
            ? { to: "support@countersign.example", subject: "Review", body: "Review" }
            : seedActions[0].parameters,
        agentReasoning: seedActions[0].agentReasoning,
        createdAt: new Date("2026-01-01T10:00:00Z"),
        policyRuleMatched: rule.id,
      })))
      .mockResolvedValueOnce([]);
    actionGroupBy.mockResolvedValue([{ status: "pending", _count: { _all: policy.rules.length } }]);
    auditFindMany.mockResolvedValue([]);
    getPrisma.mockReturnValue({
      action: { findMany: actionFindMany, groupBy: actionGroupBy },
      auditLog: { findMany: auditFindMany },
    });

    const response = await GET();
    const snapshot = consoleSnapshotSchema.parse(await response.json());
    const markup = renderToStaticMarkup(
      <QueuePage
        actions={snapshot.actions}
        counts={getConsoleCounts(snapshot)}
        loaded
        sort="oldest"
        {...callbacks}
      />,
    );

    for (const rule of policy.rules) {
      expect(markup).toContain(rule.id);
      expect(markup).toContain(rule.description);
    }
  });

  it("supports the four assessment statuses as text", () => {
    expect(renderToStaticMarkup(<AssessmentStatus status="not_assessed" />)).toContain("Risk not assessed");
    expect(renderToStaticMarkup(<AssessmentStatus status="pending" />)).toContain("Assessment pending");
    expect(renderToStaticMarkup(<AssessmentStatus status="unavailable" />)).toContain("Risk assessment unavailable");
    expect(renderToStaticMarkup(<AssessmentStatus status="failed" />)).toContain("Assessment failed");
  });

  it("formats the requested relative age example", () => {
    expect(formatAge(new Date("2026-01-01T10:00:00Z"), Date.parse("2026-01-01T12:00:00Z"))).toBe("2 hours ago");
  });
});
