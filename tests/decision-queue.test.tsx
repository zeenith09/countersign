import { isValidElement, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  values: ["Reviewer", "Reason", false, null, null] as unknown[],
  setters: [vi.fn(), vi.fn(), vi.fn(), vi.fn(), vi.fn()],
  index: 0,
  inFlight: { current: false },
  refresh: vi.fn(),
}));

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return {
    ...actual,
    useState: () => {
      const index = state.index++;
      return [state.values[index], state.setters[index]];
    },
    useRef: () => state.inFlight,
  };
});
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: state.refresh }) }));

import { DecisionQueue } from "../src/app/decision-queue";
import { ActionDetails, QueueList, type QueueAction } from "../src/app/queue-list";

const action: QueueAction = {
  id: "c076fb00-26d9-4dfd-9f31-000000000001",
  tool: "issue_refund",
  parameters: { amount: 25 },
  summary: "Refund request",
  agentReasoning: "Customer requested a refund",
  createdAt: "2026-01-01T10:00:00.000Z",
  age: "2 hours ago",
  policyRuleMatched: "refund-over-500",
};

function queueProps() {
  state.index = 0;
  const tree = DecisionQueue({ actions: [action] });
  const children: ReactNode[] = tree.props.children;
  const queue = children.find((child) => isValidElement(child) && child.type === QueueList);
  if (!queue || !isValidElement(queue)) throw new Error("Queue not rendered");
  return (queue as ReactElement<React.ComponentProps<typeof QueueList>>).props;
}

function findButton(node: ReactNode, text: string): ReactElement<{ onClick?: () => void; disabled?: boolean }> | undefined {
  if (Array.isArray(node)) {
    for (const child of node) {
      const match = findButton(child, text);
      if (match) return match;
    }
    return undefined;
  }
  if (!isValidElement<{ children?: ReactNode; onClick?: () => void; disabled?: boolean }>(node)) return undefined;
  if (node.type === "button" && node.props.children === text) return node;
  return findButton(node.props.children, text);
}

function findInputs(node: ReactNode): ReactElement<{
  onChange?: (event: { target: { value: string } }) => void;
}>[] {
  if (Array.isArray(node)) return node.flatMap(findInputs);
  if (!isValidElement<{ children?: ReactNode; onChange?: (event: { target: { value: string } }) => void }>(node)) {
    return [];
  }
  const inputs = node.type === "input"
    ? [node as ReactElement<{ onChange?: (event: { target: { value: string } }) => void }>]
    : [];
  return [...inputs, ...findInputs(node.props.children)];
}

describe("decision queue", () => {
  beforeEach(() => {
    state.values = ["Reviewer", "Reason", false, null, null];
    state.index = 0;
    state.inFlight.current = false;
    state.refresh.mockReset();
    state.setters.forEach((setter) => setter.mockReset());
  });

  afterEach(() => vi.unstubAllGlobals());

  it("wires approve, deny and conflict refresh to their controls", () => {
    const onDecide = vi.fn();
    const onRefresh = vi.fn();
    const details = ActionDetails({ action, onDecide, decisionState: null, submitting: false, onRefresh });
    findButton(details, "Approve")?.props.onClick?.();
    findButton(details, "Deny")?.props.onClick?.();
    expect(onDecide).toHaveBeenNthCalledWith(1, action.id, "approved");
    expect(onDecide).toHaveBeenNthCalledWith(2, action.id, "denied");
    expect(findButton(details, "Edit")?.props.disabled).toBe(true);

    const conflict = ActionDetails({
      action, onDecide, submitting: false, onRefresh,
      decisionState: { actionId: action.id, message: "Already decided by someone else", refreshAvailable: true, locked: true },
    });
    findButton(conflict, "Refresh queue")?.props.onClick?.();
    expect(onRefresh).toHaveBeenCalledOnce();
    expect(findButton(conflict, "Approve")?.props.disabled).toBe(true);
    expect(findButton(conflict, "Deny")?.props.disabled).toBe(true);
  });

  it("renders reviewer inputs and wires the queue refresh callback", () => {
    const reload = vi.fn();
    vi.stubGlobal("window", { location: { reload } });
    const tree = DecisionQueue({ actions: [action] });
    const markup = renderToStaticMarkup(tree);
    expect(markup).toContain("Reviewer name");
    expect(markup).toContain("Reason");
    expect(markup).toContain('maxLength="100"');
    expect(markup).toContain('maxLength="2000"');
    const inputs = findInputs(tree);
    expect(inputs).toHaveLength(2);
    inputs[0].props.onChange?.({ target: { value: "New reviewer" } });
    inputs[1].props.onChange?.({ target: { value: "New reason" } });
    expect(state.setters[0]).toHaveBeenCalledWith("New reviewer");
    expect(state.setters[1]).toHaveBeenCalledWith("New reason");

    const props = queueProps();
    props.onRefresh();
    expect(reload).toHaveBeenCalledOnce();
  });

  it.each(["approved", "denied"] as const)("sends the selected action and %s decision", async (outcome) => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(null, { status: 200 }))
      .mockResolvedValueOnce(Response.json({ status: outcome }));
    vi.stubGlobal("fetch", fetchMock);
    await queueProps().onDecide(action.id, outcome);
    expect(fetchMock).toHaveBeenNthCalledWith(1, `/api/actions/${action.id}/decision`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reviewer: "Reviewer", outcome, reason: "Reason" }),
    });
    expect(fetchMock).toHaveBeenLastCalledWith(`/api/actions/${action.id}`, { cache: "no-store" });
    expect(state.setters[3].mock.calls.at(-1)?.[0].message).toContain(`Current status: ${outcome}`);
    expect(state.refresh).toHaveBeenCalledOnce();
  });

  it("requires a non-blank reviewer and reason", async () => {
    state.values[1] = "   ";
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await queueProps().onDecide(action.id, "approved");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(state.setters[3]).toHaveBeenCalledWith({
      actionId: action.id, message: "Enter a reviewer and reason.", locked: false,
    });
  });

  it("shows the requested conflict message and refresh button after re-reading status", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(null, { status: 409 }))
      .mockResolvedValueOnce(Response.json({ status: "denied" }));
    vi.stubGlobal("fetch", fetchMock);
    await queueProps().onDecide(action.id, "approved");
    expect(fetchMock).toHaveBeenLastCalledWith(`/api/actions/${action.id}`, { cache: "no-store" });
    const decisionState = state.setters[3].mock.calls.at(-1)?.[0];
    const markup = renderToStaticMarkup(<ActionDetails action={action} onDecide={vi.fn()} decisionState={decisionState} submitting={false} onRefresh={vi.fn()} />);
    expect(markup).toContain("Already decided by someone else");
    expect(markup).toContain("Refresh queue");
  });

  it("reports unknown when a failed decision and its status cannot be verified", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("network unavailable"));
    vi.stubGlobal("fetch", fetchMock);
    await queueProps().onDecide(action.id, "denied");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(state.setters[3]).toHaveBeenLastCalledWith({
      actionId: action.id,
      message: "Decision could not be confirmed. Current status: unknown. Refresh the queue before trying again.",
      refreshAvailable: true,
      locked: true,
    });
    expect(state.refresh).not.toHaveBeenCalled();
  });

  it("re-reads status after a busy response", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(null, { status: 503 }))
      .mockResolvedValueOnce(Response.json({ status: "pending" }));
    vi.stubGlobal("fetch", fetchMock);
    await queueProps().onDecide(action.id, "denied");
    expect(fetchMock).toHaveBeenLastCalledWith(`/api/actions/${action.id}`, { cache: "no-store" });
    expect(state.setters[3]).toHaveBeenLastCalledWith({
      actionId: action.id,
      message: "Decision could not be confirmed. Current status: pending. Refresh the queue before trying again.",
      refreshAvailable: true,
      locked: true,
    });
  });

  it("re-reads status after a server error response", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(null, { status: 500 }))
      .mockResolvedValueOnce(Response.json({ status: "approved" }));
    vi.stubGlobal("fetch", fetchMock);
    await queueProps().onDecide(action.id, "denied");
    expect(state.setters[3]).toHaveBeenLastCalledWith({
      actionId: action.id,
      message: "Decision could not be confirmed. Current status: approved. Refresh the queue before trying again.",
      refreshAvailable: true,
      locked: true,
    });
  });

  it("shows a retryable message for a non-server decision error", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(new Response(null, { status: 400 }));
    vi.stubGlobal("fetch", fetchMock);
    await queueProps().onDecide(action.id, "denied");
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(state.setters[3]).toHaveBeenLastCalledWith({
      actionId: action.id,
      message: "Decision request failed (400). Refresh the queue and try again.",
      refreshAvailable: true,
      locked: false,
    });
  });

  it.each([
    ["pending", "pending"],
    ["approved", "approved"],
    ["denied", "denied"],
    ["auto_allowed", "auto_allowed"],
    ["blocked", "blocked"],
  ])("recognizes the stored status %s", async (status, expected) => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(null, { status: 503 }))
      .mockResolvedValueOnce(Response.json({ status }));
    vi.stubGlobal("fetch", fetchMock);
    await queueProps().onDecide(action.id, "approved");
    expect(state.setters[3].mock.calls.at(-1)?.[0].message).toContain(`Current status: ${expected}`);
  });

  it.each([
    ["string body", "not-an-object"],
    ["null body", null],
    ["object without a status", {}],
    ["unsupported status", { status: "unknown-status" }],
  ])("reports unknown for a status response with %s", async (_case, body) => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(null, { status: 503 }))
      .mockResolvedValueOnce(Response.json(body));
    vi.stubGlobal("fetch", fetchMock);
    await queueProps().onDecide(action.id, "approved");
    expect(state.setters[3].mock.calls.at(-1)?.[0].message).toContain("Current status: unknown");
  });

  it.each(["approved", "denied"] as const)(
    "re-fetches and displays the stored status after a successful %s decision",
    async (outcome) => {
      const storedStatus = outcome === "approved" ? "denied" : "approved";
      const fetchMock = vi.fn()
        .mockResolvedValueOnce(Response.json({ actionId: action.id, outcome }))
        .mockResolvedValueOnce(Response.json({ status: storedStatus }));
      vi.stubGlobal("fetch", fetchMock);
      await queueProps().onDecide(action.id, outcome);
      expect(fetchMock).toHaveBeenLastCalledWith(`/api/actions/${action.id}`, { cache: "no-store" });
      const decisionState = state.setters[3].mock.calls.at(-1)?.[0];
      const markup = renderToStaticMarkup(
        <ActionDetails action={action} onDecide={vi.fn()} decisionState={decisionState} submitting={false} onRefresh={vi.fn()} />,
      );
      expect(markup).toContain(storedStatus);
      expect(state.refresh).toHaveBeenCalledOnce();
    },
  );

  it("distinguishes a committed decision from an unavailable status read", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(null, { status: 200 }))
      .mockResolvedValueOnce(new Response(null, { status: 503 }))
      .mockRejectedValueOnce(new Error("status unavailable"));
    vi.stubGlobal("fetch", fetchMock);
    await queueProps().onDecide(action.id, "approved");
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(state.setters[3]).toHaveBeenLastCalledWith({
      actionId: action.id,
      message: "Server confirmed the decision, but the stored status couldn't be refreshed. Refresh the queue to check.",
      refreshAvailable: true,
      locked: true,
    });
    expect(state.refresh).toHaveBeenCalledOnce();
  });

  it.each(["conflict", "busy", "timeout"] as const)(
    "waits for the status re-read after %s before reporting the result",
    async (failure) => {
      let finishRead!: (response: Response) => void;
      const read = new Promise<Response>((resolve) => { finishRead = resolve; });
      const fetchMock = vi.fn();
      if (failure === "timeout") {
        fetchMock.mockRejectedValueOnce(new DOMException("Request timed out", "TimeoutError"));
      } else {
        fetchMock.mockResolvedValueOnce(new Response(null, { status: failure === "conflict" ? 409 : 503 }));
      }
      fetchMock.mockReturnValueOnce(read);
      vi.stubGlobal("fetch", fetchMock);
      const decision = queueProps().onDecide(action.id, "approved");
      await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
      expect(fetchMock).toHaveBeenLastCalledWith(`/api/actions/${action.id}`, { cache: "no-store" });
      expect(state.setters[3].mock.calls.every(([value]) => value === null)).toBe(true);
      finishRead(Response.json({ status: "denied" }));
      await decision;
      const result = state.setters[3].mock.calls.at(-1)?.[0];
      expect(result?.actionId).toBe(action.id);
      if (failure === "conflict") {
        expect(result?.message).toContain("Already decided by someone else");
      } else {
        expect(result?.message).toContain("denied");
      }
    },
  );

  it.each(["conflict", "busy", "timeout"] as const)(
    "reports unknown after %s when status cannot be read",
    async (failure) => {
      const fetchMock = vi.fn();
      if (failure === "timeout") {
        fetchMock.mockRejectedValueOnce(new DOMException("Request timed out", "TimeoutError"));
      } else {
        fetchMock.mockResolvedValueOnce(new Response(null, { status: failure === "conflict" ? 409 : 503 }));
      }
      fetchMock.mockRejectedValueOnce(new Error("status unavailable"));
      vi.stubGlobal("fetch", fetchMock);
      await queueProps().onDecide(action.id, "approved");
      expect(fetchMock).toHaveBeenLastCalledWith(`/api/actions/${action.id}`, { cache: "no-store" });
      expect(state.setters[3].mock.calls.at(-1)?.[0]).toMatchObject({
        actionId: action.id, message: expect.stringContaining("unknown"), locked: true,
      });
    },
  );

  it("does not submit a second decision while the first is in flight", async () => {
    let finish!: (response: Response) => void;
    const fetchMock = vi.fn().mockReturnValue(new Promise<Response>((resolve) => { finish = resolve; }));
    vi.stubGlobal("fetch", fetchMock);
    const props = queueProps();
    const first = props.onDecide(action.id, "approved");
    await props.onDecide(action.id, "denied");
    expect(fetchMock).toHaveBeenCalledOnce();
    finish(new Response(null, { status: 200 }));
    await first;
  });
});
