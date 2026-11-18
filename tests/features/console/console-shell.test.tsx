import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { ConsoleActivityItem, ConsoleAuditEntry } from "../../../src/lib/console/contract";
import { ConsoleHeader } from "../../../src/components/header/ConsoleHeader";
import { GeneratorDialog } from "../../../src/components/dialogs/GeneratorDialog";
import { OverviewPage } from "../../../src/components/overview/OverviewContent";
import { QueuePage } from "../../../src/components/approval/QueueContent";
import { ActivityPage } from "../../../src/components/history/HistoryContent";
import { AuditPage } from "../../../src/components/log/AuditContent";
import Loading from "../../../src/app/loading";

describe("console shell", () => {
  it("renders the initial overview loading state and console controls", () => {
    const markup = renderToStaticMarkup(
      <>
        <ConsoleHeader
          page="overview"
          mobileNav={false}
          hasSnapshot={false}
          pendingCount={0}
          snapshotError=""
          reviewer=""
          profileColor="#2c2782"
          onNavigate={() => undefined}
          onMobileNavChange={() => undefined}
          onOpenGenerator={() => undefined}
          onOpenProfile={() => undefined}
        />
        <OverviewPage
          counts={{ pending: null, approved: null, denied: null, auto: null, blocked: null }}
          activity={[]}
          loaded={false}
          onNavigate={() => undefined}
          onStatusClick={() => undefined}
        />
        <GeneratorDialog open={false} onOpenChange={() => undefined} onSubmitted={async () => undefined} />
      </>,
    );

    expect(markup).toContain("Countersign");
    expect(markup).toContain("Governance workspace");
    expect(markup).toContain("Loading recent activity.");
    expect(markup).not.toContain("Loading console data. Please wait.");
    expect(markup).toContain("Generate incoming action");
    expect(markup).toContain("Reviewer not set");
  });

  it("exposes the route loading state to assistive technology", () => {
    const markup = renderToStaticMarkup(<Loading />);

    expect(markup).toContain("Overview");
    expect(markup).toContain('role="status"');
    expect(markup).toContain('aria-live="polite"');
    expect(markup).toContain("Loading overview. Please wait.");
  });

  it("renders the queue, activity, and audit content independently", () => {
    const emptyCounts = { pending: 0, approved: 0, denied: 0, auto: 0, blocked: 0 };
    const activity: ConsoleActivityItem[] = [];
    const audit: ConsoleAuditEntry[] = [];
    expect(renderToStaticMarkup(
      <QueuePage
        actions={[]}
        counts={emptyCounts}
        loaded
        sort="oldest"
        onSortChange={() => undefined}
        onGenerate={() => undefined}
        onReview={() => undefined}
        onStatusClick={() => undefined}
        onNavigate={() => undefined}
      />,
    )).toContain("<h1>Approval queue</h1>");
    expect(renderToStaticMarkup(
      <ActivityPage activity={activity} loaded filter="all" setFilter={() => undefined} />,
    )).toContain("<h1>Activity history</h1>");
    expect(renderToStaticMarkup(<AuditPage entries={audit} loaded />)).toContain("<h1>Audit log</h1>");
  });
});
