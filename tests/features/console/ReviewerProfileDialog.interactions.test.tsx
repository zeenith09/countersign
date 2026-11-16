// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ReviewerProfileDialog } from "../../../src/features/console/components/ReviewerProfileDialog";
import { mockDialogMethods } from "./dom-test-helpers";

let restoreDialogMethods: (() => void) | undefined;

function renderProfile({
  reviewerDraft = "Alex   ",
  profileColorDraft = "#123456",
  profileError = "",
  onOpenChange = vi.fn(),
  onSaved = vi.fn(),
  onReviewerDraftChange = vi.fn(),
  onProfileColorDraftChange = vi.fn(),
} = {}) {
  return {
    onOpenChange,
    onSaved,
    onReviewerDraftChange,
    onProfileColorDraftChange,
    ...render(
      <ReviewerProfileDialog
        open
        reviewerDraft={reviewerDraft}
        profileColorDraft={profileColorDraft}
        profileError={profileError}
        onOpenChange={onOpenChange}
        onSaved={onSaved}
        onReviewerDraftChange={onReviewerDraftChange}
        onProfileColorDraftChange={onProfileColorDraftChange}
      />,
    ),
  };
}

beforeEach(() => {
  window.localStorage.clear();
  restoreDialogMethods = mockDialogMethods();
});

afterEach(() => {
  cleanup();
  restoreDialogMethods?.();
  vi.restoreAllMocks();
});

describe("ReviewerProfileDialog interactions", () => {
  it("saves a trimmed name and selected color to browser storage", () => {
    const onSaved = vi.fn();
    const onOpenChange = vi.fn();
    renderProfile({
      reviewerDraft: " Alex ",
      profileColorDraft: "#abcdef",
      onSaved,
      onOpenChange,
    });
    fireEvent.click(screen.getByRole("button", { name: "Save profile" }));

    expect(onSaved).toHaveBeenCalledWith("Alex", "#abcdef");
    expect(JSON.parse(window.localStorage.getItem("countersign.reviewer-profile") ?? "{}"))
      .toEqual({ reviewer: "Alex", color: "#abcdef" });
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(screen.getByText("#ABCDEF")).toBeTruthy();
  });

  it("reports storage failure without claiming the profile was saved", () => {
    const onSaved = vi.fn();
    const { container } = renderProfile({ reviewerDraft: "Alex", onSaved });
    const form = container.querySelector("form");
    if (!form) throw new Error("Profile form was not rendered.");
    const dialog = container.querySelector("dialog");
    if (!dialog) throw new Error("Profile dialog was not rendered.");
    dialog.setAttribute("open", "");

    const setItem = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("storage disabled");
    });
    fireEvent.click(screen.getByRole("button", { name: "Save profile" }));

    expect(setItem).toHaveBeenCalledOnce();
    expect(screen.getByRole("alert").textContent).toContain("Could not save your profile");
    expect(onSaved).not.toHaveBeenCalled();
  });

  it("closes on backdrop and close-button actions", () => {
    const onOpenChange = vi.fn();
    const { container } = renderProfile({ onOpenChange });
    const dialog = container.querySelector("dialog");
    if (!dialog) throw new Error("Profile dialog was not rendered.");

    fireEvent.click(dialog, { target: dialog });
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
