"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { z } from "zod";
import { fetchActionStatus, postActionDecision } from "./api-client";
import {
  type ConsoleAction as Action,
  type ConsoleStatus as Status,
} from "./contract";
import { getConsoleCounts, type ConsolePage as Page } from "./view-model";
import { useConsoleSnapshot } from "./hooks/use-console-snapshot";
import { ActionDetailDialog, DecisionDialog } from "./components/ActionDialogs";
import { GeneratorDialog } from "./components/GeneratorDialog";
import { ReviewerProfileDialog } from "./components/ReviewerProfileDialog";
import {
  ActivityPage,
  AuditPage,
  OverviewPage,
  QueuePage,
} from "./components/ConsolePages";
import { ConsoleHeader } from "./components/ConsoleHeader";

export default function App() {
  const [page, setPage] = useState<Page>("queue");
  const [mobileNav, setMobileNav] = useState(false);
  const { snapshot, snapshotError, loadSnapshot } = useConsoleSnapshot();
  const [selected, setSelected] = useState<Action | null>(null);
  const [decision, setDecision] = useState<"approved" | "denied" | null>(null);
  const [reviewer, setReviewer] = useState("");
  const [reviewerDraft, setReviewerDraft] = useState("");
  const [profileColor, setProfileColor] = useState("#2c2782");
  const [profileColorDraft, setProfileColorDraft] = useState("#2c2782");
  const [profileError, setProfileError] = useState("");
  const [profileOpen, setProfileOpen] = useState(false);
  const [generatorOpen, setGeneratorOpen] = useState(false);
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [reasonError, setReasonError] = useState("");
  const [reviewerError, setReviewerError] = useState("");
  const [decisionMessage, setDecisionMessage] = useState("");
  const [lockedIds, setLockedIds] = useState<string[]>([]);
  const [announcement, setAnnouncement] = useState("");
  const [decisionState, setDecisionState] = useState<"idle" | "loading" | "success" | "error">(
    "idle",
  );
  const [copied, setCopied] = useState(false);
  const [activityFilter, setActivityFilter] = useState<"all" | Status>("all");
  const [queueSort, setQueueSort] = useState<"oldest" | "newest">("oldest");
  const detailDialog = useRef<HTMLDialogElement>(null);
  const decisionDialog = useRef<HTMLDialogElement>(null);
  const reasonRef = useRef<HTMLTextAreaElement>(null);
  const reviewerRef = useRef<HTMLInputElement>(null);
  const inFlightDecision = useRef(false);

  const actions = snapshot?.actions ?? [];
  const activity = snapshot?.activity ?? [];
  const counts = getConsoleCounts(snapshot);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      try {
        const saved = window.localStorage.getItem("countersign.reviewer-profile");
        if (!saved) return;
        const profile = z.object({
          reviewer: z.string().max(100),
          color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
        }).safeParse(JSON.parse(saved));
        if (!profile.success) {
          setProfileError("Saved profile settings are invalid. Update them and save again.");
          return;
        }
        setReviewer(profile.data.reviewer);
        setProfileColor(profile.data.color);
      } catch {
        setProfileError("Could not load saved profile settings from this browser.");
      }
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    if (selected && !detailDialog.current?.open && !decision) detailDialog.current?.showModal();
  }, [selected, decision]);

  useEffect(() => {
    if (selected && decision && !decisionDialog.current?.open) decisionDialog.current?.showModal();
  }, [selected, decision]);

  function openAction(action: Action) {
    setSelected(action);
    setDecisionState("idle");
    setDecisionMessage("");
    setCopied(false);
  }

  function closeDetail() {
    detailDialog.current?.close();
    setSelected(null);
  }

  function openDecision(outcome: "approved" | "denied") {
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
        const message = status ? `Decision committed. Current status: ${status}.` : "Decision committed, but its stored status could not be refreshed.";
        setDecisionState("success");
        setDecisionMessage(message);
        setAnnouncement(message);
        setLockedIds((ids) => [...ids, id]);
        await loadSnapshot();
        decisionDialog.current?.close();
        setSelected(null);
        setDecision(null);
        setReasons((current) => { const next = { ...current }; delete next[id]; return next; });
        requestAnimationFrame(() => document.getElementById("console-announcement")?.focus());
      } else if (response.status === 409 || response.status >= 500) {
        const status = await fetchActionStatus(id);
        setLockedIds((ids) => [...ids, id]);
        setDecisionState("error");
        setDecisionMessage(`${response.status === 409 ? "This action is no longer pending." : "The server could not confirm the decision."} Current status: ${status ?? "unknown"}. Refresh before continuing.`);
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

  function navigate(next: Page) {
    setPage(next);
    setMobileNav(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function showActivityStatus(status: Status) {
    setActivityFilter(status);
    navigate("activity");
  }

  function openProfileSettings() {
    setReviewerDraft(reviewer);
    setProfileColorDraft(profileColor);
    setProfileOpen(true);
  }

  function saveProfile(name: string, color: string) {
    setReviewer(name);
    setProfileColor(color);
    setProfileError("");
    setAnnouncement("Reviewer profile saved in this browser.");
  }

  async function copySelectedParameters() {
    if (!selected) return;
    try {
      await navigator.clipboard.writeText(JSON.stringify(selected.parameters, null, 2));
      setCopied(true);
    } catch {
      setAnnouncement("Could not copy JSON. Select the parameters and copy them manually.");
    }
  }

  return (
    <div className="redesign app-shell">
      <ConsoleHeader
        page={page}
        mobileNav={mobileNav}
        hasSnapshot={snapshot !== null}
        pendingCount={actions.length}
        snapshotError={snapshotError}
        reviewer={reviewer}
        profileColor={profileColor}
        onNavigate={navigate}
        onMobileNavChange={setMobileNav}
        onOpenGenerator={() => setGeneratorOpen(true)}
        onOpenProfile={openProfileSettings}
      />

      <main>
        <div className="page">
          <p id="console-announcement" role="status" aria-live="polite" tabIndex={-1}>{announcement}</p>
          {snapshotError && <p role="alert">{snapshotError} <button type="button" onClick={() => void loadSnapshot()}>Retry loading</button></p>}
          {!snapshot && !snapshotError && <p role="status">Loading console data. Please wait.</p>}
          {page === "queue" && (
            <QueuePage
              actions={actions}
              counts={counts}
              loaded={snapshot !== null}
              sort={queueSort}
              onSortChange={() => setQueueSort((sort) => sort === "oldest" ? "newest" : "oldest")}
              onGenerate={() => setGeneratorOpen(true)}
              onReview={openAction}
              onStatusClick={showActivityStatus}
              onNavigate={navigate}
            />
          )}
          {page === "overview" && (
            <OverviewPage counts={counts} activity={activity} onNavigate={navigate} onStatusClick={showActivityStatus} />
          )}
          {page === "activity" && (
            <ActivityPage
              activity={activity}
              filter={activityFilter}
              setFilter={setActivityFilter}
            />
          )}
          {page === "audit" && <AuditPage entries={snapshot?.audit ?? []} />}
        </div>
      </main>


      <ActionDetailDialog
        dialogRef={detailDialog}
        action={selected}
        locked={selected ? lockedIds.includes(selected.id) : false}
        decisionMessage={decisionMessage}
        copied={copied}
        onClose={closeDetail}
        onDecision={openDecision}
        onCopy={() => void copySelectedParameters()}
      />


      <DecisionDialog
        dialogRef={decisionDialog}
        action={selected}
        outcome={decision}
        decisionState={decisionState}
        decisionMessage={decisionMessage}
        reviewer={reviewer}
        reason={selected ? reasons[selected.id] ?? "" : ""}
        reasonError={reasonError}
        reviewerError={reviewerError}
        locked={selected ? lockedIds.includes(selected.id) : false}
        reviewerRef={reviewerRef}
        reasonRef={reasonRef}
        onReviewerChange={(name) => {
          setReviewer(name);
          setReviewerError("");
        }}
        onReasonChange={(reason) => {
          if (selected) setReasons((current) => ({ ...current, [selected.id]: reason }));
          setReasonError("");
        }}
        onCancel={cancelDecision}
        onSubmit={submitDecision}
      />


      <GeneratorDialog
        open={generatorOpen}
        onOpenChange={setGeneratorOpen}
        onSubmitted={loadSnapshot}
      />


      <ReviewerProfileDialog
        open={profileOpen}
        reviewerDraft={reviewerDraft}
        profileColorDraft={profileColorDraft}
        profileError={profileError}
        onOpenChange={setProfileOpen}
        onSaved={saveProfile}
        onReviewerDraftChange={setReviewerDraft}
        onProfileColorDraftChange={setProfileColorDraft}
      />
    </div>
  );
}
