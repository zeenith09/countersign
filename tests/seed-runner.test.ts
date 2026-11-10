import { afterEach, describe, expect, it, vi } from "vitest";
import { seedActions } from "../prisma/seed-actions";
import { databaseTarget, isSeedPayload } from "../prisma/seed-identity";
import { submitSeedActions } from "../prisma/seed-runner";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("gateway seed", () => {
  it("recognizes complete seed payloads without changing parameters", () => {
    expect(isSeedPayload(seedActions[0])).toBe(true);
    expect(isSeedPayload({ ...seedActions[0], parameters: { amount: 50 } })).toBe(false);
    expect(isSeedPayload({ ...seedActions[0], agentReasoning: "different" })).toBe(false);
  });

  it("compares pooled and direct endpoints for the same database", () => {
    const direct = databaseTarget("postgresql://user:password@ep-example.neon.tech/app");
    expect(databaseTarget("postgresql://other:other@ep-example-pooler.neon.tech/app")).toBe(direct);
    expect(databaseTarget("postgresql://user:password@ep-other.neon.tech/app")).not.toBe(direct);
    expect(databaseTarget("postgresql://user:password@ep-example.neon.tech/other")).not.toBe(direct);
  });

  it("skips matching assessed rows without submitting or modifying them", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(console, "log").mockImplementation(() => {});
    await submitSeedActions(
      seedActions.map((action) => ({ ...action, policyRuleMatched: "recorded-rule" })),
      vi.fn(), "http://localhost/api/actions", "target",
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    ["legacy", { ...seedActions[0], policyRuleMatched: null }],
    ["conflicting", { ...seedActions[0], agentId: "different", policyRuleMatched: "recorded-rule" }],
  ])("stops before submissions for a %s row", async (_name, row) => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(submitSeedActions([row], vi.fn(), "http://localhost/api/actions", "target"))
      .rejects.toThrow("conflicts or has not been assessed");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("submits a missing seed payload and fails explicitly if the gateway rejects it", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("unavailable", { status: 500 }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(submitSeedActions([], vi.fn(), "http://localhost/api/actions", "target"))
      .rejects.toThrow("HTTP 500");
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock).toHaveBeenCalledWith("http://localhost/api/actions", {
      method: "POST",
      headers: { "content-type": "application/json", "x-seed-database-target": "target" },
      body: JSON.stringify(seedActions[0]),
    });
  });
});
