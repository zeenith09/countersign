import { createRequire } from "node:module";
import { expect, test, type Page } from "@playwright/test";
import type { ConsoleSnapshot } from "../../src/features/console/contract";

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
    parameters: { orderId: "ORDER-1005", amount: 750, currency: "USD" },
  }],
  counts: { pending: 1, approved: 0, denied: 0, auto_allowed: 0, blocked: 0 },
  activity: [],
  audit: [],
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
  await page.goto("/");
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
