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

  it("accepts 100 array items and rejects 101 at the array path", () => {
    expect(actionParametersSchema.safeParse({ items: Array(100).fill("value") }).success).toBe(true);

    const result = actionParametersSchema.safeParse({ items: Array(101).fill("value") });
    expect(result.success).toBe(false);
    if (result.success) throw new Error("Expected an array length validation error.");
    expect(result.error.issues).toContainEqual(expect.objectContaining({
      message: "Parameter arrays must contain no more than 100 items.",
      path: ["items"],
    }));
  });

  it("enforces string and nesting limits on array items", () => {
    const longString = actionParametersSchema.safeParse({ items: ["ok", "x".repeat(4_001)] });
    expect(longString.success).toBe(false);
    if (longString.success) throw new Error("Expected a string length validation error.");
    expect(longString.error.issues).toContainEqual(expect.objectContaining({
      message: "Parameter strings must be 4,000 characters or fewer.",
      path: ["items", 1],
    }));

    let nested: unknown = "value";
    for (let depth = 0; depth < 9; depth += 1) nested = [nested];
    const deepArray = actionParametersSchema.safeParse({ items: nested });
    expect(deepArray.success).toBe(false);
    if (deepArray.success) throw new Error("Expected a nesting validation error.");
    expect(deepArray.error.issues).toContainEqual(expect.objectContaining({
      message: "Parameter nesting must not exceed 8 levels.",
    }));
  });

  it("accepts 100 object fields and rejects 101", () => {
    const fields = Object.fromEntries(Array.from({ length: 100 }, (_, index) => [`field${index}`, index]));
    expect(actionParametersSchema.safeParse({ nested: fields }).success).toBe(true);

    const result = actionParametersSchema.safeParse({ nested: { ...fields, extra: 1 } });
    expect(result.success).toBe(false);
    if (result.success) throw new Error("Expected an object field count validation error.");
    expect(result.error.issues).toContainEqual(expect.objectContaining({
      message: "Parameter objects must contain no more than 100 fields.",
      path: ["nested"],
    }));
  });

  it("accepts a 100-character key and rejects a 101-character key", () => {
    expect(actionParametersSchema.safeParse({ ["x".repeat(100)]: 1 }).success).toBe(true);

    const key = "x".repeat(101);
    const result = actionParametersSchema.safeParse({ nested: { [key]: 1 } });
    expect(result.success).toBe(false);
    if (result.success) throw new Error("Expected an object key length validation error.");
    expect(result.error.issues).toContainEqual(expect.objectContaining({
      message: "Parameter field names must be 100 characters or fewer.",
      path: ["nested", key],
    }));
  });
});
