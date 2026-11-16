// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from "@testing-library/react";
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
});
