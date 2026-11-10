import { describe, expect, it } from "vitest";
import { validEditedParameters } from "../src/lib/tools/parameters";

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
});
