"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { QueueList, type DecisionOutcome, type DecisionState, type QueueAction } from "./queue-list";

async function readStatus(id: string): Promise<string | null> {
  try {
    const response = await fetch(`/api/actions/${encodeURIComponent(id)}`, { cache: "no-store" });
    if (!response.ok) return null;
    const body: unknown = await response.json();
    if (typeof body !== "object" || body === null || !("status" in body)) return null;
    const status = body.status;
    return status === "pending" || status === "approved" || status === "denied" ||
      status === "auto_allowed" || status === "blocked" ? status : null;
  } catch {
    return null;
  }
}

export function DecisionQueue({ actions }: { actions: QueueAction[] }) {
  const router = useRouter();
  const [reviewer, setReviewer] = useState("");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [decisionState, setDecisionState] = useState<DecisionState>(null);
  const [formError, setFormError] = useState<{ field: "reviewer" | "reason"; message: string } | null>(null);
  const [confirmation, setConfirmation] = useState<{ actionId: string; outcome: DecisionOutcome } | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const inFlight = useRef(false);
  const confirmationTrigger = useRef<HTMLElement | null>(null);
  const announcementRef = useRef<HTMLParagraphElement | null>(null);
  const confirmationDialogRef = useRef<HTMLDialogElement | null>(null);

  function validateReview(): boolean {
    if (!reviewer.trim()) {
      setFormError({ field: "reviewer", message: "Enter a reviewer name." });
      document.getElementById("reviewer-name")?.focus();
      return false;
    }
    if (!reason.trim()) {
      setFormError({ field: "reason", message: "Enter a reason." });
      document.getElementById("decision-reason")?.focus();
      return false;
    }
    setFormError(null);
    return true;
  }

  async function decide(id: string, outcome: DecisionOutcome) {
    if (inFlight.current) return;
    if (!validateReview()) return;

    inFlight.current = true;
    setSubmitting(true);
    setDecisionState(null);
    setAnnouncement(`Submitting ${outcome === "approved" ? "approval" : "denial"} decision.`);
    try {
      const response = await fetch(`/api/actions/${encodeURIComponent(id)}/decision`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reviewer, outcome, reason }),
      });
      if (response.ok) {
        let status = await readStatus(id);
        if (!status) status = await readStatus(id);
        const message = status
          ? `Decision committed. Current status: ${status}.`
          : "Server confirmed the decision, but the stored status couldn't be refreshed. Refresh the queue to check.";
        setDecisionState({
          actionId: id,
          message,
          ...(!status && { refreshAvailable: true }),
          locked: true,
        });
        setAnnouncement(message);
        announcementRef.current?.focus();
        router.refresh();
      } else if (response.status === 409) {
        const status = await readStatus(id);
        setDecisionState({
          actionId: id,
          message: `The server rejected this decision because the action is no longer pending. Current status: ${status ?? "unknown"}. Refresh the queue before continuing.`,
          refreshAvailable: true,
          locked: true,
        });
      } else if (response.status === 503 || response.status >= 500) {
        const status = await readStatus(id);
        setDecisionState({
          actionId: id,
          message: `The server could not confirm the decision (HTTP ${response.status}). Current status: ${status ?? "unknown"}. Refresh the queue before trying again.`,
          refreshAvailable: true,
          locked: true,
        });
      } else {
        setDecisionState({
          actionId: id,
          message: `The decision request was rejected (HTTP ${response.status}). Check the reviewer name and reason, then try again.`,
          locked: false,
        });
      }
    } catch {
      const status = await readStatus(id);
      setDecisionState({
        actionId: id,
        message: `A network error interrupted the decision request. Current status: ${status ?? "unknown"}. Refresh the queue before trying again.`,
        refreshAvailable: true,
        locked: true,
      });
    } finally {
      inFlight.current = false;
      setSubmitting(false);
    }
  }

  function requestDecision(id: string, outcome: DecisionOutcome, trigger?: HTMLElement) {
    const action = actions.find((candidate) => candidate.id === id);
    const needsConfirmation = action && (
      (outcome === "denied" && action.policyRuleMatched === "refund-over-500") ||
      (outcome === "approved" && action.tool === "delete_record")
    );
    if (needsConfirmation) {
      if (!validateReview()) return;
      confirmationTrigger.current = trigger ?? null;
      setConfirmation({ actionId: id, outcome });
      return;
    }
    return decide(id, outcome);
  }

  function closeConfirmation() {
    confirmationDialogRef.current?.close();
    setConfirmation(null);
    confirmationTrigger.current?.focus();
  }

  const confirmationAction = confirmation
    ? actions.find((action) => action.id === confirmation.actionId)
    : undefined;

  return (
    <>
      <div className="console-reviewer-fields mt-4 flex flex-wrap gap-4">
        <label className="flex flex-col gap-1">
          Reviewer name
          <input
            id="reviewer-name"
            className="border px-2 focus-visible:outline-2 focus-visible:outline-offset-2"
            value={reviewer}
            maxLength={100}
            required
            aria-invalid={formError?.field === "reviewer"}
            aria-describedby="reviewer-name-error"
            onChange={(event) => {
              setReviewer(event.target.value);
              if (formError?.field === "reviewer") setFormError(null);
            }}
          />
          <span id="reviewer-name-error" role="alert">
            {formError?.field === "reviewer" ? formError.message : ""}
          </span>
        </label>
        <label className="flex flex-col gap-1">
          Reason
          <input
            id="decision-reason"
            className="border px-2 focus-visible:outline-2 focus-visible:outline-offset-2"
            value={reason}
            maxLength={2000}
            required
            aria-invalid={formError?.field === "reason"}
            aria-describedby="decision-reason-error"
            onChange={(event) => {
              setReason(event.target.value);
              if (formError?.field === "reason") setFormError(null);
            }}
          />
          <span id="decision-reason-error" role="alert">
            {formError?.field === "reason" ? formError.message : ""}
          </span>
        </label>
      </div>
      <p
        id="decision-announcement"
        ref={announcementRef}
        role="status"
        aria-live="polite"
        aria-atomic="true"
        tabIndex={-1}
        className="mt-2"
      >
        {announcement}
      </p>
      <QueueList actions={actions} onDecide={requestDecision} decisionState={decisionState} submitting={submitting} onRefresh={() => window.location.reload()} />
      {confirmation && confirmationAction && (
        <dialog
          ref={(dialog) => {
            confirmationDialogRef.current = dialog;
            if (dialog && !dialog.open) {
              dialog.showModal();
              const focusable = dialog.querySelector<HTMLElement>("button:not([disabled])");
              (focusable ?? dialog).focus();
            }
          }}
          onCancel={(event) => {
            event.preventDefault();
            closeConfirmation();
          }}
          aria-modal="true"
          aria-labelledby="decision-confirmation-title"
          aria-describedby="decision-confirmation-description"
          tabIndex={-1}
          className="fixed inset-0 m-auto w-full max-w-md border bg-white p-6 text-black shadow-xl backdrop:bg-black/50"
        >
          <h2 id="decision-confirmation-title" className="text-xl font-semibold">
            {confirmation.outcome === "denied" ? "Confirm denial" : "Confirm approval"}
          </h2>
          <p id="decision-confirmation-description" className="mt-2">
            {confirmation.outcome === "denied"
              ? "This action matched the refund-over-500 rule. Are you sure you want to deny it?"
              : "This will approve the requested record deletion. Continue?"}
          </p>
          <div className="mt-6 flex justify-end gap-2">
            <button
              type="button"
              onClick={closeConfirmation}
              className="border px-3 py-1 focus-visible:outline-2 focus-visible:outline-offset-2"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => {
                const { actionId, outcome } = confirmation;
                closeConfirmation();
                void decide(actionId, outcome);
              }}
              className="border px-3 py-1 focus-visible:outline-2 focus-visible:outline-offset-2"
            >
              {confirmation.outcome === "denied" ? "Confirm denial" : "Confirm approval"}
            </button>
          </div>
        </dialog>
      )}
    </>
  );
}
