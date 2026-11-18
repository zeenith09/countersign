import { afterEach, describe, expect, it, vi } from "vitest";
import {
  fetchActionStatus,
  fetchConsoleSnapshot,
  postActionDecision,
  postActionProposal,
} from "../../../src/lib/console/api-client";
import { filterActivity, getConsoleCounts, sortPendingActions } from "../../../src/lib/console/view-model";
import type { ConsoleSnapshot } from "../../../src/lib/console/contract";

const snapshot: ConsoleSnapshot = {
  actions: [
    { id: "later", tool: "issue_refund", title: "issue refund", summary: "later", reasoning: "", age: "", created: 2, status: "pending", risk: "", rule: "", ruleDescription: "", parameters: {} },
    { id: "earlier", tool: "issue_refund", title: "issue refund", summary: "earlier", reasoning: "", age: "", created: 1, status: "pending", risk: "", rule: "", ruleDescription: "", parameters: {} },
  ],
  counts: { pending: 2, approved: 1, denied: 0, auto_allowed: 3, blocked: 4 },
  activity: [
    { id: "pending", title: "Pending", detail: "", status: "pending", actor: "", time: "" },
    { id: "blocked", title: "Blocked", detail: "", status: "blocked", actor: "", time: "" },
  ],
  audit: [],
};

describe("console client and view-model helpers", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("loads and validates the existing console snapshot response", async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json(snapshot));
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchConsoleSnapshot()).resolves.toEqual(snapshot);
    expect(fetchMock).toHaveBeenCalledWith("/api/console", { cache: "no-store" });
  });

  it("rejects unsuccessful and malformed snapshot responses with readable errors", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(new Response(null, { status: 500 }))
      .mockResolvedValueOnce(Response.json({ actions: [] })));

    await expect(fetchConsoleSnapshot()).rejects.toThrow("Console data could not be loaded.");
    await expect(fetchConsoleSnapshot()).rejects.toThrow("The console received an invalid response.");
  });

  it("reads a valid status and returns null for failed or invalid status responses", async () => {
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(Response.json({ status: "approved" }))
      .mockResolvedValueOnce(Response.json({ status: "unknown" }))
      .mockRejectedValueOnce(new Error("network unavailable")));

    await expect(fetchActionStatus("action/id")).resolves.toBe("approved");
    await expect(fetchActionStatus("action/id")).resolves.toBeNull();
    await expect(fetchActionStatus("action/id")).resolves.toBeNull();
    expect(fetch).toHaveBeenNthCalledWith(1, "/api/actions/action%2Fid", {
      cache: "no-store",
      signal: expect.any(AbortSignal),
    });
  });

  it("posts decisions and proposals to their existing API contracts", async () => {
    const response = new Response(null, { status: 200 });
    const fetchMock = vi.fn().mockResolvedValue(response);
    vi.stubGlobal("fetch", fetchMock);
    const decision = { reviewer: "Alex", outcome: "approved" as const, reason: "Reviewed." };
    const proposal = { agentId: "demo-agent", tool: "issue_refund", parameters: { amount: 400 } };

    await expect(postActionDecision("action/id", decision)).resolves.toBe(response);
    await expect(postActionProposal(proposal)).resolves.toBe(response);

    expect(fetchMock).toHaveBeenNthCalledWith(1, "/api/actions/action%2Fid/decision", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(decision),
      signal: expect.any(AbortSignal),
    });
    expect(fetchMock).toHaveBeenNthCalledWith(2, "/api/actions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(proposal),
    });
  });

  it("preserves queue sorting tie-breaks, status counts, and activity filters", () => {
    expect(sortPendingActions(snapshot.actions, "oldest").map((action) => action.id)).toEqual(["earlier", "later"]);
    expect(sortPendingActions(snapshot.actions, "newest").map((action) => action.id)).toEqual(["later", "earlier"]);
    expect(getConsoleCounts(snapshot)).toEqual({
      pending: 2,
      approved: 1,
      denied: 0,
      auto: 3,
      blocked: 4,
    });
    expect(getConsoleCounts(null)).toEqual({
      pending: null,
      approved: null,
      denied: null,
      auto: null,
      blocked: null,
    });
    expect(getConsoleCounts({ ...snapshot, counts: { pending: 1 } })).toEqual({
      pending: 1,
      approved: 0,
      denied: 0,
      auto: 0,
      blocked: 0,
    });
    expect(filterActivity(snapshot.activity, "blocked").map((item) => item.id)).toEqual(["blocked"]);
    expect(filterActivity(snapshot.activity, "all")).toEqual(snapshot.activity);
  });
});
