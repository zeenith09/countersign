// @vitest-environment jsdom

import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ConsoleActivity } from "../../../src/features/console/legacy/ConsoleActivity";

describe("legacy ConsoleActivity", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("loads counts and recent activity and aborts its request on unmount", async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json({
      counts: [{ status: "pending", _count: { _all: 2 } }],
      recent: [{
        id: "activity-1",
        tool: "issue_refund",
        status: "approved",
        policyRuleMatched: "refund-over-500",
        createdAt: "2026-11-15T20:00:00.000Z",
        decision: { reviewer: "Alex", decidedAt: "2026-11-15T20:01:00.000Z" },
      }],
    }));
    vi.stubGlobal("fetch", fetchMock);
    const { unmount } = render(<ConsoleActivity pendingCount={2}><p>Queue content</p></ConsoleActivity>);

    expect(screen.getByText("Loading action counts and activity.")).toBeTruthy();
    expect(screen.getByText("Queue content")).toBeTruthy();
    await waitFor(() => expect(screen.getByText("issue_refund")).toBeTruthy());
    expect(screen.getByText("2")).toBeTruthy();
    expect(screen.getByText("Alex")).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledWith("/api/console", {
      cache: "no-store",
      signal: expect.any(AbortSignal),
    });

    unmount();
    expect(fetchMock.mock.calls[0][1].signal.aborted).toBe(true);
  });

  it.each([
    ["server failure", () => Promise.resolve(new Response(null, { status: 500 }))],
    ["invalid response", () => Promise.resolve(Response.json({ counts: [], recent: [{ id: "bad" }] }))],
    ["network failure", () => Promise.reject(new Error("offline"))],
  ])("shows recovery guidance for %s", async (_label, response) => {
    vi.stubGlobal("fetch", vi.fn(response));
    render(<ConsoleActivity pendingCount={1}><p>Queue content</p></ConsoleActivity>);

    await waitFor(() => {
      expect(screen.getByText("Activity could not be loaded. Refresh the page to try again.")).toBeTruthy();
    });
  });

  it("does not replace current activity when an aborted request rejects", async () => {
    let rejectFirstRequest!: (error: Error) => void;
    const firstRequest = new Promise<Response>((_resolve, reject) => {
      rejectFirstRequest = reject;
    });
    const fetchMock = vi.fn()
      .mockReturnValueOnce(firstRequest)
      .mockResolvedValueOnce(Response.json({
        counts: [],
        recent: [{
          id: "activity-2",
          tool: "delete_record",
          status: "denied",
          policyRuleMatched: "delete-record-blocked",
          createdAt: "2026-11-15T20:00:00.000Z",
          decision: { reviewer: "Alex", decidedAt: "2026-11-15T20:01:00.000Z" },
        }],
      }));
    vi.stubGlobal("fetch", fetchMock);
    const { rerender } = render(<ConsoleActivity pendingCount={1}><p>Queue content</p></ConsoleActivity>);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    rerender(<ConsoleActivity pendingCount={2}><p>Queue content</p></ConsoleActivity>);
    await waitFor(() => expect(screen.getByText("delete_record")).toBeTruthy());

    await act(async () => {
      rejectFirstRequest(new Error("request aborted"));
      await Promise.resolve();
    });

    expect(screen.getByText("delete_record")).toBeTruthy();
    expect(screen.queryByText("Activity could not be loaded. Refresh the page to try again.")).toBeNull();
    expect(fetchMock.mock.calls[0][1].signal.aborted).toBe(true);
  });

  it("shows the empty state when the loaded snapshot has no recent actions", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ counts: [], recent: [] })));
    render(<ConsoleActivity pendingCount={0}><p>Queue content</p></ConsoleActivity>);

    await waitFor(() => expect(screen.getByText("No completed actions yet.")).toBeTruthy());
  });

  it.each([
    ["approved", "Human-approved", "✓"],
    ["auto_allowed", "Auto-allowed", "✓"],
    ["denied", "Human-denied", "×"],
    ["blocked", "Blocked", "×"],
  ] as const)("shows the correct icon and text for %s", async (status, label, icon) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({
      counts: [],
      recent: [{
        id: `activity-${status}`,
        tool: "issue_refund",
        status,
        policyRuleMatched: "other-refunds-allowed",
        createdAt: "2026-11-15T20:00:00.000Z",
        decision: { reviewer: "Alex", decidedAt: "2026-11-15T20:01:00.000Z" },
      }],
    })));
    const { container } = render(<ConsoleActivity pendingCount={0}><p>Queue content</p></ConsoleActivity>);

    await waitFor(() => expect(container.querySelector(".activity-item .badge")?.textContent).toBe(label));
    const activityIcon = container.querySelector(".activity-item .activity-icon");
    expect(activityIcon?.textContent).toBe(icon);
    expect(container.querySelector(".activity-item .badge")?.textContent).toBe(label);
  });

  it.each([
    ["missing rule and decision", null, null],
    ["empty reviewer", "refund-over-500", { reviewer: "", decidedAt: "2026-11-15T20:01:00.000Z" }],
    ["whitespace reviewer", "refund-over-500", { reviewer: " \t ", decidedAt: "2026-11-15T20:01:00.000Z" }],
  ] as const)("shows explicit rule and reviewer fallbacks for %s", async (_label, policyRuleMatched, decision) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({
      counts: [],
      recent: [{
        id: "activity-missing-data",
        tool: "issue_refund",
        status: "approved",
        policyRuleMatched,
        createdAt: "2026-11-15T20:00:00.000Z",
        decision,
      }],
    })));
    render(<ConsoleActivity pendingCount={0}><p>Queue content</p></ConsoleActivity>);

    await waitFor(() => expect(screen.getByText("issue_refund")).toBeTruthy());
    expect(screen.getAllByText(policyRuleMatched ?? "Unknown (not recorded)").length).toBeGreaterThan(0);
    expect(screen.getByText("No reviewer decision")).toBeTruthy();
  });
});
