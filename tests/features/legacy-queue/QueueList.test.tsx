import type { ReactElement, ReactNode } from "react";
import { isValidElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const selection = vi.hoisted(() => ({
  selectedId: null as string | null,
  setSelectedId: vi.fn<(next: string | null | ((previous: string | null) => string | null)) => void>(),
}));

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return {
    ...actual,
    useState: () => [selection.selectedId, selection.setSelectedId] as const,
  };
});

import { QueueList, type QueueAction } from "../../../src/components/legacy-queue/QueueList";

type SelectButtonProps = {
  children?: ReactNode;
  "aria-label"?: string;
  "aria-pressed"?: boolean;
  onClick?: (event: never) => void;
};

function findSelectButton(node: ReactNode, labelFragment: string): ReactElement<SelectButtonProps> | undefined {
  if (Array.isArray(node)) {
    for (const child of node) {
      const button = findSelectButton(child, labelFragment);
      if (button) return button;
    }
    return undefined;
  }
  if (!isValidElement<SelectButtonProps>(node)) return undefined;
  if (node.type === "button" && node.props["aria-label"]?.includes(labelFragment)) return node;
  return findSelectButton(node.props.children, labelFragment);
}

describe("QueueList selection", () => {
  const actions: QueueAction[] = [
    {
      id: "action-one",
      tool: "issue_refund",
      parameters: { amount: 25 },
      summary: "Refund request",
      summaryParts: [{ type: "text", value: "Refund request" }],
      agentReasoning: "Customer requested a refund",
      createdAt: "2026-01-01T10:00:00.000Z",
      age: "2 hours ago",
      policyRuleMatched: "refund-over-500",
      policyRuleDescription: "Refunds over $500 require reviewer approval.",
    },
    {
      id: "action-two",
      tool: "send_email",
      parameters: { to: "support@countersign.example" },
      summary: "Email request",
      summaryParts: [{ type: "text", value: "Email request" }],
      agentReasoning: "Customer requested an update",
      createdAt: "2026-01-01T11:00:00.000Z",
      age: "1 hour ago",
      policyRuleMatched: null,
      policyRuleDescription: null,
    },
  ];
  const props = { actions, onDecide: vi.fn(), decisionState: null, submitting: false, onRefresh: vi.fn() };

  beforeEach(() => {
    selection.selectedId = null;
    selection.setSelectedId.mockReset();
    selection.setSelectedId.mockImplementation((next) => {
      selection.selectedId = typeof next === "function" ? next(selection.selectedId) : next;
    });
  });

  it("shows each rule label and toggles details for the selected action", () => {
    const initial = renderToStaticMarkup(QueueList(props));
    expect(initial).toContain("Matched policy rule: </span>refund-over-500 — Refunds over $500 require reviewer approval.");
    expect(initial).toContain("Matched policy rule: </span>Not recorded — No matched policy rule was recorded.");
    expect(initial.match(/Select action/g)).toHaveLength(2);
    expect(initial).not.toContain("Action details");

    const firstButton = findSelectButton(QueueList(props), "issue_refund");
    expect(firstButton?.props["aria-pressed"]).toBe(false);
    firstButton?.props.onClick?.(undefined as never);

    const firstSelected = renderToStaticMarkup(QueueList(props));
    expect(firstSelected).toContain(">Selected</button>");
    expect(firstSelected).toContain("Action details");
    expect(firstSelected).toContain("Refund request");
    expect(firstSelected).toContain("Matched policy rule: </span>refund-over-500 — Refunds over $500 require reviewer approval.");
    expect(firstSelected).toContain("Risk assessment status: </span><span>Risk not assessed</span>");

    const secondButton = findSelectButton(QueueList(props), "send_email");
    expect(secondButton?.props["aria-pressed"]).toBe(false);
    secondButton?.props.onClick?.(undefined as never);

    const secondSelected = renderToStaticMarkup(QueueList(props));
    expect(secondSelected).toContain("Email request");
    expect(secondSelected).toContain('aria-pressed="true"');

    const selectedSecondButton = findSelectButton(QueueList(props), "send_email");
    selectedSecondButton?.props.onClick?.(undefined as never);

    const deselected = renderToStaticMarkup(QueueList(props));
    expect(deselected).not.toContain("Action details");
    expect(deselected.match(/Select action/g)).toHaveLength(2);
    expect(deselected).not.toContain('aria-pressed="true"');
  });

  it.each([
    ["no_rule_match", "No policy rule matched; reviewer approval is required."],
    ["unsupported_tool", "The submitted tool is not registered and is blocked."],
  ])("shows the built-in description for %s", (ruleId, description) => {
    const action = {
      ...actions[0],
      policyRuleMatched: ruleId,
      policyRuleDescription: null,
    };
    const markup = renderToStaticMarkup(QueueList({ ...props, actions: [action] }));
    expect(markup).toContain(`Matched policy rule: </span>${ruleId} — ${description}`);
  });
});
