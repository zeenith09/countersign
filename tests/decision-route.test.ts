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

  it("rejects malformed JSON without calling the transaction or a tool", async () => {
    const tool = vi.spyOn(toolRegistry, "issue_refund");
    const response = await POST(new Request("http://localhost/api/actions/id/decision", {
      method: "POST",
      body: "{",
    }), { params });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ message: "Invalid decision." });
    expect(decideAction).not.toHaveBeenCalled();
    expect(tool).not.toHaveBeenCalled();
  });

  it("rejects a non-UUID action id without parsing the body or calling the transaction", async () => {
    const tool = vi.spyOn(toolRegistry, "issue_refund");
    const response = await POST(request({
      reviewer: "reviewer", outcome: "approved", reason: "reason",
    }), { params: Promise.resolve({ id: "not-a-uuid" }) });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ message: "Invalid decision." });
    expect(decideAction).not.toHaveBeenCalled();
    expect(tool).not.toHaveBeenCalled();
  });

  it("rethrows non-SyntaxError failures while reading the request body", async () => {
    const error = new Error("body read failed");
    const malformedRequest = new Request("http://localhost/api/actions/id/decision", {
      method: "POST",
    });
    vi.spyOn(malformedRequest, "json").mockRejectedValue(error);

    await expect(POST(malformedRequest, { params })).rejects.toBe(error);
    expect(decideAction).not.toHaveBeenCalled();
  });

  it.each([undefined, "", " \t "])("rejects a missing or blank reason without calling the transaction or a tool", async (reason) => {
    const tool = vi.spyOn(toolRegistry, "issue_refund");
    const response = await POST(request({ reviewer: "reviewer", outcome: "approved", reason }), { params });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ message: expect.stringContaining("reason") });
    expect(decideAction).not.toHaveBeenCalled();
    expect(tool).not.toHaveBeenCalled();
  });

  it.each(["not_a_tool", "toString", "constructor"])(
    "throws when an approved result has an unregistered tool (%s)", async (toolName) => {
      decideAction.mockResolvedValue({
        kind: "ok",
        outcome: "approved",
        tool: toolName,
        parameters: {},
      });
      const tools = (Object.keys(toolRegistry) as (keyof typeof toolRegistry)[])
        .map((tool) => vi.spyOn(toolRegistry, tool));

      await expect(POST(request({
        reviewer: "reviewer", outcome: "approved", reason: "reason",
      }), { params })).rejects.toThrow("Approved action has an unsupported tool.");
      for (const tool of tools) expect(tool).not.toHaveBeenCalled();
    },
  );

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

  it("runs the mocked tool after an approved transaction returns with its approved parameters", async () => {
    let finish!: (value: unknown) => void;
    decideAction.mockReturnValue(new Promise((resolve) => { finish = resolve; }));
    const tool = vi.spyOn(toolRegistry, "issue_refund").mockReturnValue({ mocked: true, tool: "issue_refund" });
    const editedParameters = { amount: 25, currency: "USD", orderId: "ORDER-1" };
    const response = POST(request({ reviewer: " reviewer ", outcome: "approved", reason: " reason ", editedParameters }), { params });
    await vi.waitFor(() => expect(decideAction).toHaveBeenCalledOnce());
    expect(decideAction).toHaveBeenCalledWith(id, "reviewer", "approved", "reason", undefined, editedParameters);
    expect(tool).not.toHaveBeenCalled();
    finish({ kind: "ok", outcome: "approved", tool: "issue_refund", parameters: editedParameters });
    const result = await response;
    expect(result.status).toBe(200);
    expect(await result.json()).toEqual({ actionId: id, outcome: "approved", message: "Action approved." });
    expect(tool).toHaveBeenCalledExactlyOnceWith(id, editedParameters);
  });

  it("rejects edits on a denied decision without invoking the transaction", async () => {
    const response = await POST(request({
      reviewer: "reviewer", outcome: "denied", reason: "reason",
      editedParameters: { amount: 25, currency: "USD", orderId: "ORDER-1" },
    }), { params });
    expect(response.status).toBe(400);
    expect((await response.json()).message).toEqual(expect.any(String));
    expect(decideAction).not.toHaveBeenCalled();
  });

  it("reports invalid tool-specific edits without executing a tool", async () => {
    decideAction.mockResolvedValue({ kind: "invalid_edit" });
    const tool = vi.spyOn(toolRegistry, "issue_refund");
    const response = await POST(request({
      reviewer: "reviewer", outcome: "approved", reason: "reason",
      editedParameters: { amount: "invalid", currency: "USD", orderId: "ORDER-1" },
    }), { params });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ message: "Edited parameters are invalid for this action." });
    expect(tool).not.toHaveBeenCalled();
  });

  it("does not execute a tool for a denied decision", async () => {
    decideAction.mockResolvedValue({ kind: "ok", outcome: "denied", tool: "issue_refund", parameters: {} });
    const tool = vi.spyOn(toolRegistry, "issue_refund");
    const response = await POST(request({ reviewer: "reviewer", outcome: "denied", reason: "reason" }), { params });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ actionId: id, outcome: "denied", message: "Action denied." });
    expect(tool).not.toHaveBeenCalled();
  });
});
