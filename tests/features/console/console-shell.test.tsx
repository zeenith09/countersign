import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import App from "../../../src/features/console/Console";
import Loading from "../../../src/app/loading";

describe("console shell", () => {
  it("renders the initial loading queue and console controls", () => {
    const markup = renderToStaticMarkup(<App />);

    expect(markup).toContain("Countersign");
    expect(markup).toContain("Loading console data. Please wait.");
    expect(markup).toContain("Loading pending actions.");
    expect(markup).toContain("Generate incoming action");
    expect(markup).toContain("Reviewer not set");
  });

  it("exposes the route loading state to assistive technology", () => {
    const markup = renderToStaticMarkup(<Loading />);

    expect(markup).toContain("Approval queue");
    expect(markup).toContain('role="status"');
    expect(markup).toContain('aria-live="polite"');
    expect(markup).toContain("Loading pending actions. Please wait.");
  });
});
