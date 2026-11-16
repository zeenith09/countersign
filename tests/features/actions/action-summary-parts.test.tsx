import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { seedActions } from "../../../prisma/seed-actions";
import type { Prisma } from "../../../src/generated/prisma/client";
import { summarizeAction, summarizeActionParts } from "../../../src/features/actions/action-summary";
import { ActionDetails } from "../../../src/features/legacy-queue/QueueList";

function joinedSummary(tool: string, parameters: Prisma.JsonValue): string {
  return summarizeActionParts(tool, parameters)
    .map((part) => part.value)
    .join("");
}

function renderSummary(tool: string, parameters: Prisma.JsonValue): string {
  const action = {
    id: "c076fb00-26d9-4dfd-9f31-000000000001",
    tool,
    parameters,
    summary: summarizeAction(tool, parameters),
    summaryParts: summarizeActionParts(tool, parameters),
    agentReasoning: "Test action",
    createdAt: "2026-01-01T10:00:00.000Z",
    age: "2 hours ago",
    policyRuleMatched: "example-rule",
    policyRuleDescription: "Example policy rule.",
  };
  return renderToStaticMarkup(createElement(ActionDetails, {
    action,
    onDecide: () => undefined,
    decisionState: null,
    submitting: false,
    onRefresh: () => undefined,
  }));
}

describe("action summary parts", () => {
  it.each([seedActions[4], seedActions[5], seedActions[6]])(
    "joins to the plain summary for $tool",
    ({ tool, parameters }) => {
      expect(joinedSummary(tool, parameters)).toBe(summarizeAction(tool, parameters));
    },
  );

  it("links only exact order and record identifiers to their routes", () => {
    const orderHtml = renderSummary("issue_refund", seedActions[4].parameters);
    const recordHtml = renderSummary("delete_record", seedActions[5].parameters);
    expect(orderHtml).toContain('href="/orders/ORDER-1005"');
    expect(orderHtml).toContain(">ORDER-1005</a>");
    expect(recordHtml).toContain('href="/records/RECORD-1006"');
    expect(recordHtml).toContain(">RECORD-1006</a>");
  });

  it.each([
    ["ORDER-1005/../x", "orderId"],
    ["javascript:alert(1)", "recordId"],
  ])("keeps malformed identifier %s as plain text", (value, field) => {
    const parameters = field === "orderId"
      ? { amount: 5000, currency: "USD", orderId: value }
      : { recordId: value };
    const html = renderSummary(field === "orderId" ? "issue_refund" : "delete_record", parameters);
    expect(html).toContain(value);
    expect(html).not.toContain("<a");
  });
});
