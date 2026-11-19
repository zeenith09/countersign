import { describe, expect, it } from "vitest";
import {
  actionParametersSchema,
  emailParameters,
  refundParameters,
  deleteParameters,
  MAX_EMAIL_BODY_LENGTH,
  MAX_EMAIL_SUBJECT_LENGTH,
  MAX_EMAIL_TO_LENGTH,
  MAX_ISSUE_REFUND_AMOUNT,
  validEditedParameters,
} from "../src/lib/tools/parameters";

describe("reviewer edit parameters", () => {
  it("accepts complete refund and email parameters", () => {
    expect(validEditedParameters("issue_refund", { amount: 25, orderId: "ORDER-1" })).toBe(true);
    expect(validEditedParameters("send_email", { to: "customer@example.com", subject: "Update", body: "Hello" })).toBe(true);
  });

  it("rejects incomplete, wrong-typed, extra, and non-editable tool parameters", () => {
    expect(validEditedParameters("issue_refund", { amount: "25", orderId: "ORDER-1" })).toBe(false);
    expect(validEditedParameters("issue_refund", { amount: 25 })).toBe(false);
    expect(validEditedParameters("send_email", { to: "customer@example.com", subject: "Update", body: "Hello", extra: true })).toBe(false);
    expect(validEditedParameters("delete_record", { recordId: "RECORD-1" })).toBe(false);
  });

  it.each([
    ["zero", 0, false],
    ["negative", -0.01, false],
    ["small positive", 0.01, true],
    ["policy boundary 500", 500, true],
    ["policy boundary 501", 501, true],
    ["demo amount 5000", 5_000, true],
    ["inclusive maximum", 10_000, true],
    ["above maximum", 10_000.01, false],
    ["Infinity", Number.POSITIVE_INFINITY, false],
    ["NaN", Number.NaN, false],
    ["numeric string", "500", false],
  ] as const)("validates refund amount %s", (_label, amount, valid) => {
    expect(refundParameters.safeParse({
      amount,
      orderId: "ORDER-1",
    }).success).toBe(valid);
  });

  it("exports the configured refund ceiling and requires a canonical order id", () => {
    expect(MAX_ISSUE_REFUND_AMOUNT).toBe(10_000);
    expect(refundParameters.safeParse({
      amount: 500,
      orderId: "order-1",
    }).success).toBe(false);
    expect(refundParameters.safeParse({
      amount: 500,
      orderId: "ORDER-1",
      currency: "USD",
    }).success).toBe(false);
  });

  it.each([
    ["email recipient", { to: 42, subject: "Subject", body: "Body" }],
    ["email subject", { to: "x", subject: null, body: "Body" }],
    ["email body", { to: "x", subject: "Subject", body: 1 }],
    ["record id", { recordId: 12 }],
  ])("rejects a wrong-typed %s", (_field, parameters) => {
    const schema = "recordId" in parameters ? deleteParameters : emailParameters;
    expect(schema.safeParse(parameters).success).toBe(false);
  });

  it.each([
    ["subject", { to: "x", subject: "x", body: "x" }, "subject", 0, false],
    ["subject", { to: "x", subject: "x", body: "x" }, "subject", 1, true],
    ["subject", { to: "x", subject: "x", body: "x" }, "subject", 120, true],
    ["subject", { to: "x", subject: "x", body: "x" }, "subject", 121, false],
    ["body", { to: "x", subject: "x", body: "x" }, "body", 0, false],
    ["body", { to: "x", subject: "x", body: "x" }, "body", 1, true],
    ["body", { to: "x", subject: "x", body: "x" }, "body", 1_000, true],
    ["body", { to: "x", subject: "x", body: "x" }, "body", 1_001, false],
    ["to", { to: "x", subject: "x", body: "x" }, "to", 0, false],
    ["to", { to: "x", subject: "x", body: "x" }, "to", 1, true],
    ["to", { to: "x", subject: "x", body: "x" }, "to", 254, true],
    ["to", { to: "x", subject: "x", body: "x" }, "to", 255, false],
  ] as const)("enforces %s length %s", (_field, parameters, field, length, valid) => {
    const result = emailParameters.safeParse({ ...parameters, [field]: "x".repeat(length) });
    expect(result.success).toBe(valid);
  });

  it("rejects carriage returns and line feeds in email subject and recipient only", () => {
    for (const newline of ["\r", "\n"]) {
      expect(emailParameters.safeParse({
        to: `a${newline}b`, subject: "Subject", body: "Body",
      }).success).toBe(false);
      expect(emailParameters.safeParse({
        to: "recipient", subject: `a${newline}b`, body: "Body",
      }).success).toBe(false);
      expect(emailParameters.safeParse({
        to: "recipient", subject: "Subject", body: `a${newline}b`,
      }).success).toBe(true);
    }
  });

  it("rejects recipient_domain and other unknown keys while accepting malformed addresses unchanged", () => {
    expect(emailParameters.safeParse({
      to: " not-an-email ",
      subject: " Subject ",
      body: " Body ",
    })).toMatchObject({
      success: true,
      data: { to: " not-an-email ", subject: " Subject ", body: " Body " },
    });
    expect(emailParameters.safeParse({
      to: "x",
      subject: "Subject",
      body: "Body",
      recipient_domain: "example.com",
    }).success).toBe(false);
  });

  it("exports the configured email limits and validates delete record ids strictly", () => {
    expect(MAX_EMAIL_TO_LENGTH).toBe(254);
    expect(MAX_EMAIL_SUBJECT_LENGTH).toBe(120);
    expect(MAX_EMAIL_BODY_LENGTH).toBe(1_000);
    expect(deleteParameters.safeParse({ recordId: "RECORD-12" }).success).toBe(true);
    expect(deleteParameters.safeParse({ recordId: "record-12" }).success).toBe(false);
    expect(deleteParameters.safeParse({ recordId: "RECORD-12", extra: true }).success).toBe(false);
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
