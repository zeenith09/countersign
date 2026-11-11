import { describe, expect, it } from "vitest";
import {
  actionParametersSchema,
  emailParameters,
  refundParameters,
  validEditedParameters,
} from "../src/lib/tools/parameters";

describe("reviewer edit parameters", () => {
  it("accepts complete refund and email parameters", () => {
    expect(validEditedParameters("issue_refund", { amount: 25, currency: "USD", orderId: "ORDER-1" })).toBe(true);
    expect(validEditedParameters("send_email", { to: "customer@example.com", subject: "Update", body: "Hello" })).toBe(true);
  });

  it("rejects incomplete, wrong-typed, extra, and non-editable tool parameters", () => {
    expect(validEditedParameters("issue_refund", { amount: "25", currency: "USD", orderId: "ORDER-1" })).toBe(false);
    expect(validEditedParameters("issue_refund", { amount: 25 })).toBe(false);
    expect(validEditedParameters("send_email", { to: "customer@example.com", subject: "Update", body: "Hello", extra: true })).toBe(false);
    expect(validEditedParameters("delete_record", { recordId: "RECORD-1" })).toBe(false);
  });

  it("enforces length and finite-number limits on tool arguments", () => {
    expect(refundParameters.safeParse({
      amount: Number.POSITIVE_INFINITY,
      currency: "USD",
      orderId: "ORDER-1",
    }).success).toBe(false);
    expect(emailParameters.safeParse({
      to: "customer@example.com",
      subject: "x".repeat(201),
      body: "Hello",
    }).success).toBe(false);
    expect(validEditedParameters("send_email", {
      to: "customer@example.com",
      subject: "Update",
      body: "x".repeat(4_001),
    })).toBe(false);
  });

  it("limits parameter JSON size, depth, and string lengths", () => {
    expect(actionParametersSchema.safeParse({ comment: "x".repeat(4_001) }).success).toBe(false);
    expect(actionParametersSchema.safeParse({
      nested: { deeper: { stillDeeper: { beyondLimit: "value" } } },
    }).success).toBe(true);

    let deeplyNested: unknown = "value";
    for (let depth = 0; depth < 9; depth += 1) {
      deeplyNested = { nested: deeplyNested };
    }
    expect(actionParametersSchema.safeParse({ nested: deeplyNested }).success).toBe(false);
  });
});
