import { randomUUID } from "node:crypto";
import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { z } from "zod";

async function submitPendingAction(request: APIRequestContext): Promise<string> {
  const response = await request.post("/api/actions", {
    data: {
      agentId: "approval-e2e",
      agentReasoning: "Browser test submission for the human review flow.",
      tool: "issue_refund",
      parameters: {
        orderId: `ORDER-${randomUUID().replaceAll("-", "").slice(0, 12)}`,
        amount: 750,
        currency: "USD",
      },
    },
  });
  expect(response.status()).toBe(201);
  const submission = z.object({
    actionId: z.string().uuid(),
    outcome: z.literal("needs_approval"),
    status: z.literal("pending"),
  }).parse(await response.json());
  return submission.actionId;
}

async function openActionByKeyboard(page: Page, actionId: string): Promise<void> {
  const card = page.locator(".action-card").filter({ hasText: actionId });
  const review = card.getByRole("button", { name: "Review action" });
  await review.focus();
  await page.keyboard.press("Enter");
}

async function openDecision(
  page: Page,
  actionId: string,
  outcome: "Approve" | "Deny",
): Promise<ReturnType<Page["locator"]>> {
  await openActionByKeyboard(page, actionId);
  const details = page.locator("dialog.detail-dialog");
  await expect(details).toBeVisible();
  await expect(details.locator(".code-block")).toContainText('"amount": 750');
  await details.getByRole("button", { name: outcome }).click();
  const decision = page.locator("dialog.decision-dialog");
  await expect(decision).toBeVisible();
  return decision;
}

test("approval waits for the server response, reads stored status, and focuses the announcement", async ({ page, request }) => {
  const actionId = await submitPendingAction(request);
  await page.goto("/");
  const decision = await openDecision(page, actionId, "Approve");
  const reviewer = decision.getByLabel("Reviewer name");
  const reason = decision.locator("textarea");
  await reviewer.fill("   ");
  await reason.fill("The customer is eligible for this refund.");
  await decision.getByRole("button", { name: "Confirm approval" }).click();

  await expect(reviewer).toHaveAttribute("aria-invalid", "true");
  await expect(page.locator("#reviewer-error")).toHaveText("Enter the reviewer name before confirming.");
  await reviewer.fill("E2E Reviewer");
  await expect(reviewer).toHaveAttribute("aria-invalid", "false");

  let releaseResponse = () => {};
  const responseGate = new Promise<void>((resolve) => {
    releaseResponse = resolve;
  });
  let signalResponseReady = () => {};
  const responseReady = new Promise<void>((resolve) => {
    signalResponseReady = resolve;
  });
  const decisionUrl = `**/api/actions/${actionId}/decision`;
  await page.route(decisionUrl, async (route) => {
    const response = await route.fetch();
    signalResponseReady();
    await responseGate;
    await route.fulfill({ response });
  });

  try {
    await decision.getByRole("button", { name: "Confirm approval" }).click();
    await responseReady;
    await expect(decision.locator(".live-status")).toContainText("Submitting decision to the server");
    await expect(decision.locator(".live-status")).not.toContainText("Decision committed");
    releaseResponse();

    await expect(page.locator("#console-announcement")).toContainText(
      "Decision committed. Current status: approved.",
    );
    await expect(page.locator("#console-announcement")).toBeFocused();
    await expect(page.locator(".action-card").filter({ hasText: actionId })).toHaveCount(0);
  } finally {
    releaseResponse();
    await page.unroute(decisionUrl);
  }
});

test("denial requires a reason and re-reads the committed denied status", async ({ page, request }) => {
  const actionId = await submitPendingAction(request);
  await page.goto("/");
  const decision = await openDecision(page, actionId, "Deny");
  const reviewer = decision.getByLabel("Reviewer name");
  const reason = decision.locator("textarea");
  await reviewer.fill("E2E Reviewer");
  await expect(reason).toHaveAttribute("required", "");
  await decision.getByRole("button", { name: "Confirm denial" }).click();
  await expect(decision).toBeVisible();
  await expect(decision.locator(".live-status")).not.toContainText("Decision committed");

  await reason.fill("The supporting order details do not match.");
  await decision.getByRole("button", { name: "Confirm denial" }).click();
  await expect(page.locator("#console-announcement")).toContainText(
    "Decision committed. Current status: denied.",
  );
  await expect(page.locator(".action-card").filter({ hasText: actionId })).toHaveCount(0);
});

test("a stale queue item reports the current status and offers a refresh", async ({ page, request }) => {
  const actionId = await submitPendingAction(request);
  await page.goto("/");
  const decision = await openDecision(page, actionId, "Approve");
  const externalDecision = await request.post(`/api/actions/${actionId}/decision`, {
    data: { reviewer: "Second Reviewer", outcome: "denied", reason: "Reviewed in another session." },
  });
  expect(externalDecision.status()).toBe(200);

  await decision.getByLabel("Reviewer name").fill("E2E Reviewer");
  await decision.locator("textarea").fill("Attempting to decide the stale queue item.");
  await decision.getByRole("button", { name: "Confirm approval" }).click();

  await expect(decision.locator(".live-status")).toContainText(
    "This action is no longer pending. Current status: denied.",
  );
  await decision.getByRole("button", { name: "Cancel", exact: true }).click();
  const details = page.locator("dialog.detail-dialog");
  await expect(details).toBeVisible();
  await details.getByRole("button", { name: "Refresh console" }).click();
  await expect(page.locator(".action-card").filter({ hasText: actionId })).toHaveCount(0);
});

test("a committed decision with a lost response triggers a status re-read, not a success claim", async ({ page, request }) => {
  const actionId = await submitPendingAction(request);
  await page.goto("/");
  const decision = await openDecision(page, actionId, "Approve");
  await decision.getByLabel("Reviewer name").fill("E2E Reviewer");
  await decision.locator("textarea").fill("The action is appropriate to proceed.");
  const decisionUrl = `**/api/actions/${actionId}/decision`;

  await page.route(decisionUrl, async (route) => {
    const response = await route.fetch();
    expect(response.status()).toBe(200);
    await route.abort("failed");
  });

  await decision.getByRole("button", { name: "Confirm approval" }).click();
  await expect(decision.locator(".live-status")).toContainText(
    "Network error or timeout. Current status: approved.",
  );
  await expect(decision.locator(".live-status")).not.toContainText("Decision committed");
  await expect(decision.getByRole("button", { name: "Confirm approval" })).toBeDisabled();
});
