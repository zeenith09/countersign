import { describe, expect, it } from "vitest";
import { seedActions } from "../prisma/seed-actions";

describe("seed actions", () => {
  it("contains the requested examples with distinct IDs and reasoning", () => {
    expect(seedActions).toHaveLength(10);
    expect(new Set(seedActions.map((action) => action.id)).size).toBe(10);
    expect(seedActions.every((action) => !("status" in action))).toBe(true);
    expect(seedActions.every((action) => action.agentReasoning.trim().length > 0)).toBe(true);
    expect(seedActions.map((action) => action.tool).sort()).toEqual([
      "delete_record",
      ...Array(6).fill("issue_refund"),
      ...Array(3).fill("send_email"),
    ]);

    const refunds = seedActions.filter((action) => action.tool === "issue_refund");
    expect(refunds.map((action) => action.parameters.amount).sort((a, b) => a - b)).toEqual([
      20, 50, 499, 500, 501, 5000,
    ]);

    const emails = seedActions.filter((action) => action.tool === "send_email");
    expect(emails.map((action) => action.parameters.to).sort()).toEqual([
      "customer@example.com",
      "support@countersign.example",
      "support@countersign.example.evil.com",
    ]);
  });
});
