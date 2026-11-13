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
  const inFlight = useRef(false);

  async function decide(id: string, outcome: DecisionOutcome) {
    if (inFlight.current) return;
    if (!reviewer.trim() || !reason.trim()) {
      setDecisionState({ actionId: id, message: "Enter a reviewer and reason.", locked: false });
      return;
    }

    inFlight.current = true;
    setSubmitting(true);
    setDecisionState(null);
    try {
      const response = await fetch(`/api/actions/${encodeURIComponent(id)}/decision`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reviewer, outcome, reason }),
      });
      if (response.ok) {
        let status = await readStatus(id);
        if (!status) status = await readStatus(id);
        setDecisionState({
          actionId: id,
          message: status
            ? `Decision committed. Current status: ${status}.`
            : "Server confirmed the decision, but the stored status couldn't be refreshed. Refresh the queue to check.",
          ...(!status && { refreshAvailable: true }),
          locked: true,
        });
        router.refresh();
      } else if (response.status === 409) {
        const status = await readStatus(id);
        setDecisionState({
          actionId: id,
          message: `Already decided by someone else${status ? "" : ". Current status: unknown."}`,
          refreshAvailable: true,
          locked: true,
        });
      } else if (response.status === 503 || response.status >= 500) {
        const status = await readStatus(id);
        setDecisionState({
          actionId: id,
          message: `Decision could not be confirmed. Current status: ${status ?? "unknown"}. Refresh the queue before trying again.`,
          refreshAvailable: true,
          locked: true,
        });
      } else {
        setDecisionState({ actionId: id, message: `Decision request failed (${response.status}). Refresh the queue and try again.`, refreshAvailable: true, locked: false });
      }
    } catch {
      const status = await readStatus(id);
      setDecisionState({
        actionId: id,
        message: `Decision could not be confirmed. Current status: ${status ?? "unknown"}. Refresh the queue before trying again.`,
        refreshAvailable: true,
        locked: true,
      });
    } finally {
      inFlight.current = false;
      setSubmitting(false);
    }
  }

  return (
    <>
      <div className="mt-4 flex flex-wrap gap-4">
        <label className="flex flex-col gap-1">
          Reviewer name
          <input className="border px-2" value={reviewer} maxLength={100} onChange={(event) => setReviewer(event.target.value)} />
        </label>
        <label className="flex flex-col gap-1">
          Reason
          <input className="border px-2" value={reason} maxLength={2000} onChange={(event) => setReason(event.target.value)} />
        </label>
      </div>
      <QueueList actions={actions} onDecide={decide} decisionState={decisionState} submitting={submitting} onRefresh={() => window.location.reload()} />
    </>
  );
}
