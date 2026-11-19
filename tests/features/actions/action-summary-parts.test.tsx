import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { seedActions } from "../../../prisma/seed-actions";
import type { Prisma } from "../../../src/generated/prisma/client";
import {
  getSummaryIdentifierHref,
  summarizeAction,
  summarizeActionParts,
} from "../../../src/lib/actions/action-summary";
import { ActionDetails } from "../../../src/components/legacy-queue/QueueList";

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
      ? { amount: 5000, orderId: value }
      : { recordId: value };
    const html = renderSummary(field === "orderId" ? "issue_refund" : "delete_record", parameters);
    expect(html).toContain(value);
    expect(html).not.toContain("<a");
  });

  it("keeps malformed or incomplete tool parameters in a plain-text fallback", () => {
    expect(summarizeAction("issue_refund", null)).toContain("parameters are not an object");
    expect(summarizeAction("issue_refund", { amount: Infinity, orderId: "ORDER-1" }))
      .toContain("refund parameters are incomplete or invalid");
    expect(summarizeAction("delete_record", {})).toContain("record ID is missing or invalid");
    expect(summarizeAction("send_email", { to: "", subject: "Review" }))
      .toContain("email parameters are incomplete or invalid");
    expect(summarizeAction("unknown_tool", {})).toBe("Summary unavailable: unsupported action.");
  });

  it("falls back to a text summary for malformed refund parts and array payloads", () => {
    const malformedRefund = { amount: "750", orderId: "ORDER-1005" };

    expect(summarizeActionParts("issue_refund", malformedRefund)).toEqual([
      { type: "text", value: summarizeAction("issue_refund", malformedRefund) },
    ]);
    expect(summarizeActionParts("delete_record", { recordId: "" })).toEqual([
      { type: "text", value: "Summary unavailable: record ID is missing or invalid." },
    ]);
    expect(summarizeActionParts("issue_refund", ["not", "an", "object"])).toEqual([
      { type: "text", value: "Summary unavailable: action parameters are not an object." },
    ]);
  });

  it("builds links only for exact identifiers of the matching kind", () => {
    expect(getSummaryIdentifierHref({ type: "identifier", kind: "order", value: "ORDER-1005" }))
      .toBe("/orders/ORDER-1005");
    expect(getSummaryIdentifierHref({ type: "identifier", kind: "record", value: "RECORD-1006" }))
      .toBe("/records/RECORD-1006");
    expect(getSummaryIdentifierHref({ type: "identifier", kind: "order", value: "RECORD-1006" }))
      .toBeNull();
    expect(getSummaryIdentifierHref({ type: "identifier", kind: "record", value: "RECORD-1/../x" }))
      .toBeNull();
  });
});
