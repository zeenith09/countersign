"use client";

import type { FormEventHandler, RefObject } from "react";
import type { ConsoleAction } from "../contract";
import { Badge, Icon, JsonCode } from "./ConsoleElements";

export function ActionDetailDialog({
  dialogRef,
  action,
  locked,
  decisionMessage,
  copied,
  onClose,
  onDecision,
  onCopy,
}: {
  dialogRef: RefObject<HTMLDialogElement | null>;
  action: ConsoleAction | null;
  locked: boolean;
  decisionMessage: string;
  copied: boolean;
  onClose: () => void;
  onDecision: (outcome: "approved" | "denied") => void;
  onCopy: () => void;
}) {
  return (
    <dialog
      ref={dialogRef}
      className="dialog detail-dialog"
      aria-labelledby="detail-dialog-title"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      {action && (
        <div className="dialog-inner">
          <div className="dialog-header">
            <div className="dialog-title">
              <div className="tool-icon large"><Icon name="bolt" /></div>
              <div>
                <span className="tool-name">{action.tool}</span>
                <h2 id="detail-dialog-title">{action.title}</h2>
              </div>
            </div>
            <button className="icon-button" onClick={onClose} aria-label="Close action details">
              <Icon name="x" />
            </button>
          </div>
          <div className="dialog-body">
            <div className="detail-summary">
              <div>
                <span>Action summary</span>
                <p>{action.summary}</p>
              </div>
              <Badge status={action.status} />
            </div>
            <div className="detail-grid">
              <div className="detail-block wide">
                <span>Agent reasoning</span>
                <p>{action.reasoning}</p>
              </div>
              <div className="detail-block">
                <span>Risk assessment</span>
                <strong>{action.risk}</strong>
                <small>No score has been provided.</small>
              </div>
              <div className="detail-block">
                <span>Action identifier</span>
                <strong className="mono">{action.id}</strong>
                <small>Submitted {action.age}</small>
              </div>
            </div>
            <div className="matched-rule">
              <Icon name="shield" />
              <div>
                <span>Matched policy rule</span>
                <strong>{action.rule}</strong>
                <p>{action.ruleDescription}</p>
              </div>
              {locked && (
                <p role="status">
                  {decisionMessage || "This action needs a status refresh before another decision."}{" "}
                  <button type="button" onClick={() => window.location.reload()}>Refresh console</button>
                </p>
              )}
            </div>
            <div className="code-heading">
              <div>
                <span>Submitted parameters</span>
                <small>Read-only · Exact gateway payload</small>
              </div>
              <button onClick={onCopy}>
                <Icon name={copied ? "check" : "copy"} size={15} />
                {copied ? "Copied" : "Copy JSON"}
              </button>
            </div>
            <pre className="code-block" tabIndex={0}><JsonCode value={action.parameters} /></pre>
          </div>
          <div className="dialog-footer">
            <p>
              <Icon name="shield" size={15} />A reason is required. The mocked tool runs only after
              approval commits.
            </p>
            <div>
              <button className="button deny" disabled={locked} onClick={() => onDecision("denied")}>
                <Icon name="x" size={16} />
                Deny
              </button>
              <button className="button approve" disabled={locked} onClick={() => onDecision("approved")}>
                <Icon name="check" size={16} />
                Approve
              </button>
            </div>
          </div>
        </div>
      )}
    </dialog>
  );
}

export function DecisionDialog({
  dialogRef,
  action,
  outcome,
  decisionState,
  decisionMessage,
  reviewer,
  reason,
  reasonError,
  reviewerError,
  locked,
  reviewerRef,
  reasonRef,
  onReviewerChange,
  onReasonChange,
  onCancel,
  onSubmit,
}: {
  dialogRef: RefObject<HTMLDialogElement | null>;
  action: ConsoleAction | null;
  outcome: "approved" | "denied" | null;
  decisionState: "idle" | "loading" | "success" | "error";
  decisionMessage: string;
  reviewer: string;
  reason: string;
  reasonError: string;
  reviewerError: string;
  locked: boolean;
  reviewerRef: RefObject<HTMLInputElement | null>;
  reasonRef: RefObject<HTMLTextAreaElement | null>;
  onReviewerChange: (reviewer: string) => void;
  onReasonChange: (reason: string) => void;
  onCancel: () => void;
  onSubmit: FormEventHandler<HTMLFormElement>;
}) {
  return (
    <dialog
      ref={dialogRef}
      className="dialog decision-dialog"
      aria-labelledby="decision-dialog-title"
      onClick={(event) => {
        if (event.target === event.currentTarget && decisionState !== "loading") onCancel();
      }}
      onCancel={(event) => {
        event.preventDefault();
        if (decisionState !== "loading") onCancel();
      }}
    >
      {action && outcome && (
        <form onSubmit={onSubmit}>
          <div className={`decision-hero ${outcome}`}>
            <div className="decision-symbol">
              <Icon name={outcome === "approved" ? "check" : "x"} size={22} />
            </div>
            <div>
              <p>Confirm {outcome === "approved" ? "approval" : "denial"}</p>
              <h2 id="decision-dialog-title">{action.title}</h2>
              <span>{action.tool} · {action.id}</span>
            </div>
            <button
              type="button"
              className="icon-button"
              onClick={onCancel}
              aria-label="Cancel decision"
              disabled={decisionState === "loading"}
            >
              <Icon name="x" />
            </button>
          </div>
          <div className="decision-body">
            <p className="decision-copy">
              You are recording a{" "}
              <strong>{outcome === "approved" ? "human approval" : "human denial"}</strong>. This
              decision and its audit entry commit together.
            </p>
            <label>
              Reviewer name
              <input
                ref={reviewerRef}
                value={reviewer}
                onChange={(event) => onReviewerChange(event.target.value)}
                maxLength={100}
                required
                disabled={decisionState === "loading"}
                autoComplete="name"
                aria-invalid={!!reviewerError}
                aria-describedby={reviewerError ? "reviewer-error" : "reviewer-help"}
              />
            </label>
            {reviewerError ? (
              <p id="reviewer-error" className="field-error" role="alert">{reviewerError}</p>
            ) : (
              <p id="reviewer-help" className="field-help">Your name is recorded with this decision.</p>
            )}
            <label>
              Reason for this {outcome === "approved" ? "approval" : "denial"}
              <span className="required">Required</span>
              <textarea
                ref={reasonRef}
                value={reason}
                onChange={(event) => onReasonChange(event.target.value)}
                aria-invalid={!!reasonError}
                aria-describedby={reasonError ? "reason-error" : "reason-help"}
                placeholder={
                  outcome === "approved"
                    ? "Why is this action appropriate to proceed?"
                    : "Why should this action not proceed?"
                }
                disabled={decisionState === "loading"}
                maxLength={2000}
                required
                autoFocus
              />
            </label>
            {reasonError ? (
              <p id="reason-error" className="field-error" role="alert">{reasonError}</p>
            ) : (
              <p id="reason-help" className="field-help">
                This reason applies only to this action and will not carry over.
              </p>
            )}
            <div className={`live-status ${decisionState}`} aria-live="polite">
              {decisionState === "loading" && (
                <>
                  <span className="spinner" />
                  Submitting decision to the server…
                </>
              )}
              {decisionState === "success" && (
                <>
                  <Icon name="check" size={16} />
                  {decisionMessage}
                </>
              )}
              {decisionState === "error" && decisionMessage}
            </div>
          </div>
          <div className="decision-footer">
            <button
              type="button"
              className="button secondary"
              onClick={onCancel}
              disabled={decisionState === "loading"}
            >
              Cancel
            </button>
            <button
              className={`button ${outcome === "approved" ? "approve" : "deny"}`}
              disabled={decisionState === "loading" || locked}
            >
              {decisionState === "loading"
                ? "Confirming…"
                : `Confirm ${outcome === "approved" ? "approval" : "denial"}`}
            </button>
          </div>
        </form>
      )}
    </dialog>
  );
}
