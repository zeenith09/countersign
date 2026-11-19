import { createRequire } from "node:module";
import { expect, test, type Page } from "@playwright/test";
import type { ConsoleSnapshot } from "../../src/lib/console/contract";

const require = createRequire(`${process.cwd()}/package.json`);
const axeScriptPath = require.resolve("axe-core/axe.min.js");

const snapshot: ConsoleSnapshot = {
  actions: [{
    id: "axe-action",
    tool: "issue_refund",
    title: "issue refund",
    summary: "The agent wants to refund $750 for order ORDER-1005.",
    reasoning: "The customer requested a refund.",
    age: "Just now",
    created: 1,
    status: "pending",
    risk: "Risk not assessed",
    rule: "refund-over-500",
    ruleDescription: "Refunds over $500 require reviewer approval.",
    parameters: { orderId: "ORDER-1005", amount: 750 },
  }],
  counts: { pending: 1, approved: 0, denied: 0, auto_allowed: 0, blocked: 0 },
  activity: [],
  audit: [],
};

const mobileSnapshot: ConsoleSnapshot = {
  ...snapshot,
  counts: { pending: 1 },
};

type AxeWindow = Window & {
  axe?: {
    run: (
      context: Document,
      options: { runOnly: { type: "tag"; values: string[] } },
    ) => Promise<{
      violations: {
        id: string;
        help: string;
        nodes: { target: string[]; html: string; failureSummary?: string }[];
      }[];
    }>;
  };
};

async function expectNoAxeViolations(page: Page, state: string): Promise<void> {
  const hasAxe = await page.evaluate(() => "axe" in window);
  if (!hasAxe) await page.addScriptTag({ path: axeScriptPath });
  const violations = await page.evaluate(async () => {
    const axe = (window as AxeWindow).axe;
    if (!axe) throw new Error("axe-core did not load in the browser.");
    const result = await axe.run(document, {
      runOnly: {
        type: "tag",
        values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"],
      },
    });
    return result.violations.map(({ id, help, nodes }) =>
      `${id}: ${help}\n${nodes.map(({ target, html, failureSummary }) =>
        `  ${target.join(", ")}\n${html}\n${failureSummary ?? ""}`,
      ).join("\n")}`,
    );
  });
  expect(violations, `Accessibility violations in ${state}`).toEqual([]);
}

test("console pages and dialogs pass axe checks without simulating decisions", async ({ page }) => {
  await page.route("**/api/console", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(snapshot),
    }),
  );
  await page.goto("/approval");
  await expect(page.getByRole("heading", { name: "Approval queue" })).toBeVisible();
  await expectNoAxeViolations(page, "approval queue");

  await page.locator(".action-card").getByRole("button", { name: "Review action" }).click();
  await expectNoAxeViolations(page, "action details dialog");
  await page.locator("dialog.detail-dialog").getByRole("button", { name: "Approve" }).click();
  await expectNoAxeViolations(page, "decision dialog");
  await page.locator("dialog.decision-dialog").getByRole("button", { name: "Cancel", exact: true }).click();
  await page.locator("dialog.detail-dialog").getByRole("button", { name: "Close action details" }).click();

  await page.getByRole("button", { name: "Overview" }).click();
  await expectNoAxeViolations(page, "overview");
  await page.getByRole("button", { name: "Activity history" }).click();
  await expectNoAxeViolations(page, "activity history");
  await page.getByRole("button", { name: "Audit log" }).click();
  await expectNoAxeViolations(page, "audit log");

  await page.getByRole("button", { name: "New action" }).click();
  const generator = page.locator("dialog.generator-dialog");
  await expect(generator).toBeVisible();
  await expectNoAxeViolations(page, "automatic generator dialog");
  await generator.getByRole("tab", { name: "Manual JSON" }).click();
  await expectNoAxeViolations(page, "manual JSON generator");
  await generator.getByRole("button", { name: "Close generator" }).click();

  await page.locator("button.profile.profile-button").click();
  await expectNoAxeViolations(page, "reviewer profile dialog");
});

test("mobile navigation and dialog controls remain reachable", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 667 });
  await page.route("**/api/console", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(mobileSnapshot),
    }),
  );
  await page.goto("/approval");
  await expect(page.getByRole("heading", { name: "Approval queue" })).toBeVisible();
  await expect(page.getByRole("button", { name: "00 Human-approved" })).toBeVisible();
  await expect(page.getByRole("button", { name: "00 Human-denied" })).toBeVisible();
  await expect(page.getByRole("button", { name: "00 Auto-allowed" })).toBeVisible();
  await expect(page.getByRole("button", { name: "00 Blocked" })).toBeVisible();

  const navigation = page.getByRole("navigation", { name: "Main navigation" });
  await page.getByRole("button", { name: "Open navigation" }).click();
  const rootFontSize = await page.locator("html").evaluate((element) => getComputedStyle(element).fontSize);
  await expect(navigation.locator(".mobile-nav-head > span")).toHaveCSS("font-size", rootFontSize);
  await expect(
    navigation.getByRole("button", { name: "Overview" }).locator("span:not(.nav-count)"),
  ).toHaveCSS("font-size", rootFontSize);
  await navigation.locator(".mobile-close").click();

  await page.locator(".action-card").getByRole("button", { name: "Review action" }).click();
  const detail = page.locator("dialog.detail-dialog");
  await detail.locator(".dialog-body").evaluate((element) => {
    element.scrollTop = element.scrollHeight;
  });
  await expect(detail.getByRole("button", { name: "Close action details" })).toBeInViewport({ ratio: 1 });
  await expect(detail.getByRole("button", { name: "Deny" })).toBeInViewport({ ratio: 1 });
  await expect(detail.getByRole("button", { name: "Approve" })).toBeInViewport({ ratio: 1 });

  await detail.getByRole("button", { name: "Close action details" }).click();
  await page.getByRole("button", { name: "New action" }).click();
  const generator = page.locator("dialog.generator-dialog");
  await generator.locator(".generator-body").evaluate((element) => {
    element.scrollTop = element.scrollHeight;
  });
  await expect(generator.getByRole("button", { name: "Close generator" })).toBeInViewport({ ratio: 1 });
  await expect(generator.getByRole("button", { name: "Submit to gateway" })).toBeInViewport({ ratio: 1 });
  await expect(generator.locator(".tabs")).not.toHaveCSS("column-gap", "0px");
});
