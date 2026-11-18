"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ActionDetailDialog, DecisionDialog } from "../dialogs/ActionDialogs";
import { useActionReview } from "../../hooks/use-action-review";
import { useConsoleData } from "../../hooks/use-console-data";
import type { ConsoleStatus } from "../../lib/console/contract";
import { consolePagePaths } from "../../lib/console/routes";
import { getConsoleCounts, type ConsolePage } from "../../lib/console/view-model";
import { QueuePage } from "./QueueContent";

export default function ApprovalPage() {
  const router = useRouter();
  const {
    refreshReveals,
    setActivityFilter,
    setGeneratorOpen,
    snapshot,
  } = useConsoleData();
  const [sort, setSort] = useState<"oldest" | "newest">("oldest");
  const review = useActionReview();

  function navigate(page: ConsolePage) {
    router.push(consolePagePaths[page]);
  }

  function showActivityStatus(status: ConsoleStatus) {
    setActivityFilter(status);
    router.push(consolePagePaths.activity);
  }

  function toggleSort() {
    setSort((current) => current === "oldest" ? "newest" : "oldest");
    refreshReveals();
  }

  return (
    <>
      <QueuePage
        actions={snapshot?.actions ?? []}
        counts={getConsoleCounts(snapshot)}
        loaded={snapshot !== null}
        sort={sort}
        onSortChange={toggleSort}
        onGenerate={() => setGeneratorOpen(true)}
        onReview={review.openAction}
        onStatusClick={showActivityStatus}
        onNavigate={navigate}
      />
      <ActionDetailDialog
        dialogRef={review.detailDialog}
        action={review.selected}
        locked={review.locked}
        decisionMessage={review.decisionMessage}
        copied={review.copied}
        onClose={review.closeDetail}
        onDecision={review.openDecision}
        onCopy={() => void review.copySelectedParameters()}
      />
      <DecisionDialog
        dialogRef={review.decisionDialog}
        action={review.selected}
        outcome={review.decision}
        decisionState={review.decisionState}
        decisionMessage={review.decisionMessage}
        reviewer={review.reviewer}
        reason={review.reason}
        reasonError={review.reasonError}
        reviewerError={review.reviewerError}
        locked={review.locked}
        reviewerRef={review.reviewerRef}
        reasonRef={review.reasonRef}
        onReviewerChange={review.onReviewerChange}
        onReasonChange={review.onReasonChange}
        onCancel={review.cancelDecision}
        onSubmit={review.submitDecision}
      />
    </>
  );
}
