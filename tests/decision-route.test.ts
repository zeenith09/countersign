import { afterEach, describe, expect, it, vi } from "vitest";

const { decideAction } = vi.hoisted(() => ({ decideAction: vi.fn() }));
vi.mock("../src/lib/actions/decide-action", () => ({ decideAction }));

import { POST } from "../src/app/api/actions/[id]/decision/route";
import { toolRegistry } from "../src/lib/tools";

const id = "c076fb00-26d9-4dfd-9f31-000000000001";
const params = Promise.resolve({ id });

function request(body: unknown) {
  return new Request("http://localhost/api/actions/id/decision", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

describe("decision route", () => {
  afterEach(() => {
    vi.resetAllMocks();
    vi.restoreAllMocks();
  });

  it.each([undefined, "", " \t "])("rejects a missing or blank reason without calling the transaction or a tool", async (reason) => {
    const tool = vi.spyOn(toolRegistry, "issue_refund");
    const response = await POST(request({ reviewer: "reviewer", outcome: "approved", reason }), { params });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ message: expect.stringContaining("reason") });
    expect(decideAction).not.toHaveBeenCalled();
    expect(tool).not.toHaveBeenCalled();
  });

  it.each([
    ["not_found", 404, "Action not found."],
    ["conflict", 409, "Action is no longer pending."],
    ["busy", 503, "Database is busy."],
  ] as const)(
    "does not execute a tool for %s", async (kind, status, message) => {
      decideAction.mockResolvedValue({ kind });
      const tool = vi.spyOn(toolRegistry, "issue_refund");
      const response = await POST(request({ reviewer: "reviewer", outcome: "approved", reason: "reason" }), { params });
      expect(response.status).toBe(status);
      expect(await response.json()).toEqual({ message });
      expect(tool).not.toHaveBeenCalled();
    },
  );

  it("runs the mocked tool after an approved transaction returns, using its chosen parameters", async () => {
    let finish!: (value: unknown) => void;
    decideAction.mockReturnValue(new Promise((resolve) => { finish = resolve; }));
    const tool = vi.spyOn(toolRegistry, "issue_refund").mockReturnValue({ mocked: true, tool: "issue_refund" });
    const response = POST(request({ reviewer: " reviewer ", outcome: "approved", reason: " reason " }), { params });
    await vi.waitFor(() => expect(decideAction).toHaveBeenCalledOnce());
    expect(decideAction).toHaveBeenCalledWith(id, "reviewer", "approved", "reason");
    expect(tool).not.toHaveBeenCalled();
    finish({ kind: "ok", outcome: "approved", tool: "issue_refund", parameters: { edited: true } });
    expect((await response).status).toBe(200);
    expect(tool).toHaveBeenCalledExactlyOnceWith(id, { edited: true });
  });

  it("does not execute a tool for a denied decision", async () => {
    decideAction.mockResolvedValue({ kind: "ok", outcome: "denied", tool: "issue_refund", parameters: {} });
    const tool = vi.spyOn(toolRegistry, "issue_refund");
    const response = await POST(request({ reviewer: "reviewer", outcome: "denied", reason: "reason" }), { params });
    expect(response.status).toBe(200);
    expect(tool).not.toHaveBeenCalled();
  });
});
