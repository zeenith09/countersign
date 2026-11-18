import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import App from "../../../src/features/console/Console";
import ApprovalPage from "../../../src/app/approval/page";
import HistoryPage from "../../../src/app/history/page";
import AuditPage from "../../../src/app/log/page";
import Loading from "../../../src/app/loading";

describe("console shell", () => {
  it("renders the initial overview loading state and console controls", () => {
    const markup = renderToStaticMarkup(<App />);

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

  it("renders each console page at its direct route", () => {
    expect(renderToStaticMarkup(<ApprovalPage />)).toContain("<h1>Approval queue</h1>");
    expect(renderToStaticMarkup(<HistoryPage />)).toContain("<h1>Activity history</h1>");
    expect(renderToStaticMarkup(<AuditPage />)).toContain("<h1>Audit log</h1>");
  });
});
