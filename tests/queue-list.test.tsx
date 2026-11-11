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

import { QueueList } from "../src/app/queue-list";

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
  const actions = [
    {
      id: "action-one",
      tool: "issue_refund",
      parameters: { amount: 25 },
      summary: "Refund request",
      agentReasoning: "Customer requested a refund",
      createdAt: "2026-01-01T10:00:00.000Z",
      age: "2 hours ago",
      policyRuleMatched: "refund-over-500",
    },
    {
      id: "action-two",
      tool: "send_email",
      parameters: { to: "support@countersign.example" },
      summary: "Email request",
      agentReasoning: "Customer requested an update",
      createdAt: "2026-01-01T11:00:00.000Z",
      age: "1 hour ago",
      policyRuleMatched: null,
    },
  ];

  beforeEach(() => {
    selection.selectedId = null;
    selection.setSelectedId.mockReset();
    selection.setSelectedId.mockImplementation((next) => {
      selection.selectedId = typeof next === "function" ? next(selection.selectedId) : next;
    });
  });

  it("shows each rule label and toggles details for the selected action", () => {
    const initial = renderToStaticMarkup(QueueList({ actions }));
    expect(initial).toContain("Matched rule: refund-over-500");
    expect(initial).toContain("Matched rule: Not recorded");
    expect(initial.match(/Select action/g)).toHaveLength(2);
    expect(initial).not.toContain("Action details");

    const firstButton = findSelectButton(QueueList({ actions }), "issue_refund");
    expect(firstButton?.props["aria-pressed"]).toBe(false);
    firstButton?.props.onClick?.(undefined as never);

    const firstSelected = renderToStaticMarkup(QueueList({ actions }));
    expect(firstSelected).toContain(">Selected</button>");
    expect(firstSelected).toContain("Action details");
    expect(firstSelected).toContain("Refund request");

    const secondButton = findSelectButton(QueueList({ actions }), "send_email");
    expect(secondButton?.props["aria-pressed"]).toBe(false);
    secondButton?.props.onClick?.(undefined as never);

    const secondSelected = renderToStaticMarkup(QueueList({ actions }));
    expect(secondSelected).toContain("Email request");
    expect(secondSelected).toContain('aria-pressed="true"');

    const selectedSecondButton = findSelectButton(QueueList({ actions }), "send_email");
    selectedSecondButton?.props.onClick?.(undefined as never);

    const deselected = renderToStaticMarkup(QueueList({ actions }));
    expect(deselected).not.toContain("Action details");
    expect(deselected.match(/Select action/g)).toHaveLength(2);
    expect(deselected).not.toContain('aria-pressed="true"');
  });
});
