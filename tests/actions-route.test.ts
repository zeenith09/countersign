import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { getPrisma, create, update, remove } = vi.hoisted(() => ({
  getPrisma: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  remove: vi.fn(),
}));

vi.mock("../src/lib/prisma", () => ({ getPrisma }));

import { POST } from "../src/app/api/actions/route";
import * as storage from "../src/lib/actions/store-action";
import { toolRegistry } from "../src/lib/tools";

const actionId = "c076fb00-26d9-4dfd-9f31-000000000001";
const baseAction = {
  agentId: "test-agent",
  agentReasoning: "Test reason",
  tool: "issue_refund",
  parameters: { amount: 500 },
};

function request(body: unknown): Request {
  return new Request("http://localhost/api/actions", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("action submission gateway", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    getPrisma.mockReturnValue({ action: { create, update, delete: remove } });
    create.mockResolvedValue({ id: actionId });
    vi.spyOn(storage, "storeAction").mockImplementation(async (_client, data) => create({ data }));
    vi.spyOn(toolRegistry, "issue_refund").mockReturnValue({ mocked: true, tool: "issue_refund" });
    vi.spyOn(toolRegistry, "send_email").mockReturnValue({ mocked: true, tool: "send_email" });
    vi.spyOn(toolRegistry, "delete_record").mockReturnValue({ mocked: true, tool: "delete_record" });
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("stores an allowed refund before calling its mocked tool once", async () => {
    const response = await POST(request(baseAction));

    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({
      actionId,
      outcome: "allow",
      ruleId: "other-refunds-allowed",
      status: "auto_allowed",
      result: { mocked: true, tool: "issue_refund" },
    });
    expect(create).toHaveBeenCalledOnce();
    expect(create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        ...baseAction,
        status: "auto_allowed",
        policyRuleMatched: "other-refunds-allowed",
      }),
    }));
    expect(storage.storeAction).toHaveBeenCalledOnce();
    expect(toolRegistry.issue_refund).toHaveBeenCalledExactlyOnceWith(actionId);
    expect(vi.mocked(storage.storeAction).mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(toolRegistry.issue_refund).mock.invocationCallOrder[0],
    );
  });

  it.each([
    ["high refund", { amount: 501 }, "refund-over-500"],
    ["missing amount", {}, "no_rule_match"],
    ["string amount", { amount: "5000" }, "no_rule_match"],
  ])("stores %s for approval without calling a tool", async (_label, parameters, ruleId) => {
    const response = await POST(request({ ...baseAction, parameters }));

    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({
      actionId,
      outcome: "needs_approval",
      ruleId,
      status: "pending",
    });
    expect(create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ parameters, status: "pending", policyRuleMatched: ruleId }),
    }));
    expect(toolRegistry.issue_refund).not.toHaveBeenCalled();
  });

  it.each([
    ["policy block", "delete_record", "delete-record-blocked"],
    ["unsupported tool", "unsupported_tool_name", "unsupported_tool"],
  ])("stores and rejects a %s without calling a tool", async (_label, tool, ruleId) => {
    const response = await POST(request({ ...baseAction, tool }));
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body).toEqual({
      actionId,
      outcome: "block",
      ruleId,
      status: "blocked",
      message: expect.any(String),
    });
    expect(body.message.length).toBeGreaterThan(0);
    expect(body.message).not.toContain(baseAction.agentReasoning);
    expect(create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ tool, status: "blocked", policyRuleMatched: ruleId }),
    }));
    expect(toolRegistry.delete_record).not.toHaveBeenCalled();
    expect(toolRegistry.issue_refund).not.toHaveBeenCalled();
    expect(toolRegistry.send_email).not.toHaveBeenCalled();
  });

  it.each([
    ["internal", "user@countersign.example", "allow", "internal-domain-emails-allowed", "auto_allowed"],
    ["external", "user@example.com", "needs_approval", "other-emails-need-approval", "pending"],
    ["lookalike", "user@countersign.example.evil.com", "needs_approval", "other-emails-need-approval", "pending"],
    ["malformed", "bad(@countersign.example", "needs_approval", "other-emails-need-approval", "pending"],
  ])("routes %s email correctly", async (_label, to, outcome, ruleId, status) => {
    const parameters = { to, recipient_domain: "caller-supplied.example", nested: { untouched: true } };
    const response = await POST(request({ ...baseAction, tool: "send_email", parameters }));
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body).toMatchObject({ actionId, outcome, ruleId, status });
    if (outcome === "allow") {
      expect(body.result).toEqual({ mocked: true, tool: "send_email" });
      expect(toolRegistry.send_email).toHaveBeenCalledExactlyOnceWith(actionId);
    } else {
      expect(toolRegistry.send_email).not.toHaveBeenCalled();
    }
    expect(create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ parameters, status, policyRuleMatched: ruleId }),
    }));
  });

  it("ignores unknown top-level properties", async () => {
    const response = await POST(request({ ...baseAction, ignored: "not stored" }));
    expect(response.status).toBe(201);
    expect(create.mock.calls[0][0].data).not.toHaveProperty("ignored");
  });

  it.each([
    ["non-object body", null],
    ["array body", []],
    ["missing tool", { agentId: "agent", agentReasoning: "", parameters: {} }],
    ["empty tool", { ...baseAction, tool: "" }],
    ["non-string tool", { ...baseAction, tool: 4 }],
    ["missing agentId", { tool: "issue_refund", agentReasoning: "", parameters: {} }],
    ["empty agentId", { ...baseAction, agentId: "" }],
    ["non-string agentId", { ...baseAction, agentId: 4 }],
    ["missing agentReasoning", { agentId: "agent", tool: "issue_refund", parameters: {} }],
    ["non-string agentReasoning", { ...baseAction, agentReasoning: 4 }],
    ["missing parameters", { agentId: "agent", agentReasoning: "", tool: "issue_refund" }],
    ["null parameters", { ...baseAction, parameters: null }],
    ["array parameters", { ...baseAction, parameters: [] }],
    ["snake_case fields", {
      agent_id: "agent",
      agent_reasoning: "reason",
      tool: "issue_refund",
      parameters: {},
    }],
  ])("rejects %s without storing or calling a tool", async (_label, body) => {
    const response = await POST(request(body));

    expect(response.status).toBe(400);
    expect(create).not.toHaveBeenCalled();
    expect(storage.storeAction).not.toHaveBeenCalled();
    expect(toolRegistry.issue_refund).not.toHaveBeenCalled();
    expect(toolRegistry.send_email).not.toHaveBeenCalled();
    expect(toolRegistry.delete_record).not.toHaveBeenCalled();
  });

  it("returns 500 without calling a tool when storage fails", async () => {
    create.mockRejectedValue(new Error("sensitive database failure"));

    const response = await POST(request(baseAction));
    expect(response.status).toBe(500);
    expect(await response.text()).not.toContain("sensitive database failure");
    expect(toolRegistry.issue_refund).not.toHaveBeenCalled();
  });

  it("returns 500 with actionId when a mocked tool throws after storage", async () => {
    vi.mocked(toolRegistry.issue_refund).mockImplementation(() => {
      throw new Error("sensitive mocked-tool failure");
    });

    const response = await POST(request(baseAction));
    const body = await response.json();
    expect(response.status).toBe(500);
    expect(body).toMatchObject({ actionId, message: expect.any(String) });
    expect(JSON.stringify(body)).not.toContain("sensitive mocked-tool failure");
    expect(create).toHaveBeenCalledOnce();
    expect(create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: "auto_allowed" }),
    }));
    expect(update).not.toHaveBeenCalled();
    expect(remove).not.toHaveBeenCalled();
    expect(toolRegistry.issue_refund).toHaveBeenCalledExactlyOnceWith(actionId);
    expect(vi.mocked(storage.storeAction).mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(toolRegistry.issue_refund).mock.invocationCallOrder[0],
    );
  });

  it("waits for the stored action before calling the allowed tool", async () => {
    let resolveStore!: (value: { id: string }) => void;
    const stored = new Promise<{ id: string }>((resolve) => { resolveStore = resolve; });
    vi.mocked(storage.storeAction).mockReturnValue(stored);

    const responsePromise = POST(request(baseAction));
    await new Promise((resolve) => setTimeout(resolve, 0));
    try {
      expect(storage.storeAction).toHaveBeenCalledOnce();
      expect(toolRegistry.issue_refund).not.toHaveBeenCalled();
    } finally {
      resolveStore({ id: actionId });
    }
    const response = await responsePromise;

    expect(response.status).toBe(201);
    expect(toolRegistry.issue_refund).toHaveBeenCalledExactlyOnceWith(actionId);
  });
});

describe("mocked tool registry", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("registers exactly the three supported tools", () => {
    expect(Object.keys(toolRegistry).sort()).toEqual([
      "delete_record",
      "issue_refund",
      "send_email",
    ]);
  });

  it.each(["send_email", "issue_refund", "delete_record"] as const)(
    "%s logs only its name and action ID",
    (tool) => {
      const log = vi.spyOn(console, "log").mockImplementation(() => {});
      expect(() => toolRegistry[tool](actionId)).not.toThrow();
      expect(log).toHaveBeenCalledOnce();
      expect(log.mock.calls[0].join(" ")).toContain(tool);
      expect(log.mock.calls[0].join(" ")).toContain(actionId);
      expect(log.mock.calls[0].join(" ")).not.toContain(baseAction.agentReasoning);
      expect(log.mock.calls[0].join(" ")).not.toContain("500");
      expect(log.mock.calls[0].join(" ")).toBe(`${tool} ${actionId}`);
    },
  );
});

it("negative control: the deferred-write guard catches a premature tool call", async () => {
  const tool = vi.fn();
  let resolveStore!: () => void;
  const stored = new Promise<void>((resolve) => { resolveStore = resolve; });
  const incorrectFlow = (async () => {
    tool(actionId);
    await stored;
  })();
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(() => expect(tool).not.toHaveBeenCalled()).toThrow();
  resolveStore();
  await incorrectFlow;
  expect(tool).toHaveBeenCalledExactlyOnceWith(actionId);
});
