import { afterEach, describe, expect, it, vi } from "vitest";

const { decideAction, executeMockedTool } = vi.hoisted(() => ({
  decideAction: vi.fn(),
  executeMockedTool: vi.fn(),
}));
vi.mock("../src/lib/actions/decide-action", () => ({ decideAction }));
vi.mock("../src/lib/actions/execute-mocked-tool", () => ({ executeMockedTool }));

import { POST } from "../src/app/api/actions/[id]/decision/route";
import { toolRegistry } from "../src/lib/tools";

const id = "c076fb00-26d9-4dfd-9f31-000000000001";
const params = Promise.resolve({ id });

function request(body: unknown, headers: HeadersInit = {}) {
  return new Request("http://localhost/api/actions/id/decision", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

function streamedRequest(stream: ReadableStream<Uint8Array>, headers: HeadersInit = {}): Request {
  return new Request("http://localhost/api/actions/id/decision", {
    method: "POST",
    headers,
    body: stream,
    duplex: "half",
  } as RequestInit & { duplex: "half" });
}

describe("decision route", () => {
  afterEach(() => {
    vi.resetAllMocks();
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it("rejects malformed JSON without calling the transaction or a tool", async () => {
    const tool = vi.spyOn(toolRegistry, "issue_refund");
    const response = await POST(new Request("http://localhost/api/actions/id/decision", {
      method: "POST",
      body: "{",
    }), { params });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ message: "Invalid JSON" });
    expect(decideAction).not.toHaveBeenCalled();
    expect(tool).not.toHaveBeenCalled();
  });

  it("rejects a declared oversized body before reading or calling the transaction", async () => {
    const body = new Request("http://localhost/api/actions/id/decision", {
      method: "POST",
      headers: { "content-length": "4097" },
      body: "{}",
    });
    const response = await POST(body, { params });

    expect(response.status).toBe(413);
    expect(await response.json()).toEqual({ message: "Request too large" });
    expect(body.bodyUsed).toBe(false);
    expect(decideAction).not.toHaveBeenCalled();
    expect(executeMockedTool).not.toHaveBeenCalled();
  });

  it("rejects a chunked oversized body without Content-Length before the transaction", async () => {
    const body = streamedRequest(new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(3_000));
        controller.enqueue(new Uint8Array(1_097));
        controller.close();
      },
    }), { "content-type": "application/json" });
    const response = await POST(body, { params });

    expect(body.headers.has("content-length")).toBe(false);
    expect(response.status).toBe(413);
    expect(await response.json()).toEqual({ message: "Request too large" });
    expect(decideAction).not.toHaveBeenCalled();
    expect(executeMockedTool).not.toHaveBeenCalled();
  });

  it("rejects a non-UUID action id without reading the body or calling the transaction", async () => {
    const tool = vi.spyOn(toolRegistry, "issue_refund");
    const response = await POST(request({
      reviewer: "reviewer", outcome: "approved", reason: "reason",
    }), { params: Promise.resolve({ id: "not-a-uuid" }) });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ message: "Invalid decision." });
    expect(decideAction).not.toHaveBeenCalled();
    expect(tool).not.toHaveBeenCalled();
  });

  it.each([
    ["different host", "https://other.example"],
    ["different port", "https://app.example:444"],
    ["different scheme", "http://app.example"],
    ["opaque null origin", "null"],
    ["lookalike host", "https://app.example.evil.com"],
  ])("rejects a %s Origin before the transaction or mock tool", async (_label, origin) => {
    vi.stubEnv("APP_ORIGIN", "https://app.example");
    const tools = (Object.keys(toolRegistry) as (keyof typeof toolRegistry)[])
      .map((tool) => vi.spyOn(toolRegistry, tool));
    const response = await POST(request({
      reviewer: "reviewer", outcome: "approved", reason: "reason",
    }, { origin }), { params });

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      message: "Cross-origin requests are not allowed.",
    });
    expect(decideAction).not.toHaveBeenCalled();
    expect(executeMockedTool).not.toHaveBeenCalled();
    for (const tool of tools) expect(tool).not.toHaveBeenCalled();
  });

  it("rejects a cross-origin oversized body before reading it", async () => {
    vi.stubEnv("APP_ORIGIN", "https://app.example");
    const body = streamedRequest(
      new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new Uint8Array(4_097));
          controller.close();
        },
      }),
      { "content-length": "4097", origin: "https://app.example.evil.com" },
    );
    const response = await POST(body, { params });

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      message: "Cross-origin requests are not allowed.",
    });
    expect(body.bodyUsed).toBe(false);
    expect(decideAction).not.toHaveBeenCalled();
    expect(executeMockedTool).not.toHaveBeenCalled();
  });

  it.each([
    ["the configured origin", "https://app.example"],
    ["the development/test localhost origin", "http://localhost:3000"],
  ])("accepts %s", async (_label, origin) => {
    vi.stubEnv("APP_ORIGIN", "https://app.example");
    if (origin === "https://app.example") vi.stubEnv("NODE_ENV", "production");
    decideAction.mockResolvedValue({ kind: "not_found" });
    const response = await POST(request({
      reviewer: "reviewer", outcome: "approved", reason: "reason",
    }, { origin }), { params });

    expect(response.status).toBe(404);
    expect(decideAction).toHaveBeenCalledOnce();
  });

  it("does not allow the localhost exception in production", async () => {
    vi.stubEnv("APP_ORIGIN", "https://app.example");
    vi.stubEnv("NODE_ENV", "production");
    const response = await POST(request({
      reviewer: "reviewer", outcome: "approved", reason: "reason",
    }, { origin: "http://localhost:3000" }), { params });

    expect(response.status).toBe(403);
    expect(decideAction).not.toHaveBeenCalled();
    expect(executeMockedTool).not.toHaveBeenCalled();
  });

  it("accepts a request without an Origin header", async () => {
    decideAction.mockResolvedValue({ kind: "not_found" });
    const response = await POST(request({
      reviewer: "reviewer", outcome: "approved", reason: "reason",
    }), { params });

    expect(response.status).toBe(404);
    expect(decideAction).toHaveBeenCalledOnce();
  });

  it.each([
    ["missing reviewer", { outcome: "approved", reason: "reason" }, "reviewer: Invalid input: expected string, received undefined"],
    ["empty reason", { reviewer: "reviewer", outcome: "approved", reason: "" }, "reason: Too small: expected string to have >=1 characters"],
    ["whitespace-only reason", { reviewer: "reviewer", outcome: "approved", reason: " \t " }, "reason: Too small: expected string to have >=1 characters"],
    ["invalid outcome", { reviewer: "reviewer", outcome: "accept", reason: "reason" }, "outcome: Invalid option: expected one of \"approved\"|\"denied\""],
  ] as const)("rejects %s without calling the transaction or a tool", async (_label, body, message) => {
    const tool = vi.spyOn(toolRegistry, "issue_refund");
    const response = await POST(request(body), { params });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ message });
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

  it.each([
    ["approved with valid parameters", "approved", { amount: 25, orderId: "ORDER-1" }],
    ["denied with valid parameters", "denied", { amount: 25, orderId: "ORDER-1" }],
    ["approved with null parameters", "approved", null],
    ["denied with a malformed value", "denied", "not parameters"],
  ] as const)("rejects editedParameters for %s without writing or executing", async (_label, outcome, editedParameters) => {
    const tools = (Object.keys(toolRegistry) as (keyof typeof toolRegistry)[])
      .map((tool) => vi.spyOn(toolRegistry, tool));
    const response = await POST(request({
      reviewer: "reviewer", outcome, reason: "reason", editedParameters,
    }), { params });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ message: "editedParameters is not supported." });
    expect(decideAction).not.toHaveBeenCalled();
    for (const tool of tools) expect(tool).not.toHaveBeenCalled();
  });

  it("executes only the validated parameters returned by the committed decision", async () => {
    const parameters = { amount: 25, orderId: "ORDER-1" };
    decideAction.mockResolvedValue({
      kind: "ok", outcome: "approved", tool: "issue_refund", parameters,
    });
    executeMockedTool.mockResolvedValue({
      kind: "executed",
      result: { mocked: true, tool: "issue_refund" },
    });

    const response = await POST(request({
      reviewer: "reviewer", outcome: "approved", reason: "reason",
    }), { params });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      actionId: id, outcome: "approved", message: "Action approved.",
    });
    expect(executeMockedTool).toHaveBeenCalledExactlyOnceWith(id, "issue_refund", parameters);
  });

  it("does not execute mutated stored parameters rejected by the pre-execution check", async () => {
    const invalidStoredParameters = {
      amount: 10_000.01,
      orderId: "ORDER-1",
    };
    decideAction.mockResolvedValue({
      kind: "ok",
      outcome: "approved",
      tool: "issue_refund",
      parameters: invalidStoredParameters,
    });
    executeMockedTool.mockResolvedValue({ kind: "invalid_parameters" });
    const tools = (Object.keys(toolRegistry) as (keyof typeof toolRegistry)[])
      .map((tool) => vi.spyOn(toolRegistry, tool));

    const response = await POST(request({
      reviewer: "reviewer", outcome: "approved", reason: "reason",
    }), { params });

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      actionId: id,
      message: "Approved action parameters are invalid; tool was not run.",
    });
    expect(executeMockedTool).toHaveBeenCalledExactlyOnceWith(
      id, "issue_refund", invalidStoredParameters,
    );
    for (const tool of tools) expect(tool).not.toHaveBeenCalled();
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
