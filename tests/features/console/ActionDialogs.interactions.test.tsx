// @vitest-environment jsdom

import { createRef, type FormEvent } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ConsoleAction } from "../../../src/lib/console/contract";
import { ActionDetailDialog, DecisionDialog } from "../../../src/components/dialogs/ActionDialogs";

const action: ConsoleAction = {
  id: "action-1",
  tool: "issue_refund",
  title: "Issue refund",
  summary: "Refund $750 for ORDER-1005.",
  reasoning: "The customer requested a refund.",
  age: "Just now",
  created: 1,
  status: "pending",
  risk: "Risk not assessed",
  rule: "refund-over-500",
  ruleDescription: "Refunds over $500 require review.",
  parameters: { orderId: "ORDER-1005", amount: 750, currency: "USD" },
};

afterEach(cleanup);

describe("action dialog interactions", () => {
  it("supports detail close, decision selection, and copying callbacks", () => {
    const onClose = vi.fn();
    const onDecision = vi.fn();
    const onCopy = vi.fn();
    const { container } = render(
      <ActionDetailDialog
        dialogRef={createRef<HTMLDialogElement>()}
        action={action}
        locked={false}
        decisionMessage=""
        copied={false}
        onClose={onClose}
        onDecision={onDecision}
        onCopy={onCopy}
      />,
    );
    const dialog = container.querySelector("dialog");
    if (!dialog) throw new Error("Action details dialog was not rendered.");
    dialog.setAttribute("open", "");

    fireEvent.click(screen.getByRole("button", { name: "Deny" }));
    fireEvent.click(screen.getByRole("button", { name: "Copy JSON" }));
    fireEvent.click(screen.getByRole("button", { name: "Close action details" }));
    expect(onDecision).toHaveBeenCalledWith("denied");
    expect(onCopy).toHaveBeenCalledOnce();
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("submits a decision form and prevents cancellation while loading", () => {
    const onCancel = vi.fn();
    const onSubmit = vi.fn((event: FormEvent<HTMLFormElement>) => event.preventDefault());
    const { container } = render(
      <DecisionDialog
        dialogRef={createRef<HTMLDialogElement>()}
        action={action}
        outcome="approved"
        decisionState="loading"
        decisionMessage=""
        reviewer="Alex"
        reason="Reviewed."
        reasonError=""
        reviewerError=""
        locked={false}
        reviewerRef={createRef<HTMLInputElement>()}
        reasonRef={createRef<HTMLTextAreaElement>()}
        onReviewerChange={vi.fn()}
        onReasonChange={vi.fn()}
        onCancel={onCancel}
        onSubmit={onSubmit}
      />,
    );

    const form = container.querySelector("form");
    expect(form).not.toBeNull();
    if (!form) throw new Error("Decision form was not rendered.");
    const dialog = container.querySelector("dialog");
    if (!dialog) throw new Error("Decision dialog was not rendered.");
    dialog.setAttribute("open", "");
    fireEvent.submit(form);
    fireEvent.click(screen.getByRole("button", { name: "Cancel decision" }));
    const cancelEvent = new Event("cancel", { cancelable: true });
    fireEvent(dialog, cancelEvent);

    expect(onSubmit).toHaveBeenCalledOnce();
    expect(onCancel).not.toHaveBeenCalled();
    expect(cancelEvent.defaultPrevented).toBe(true);
    expect(screen.getByRole("textbox", { name: /Reviewer name/ }).hasAttribute("disabled")).toBe(true);
    expect(screen.getByRole("textbox", { name: /Reason for this approval/ }).hasAttribute("disabled")).toBe(true);
  });

  it("updates reviewer and reason fields and permits cancel while idle", () => {
    const onCancel = vi.fn();
    const onReviewerChange = vi.fn();
    const onReasonChange = vi.fn();
    const { container } = render(
      <DecisionDialog
        dialogRef={createRef<HTMLDialogElement>()}
        action={action}
        outcome="denied"
        decisionState="idle"
        decisionMessage=""
        reviewer=""
        reason=""
        reasonError="A reason is required."
        reviewerError="Enter a reviewer."
        locked={false}
        reviewerRef={createRef<HTMLInputElement>()}
        reasonRef={createRef<HTMLTextAreaElement>()}
        onReviewerChange={onReviewerChange}
        onReasonChange={onReasonChange}
        onCancel={onCancel}
        onSubmit={vi.fn()}
      />,
    );
    const dialog = container.querySelector("dialog");
    if (!dialog) throw new Error("Decision dialog was not rendered.");
    dialog.setAttribute("open", "");

    fireEvent.change(screen.getByRole("textbox", { name: /Reviewer name/ }), { target: { value: "Alex" } });
    fireEvent.change(screen.getByRole("textbox", { name: /Reason for this denial/ }), { target: { value: "Not supported." } });
    fireEvent.click(screen.getByRole("button", { name: "Cancel decision" }));

    expect(onReviewerChange).toHaveBeenCalledWith("Alex");
    expect(onReasonChange).toHaveBeenCalledWith("Not supported.");
    expect(onCancel).toHaveBeenCalledOnce();
    expect(screen.getByText("A reason is required.")).toBeTruthy();
    expect(screen.getByText("Enter a reviewer.")).toBeTruthy();
  });
});
