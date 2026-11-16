// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type {
  ConsoleAction,
  ConsoleActivityItem,
} from "../../../src/features/console/contract";
import {
  ActivityPage,
  OverviewPage,
  QueuePage,
} from "../../../src/features/console/components/ConsolePages";

const action: ConsoleAction = {
  id: "action-1",
  tool: "issue_refund",
  title: "Issue refund",
  summary: "Refund $750 for ORDER-1005.",
  reasoning: "Customer requested a refund.",
  age: "Just now",
  created: 1,
  status: "pending",
  risk: "Risk not assessed",
  rule: "refund-over-500",
  ruleDescription: "Refunds over $500 require review.",
  parameters: { orderId: "ORDER-1005", amount: 750, currency: "USD" },
};

const activity: ConsoleActivityItem[] = [{
  id: "activity-1",
  title: "Refund",
  detail: "Refund request",
  status: "pending",
  actor: "Waiting",
  time: "Just now",
}];

const counts = { pending: 1, approved: 0, denied: 0, auto: 0, blocked: 0 };

afterEach(cleanup);

describe("console page interactions", () => {
  it("routes queue actions, status cards, and queue-card clicks", () => {
    const onGenerate = vi.fn();
    const onReview = vi.fn();
    const onStatusClick = vi.fn();
    const onNavigate = vi.fn();
    const onSortChange = vi.fn();
    const { container } = render(
      <QueuePage
        actions={[action]}
        counts={counts}
        loaded
        sort="oldest"
        onSortChange={onSortChange}
        onGenerate={onGenerate}
        onReview={onReview}
        onStatusClick={onStatusClick}
        onNavigate={onNavigate}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Generate incoming action" }));
    fireEvent.click(screen.getByRole("button", { name: "Sort pending actions: oldest first" }));
    fireEvent.click(screen.getByRole("button", { name: /Human-denied/ }));
    fireEvent.click(screen.getByRole("button", { name: /View activity/ }));
    fireEvent.click(screen.getByRole("button", { name: "Review action" }));
    expect(container.querySelector(".action-card")).not.toBeNull();
    fireEvent.click(container.querySelector(".action-card")!);

    expect(onGenerate).toHaveBeenCalledOnce();
    expect(onSortChange).toHaveBeenCalledOnce();
    expect(onStatusClick).toHaveBeenCalledWith("denied");
    expect(onNavigate).toHaveBeenCalledWith("activity");
    expect(onReview).toHaveBeenCalledTimes(2);
    expect(onReview).toHaveBeenCalledWith(action);
  });

  it("routes overview controls to the queue and activity pages", () => {
    const onNavigate = vi.fn();
    const onStatusClick = vi.fn();
    render(
      <OverviewPage counts={counts} activity={activity} onNavigate={onNavigate} onStatusClick={onStatusClick} />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Open approval queue" }));
    fireEvent.click(screen.getByRole("button", { name: /Auto-allowed/ }));
    fireEvent.click(screen.getByRole("button", { name: /View all/ }));
    fireEvent.click(screen.getByRole("button", { name: /Review 1 pending actions/ }));

    expect(onNavigate).toHaveBeenNthCalledWith(1, "queue");
    expect(onNavigate).toHaveBeenNthCalledWith(2, "activity");
    expect(onNavigate).toHaveBeenNthCalledWith(3, "queue");
    expect(onStatusClick).toHaveBeenCalledWith("auto_allowed");
  });

  it("calls the activity filter callback for a selected status", () => {
    const setFilter = vi.fn();
    render(<ActivityPage activity={activity} filter="all" setFilter={setFilter} />);

    fireEvent.click(screen.getByRole("button", { name: /Pending/ }));
    expect(setFilter).toHaveBeenCalledWith("pending");
  });
});
