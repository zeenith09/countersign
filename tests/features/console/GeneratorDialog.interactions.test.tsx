// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { postActionProposal } from "../../../src/features/console/api-client";
import { GeneratorDialog } from "../../../src/features/console/components/GeneratorDialog";
import { mockDialogMethods } from "./dom-test-helpers";

vi.mock("../../../src/features/console/api-client", () => ({
  fetchConsoleSnapshot: vi.fn(),
  fetchActionStatus: vi.fn(),
  postActionDecision: vi.fn(),
  postActionProposal: vi.fn(),
}));

const postProposalMock = vi.mocked(postActionProposal);
let restoreDialogMethods: (() => void) | undefined;

function renderGenerator(
  onSubmitted = vi.fn(async () => undefined),
  onOpenChange = vi.fn(),
) {
  return {
    onSubmitted,
    onOpenChange,
    ...render(<GeneratorDialog open onOpenChange={onOpenChange} onSubmitted={onSubmitted} />),
  };
}

beforeEach(() => {
  postProposalMock.mockReset();
  restoreDialogMethods = mockDialogMethods();
});

afterEach(() => {
  cleanup();
  restoreDialogMethods?.();
});

describe("GeneratorDialog interactions", () => {
  it("switches tabs with clicks and arrow keys and reports invalid JSON", () => {
    renderGenerator();
    const manualTab = screen.getByRole("tab", { name: "Manual JSON" });
    fireEvent.click(manualTab);
    expect(screen.getByLabelText("Proposal JSON")).toBeTruthy();

    fireEvent.change(screen.getByLabelText("Proposal JSON"), { target: { value: "{invalid" } });
    fireEvent.click(screen.getByRole("button", { name: "Submit to gateway" }));
    expect(screen.getByRole("alert").textContent).toContain("Expected property name");
    expect(postProposalMock).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Format JSON" }));
    expect(screen.getByRole("alert")).toBeTruthy();
    fireEvent.click(screen.getByRole("tab", { name: "Automatic demo" }));
    expect(screen.queryByRole("alert")).toBeNull();
    fireEvent.click(screen.getByRole("tab", { name: "Manual JSON" }));
    const tablist = screen.getByRole("tablist");
    const ignoredKey = new KeyboardEvent("keydown", {
      bubbles: true,
      cancelable: true,
      key: "Home",
    });
    tablist.dispatchEvent(ignoredKey);
    expect(ignoredKey.defaultPrevented).toBe(false);
    fireEvent.keyDown(tablist, { key: "ArrowLeft" });
    expect(screen.getByRole("tab", { name: "Automatic demo" }).getAttribute("aria-selected")).toBe("true");
    fireEvent.keyDown(tablist, { key: "ArrowRight" });
    expect(screen.getByRole("tab", { name: "Manual JSON" }).getAttribute("aria-selected")).toBe("true");
  });

  it("shows a committed gateway receipt and refreshes the console", async () => {
    const onSubmitted = vi.fn(async () => undefined);
    postProposalMock.mockResolvedValue(Response.json({
      actionId: "action-created",
      status: "pending",
      outcome: "needs_approval",
      ruleId: "refund-over-500",
    }, { status: 201 }));
    renderGenerator(onSubmitted);

    fireEvent.click(screen.getByRole("button", { name: "Submit to gateway" }));
    await waitFor(() => expect(screen.getByText("Awaiting human review")).toBeTruthy());

    expect(onSubmitted).toHaveBeenCalledOnce();
    expect(document.querySelector(".lifecycle .life-step")?.classList.contains("complete")).toBe(true);
    expect(document.querySelectorAll(".lifecycle .life-step.complete")).toHaveLength(3);
    expect(postProposalMock).toHaveBeenCalledWith(expect.objectContaining({
      agentId: "demo-agent",
      tool: "issue_refund",
    }));
    expect(screen.getByText(/Action action-created; matched rule: refund-over-500/)).toBeTruthy();
  });

  it.each([
    [
      /Internal email/,
      "auto_allowed",
      201,
      {
        actionId: "allowed-action",
        status: "auto_allowed",
        outcome: "allow",
        ruleId: "internal-domain-emails-allowed",
      },
      "Policy auto-allowed this action",
    ],
    [
      /Delete record/,
      "blocked",
      403,
      {
        actionId: "blocked-action",
        status: "blocked",
        outcome: "block",
        ruleId: "delete-record-blocked",
      },
      "Gateway blocked this action",
    ],
  ] as const)(
    "shows the %s scenario receipt",
    async (scenarioName, status, responseStatus, body, title) => {
      const onSubmitted = vi.fn(async () => undefined);
      postProposalMock.mockResolvedValueOnce(Response.json(body, { status: responseStatus }));
      const { container } = renderGenerator(onSubmitted);

      fireEvent.click(screen.getByRole("radio", { name: scenarioName }));
      fireEvent.click(screen.getByRole("button", { name: "Submit to gateway" }));

      expect(await screen.findByText(title)).toBeTruthy();
      expect(container.querySelector(`.generated-receipt.${status}`)).toBeTruthy();
      expect(onSubmitted).toHaveBeenCalledOnce();
      fireEvent.click(screen.getByRole("radio", { name: /High-value refund/ }));
      expect(container.querySelector(".generated-receipt")).toBeNull();
      expect(container.querySelector(".lifecycle")).toBeNull();
    },
  );

  it("does not claim success for an invalid gateway response", async () => {
    postProposalMock.mockResolvedValue(Response.json({ message: "Invalid proposal." }, { status: 400 }));
    const { onSubmitted } = renderGenerator();

    fireEvent.click(screen.getByRole("button", { name: "Submit to gateway" }));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("Invalid proposal."));
    expect(onSubmitted).not.toHaveBeenCalled();
  });

  it("explains an unknown outcome after a network failure", async () => {
    postProposalMock.mockRejectedValue(new Error("network down"));
    renderGenerator();

    fireEvent.click(screen.getByRole("button", { name: "Submit to gateway" }));
    await waitFor(() => {
      expect(screen.getByRole("alert").textContent).toContain("status is unknown");
    });
  });

  it.each(["null", "[]", '"proposal"'])(
    "rejects a manual JSON proposal that is not an object: %s",
    async (value) => {
      renderGenerator();
      fireEvent.click(screen.getByRole("tab", { name: "Manual JSON" }));
      fireEvent.change(screen.getByLabelText("Proposal JSON"), { target: { value } });
      fireEvent.click(screen.getByRole("button", { name: "Submit to gateway" }));

      expect((await screen.findByRole("alert")).textContent).toContain(
        "The proposal must be a JSON object.",
      );
      expect(postProposalMock).not.toHaveBeenCalled();
    },
  );

  it.each([
    [503, { message: "Service unavailable." }, "Submission could not be confirmed"],
    [201, { message: "Unexpected success body." }, "Submission could not be confirmed"],
    [
      403,
      {
        actionId: "inconsistent-action",
        status: "blocked",
        outcome: "allow",
        ruleId: "unsupported_tool",
      },
      "Submission could not be confirmed",
    ],
    [400, {}, "Submission rejected (HTTP 400)."],
  ] as const)(
    "reports an unconfirmed or rejected gateway response (HTTP %s)",
    async (status, body, expectedMessage) => {
      postProposalMock.mockResolvedValueOnce(Response.json(body, { status }));
      renderGenerator();

      fireEvent.click(screen.getByRole("button", { name: "Submit to gateway" }));

      expect((await screen.findByRole("alert")).textContent).toContain(expectedMessage);
    },
  );

  it("closes from the header, footer, and backdrop, and follows a controlled close", async () => {
    const onOpenChange = vi.fn();
    const onSubmitted = vi.fn(async () => undefined);
    const { container, rerender } = renderGenerator(onSubmitted, onOpenChange);
    const dialog = container.querySelector("dialog");
    if (!dialog) throw new Error("Generator dialog was not rendered.");

    fireEvent.click(screen.getByRole("button", { name: "Close generator" }));
    expect(dialog.hasAttribute("open")).toBe(false);
    expect(onOpenChange).toHaveBeenLastCalledWith(false);

    dialog.showModal();
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(dialog.hasAttribute("open")).toBe(false);

    dialog.showModal();
    fireEvent.click(dialog);
    expect(dialog.hasAttribute("open")).toBe(false);

    dialog.showModal();
    rerender(
      <GeneratorDialog open={false} onOpenChange={onOpenChange} onSubmitted={onSubmitted} />,
    );
    await waitFor(() => expect(dialog.hasAttribute("open")).toBe(false));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("prevents cancellation and duplicate submission while a proposal is in flight", async () => {
    let resolveProposal!: (response: Response) => void;
    postProposalMock.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveProposal = resolve;
      }),
    );
    const onOpenChange = vi.fn();
    renderGenerator(undefined, onOpenChange);
    const submit = screen.getByRole("button", { name: "Submit to gateway" });
    const dialog = screen.getByRole("dialog");

    fireEvent.click(submit);
    await waitFor(() => expect(submit.hasAttribute("disabled")).toBe(true));
    expect(document.querySelector(".lifecycle .life-step")?.classList.contains("active")).toBe(true);

    const cancelEvent = new Event("cancel", { cancelable: true });
    dialog.dispatchEvent(cancelEvent);
    expect(cancelEvent.defaultPrevented).toBe(true);
    fireEvent.click(dialog);
    expect(dialog.hasAttribute("open")).toBe(true);

    act(() => {
      submit.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      submit.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(postProposalMock).toHaveBeenCalledOnce();

    resolveProposal(
      Response.json(
        {
          actionId: "action-in-flight",
          status: "pending",
          outcome: "needs_approval",
          ruleId: "refund-over-500",
        },
        { status: 201 },
      ),
    );
    expect(await screen.findByText("Awaiting human review")).toBeTruthy();

    const cancelAfterCompletion = new Event("cancel", { cancelable: true });
    dialog.dispatchEvent(cancelAfterCompletion);
    expect(cancelAfterCompletion.defaultPrevented).toBe(false);
    fireEvent.click(dialog);
    expect(dialog.hasAttribute("open")).toBe(false);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
