import { isValidElement, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  values: ["Reviewer", "Reason", false, null, null] as unknown[],
  setters: [vi.fn(), vi.fn(), vi.fn(), vi.fn(), vi.fn(), vi.fn(), vi.fn()],
  index: 0,
  refs: [
    { current: false as boolean | HTMLElement | null },
    { current: null as HTMLElement | null },
    { current: null as HTMLElement | null },
    { current: null as HTMLElement | null },
  ],
  refIndex: 0,
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
    useRef: () => state.refs[state.refIndex++],
  };
});
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: state.refresh }) }));

import { DecisionQueue } from "../../../src/features/legacy-queue/DecisionQueue";
import { ActionDetails, QueueList, type QueueAction } from "../../../src/features/legacy-queue/QueueList";

const action: QueueAction = {
  id: "c076fb00-26d9-4dfd-9f31-000000000001",
  tool: "issue_refund",
  parameters: { amount: 25 },
  summary: "Refund request",
  summaryParts: [{ type: "text", value: "Refund request" }],
  agentReasoning: "Customer requested a refund",
  createdAt: "2026-01-01T10:00:00.000Z",
  age: "2 hours ago",
  policyRuleMatched: "other-refunds-allowed",
  policyRuleDescription: "Refunds not matched by the over-$500 rule are allowed.",
};

function queueProps(actions: QueueAction[] = [action]) {
  state.index = 0;
  state.refIndex = 0;
  const tree = DecisionQueue({ actions });
  const children: ReactNode[] = tree.props.children;
  const queue = children.find((child) => isValidElement(child) && child.type === QueueList);
  if (!queue || !isValidElement(queue)) throw new Error("Queue not rendered");
  return (queue as ReactElement<React.ComponentProps<typeof QueueList>>).props;
}

function findButton(node: ReactNode, text: string): ReactElement<{
  onClick?: (event?: { currentTarget: HTMLElement }) => void;
  disabled?: boolean;
}> | undefined {
  if (Array.isArray(node)) {
    for (const child of node) {
      const match = findButton(child, text);
      if (match) return match;
    }
    return undefined;
  }
  if (!isValidElement<{
    children?: ReactNode;
    onClick?: (event?: { currentTarget: HTMLElement }) => void;
    disabled?: boolean;
  }>(node)) return undefined;
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

function findDialog(node: ReactNode): ReactElement<{
  children?: ReactNode;
  "aria-modal"?: boolean;
  onCancel?: (event: { preventDefault: () => void }) => void;
  ref?: (node: HTMLDialogElement | null) => void;
}> | undefined {
  if (Array.isArray(node)) {
    for (const child of node) {
      const match = findDialog(child);
      if (match) return match;
    }
    return undefined;
  }
  if (!isValidElement<{
    children?: ReactNode;
    "aria-modal"?: boolean;
    onCancel?: (event: { preventDefault: () => void }) => void;
    ref?: (node: HTMLDialogElement | null) => void;
  }>(node)) return undefined;
  if (node.type === "dialog") return node;
  return findDialog(node.props.children);
}

describe("decision queue", () => {
  beforeEach(() => {
    state.values = ["Reviewer", "Reason", false, null, null, null, ""];
    state.index = 0;
    state.refIndex = 0;
    state.refs[0].current = false;
    state.refs[1].current = null;
    state.refs[2].current = null;
    state.refs[3].current = null;
    state.refresh.mockReset();
    state.setters.forEach((setter) => setter.mockReset());
  });

  afterEach(() => vi.unstubAllGlobals());

  it("wires approve, deny and conflict refresh to their controls", () => {
    const onDecide = vi.fn();
    const onRefresh = vi.fn();
    const details = ActionDetails({ action, onDecide, decisionState: null, submitting: false, onRefresh });
    const approveTrigger = { focus: vi.fn() } as unknown as HTMLElement;
    const denyTrigger = { focus: vi.fn() } as unknown as HTMLElement;
    findButton(details, "Approve")?.props.onClick?.({ currentTarget: approveTrigger });
    findButton(details, "Deny")?.props.onClick?.({ currentTarget: denyTrigger });
    expect(onDecide).toHaveBeenNthCalledWith(1, action.id, "approved", approveTrigger);
    expect(onDecide).toHaveBeenNthCalledWith(2, action.id, "denied", denyTrigger);
    expect(findButton(details, "Edit")).toBeUndefined();

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

  it("announces a pending decision and focuses the persistent status after commit", async () => {
    const focus = vi.fn();
    state.refs[2].current = { focus } as unknown as HTMLElement;
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(null, { status: 200 }))
      .mockResolvedValueOnce(Response.json({ status: "approved" }));
    vi.stubGlobal("fetch", fetchMock);
    await queueProps().onDecide(action.id, "approved");
    expect(state.setters[6]).toHaveBeenNthCalledWith(1, "Submitting approval decision.");
    expect(state.setters[6]).toHaveBeenLastCalledWith("Decision committed. Current status: approved.");
    expect(focus).toHaveBeenCalledOnce();
  });

  it("requires a non-blank reason and moves focus to the reason field", async () => {
    state.values[1] = "   ";
    const fetchMock = vi.fn();
    const focus = vi.fn();
    const getElementById = vi.fn(() => ({ focus }));
    vi.stubGlobal("document", { getElementById });
    vi.stubGlobal("fetch", fetchMock);
    await queueProps().onDecide(action.id, "approved");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(focus).toHaveBeenCalledOnce();
    expect(getElementById).toHaveBeenCalledWith("decision-reason");
    expect(state.setters[4]).toHaveBeenCalledWith({ field: "reason", message: "Enter a reason." });

    state.values[4] = { field: "reason", message: "Enter a reason." };
    state.index = 0;
    const markup = renderToStaticMarkup(DecisionQueue({ actions: [action] }));
    expect(markup).toContain('aria-invalid="true"');
    expect(markup).toContain('role="alert">Enter a reason.</span>');
  });

  it("requires a non-blank reviewer", async () => {
    state.values[0] = "   ";
    const focus = vi.fn();
    vi.stubGlobal("document", { getElementById: vi.fn(() => ({ focus })) });
    await queueProps().onDecide(action.id, "approved");
    expect(focus).toHaveBeenCalledOnce();
    expect(state.setters[4]).toHaveBeenCalledWith({ field: "reviewer", message: "Enter a reviewer name." });
  });

  it("requires confirmation to deny an action matched by refund-over-500", () => {
    const highRiskAction = { ...action, policyRuleMatched: "refund-over-500" };
    const trigger = { focus: vi.fn() } as unknown as HTMLElement;
    const onDecide = queueProps([highRiskAction]).onDecide;
    onDecide(highRiskAction.id, "denied", trigger);
    expect(state.setters[5]).toHaveBeenCalledWith({ actionId: highRiskAction.id, outcome: "denied" });
    expect(trigger.focus).not.toHaveBeenCalled();
  });

  it("requires confirmation to approve a delete action", () => {
    const deleteAction = { ...action, tool: "delete_record" };
    const trigger = { focus: vi.fn() } as unknown as HTMLElement;
    queueProps([deleteAction]).onDecide(deleteAction.id, "approved", trigger);
    expect(state.setters[5]).toHaveBeenCalledWith({ actionId: deleteAction.id, outcome: "approved" });
  });

  it("uses a native modal dialog and returns focus to its trigger on Escape", () => {
    const highRiskAction = { ...action, policyRuleMatched: "refund-over-500" };
    const trigger = { focus: vi.fn() } as unknown as HTMLElement;
    queueProps([highRiskAction]).onDecide(highRiskAction.id, "denied", trigger);
    state.values[5] = { actionId: highRiskAction.id, outcome: "denied" };
    state.index = 0;
    state.refIndex = 0;
    const tree = DecisionQueue({ actions: [highRiskAction] });
    const markup = renderToStaticMarkup(tree);
    expect(markup).toContain("<dialog");
    expect(markup).toContain('aria-modal="true"');
    expect(markup).toContain("This action matched the refund-over-500 rule.");

    const dialog = findDialog(tree);
    if (!dialog) throw new Error("Confirmation dialog not rendered");
    const firstButton = { focus: vi.fn() };
    const nativeDialog = {
      open: false,
      showModal: vi.fn(),
      close: vi.fn(),
      querySelector: vi.fn(() => firstButton),
      focus: vi.fn(),
    } as unknown as HTMLDialogElement;
    dialog.props.ref?.(nativeDialog);
    expect(nativeDialog.showModal).toHaveBeenCalledOnce();
    expect(firstButton.focus).toHaveBeenCalledOnce();
    const preventDefault = vi.fn();
    dialog.props.onCancel?.({ preventDefault });
    expect(preventDefault).toHaveBeenCalledOnce();
    expect(nativeDialog.close).toHaveBeenCalledOnce();
    expect(trigger.focus).toHaveBeenCalledOnce();
    expect(state.setters[5]).toHaveBeenLastCalledWith(null);
  });

  it("renders a native dialog with modal accessibility state", () => {
    const highRiskAction = { ...action, policyRuleMatched: "refund-over-500" };
    state.values[5] = { actionId: highRiskAction.id, outcome: "denied" };
    const tree = DecisionQueue({ actions: [highRiskAction] });
    const dialog = findDialog(tree);
    expect(dialog?.type).toBe("dialog");
    expect(dialog?.props["aria-modal"]).toBe("true");
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
    expect(markup).toContain("action is no longer pending");
    expect(markup).toContain("Refresh queue");
  });

  it("reports unknown when a failed decision and its status cannot be verified", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("network unavailable"));
    vi.stubGlobal("fetch", fetchMock);
    await queueProps().onDecide(action.id, "denied");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(state.setters[3]).toHaveBeenLastCalledWith({
      actionId: action.id,
      message: "A network error interrupted the decision request. Current status: unknown. Refresh the queue before trying again.",
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
      message: "The server could not confirm the decision (HTTP 503). Current status: pending. Refresh the queue before trying again.",
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
      message: "The server could not confirm the decision (HTTP 500). Current status: approved. Refresh the queue before trying again.",
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
      message: "The decision request was rejected (HTTP 400). Check the reviewer name and reason, then try again.",
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
        expect(result?.message).toContain("action is no longer pending");
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
