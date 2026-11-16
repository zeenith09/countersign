"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { Icon, profileTextColor } from "./ConsoleElements";

export function ReviewerProfileDialog({
  open,
  reviewerDraft,
  profileColorDraft,
  profileError,
  onOpenChange,
  onSaved,
  onReviewerDraftChange,
  onProfileColorDraftChange,
}: {
  open: boolean;
  reviewerDraft: string;
  profileColorDraft: string;
  profileError: string;
  onOpenChange: (open: boolean) => void;
  onSaved: (reviewer: string, profileColor: string) => void;
  onReviewerDraftChange: (reviewer: string) => void;
  onProfileColorDraftChange: (profileColor: string) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [saveError, setSaveError] = useState("");

  useEffect(() => {
    if (open) {
      if (!dialog.current?.open) dialog.current?.showModal();
    } else if (dialog.current?.open) {
      dialog.current.close();
    }
  }, [open]);

  function handleClose() {
    setSaveError("");
    onOpenChange(false);
  }

  function saveProfileSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = reviewerDraft.trim();
    if (!name) {
      setSaveError("Enter a reviewer name before saving.");
      return;
    }
    try {
      window.localStorage.setItem(
        "countersign.reviewer-profile",
        JSON.stringify({ reviewer: name, color: profileColorDraft }),
      );
      onSaved(name, profileColorDraft);
      setSaveError("");
      dialog.current?.close();
    } catch {
      setSaveError("Could not save your profile in this browser. Check storage settings and try again.");
    }
  }

  return (
    <dialog
      ref={dialog}
      className="dialog profile-dialog"
      aria-labelledby="profile-dialog-title"
      onClick={(event) => {
        if (event.target === event.currentTarget) dialog.current?.close();
      }}
      onClose={handleClose}
    >
      <form onSubmit={saveProfileSettings}>
        <div className="dialog-header">
          <div className="dialog-title">
            <div
              className="avatar profile-dialog-avatar"
              style={{
                backgroundColor: profileColorDraft,
                color: profileTextColor(profileColorDraft),
              }}
            >
              {reviewerDraft.trim().slice(0, 2).toUpperCase() || "—"}
            </div>
            <div>
              <span className="tool-name">Console preferences</span>
              <h2 id="profile-dialog-title">Reviewer profile</h2>
            </div>
          </div>
          <button type="button" className="icon-button" aria-label="Close reviewer profile" onClick={() => dialog.current?.close()}>
            <Icon name="x" />
          </button>
        </div>
        <div className="profile-dialog-body">
          <label htmlFor="reviewer-name">Profile name</label>
          <input
            id="reviewer-name"
            value={reviewerDraft}
            onChange={(event) => onReviewerDraftChange(event.target.value)}
            maxLength={100}
            autoComplete="name"
            required
            autoFocus
          />
          <label htmlFor="reviewer-color">Profile color</label>
          <div className="profile-color-control">
            <input
              id="reviewer-color"
              type="color"
              value={profileColorDraft}
              onChange={(event) => onProfileColorDraftChange(event.target.value)}
            />
            <span>{profileColorDraft.toUpperCase()}</span>
          </div>
          <div className="theme-coming-soon">
            <span>Dark / light mode</span>
            <button type="button" disabled aria-disabled="true" aria-label="Dark and light mode coming soon">
              <span />
            </button>
            <strong>Coming soon</strong>
          </div>
          {(profileError || saveError) && (
            <p className="field-error" role="alert">{saveError || profileError}</p>
          )}
        </div>
        <div className="decision-footer">
          <button type="button" className="button secondary" onClick={() => dialog.current?.close()}>
            Cancel
          </button>
          <button type="submit" className="button primary">Save profile</button>
        </div>
      </form>
    </dialog>
  );
}
