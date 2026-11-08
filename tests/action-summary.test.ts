import { describe, expect, it } from "vitest";
import { seedActions } from "../prisma/seed-actions";
import { summarizeAction } from "../src/app/action-summary";

describe("action summary", () => {
  it("summarizes a refund", () => {
    expect(summarizeAction(seedActions[4].tool, seedActions[4].parameters))
      .toBe("The agent wants to refund $5,000 for order ORDER-1005.");
  });

  it("summarizes a record deletion", () => {
    expect(summarizeAction(seedActions[5].tool, seedActions[5].parameters))
      .toBe("The agent wants to delete record RECORD-1006.");
  });

  it("summarizes an email", () => {
    expect(summarizeAction(seedActions[6].tool, seedActions[6].parameters))
      .toBe("The agent wants to send an email to support@countersign.example with the subject ‘Order review requested’.");
  });
});
