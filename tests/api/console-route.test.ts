import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { getPrisma, actionFindMany, actionGroupBy, auditFindMany } = vi.hoisted(() => ({
  getPrisma: vi.fn(),
  actionFindMany: vi.fn(),
  actionGroupBy: vi.fn(),
  auditFindMany: vi.fn(),
}));

vi.mock("../../src/lib/prisma", () => ({ getPrisma }));
vi.mock("server-only", () => ({}));

import { GET } from "../../src/app/api/console/route";
import { policy } from "../../src/lib/policy/policy";

const now = new Date("2026-11-16T00:00:00.000Z");
const pendingAction = {
  id: "pending-id",
  tool: "issue_refund",
  parameters: { amount: 400, currency: "USD", orderId: "ORDER-1001" },
  agentReasoning: "Customer was charged twice.",
  status: "pending",
  policyRuleMatched: "other-refunds-allowed",
  createdAt: now,
};

describe("GET /api/console", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    actionFindMany.mockResolvedValue([]);
    actionGroupBy.mockResolvedValue([]);
    auditFindMany.mockResolvedValue([]);
    getPrisma.mockReturnValue({
      action: { findMany: actionFindMany, groupBy: actionGroupBy },
      auditLog: { findMany: auditFindMany },
    });
    vi.spyOn(Date, "now").mockReturnValue(now.getTime());
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("preserves pending ordering, counts, activity mapping, audit mapping, and response headers", async () => {
    const approvedAction = {
      ...pendingAction,
      id: "approved-id",
      status: "approved",
      decision: { reviewer: "Alex", outcome: "approved", reason: "Reviewed." },
    };
    const autoAllowedAction = {
      ...pendingAction,
      id: "auto-allowed-id",
      status: "auto_allowed",
      policyRuleMatched: "other-refunds-allowed",
      decision: null,
    };
    actionFindMany
      .mockResolvedValueOnce([pendingAction])
      .mockResolvedValueOnce([approvedAction, pendingAction, autoAllowedAction]);
    actionGroupBy.mockResolvedValue([
      { status: "pending", _count: { _all: 1 } },
      { status: "approved", _count: { _all: 1 } },
      { status: "auto_allowed", _count: { _all: 1 } },
    ]);
    auditFindMany.mockResolvedValue([
      {
        id: "audit-review",
        sequence: BigInt(12),
        eventType: "action_decided",
        hash: "review-hash",
        createdAt: now,
        payload: { reviewer: "Alex" },
      },
      {
        id: "audit-submission",
        sequence: BigInt(11),
        eventType: "action_submitted",
        hash: "submission-hash",
        createdAt: now,
        payload: { agent_id: "demo-agent" },
      },
      {
        id: "audit-unknown",
        sequence: BigInt(10),
        eventType: "other_event",
        hash: "unknown-hash",
        createdAt: now,
        payload: ["not", "an", "object"],
      },
    ]);

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(body).toEqual({
      actions: [{
        id: "pending-id",
        tool: "issue_refund",
        title: "issue refund",
        summary: "The agent wants to refund $400 for order ORDER-1001.",
        reasoning: "Customer was charged twice.",
        age: "Just now",
        created: now.getTime(),
        status: "pending",
        risk: "Risk not assessed",
        rule: "other-refunds-allowed",
        ruleDescription: "Refunds not matched by the over-$500 rule are allowed.",
        parameters: pendingAction.parameters,
      }],
      counts: { pending: 1, approved: 1, auto_allowed: 1 },
      activity: [
        {
          id: "approved-id",
          title: "issue refund",
          detail: "The agent wants to refund $400 for order ORDER-1001.",
          status: "approved",
          actor: "Alex · Human decision",
          rule: "other-refunds-allowed",
          time: "Just now",
        },
        {
          id: "pending-id",
          title: "issue refund",
          detail: "The agent wants to refund $400 for order ORDER-1001.",
          status: "pending",
          actor: "Awaiting human decision",
          rule: "other-refunds-allowed",
          time: "Just now",
        },
        {
          id: "auto-allowed-id",
          title: "issue refund",
          detail: "The agent wants to refund $400 for order ORDER-1001.",
          status: "auto_allowed",
          actor: "No reviewer decision",
          rule: "other-refunds-allowed",
          time: "Just now",
        },
      ],
      audit: [
        {
          id: "audit-review",
          sequence: "12",
          event: "action_decided",
          hash: "review-hash",
          createdAt: now.toISOString(),
          principal: "Alex",
        },
        {
          id: "audit-submission",
          sequence: "11",
          event: "action_submitted",
          hash: "submission-hash",
          createdAt: now.toISOString(),
          principal: "demo-agent",
        },
        {
          id: "audit-unknown",
          sequence: "10",
          event: "other_event",
          hash: "unknown-hash",
          createdAt: now.toISOString(),
          principal: "Unknown (not recorded)",
        },
      ],
    });
    expect(actionFindMany).toHaveBeenNthCalledWith(1, {
      where: { status: "pending" },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    });
    expect(actionGroupBy).toHaveBeenCalledWith({ by: ["status"], _count: { _all: true } });
    expect(actionFindMany).toHaveBeenNthCalledWith(2, {
      include: { decision: true },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 100,
    });
    expect(auditFindMany).toHaveBeenCalledWith({
      orderBy: { sequence: "desc" },
      take: 100,
    });
  });

  it("returns empty collections and counts when the database has no console data", async () => {
    const response = await GET();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      actions: [],
      counts: {},
      activity: [],
      audit: [],
    });
  });

  it("maps descriptions for every configured policy rule into pending action DTOs", async () => {
    actionFindMany
      .mockResolvedValueOnce(policy.rules.map((rule, index) => ({
        ...pendingAction,
        id: `pending-${index}`,
        tool: rule.tool,
        policyRuleMatched: rule.id,
        parameters: rule.tool === "delete_record"
          ? { recordId: "RECORD-1006" }
          : rule.tool === "send_email"
            ? { to: "support@countersign.example", subject: "Review" }
            : pendingAction.parameters,
      })))
      .mockResolvedValueOnce([]);

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.actions.map(({ rule, ruleDescription }: { rule: string; ruleDescription: string }) => ({
      rule,
      ruleDescription,
    }))).toEqual(policy.rules.map(({ id, description }) => ({
      rule: id,
      ruleDescription: description,
    })));
  });

  it("keeps unknown and missing rule ids distinct from configured descriptions", async () => {
    const missingRule = { ...pendingAction, id: "missing-rule", policyRuleMatched: null };
    const unknownRule = { ...pendingAction, id: "unknown-rule", policyRuleMatched: "future-rule" };
    const noRuleMatch = { ...pendingAction, id: "no-rule", policyRuleMatched: "no_rule_match" };
    const unsupportedTool = { ...pendingAction, id: "unsupported", policyRuleMatched: "unsupported_tool" };
    const invalidParameters = { ...pendingAction, id: "invalid-parameters", policyRuleMatched: "invalid_parameters" };
    actionFindMany
      .mockResolvedValueOnce([missingRule, unknownRule, noRuleMatch, unsupportedTool, invalidParameters])
      .mockResolvedValueOnce([]);

    const response = await GET();
    const body = await response.json();

    expect(body.actions.map(({ id, rule, ruleDescription }: {
      id: string;
      rule: string;
      ruleDescription: string;
    }) => ({ id, rule, ruleDescription }))).toEqual([
      { id: "missing-rule", rule: "Unknown (not recorded)", ruleDescription: "No description available" },
      { id: "unknown-rule", rule: "future-rule", ruleDescription: "No description available" },
      {
        id: "no-rule",
        rule: "no_rule_match",
        ruleDescription: "No policy rule matched; reviewer approval is required.",
      },
      {
        id: "unsupported",
        rule: "unsupported_tool",
        ruleDescription: "The submitted tool is not registered and is blocked.",
      },
      {
        id: "invalid-parameters",
        rule: "invalid_parameters",
        ruleDescription: "The parameters do not match the tool requirements, so the action is blocked.",
      },
    ]);
  });

  it("does not present missing or blank reviewers as human decisions", async () => {
    const recent = [
      { ...pendingAction, id: "no-decision", status: "approved", decision: null },
      { ...pendingAction, id: "empty-reviewer", status: "denied", decision: { reviewer: "", outcome: "denied", reason: "" } },
      { ...pendingAction, id: "whitespace-reviewer", status: "denied", decision: { reviewer: " \t ", outcome: "denied", reason: "" } },
      { ...pendingAction, id: "missing-rule", status: "blocked", policyRuleMatched: null, decision: null },
    ];
    actionFindMany.mockResolvedValueOnce([]).mockResolvedValueOnce(recent);

    const response = await GET();
    const body = await response.json();

    expect(body.activity.map(({ id, actor }: { id: string; actor: string }) => ({ id, actor }))).toEqual([
      { id: "no-decision", actor: "No reviewer decision" },
      { id: "empty-reviewer", actor: "No reviewer decision" },
      { id: "whitespace-reviewer", actor: "No reviewer decision" },
      { id: "missing-rule", actor: "No reviewer decision" },
    ]);
  });

  it.each([
    ["null", null],
    ["array", []],
    ["number", 7],
    ["object", { name: "untrusted" }],
  ])("labels non-string audit principals as unknown when both IDs are %s", async (_label, nonString) => {
    auditFindMany.mockResolvedValue([{
      id: "audit-untrusted-principal",
      sequence: BigInt(1),
      eventType: "action_submitted",
      hash: "audit-hash",
      createdAt: now,
      payload: { reviewer: nonString, agent_id: nonString },
    }]);

    const response = await GET();
    const body = await response.json();

    expect(body.audit[0].principal).toBe("Unknown (not recorded)");
  });

  it("returns the existing generic error response when a database query fails", async () => {
    actionGroupBy.mockRejectedValue(new Error("database unavailable"));

    const response = await GET();

    expect(response.status).toBe(500);
    expect(response.headers.get("Cache-Control")).toBeNull();
    expect(await response.json()).toEqual({ message: "Console data could not be loaded." });
    expect(console.error).toHaveBeenCalledOnce();
    expect(console.error).toHaveBeenCalledWith("Failed to load console snapshot.");
  });
});
