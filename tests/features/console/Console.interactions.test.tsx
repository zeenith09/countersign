// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
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
let restoreClipboard: (() => void) | undefined;

class MockIntersectionObserver implements IntersectionObserver {
  static instances: MockIntersectionObserver[] = [];

  readonly root: Element | Document | null = null;
  readonly rootMargin = "";
  readonly thresholds: ReadonlyArray<number> = [];
  readonly observed: Element[] = [];
  readonly unobserved: Element[] = [];
  disconnected = false;

  constructor(readonly callback: IntersectionObserverCallback) {
    MockIntersectionObserver.instances.push(this);
  }

  observe(target: Element) {
    this.observed.push(target);
  }

  unobserve(target: Element) {
    this.unobserved.push(target);
  }

  disconnect() {
    this.disconnected = true;
  }

  takeRecords(): IntersectionObserverEntry[] {
    return [];
  }
}

async function openDecision(outcome: "approved" | "denied") {
  await screen.findByRole("button", { name: /Review action/ });
  fireEvent.click(screen.getByRole("button", { name: /Review action/ }));
  await screen.findByRole("dialog", { name: /issue refund/i });
  fireEvent.click(screen.getByRole("button", { name: outcome === "approved" ? "Approve" : "Deny" }));
  return screen.findByRole("dialog", { name: /issue refund/i });
}

beforeEach(() => {
  MockIntersectionObserver.instances = [];
  restoreClipboard?.();
  restoreClipboard = undefined;
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
  restoreClipboard?.();
  restoreClipboard = undefined;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("console approval workflow", () => {
  it("uses the reduced-motion preference for reveal and page scrolling", async () => {
    vi.stubGlobal("matchMedia", vi.fn().mockReturnValue({ matches: true }));
    vi.stubGlobal("IntersectionObserver", MockIntersectionObserver);
    render(<App />);
    await screen.findByRole("button", { name: /Review action/ });

    await waitFor(() => {
      expect(
        Array.from(document.querySelectorAll("[data-reveal]")).every((element) =>
          element.classList.contains("is-visible"),
        ),
      ).toBe(true);
    });
    expect(MockIntersectionObserver.instances).toHaveLength(0);

    fireEvent.click(screen.getByRole("button", { name: "Overview" }));
    expect(window.scrollTo).toHaveBeenLastCalledWith({ top: 0, behavior: "auto" });
  });

  it("reveals intersecting content once and disconnects its observer", async () => {
    vi.stubGlobal("matchMedia", vi.fn().mockReturnValue({ matches: false }));
    vi.stubGlobal("IntersectionObserver", MockIntersectionObserver);
    const view = render(<App />);
    await screen.findByRole("button", { name: /Review action/ });

    const target = view.container.querySelector(".action-card");
    if (!target) throw new Error("Action card was not rendered.");
    await waitFor(() => {
      expect(
        MockIntersectionObserver.instances.some((instance) => instance.observed.includes(target)),
      ).toBe(true);
    });
    const observer = [...MockIntersectionObserver.instances]
      .reverse()
      .find((instance) => instance.observed.includes(target));
    if (!observer) throw new Error("Action card observer was not created.");

    expect(observer.observed).toContain(target);
    act(() => {
      observer.callback([{ target, isIntersecting: false } as IntersectionObserverEntry], observer);
    });
    expect(target.classList.contains("is-visible")).toBe(false);
    expect(observer.unobserved).not.toContain(target);

    act(() => {
      observer.callback([{ target, isIntersecting: true } as IntersectionObserverEntry], observer);
    });
    expect(target.classList.contains("is-visible")).toBe(true);
    expect(observer.unobserved).toContain(target);

    fireEvent.click(screen.getByRole("button", { name: /Sort pending actions/ }));
    expect(observer.disconnected).toBe(true);
    const updatedObserver = MockIntersectionObserver.instances.at(-1);
    expect(updatedObserver?.observed).not.toContain(target);
    fireEvent.click(screen.getByRole("button", { name: /Sort pending actions/ }));
    expect(updatedObserver?.disconnected).toBe(true);

    view.unmount();
    expect(MockIntersectionObserver.instances.at(-1)?.disconnected).toBe(true);
  });

  it("navigates to overview and audit pages and opens the action generator", async () => {
    render(<App />);
    await screen.findByRole("button", { name: /Review action/ });

    fireEvent.click(screen.getByRole("button", { name: "Overview" }));
    expect(screen.getByRole("heading", { name: "Overview" })).toBeTruthy();
    expect(window.scrollTo).toHaveBeenLastCalledWith({ top: 0, behavior: "smooth" });

    fireEvent.click(screen.getByRole("button", { name: "Audit log" }));
    expect(screen.getByRole("heading", { name: "Audit log" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /Approval queue/ }));
    fireEvent.click(screen.getByRole("button", { name: "New action" }));
    expect(await screen.findByRole("dialog", { name: /Generate incoming action/ })).toBeTruthy();
  });

  it("renders the audit page while the initial snapshot is still loading", async () => {
    let resolveSnapshot!: (result: ConsoleSnapshot) => void;
    fetchSnapshotMock.mockReturnValueOnce(new Promise((resolve) => {
      resolveSnapshot = resolve;
    }));
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "Audit log" }));
    expect(screen.getByRole("heading", { name: "Audit log" })).toBeTruthy();
    await act(async () => resolveSnapshot(snapshot));
    expect(screen.getByRole("heading", { name: "Audit log" })).toBeTruthy();
  });

  it("opens the generator from the queue action", async () => {
    render(<App />);
    await screen.findByRole("button", { name: /Review action/ });

    fireEvent.click(screen.getByRole("button", { name: "Generate incoming action" }));
    expect(await screen.findByRole("dialog", { name: /Generate incoming action/ })).toBeTruthy();
  });

  it("closes action details and returns to them when a decision is cancelled", async () => {
    render(<App />);
    await screen.findByRole("button", { name: /Review action/ });
    fireEvent.click(screen.getByRole("button", { name: /Review action/ }));
    await screen.findByRole("dialog", { name: /issue refund/i });
    fireEvent.click(screen.getByRole("button", { name: "Close action details" }));
    expect(document.querySelector("dialog.detail-dialog")?.hasAttribute("open")).toBe(false);

    fireEvent.click(screen.getByRole("button", { name: /Review action/ }));
    await screen.findByRole("dialog", { name: /issue refund/i });
    fireEvent.click(screen.getByRole("button", { name: "Approve" }));
    await screen.findByRole("dialog", { name: /issue refund/i });
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(document.querySelector("dialog.decision-dialog")?.hasAttribute("open")).toBe(false);
    expect(document.querySelector("dialog.detail-dialog")?.hasAttribute("open")).toBe(true);
  });

  it("reports a saved-status refresh miss after a committed decision", async () => {
    fetchStatusMock.mockResolvedValueOnce(null);
    render(<App />);
    await openDecision("approved");

    fireEvent.change(screen.getByLabelText("Reviewer name"), { target: { value: "Alex" } });
    fireEvent.change(screen.getByLabelText(/Reason for this/), { target: { value: "Reviewed." } });
    const form = screen.getByRole("button", { name: "Confirm approval" }).closest("form");
    if (!form) throw new Error("Decision form was not rendered.");
    fireEvent.submit(form);

    expect(
      await screen.findByText("Decision committed, but its stored status could not be refreshed."),
    ).toBeTruthy();
  });

  it("loads invalid saved preferences and clears the error after saving a profile", async () => {
    window.localStorage.setItem(
      "countersign.reviewer-profile",
      JSON.stringify({ reviewer: 42, color: "not-a-color" }),
    );
    render(<App />);
    await screen.findByRole("button", { name: /Review action/ });
    fireEvent.click(screen.getByRole("button", { name: /Reviewer not set/ }));
    expect(
      await screen.findByText("Saved profile settings are invalid. Update them and save again."),
    ).toBeTruthy();

    fireEvent.change(screen.getByLabelText("Profile name"), { target: { value: "Sam" } });
    fireEvent.change(screen.getByLabelText("Profile color"), { target: { value: "#abcdef" } });
    fireEvent.click(screen.getByRole("button", { name: "Save profile" }));

    expect(await screen.findByText("Reviewer profile saved in this browser.")).toBeTruthy();
    expect(screen.getByRole("button", { name: /Sam/ })).toBeTruthy();
    expect(JSON.parse(window.localStorage.getItem("countersign.reviewer-profile") ?? "{}"))
      .toEqual({ reviewer: "Sam", color: "#abcdef" });
  });

  it("copies selected parameters and reports clipboard failures", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    const originalClipboard = Object.getOwnPropertyDescriptor(navigator, "clipboard");
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    restoreClipboard = () => {
      if (originalClipboard) {
        Object.defineProperty(navigator, "clipboard", originalClipboard);
      } else {
        Reflect.deleteProperty(navigator, "clipboard");
      }
    };

    render(<App />);
    await screen.findByRole("button", { name: /Review action/ });
    fireEvent.click(screen.getByRole("button", { name: /Review action/ }));
    await screen.findByRole("dialog", { name: /issue refund/i });
    fireEvent.click(screen.getByRole("button", { name: "Copy JSON" }));

    expect(await screen.findByRole("button", { name: "Copied" })).toBeTruthy();
    expect(writeText).toHaveBeenCalledWith(JSON.stringify(action.parameters, null, 2));
    fireEvent.click(screen.getByRole("button", { name: "Close action details" }));
    fireEvent.click(screen.getByRole("button", { name: /Review action/ }));
    await screen.findByRole("dialog", { name: /issue refund/i });
    restoreClipboard();
    restoreClipboard = undefined;

    fireEvent.click(screen.getByRole("button", { name: "Copy JSON" }));
    expect(
      await screen.findByText("Could not copy JSON. Select the parameters and copy them manually."),
    ).toBeTruthy();
  });

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
    fireEvent.submit(form);
    expect(postDecisionMock).toHaveBeenCalledOnce();
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

  it("reports an unknown status when an unresolved server response cannot be refreshed", async () => {
    postDecisionMock.mockResolvedValueOnce(new Response(null, { status: 503 }));
    fetchStatusMock.mockResolvedValueOnce(null);
    render(<App />);
    await openDecision("approved");

    fireEvent.change(screen.getByLabelText("Reviewer name"), { target: { value: "Alex" } });
    fireEvent.change(screen.getByLabelText(/Reason for this/), { target: { value: "Reviewed." } });
    const form = screen.getByRole("button", { name: "Confirm approval" }).closest("form");
    if (!form) throw new Error("Decision form was not rendered.");
    fireEvent.submit(form);

    await screen.findAllByText(/The server could not confirm the decision\. Current status: unknown/);
    expect(fetchStatusMock).toHaveBeenCalledWith("action-1");
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
    expect(window.scrollTo).toHaveBeenLastCalledWith({ top: 0, behavior: "smooth" });
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
