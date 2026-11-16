// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ConsoleSnapshot } from "../../../src/features/console/contract";
import { fetchActionStatus, fetchConsoleSnapshot, postActionDecision } from "../../../src/features/console/api-client";
import App from "../../../src/features/console/Console";
import { mockDialogMethods } from "./dom-test-helpers";

vi.mock("../../../src/features/console/api-client", () => ({
  fetchConsoleSnapshot: vi.fn(),
  fetchActionStatus: vi.fn(),
  postActionDecision: vi.fn(),
  postActionProposal: vi.fn(),
}));

const action: ConsoleSnapshot["actions"][number] = {
  id: "action-1",
  tool: "issue_refund",
  title: "Issue refund",
  summary: "The agent wants to refund $750 for order ORDER-1005.",
  reasoning: "The customer requested a refund.",
  age: "Just now",
  created: 1,
  status: "pending",
  risk: "Risk not assessed",
  rule: "refund-over-500",
  ruleDescription: "Refunds over $500 require review.",
  parameters: { orderId: "ORDER-1005", amount: 750, currency: "USD" },
};

const snapshot: ConsoleSnapshot = {
  actions: [action],
  counts: { pending: 1, approved: 0, denied: 0, auto_allowed: 0, blocked: 0 },
  activity: [],
  audit: [],
};

const fetchSnapshotMock = vi.mocked(fetchConsoleSnapshot);
const fetchStatusMock = vi.mocked(fetchActionStatus);
const postDecisionMock = vi.mocked(postActionDecision);
let restoreDialogMethods: (() => void) | undefined;

async function openDecision(outcome: "approved" | "denied") {
  await screen.findByRole("button", { name: /Review action/ });
  fireEvent.click(screen.getByRole("button", { name: /Review action/ }));
  await screen.findByRole("dialog", { name: /issue refund/i });
  fireEvent.click(screen.getByRole("button", { name: outcome === "approved" ? "Approve" : "Deny" }));
  return screen.findByRole("dialog", { name: /issue refund/i });
}

beforeEach(() => {
  fetchSnapshotMock.mockReset().mockResolvedValue(snapshot);
  fetchStatusMock.mockReset().mockResolvedValue("pending");
  postDecisionMock.mockReset().mockResolvedValue(new Response(null, { status: 200 }));
  window.localStorage.clear();
  restoreDialogMethods = mockDialogMethods();
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    callback(0);
    return 1;
  });
  vi.stubGlobal("cancelAnimationFrame", vi.fn());
  vi.stubGlobal("scrollTo", vi.fn());
});

afterEach(() => {
  cleanup();
  restoreDialogMethods?.();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("console approval workflow", () => {
  it.each([
    ["approved", "approved"],
    ["denied", "denied"],
  ] as const)("commits %s only after the server confirms the stored status", async (outcome, status) => {
    fetchStatusMock.mockResolvedValueOnce(status);
    render(<App />);
    await openDecision(outcome);

    fireEvent.change(screen.getByLabelText("Reviewer name"), { target: { value: "  Alex  " } });
    fireEvent.change(screen.getByLabelText(/Reason for this/), { target: { value: "Reviewed carefully." } });
    const form = screen.getByRole("button", { name: `Confirm ${outcome === "approved" ? "approval" : "denial"}` }).closest("form");
    if (!form) throw new Error("Decision form was not rendered.");
    fireEvent.submit(form);

    await screen.findByText(`Decision committed. Current status: ${status}.`);
    expect(postDecisionMock).toHaveBeenCalledWith("action-1", {
      reviewer: "  Alex  ",
      outcome,
      reason: "Reviewed carefully.",
    });
    expect(fetchStatusMock).toHaveBeenCalledWith("action-1");
    expect(fetchSnapshotMock).toHaveBeenCalledTimes(2);
    expect(document.activeElement?.id).toBe("console-announcement");
    expect(document.querySelector("dialog.detail-dialog")?.hasAttribute("open")).toBe(false);
    expect(document.querySelector("dialog.decision-dialog")?.hasAttribute("open")).toBe(false);
  });

  it("requires a reason and reviewer before posting a decision", async () => {
    render(<App />);
    await openDecision("approved");
    const form = screen.getByRole("button", { name: "Confirm approval" }).closest("form");
    if (!form) throw new Error("Decision form was not rendered.");

    fireEvent.submit(form);
    expect(screen.getByText("Enter a reason specific to this action.")).toBeTruthy();
    expect(document.activeElement).toBe(screen.getByLabelText(/Reason for this/));
    expect(postDecisionMock).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText(/Reason for this/), { target: { value: "Reviewed." } });
    fireEvent.submit(form);
    expect(screen.getByText("Enter the reviewer name before confirming.")).toBeTruthy();
    expect(document.activeElement).toBe(screen.getByLabelText("Reviewer name"));
    expect(postDecisionMock).not.toHaveBeenCalled();
  });

  it("re-reads status after a stale conflict and keeps the decision locked", async () => {
    postDecisionMock.mockResolvedValueOnce(new Response(null, { status: 409 }));
    fetchStatusMock.mockResolvedValueOnce("approved");
    render(<App />);
    await openDecision("denied");

    fireEvent.change(screen.getByLabelText("Reviewer name"), { target: { value: "Alex" } });
    fireEvent.change(screen.getByLabelText(/Reason for this/), { target: { value: "Reviewing." } });
    const form = screen.getByRole("button", { name: "Confirm denial" }).closest("form");
    if (!form) throw new Error("Decision form was not rendered.");
    fireEvent.submit(form);

    await screen.findAllByText(/This action is no longer pending\. Current status: approved/);
    expect(screen.getByRole("button", { name: "Confirm denial" }).hasAttribute("disabled")).toBe(true);
    expect(fetchStatusMock).toHaveBeenCalledWith("action-1");
  });

  it("reports an unknown status after a network error and does not claim success", async () => {
    postDecisionMock.mockRejectedValueOnce(new Error("request timed out"));
    fetchStatusMock.mockResolvedValueOnce(null);
    render(<App />);
    await openDecision("approved");

    fireEvent.change(screen.getByLabelText("Reviewer name"), { target: { value: "Alex" } });
    fireEvent.change(screen.getByLabelText(/Reason for this/), { target: { value: "Reviewed." } });
    const form = screen.getByRole("button", { name: "Confirm approval" }).closest("form");
    if (!form) throw new Error("Decision form was not rendered.");
    fireEvent.submit(form);

    await screen.findAllByText(/Network error or timeout\. Current status: unknown/);
    expect(screen.queryByText(/Decision committed/)).toBeNull();
    expect(fetchStatusMock).toHaveBeenCalledWith("action-1");
  });

  it("reports an unresolved server response and refreshes the action status", async () => {
    postDecisionMock.mockResolvedValueOnce(new Response(null, { status: 503 }));
    fetchStatusMock.mockResolvedValueOnce("pending");
    render(<App />);
    await openDecision("approved");

    fireEvent.change(screen.getByLabelText("Reviewer name"), { target: { value: "Alex" } });
    fireEvent.change(screen.getByLabelText(/Reason for this/), { target: { value: "Reviewed." } });
    const form = screen.getByRole("button", { name: "Confirm approval" }).closest("form");
    if (!form) throw new Error("Decision form was not rendered.");
    fireEvent.submit(form);

    await screen.findAllByText(/The server could not confirm the decision\. Current status: pending/);
    expect(fetchStatusMock).toHaveBeenCalledWith("action-1");
    expect(screen.queryByText(/Decision committed/)).toBeNull();
  });

  it("reports a rejected client decision without a status re-read", async () => {
    postDecisionMock.mockResolvedValueOnce(new Response(null, { status: 400 }));
    render(<App />);
    await openDecision("denied");

    fireEvent.change(screen.getByLabelText("Reviewer name"), { target: { value: "Alex" } });
    fireEvent.change(screen.getByLabelText(/Reason for this/), { target: { value: "Reviewed." } });
    const form = screen.getByRole("button", { name: "Confirm denial" }).closest("form");
    if (!form) throw new Error("Decision form was not rendered.");
    fireEvent.submit(form);

    await screen.findAllByText(/Decision rejected \(HTTP 400\)/);
    expect(fetchStatusMock).not.toHaveBeenCalled();
  });

  it("navigates from a status metric and toggles the queue order", async () => {
    render(<App />);
    await screen.findByRole("button", { name: /Review action/ });

    fireEvent.click(screen.getByRole("button", { name: /Human-denied/ }));
    expect(screen.getByRole("heading", { name: "Activity history" })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Denied/ }).getAttribute("aria-pressed")).toBe("true");

    fireEvent.click(screen.getByRole("button", { name: /Approval queue/ }));
    fireEvent.click(screen.getByRole("button", { name: "Sort pending actions: oldest first" }));
    expect(screen.getByRole("button", { name: "Sort pending actions: newest first" })).toBeTruthy();
  });

  it("loads saved reviewer preferences and reports malformed saved data", async () => {
    window.localStorage.setItem(
      "countersign.reviewer-profile",
      JSON.stringify({ reviewer: "Saved Reviewer", color: "#abcdef" }),
    );
    render(<App />);
    await screen.findByText("Saved Reviewer");

    cleanup();
    window.localStorage.setItem("countersign.reviewer-profile", "{invalid");
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: /Reviewer not set/ }));
    expect(await screen.findByText("Could not load saved profile settings from this browser.")).toBeTruthy();
  });

  it("retries loading the console after the initial request fails", async () => {
    fetchSnapshotMock.mockRejectedValueOnce(new Error("Service unavailable"))
      .mockResolvedValueOnce(snapshot);
    render(<App />);
    await screen.findByText("Service unavailable");
    fireEvent.click(screen.getByRole("button", { name: "Retry loading" }));
    await screen.findByRole("button", { name: /Review action/ });
    expect(fetchSnapshotMock).toHaveBeenCalledTimes(2);
  });
});
