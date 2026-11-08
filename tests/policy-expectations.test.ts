import { readFile } from "node:fs/promises";
import { afterEach, describe, expect, it, vi } from "vitest";
import { evaluatePolicy } from "../src/lib/policy/evaluate";
import { policy } from "../src/lib/policy/policy";

describe("approved policy outcomes", () => {
  it.each([
    [500, "allow", "other-refunds-allowed"],
    [501, "needs_approval", "refund-over-500"],
    [499, "allow", "other-refunds-allowed"],
    [500.01, "needs_approval", "refund-over-500"],
    [499.99, "allow", "other-refunds-allowed"],
  ])("evaluates refund amount %s as %s", (amount, outcome, ruleId) => {
    expect(evaluatePolicy(policy, {
      tool: "issue_refund",
      parameters: { amount },
    })).toMatchObject({ outcome, rule_id: ruleId });
  });

  it("blocks record deletion", () => {
    expect(evaluatePolicy(policy, {
      tool: "delete_record",
      parameters: { recordId: "record-1" },
    })).toMatchObject({ outcome: "block", rule_id: "delete-record-blocked" });
  });

  it.each([
    ["user@countersign.example", "allow", "internal-domain-emails-allowed"],
    ["USER@COUNTERSIGN.EXAMPLE", "allow", "internal-domain-emails-allowed"],
    ["user@countersign.example.evil.com", "needs_approval", "other-emails-need-approval"],
    ["user@mail.countersign.example", "needs_approval", "other-emails-need-approval"],
    ["user@@countersign.example", "needs_approval", "other-emails-need-approval"],
    ["a(b@countersign.example", "needs_approval", "other-emails-need-approval"],
    ["user@example.com", "needs_approval", "other-emails-need-approval"],
  ])("evaluates email to %s", (to, outcome, ruleId) => {
    expect(evaluatePolicy(policy, {
      tool: "send_email",
      parameters: { to },
    })).toMatchObject({ outcome, rule_id: ruleId });
  });

  it("requires approval for a missing email address", () => {
    expect(evaluatePolicy(policy, {
      tool: "send_email",
      parameters: {},
    })).toMatchObject({
      outcome: "needs_approval",
      rule_id: "other-emails-need-approval",
    });
  });

  it("requires approval when no rule matches a supported tool", () => {
    const policyWithoutRefunds = {
      ...policy,
      rules: policy.rules.filter((rule) => rule.tool !== "issue_refund"),
    };
    expect(evaluatePolicy(policyWithoutRefunds, {
      tool: "issue_refund",
      parameters: { amount: 500 },
    })).toMatchObject({ outcome: "needs_approval", rule_id: "no_rule_match" });
  });

  it("uses the first matching rule when a refund matches multiple rules", () => {
    expect(policy.rules.findIndex((rule) => rule.id === "refund-over-500"))
      .toBeLessThan(policy.rules.findIndex((rule) => rule.id === "other-refunds-allowed"));
    expect(evaluatePolicy(policy, {
      tool: "issue_refund",
      parameters: { amount: 501 },
    })).toMatchObject({ outcome: "needs_approval", rule_id: "refund-over-500" });
  });

  it("uses the first matching rule when an internal email matches multiple rules", () => {
    expect(policy.rules.findIndex((rule) => rule.id === "internal-domain-emails-allowed"))
      .toBeLessThan(policy.rules.findIndex((rule) => rule.id === "other-emails-need-approval"));
    expect(evaluatePolicy(policy, {
      tool: "send_email",
      parameters: { to: "user@countersign.example" },
    })).toMatchObject({ outcome: "allow", rule_id: "internal-domain-emails-allowed" });
  });
});

describe("policy loading", () => {
  afterEach(() => {
    vi.doUnmock("../src/lib/policy/policy.json");
    vi.resetModules();
  });

  it("loads the valid policy JSON", async () => {
    vi.resetModules();
    const loaded = await import("../src/lib/policy/policy");
    expect(loaded.policy).toEqual(policy);
  });

  it("throws when a mocked policy JSON import parses malformed JSON", async () => {
    vi.resetModules();
    vi.doMock("../src/lib/policy/policy.json", async () => ({
      default: JSON.parse(await readFile(
        new URL("./fixtures/malformed-policy.json", import.meta.url),
        "utf8",
      )),
    }));
    await expect(import("../src/lib/policy/policy")).rejects.toMatchObject({
      cause: expect.any(SyntaxError),
    });
  });

  it.each([
    ["missing required fields", { default_outcome: "needs_approval", rules: [{ id: "missing" }] }],
    ["invalid outcome", {
      default_outcome: "needs_approval",
      rules: [{ id: "invalid", description: "Invalid outcome", tool: "issue_refund", outcome: "unknown" }],
    }],
    ["unsupported operator", {
      default_outcome: "needs_approval",
      rules: [{
        id: "invalid",
        description: "Invalid operator",
        tool: "issue_refund",
        conditions: [{ field: "parameters.amount", operator: "less-than", value: 500 }],
        outcome: "allow",
      }],
    }],
  ])("throws while loading a policy with %s", async (_description, invalidPolicy) => {
    vi.resetModules();
    vi.doMock("../src/lib/policy/policy.json", () => ({ default: invalidPolicy }));
    await expect(import("../src/lib/policy/policy")).rejects.toThrow();
  });
});
