import { describe, expect, it } from "vitest";
import { evaluatePolicy } from "../src/lib/policy/evaluate";
import { policy } from "../src/lib/policy/policy";
import { policySchema } from "../src/lib/policy/schema";

describe("policy evaluation", () => {
  it("uses the first matching rule for refund, deletion, and email outcomes", () => {
    expect(evaluatePolicy(policy, {
      tool: "issue_refund",
      parameters: { amount: 501 },
    })).toMatchObject({
      outcome: "needs_approval",
      matchedRule: { id: "refund-over-500" },
    });

    expect(evaluatePolicy(policy, {
      tool: "issue_refund",
      parameters: { amount: 500 },
    })).toMatchObject({
      outcome: "allow",
      matchedRule: { id: "other-refunds-allowed" },
    });

    expect(evaluatePolicy(policy, {
      tool: "delete_record",
      parameters: { recordId: "record-1" },
    })).toMatchObject({
      outcome: "block",
      matchedRule: { id: "delete-record-blocked" },
    });

    expect(evaluatePolicy(policy, {
      tool: "send_email",
      parameters: { to: "support@countersign.example" },
    })).toMatchObject({
      outcome: "allow",
      matchedRule: { id: "internal-domain-emails-allowed" },
    });

    expect(evaluatePolicy(policy, {
      tool: "send_email",
      parameters: { to: "customer@example.com" },
    })).toMatchObject({
      outcome: "needs_approval",
      matchedRule: { id: "other-emails-need-approval" },
    });
  });

  it.each([
    ["missing recipient", {}],
    ["non-string recipient", { to: 42 }],
    ["missing at sign", { to: "not-an-email" }],
    ["missing local part", { to: "@countersign.example" }],
    ["missing domain", { to: "support@" }],
    ["multiple at signs", { to: "support@@countersign.example" }],
    ["subdomain", { to: "support@mail.countersign.example" }],
    ["lookalike suffix", { to: "support@countersign.example.evil.com" }],
    ["lookalike name", { to: "support@countersign-example" }],
  ])("requires approval for %s", (_description, parameters) => {
    expect(evaluatePolicy(policy, {
      tool: "send_email",
      parameters,
    })).toMatchObject({
      outcome: "needs_approval",
      matchedRule: { id: "other-emails-need-approval" },
    });
  });

  it("requires approval when no rule matches a supported tool", () => {
    expect(evaluatePolicy(policy, {
      tool: "unlisted_supported_tool",
      parameters: {},
    })).toMatchObject({
      outcome: "needs_approval",
      matchedRule: null,
    });
  });

  it("does not allow a catch-all allow outcome", () => {
    expect(() => policySchema.parse({
      ...policy,
      default_outcome: "allow",
    })).toThrow();
  });
});
