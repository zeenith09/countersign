"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { fetchActionStatus, postActionDecision } from "../lib/console/api-client";
import type { ConsoleAction } from "../lib/console/contract";
import { useConsoleData } from "./use-console-data";

type DecisionOutcome = "approved" | "denied";

export function useActionReview() {
  const {
    announce,
    loadSnapshot,
    reviewer,
    setReviewer,
  } = useConsoleData();
  const [selected, setSelected] = useState<ConsoleAction | null>(null);
  const [decision, setDecision] = useState<DecisionOutcome | null>(null);
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [reasonError, setReasonError] = useState("");
  const [reviewerError, setReviewerError] = useState("");
  const [decisionMessage, setDecisionMessage] = useState("");
  const [lockedIds, setLockedIds] = useState<string[]>([]);
  const [decisionState, setDecisionState] = useState<"idle" | "loading" | "success" | "error">(
    "idle",
  );
  const [copied, setCopied] = useState(false);
  const detailDialog = useRef<HTMLDialogElement>(null);
  const decisionDialog = useRef<HTMLDialogElement>(null);
  const reasonRef = useRef<HTMLTextAreaElement>(null);
  const reviewerRef = useRef<HTMLInputElement>(null);
  const inFlightDecision = useRef(false);

  useEffect(() => {
    if (selected && !detailDialog.current?.open && !decision) detailDialog.current?.showModal();
  }, [selected, decision]);

  useEffect(() => {
    if (selected && decision && !decisionDialog.current?.open) decisionDialog.current?.showModal();
  }, [selected, decision]);

  function openAction(action: ConsoleAction) {
    setSelected(action);
    setDecisionState("idle");
    setDecisionMessage("");
    setCopied(false);
  }

  function closeDetail() {
    detailDialog.current?.close();
    setSelected(null);
  }

  function openDecision(outcome: DecisionOutcome) {
    detailDialog.current?.close();
    setDecision(outcome);
    setReasonError("");
    setReviewerError("");
    setDecisionState("idle");
    setDecisionMessage("");
  }

  function cancelDecision() {
    decisionDialog.current?.close();
    setDecision(null);
  }

  async function submitDecision(event: FormEvent) {
    event.preventDefault();
    if (!selected || !decision || inFlightDecision.current || lockedIds.includes(selected.id)) return;
    const reason = reasons[selected.id]?.trim();
    if (!reason) {
      setReasonError("Enter a reason specific to this action.");
      reasonRef.current?.focus();
      return;
    }
    if (!reviewer.trim()) {
      setReviewerError("Enter the reviewer name before confirming.");
      reviewerRef.current?.focus();
      return;
    }
    setReasonError("");
    setReviewerError("");
    setDecisionMessage("");
    setDecisionState("loading");
    inFlightDecision.current = true;
    const id = selected.id;
    try {
      const response = await postActionDecision(id, { reviewer, outcome: decision, reason });
      if (response.ok) {
        const status = await fetchActionStatus(id);
        const message = status
          ? `Decision committed. Current status: ${status}.`
          : "Decision committed, but its stored status could not be refreshed.";
        setDecisionState("success");
        setDecisionMessage(message);
        announce(message);
        setLockedIds((ids) => [...ids, id]);
        await loadSnapshot();
        decisionDialog.current?.close();
        setSelected(null);
        setDecision(null);
        setReasons((current) => {
          const next = { ...current };
          delete next[id];
          return next;
        });
        requestAnimationFrame(() => document.getElementById("console-announcement")?.focus());
      } else if (response.status === 409 || response.status >= 500) {
        const status = await fetchActionStatus(id);
        setLockedIds((ids) => [...ids, id]);
        setDecisionState("error");
        setDecisionMessage(
          `${response.status === 409 ? "This action is no longer pending." : "The server could not confirm the decision."} Current status: ${status ?? "unknown"}. Refresh before continuing.`,
        );
      } else {
        setDecisionState("error");
        setDecisionMessage(`Decision rejected (HTTP ${response.status}). Check the reviewer and reason.`);
      }
    } catch {
      const status = await fetchActionStatus(id);
      setLockedIds((ids) => [...ids, id]);
      setDecisionState("error");
      setDecisionMessage(`Network error or timeout. Current status: ${status ?? "unknown"}. Refresh before continuing.`);
    } finally {
      inFlightDecision.current = false;
    }
  }

  async function copySelectedParameters() {
    if (!selected) return;
    try {
      await navigator.clipboard.writeText(JSON.stringify(selected.parameters, null, 2));
      setCopied(true);
    } catch {
      announce("Could not copy JSON. Select the parameters and copy them manually.");
    }
  }

  return {
    selected,
    decision,
    decisionState,
    decisionMessage,
    copied,
    locked: selected ? lockedIds.includes(selected.id) : false,
    reason: selected ? reasons[selected.id] ?? "" : "",
    reasonError,
    reviewerError,
    reviewer,
    reviewerRef,
    reasonRef,
    detailDialog,
    decisionDialog,
    openAction,
    closeDetail,
    openDecision,
    cancelDecision,
    submitDecision,
    copySelectedParameters,
    onReviewerChange: (name: string) => {
      setReviewer(name);
      setReviewerError("");
    },
    onReasonChange: (reason: string) => {
      if (selected) setReasons((current) => ({ ...current, [selected.id]: reason }));
      setReasonError("");
    },
  };
}
