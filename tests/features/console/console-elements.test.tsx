import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { Badge, Icon, JsonCode, Metric, NavItem, profileTextColor, statusLabel } from "../../../src/features/console/components/ConsoleElements";

describe("console elements", () => {
  it("chooses readable profile text colors for light and dark backgrounds", () => {
    expect(profileTextColor("#000000")).toBe("#ffffff");
    expect(profileTextColor("#ffffff")).toBe("#201e4f");
  });

  it("renders every supported icon as decorative SVG", () => {
    const names = [
      "overview", "queue", "activity", "audit", "plus", "arrow", "shield", "x", "copy",
      "check", "bolt", "menu", "chevron", "code", "spark",
    ];

    for (const name of names) {
      const markup = renderToStaticMarkup(<Icon name={name} />);
      expect(markup).toContain('aria-hidden="true"');
      expect(markup).toContain("<svg");
    }
  });

  it("labels each action status and styles its badge", () => {
    for (const [status, label] of Object.entries(statusLabel)) {
      const markup = renderToStaticMarkup(<Badge status={status as keyof typeof statusLabel} />);
      expect(markup).toContain(`badge-${status}`);
      expect(markup).toContain(label);
    }
  });

  it("highlights JSON keys, strings, numbers, and booleans", () => {
    const markup = renderToStaticMarkup(
      <JsonCode value={{ name: "review", amount: -12.5, allowed: true, missing: null }} />,
    );

    expect(markup).toContain('class="json-key"');
    expect(markup).toContain('class="json-string"');
    expect(markup).toContain('class="json-number"');
    expect(markup).toContain('class="json-bool"');
  });

  it("renders metrics as plain data or a button depending on interactivity", () => {
    const staticMetric = renderToStaticMarkup(<Metric label="Pending" value={null} tone="amber" />);
    const interactiveMetric = renderToStaticMarkup(
      <Metric label="Blocked" value={3} tone="slate" onClick={vi.fn()} />,
    );

    expect(staticMetric).toContain("—");
    expect(staticMetric).not.toContain("<button");
    expect(interactiveMetric).toContain("<button");
    expect(interactiveMetric).toContain(">03</strong>");
  });

  it("marks the current navigation item and includes an optional count", () => {
    const active = renderToStaticMarkup(
      <NavItem page="queue" current="queue" label="Queue" icon="queue" count={2} onClick={vi.fn()} />,
    );
    const inactive = renderToStaticMarkup(
      <NavItem page="audit" current="queue" label="Audit" icon="audit" onClick={vi.fn()} />,
    );

    expect(active).toContain('aria-current="page"');
    expect(active).toContain("2");
    expect(inactive).not.toContain("aria-current");
    expect(inactive).not.toContain("nav-count");
  });
});
