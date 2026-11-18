// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ReviewerProfileDialog } from "../../../src/features/console/components/ReviewerProfileDialog";
import { mockDialogMethods } from "./dom-test-helpers";

let restoreDialogMethods: (() => void) | undefined;

function renderProfile({
  open = true,
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
        open={open}
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

  it("opens only once when effects are replayed while already open", () => {
    const { container } = render(
      <StrictMode>
        <ReviewerProfileDialog
          open
          reviewerDraft="Alex"
          profileColorDraft="#123456"
          profileError=""
          onOpenChange={vi.fn()}
          onSaved={vi.fn()}
          onReviewerDraftChange={vi.fn()}
          onProfileColorDraftChange={vi.fn()}
        />
      </StrictMode>,
    );

    expect(container.querySelector("dialog")?.open).toBe(true);
  });

  it("keeps mobile profile opening from focusing the name field", () => {
    vi.stubGlobal("matchMedia", vi.fn().mockReturnValue({ matches: true }));
    const { container } = renderProfile();
    const closeButton = container.querySelector<HTMLButtonElement>(".profile-dialog-close");

    expect(closeButton).not.toBeNull();
    expect(document.activeElement).toBe(closeButton);
    expect(document.activeElement).not.toBe(screen.getByLabelText("Profile name"));
  });

  it("closes when the open prop changes to false", () => {
    const props = {
      reviewerDraft: "Alex",
      profileColorDraft: "#123456",
      profileError: "",
      onOpenChange: vi.fn(),
      onSaved: vi.fn(),
      onReviewerDraftChange: vi.fn(),
      onProfileColorDraftChange: vi.fn(),
    };
    const { rerender, container } = render(<ReviewerProfileDialog {...props} open />);
    const dialog = container.querySelector("dialog");
    if (!dialog) throw new Error("Profile dialog was not rendered.");
    expect(dialog.open).toBe(true);

    rerender(<ReviewerProfileDialog {...props} open={false} />);
    expect(dialog.open).toBe(false);
  });

  it("does not call showModal when the dialog is already open", () => {
    const props = {
      reviewerDraft: "Alex",
      profileColorDraft: "#123456",
      profileError: "",
      onOpenChange: vi.fn(),
      onSaved: vi.fn(),
      onReviewerDraftChange: vi.fn(),
      onProfileColorDraftChange: vi.fn(),
    };
    const { rerender, container } = render(<ReviewerProfileDialog {...props} open={false} />);
    const dialog = container.querySelector("dialog");
    if (!dialog) throw new Error("Profile dialog was not rendered.");
    const showModal = vi.spyOn(dialog, "showModal");
    dialog.showModal();

    rerender(<ReviewerProfileDialog {...props} open />);

    expect(dialog.open).toBe(true);
    expect(showModal).toHaveBeenCalledOnce();
  });

  it("rejects a blank reviewer name without writing or saving", () => {
    const onSaved = vi.fn();
    const setItem = vi.spyOn(Storage.prototype, "setItem");
    const { container } = renderProfile({ reviewerDraft: " \t ", onSaved });
    const form = container.querySelector("form");
    if (!form) throw new Error("Profile form was not rendered.");

    fireEvent.submit(form);

    expect(screen.getByRole("alert").textContent).toBe("Enter a reviewer name before saving.");
    expect(setItem).not.toHaveBeenCalled();
    expect(onSaved).not.toHaveBeenCalled();
  });

  it("reports profile-name and profile-color input changes", () => {
    const onReviewerDraftChange = vi.fn();
    const onProfileColorDraftChange = vi.fn();
    renderProfile({ onReviewerDraftChange, onProfileColorDraftChange });

    fireEvent.change(screen.getByLabelText("Profile name"), { target: { value: "Sam" } });
    fireEvent.change(screen.getByLabelText("Profile color"), { target: { value: "#abcdef" } });

    expect(onReviewerDraftChange).toHaveBeenCalledWith("Sam");
    expect(onProfileColorDraftChange).toHaveBeenCalledWith("#abcdef");
  });

  it("shows a profile error supplied by the parent", () => {
    renderProfile({ profileError: "Profile could not be loaded." });

    expect(screen.getByRole("alert").textContent).toBe("Profile could not be loaded.");
  });

  it.each([
    ["Close reviewer profile", "close"],
    ["Cancel", "cancel"],
  ])("closes through the %s button", (name) => {
    const onOpenChange = vi.fn();
    const { container } = renderProfile({ onOpenChange });
    const dialog = container.querySelector("dialog");
    if (!dialog) throw new Error("Profile dialog was not rendered.");

    fireEvent.click(screen.getByRole("button", { name }));

    expect(dialog.open).toBe(false);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
