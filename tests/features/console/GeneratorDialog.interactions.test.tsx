// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
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

function renderGenerator(onSubmitted = vi.fn(async () => undefined)) {
  return {
    onSubmitted,
    ...render(<GeneratorDialog open onOpenChange={vi.fn()} onSubmitted={onSubmitted} />),
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
    fireEvent.keyDown(screen.getByRole("tablist"), { key: "ArrowLeft" });
    expect(screen.getByRole("tab", { name: "Automatic demo" }).getAttribute("aria-selected")).toBe("true");
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
    expect(postProposalMock).toHaveBeenCalledWith(expect.objectContaining({
      agentId: "demo-agent",
      tool: "issue_refund",
    }));
    expect(screen.getByText(/Action action-created; matched rule: refund-over-500/)).toBeTruthy();
  });

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
});
