import { createRef } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { ConsoleAction } from "../../../src/lib/console/contract";
import { ConsoleHeader } from "../../../src/components/header/ConsoleHeader";
import { ActionDetailDialog, DecisionDialog } from "../../../src/components/dialogs/ActionDialogs";
import { GeneratorDialog } from "../../../src/components/dialogs/GeneratorDialog";
import { ReviewerProfileDialog } from "../../../src/components/dialogs/ReviewerProfileDialog";
import { ConsoleActivity } from "../../../src/components/history/ConsoleActivity";

const action: ConsoleAction = {
  id: "action-1",
  tool: "issue_refund",
  title: "Issue refund",
  summary: "Refund $750 for ORDER-1005.",
  reasoning: "The customer requested a refund.",
  age: "Just now",
  created: 1,
  status: "pending",
  risk: "Risk not assessed",
  rule: "refund-over-500",
  ruleDescription: "Refunds over $500 require review.",
  parameters: { orderId: "ORDER-1005", amount: 750, currency: "USD" },
};

describe("console dialogs and header", () => {
  it("renders header loading, unavailable, and mobile-navigation states", () => {
    const renderHeader = (props: Partial<React.ComponentProps<typeof ConsoleHeader>> = {}) =>
      renderToStaticMarkup(
        <ConsoleHeader
          page="queue"
          mobileNav={false}
          hasSnapshot={false}
          pendingCount={0}
          snapshotError=""
          reviewer=""
          profileColor="#2c2782"
          onNavigate={vi.fn()}
          onMobileNavChange={vi.fn()}
          onOpenGenerator={vi.fn()}
          onOpenProfile={vi.fn()}
          {...props}
        />,
      );

    expect(renderHeader()).toContain("Loading");
    expect(renderHeader({ hasSnapshot: true, pendingCount: 4, reviewer: "Alex" })).toContain("Data loaded");
    const unavailable = renderHeader({ snapshotError: "offline", mobileNav: true });
    expect(unavailable).toContain("Data unavailable");
    expect(unavailable).toContain("mobile-open");
    expect(unavailable).toContain('aria-label="Close navigation"');
  });

  it("renders action details only when selected and exposes locked status", () => {
    const common = {
      dialogRef: createRef<HTMLDialogElement>(),
      locked: false,
      decisionMessage: "",
      copied: false,
      onClose: vi.fn(),
      onDecision: vi.fn(),
      onCopy: vi.fn(),
    };
    const empty = renderToStaticMarkup(<ActionDetailDialog {...common} action={null} />);
    const locked = renderToStaticMarkup(
      <ActionDetailDialog
        {...common}
        action={action}
        locked
        decisionMessage="This action is already approved."
      />,
    );

    expect(empty).not.toContain("Action summary");
    expect(locked).toContain("Issue refund");
    expect(locked).toContain("This action is already approved.");
    expect(locked).toContain("Refresh console");
    expect(locked).toContain("Submitted parameters");
  });

  it("renders approval and denial decision states with field errors and status", () => {
    const common = {
      dialogRef: createRef<HTMLDialogElement>(),
      action,
      decisionMessage: "",
      reviewer: "Alex",
      reason: "",
      reasonError: "",
      reviewerError: "",
      locked: false,
      reviewerRef: createRef<HTMLInputElement>(),
      reasonRef: createRef<HTMLTextAreaElement>(),
      onReviewerChange: vi.fn(),
      onReasonChange: vi.fn(),
      onCancel: vi.fn(),
      onSubmit: vi.fn(),
    };
    const approval = renderToStaticMarkup(
      <DecisionDialog {...common} outcome="approved" decisionState="success" decisionMessage="Committed." />,
    );
    const denial = renderToStaticMarkup(
      <DecisionDialog
        {...common}
        outcome="denied"
        decisionState="error"
        reasonError="A reason is required."
        reviewerError="Enter a reviewer."
        locked
      />,
    );
    const loading = renderToStaticMarkup(
      <DecisionDialog {...common} outcome="approved" decisionState="loading" />,
    );

    expect(approval).toContain("Confirm approval");
    expect(approval).toContain("Committed.");
    expect(denial).toContain("Confirm denial");
    expect(denial).toContain("A reason is required.");
    expect(denial).toContain("Enter a reviewer.");
    expect(denial).toContain("disabled");
    expect(loading).toContain("Submitting decision to the server");
    expect(loading).toContain("Confirming…");
  });

  it("renders the generator's initial demo scenario and submission controls", () => {
    const markup = renderToStaticMarkup(
      <GeneratorDialog open={false} onOpenChange={vi.fn()} onSubmitted={vi.fn(async () => undefined)} />,
    );

    expect(markup).toContain("Generate incoming action");
    expect(markup).toContain('role="tablist"');
    expect(markup).toContain("High-value refund");
    expect(markup).toContain("Internal email");
    expect(markup).toContain("Delete record");
    expect(markup).toContain("Submit to gateway");
    expect(markup).not.toContain("Proposal JSON");
  });

  it("renders reviewer profile controls and validation feedback", () => {
    const markup = renderToStaticMarkup(
      <ReviewerProfileDialog
        open={false}
        reviewerDraft="Alex"
        profileColorDraft="#123456"
        profileError="Update your saved profile."
        onOpenChange={vi.fn()}
        onSaved={vi.fn()}
        onReviewerDraftChange={vi.fn()}
        onProfileColorDraftChange={vi.fn()}
      />,
    );

    expect(markup).toContain("Reviewer profile");
    expect(markup).toContain('for="reviewer-name"');
    expect(markup).toContain('for="reviewer-color"');
    expect(markup).toContain("Update your saved profile.");
    expect(markup).toContain("Coming soon");
  });

  it("renders the legacy activity loading state and caller content", () => {
    const markup = renderToStaticMarkup(
      <ConsoleActivity pendingCount={2}><p>Caller content</p></ConsoleActivity>,
    );

    expect(markup).toContain("Loading action counts and activity.");
    expect(markup).toContain("Caller content");
    expect(markup).toContain("Recent activity");
  });
});
