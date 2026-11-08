import { describe, expect, it } from "vitest";
import { evaluatePolicy } from "../src/lib/policy/evaluate";
import { policy } from "../src/lib/policy/policy";
import { policySchema } from "../src/lib/policy/schema";

function policyWithCondition(condition: unknown) {
  return {
    default_outcome: "needs_approval",
    rules: [{
      id: "condition-match",
      description: "Test a condition.",
      tool: "issue_refund",
      conditions: [condition],
      outcome: "allow",
    }],
  };
}

describe("policy evaluator regressions", () => {
  it.each([
    ["missing recipient", {}],
    ["non-string recipient", { to: 42 }],
    ["missing local part", { to: "@countersign.example" }],
    ["invalid parentheses", { to: "a(b@countersign.example" }],
    ["invalid comma", { to: "a,b@countersign.example" }],
    ["whitespace in local part", { to: "a b@countersign.example" }],
    ["invalid local-part character", { to: "a/b@countersign.example" }],
    ["multiple at signs", { to: "a@@countersign.example" }],
    ["subdomain", { to: "a@mail.countersign.example" }],
    ["lookalike domain", { to: "a@countersign.example.evil.com" }],
  ])("routes %s to email approval", (_description, parameters) => {
    expect(evaluatePolicy(policy, { tool: "send_email", parameters })).toMatchObject({
      outcome: "needs_approval",
      rule_id: "other-emails-need-approval",
      matchedRule: { id: "other-emails-need-approval" },
    });
  });

  it("normalizes the domain derived from the recipient address", () => {
    expect(evaluatePolicy(policy, {
      tool: "send_email",
      parameters: { to: "user.name_1%tag+test-x@ CounterSign.Example " },
    })).toMatchObject({
      outcome: "allow",
      rule_id: "internal-domain-emails-allowed",
    });
  });

  it("ignores a caller-supplied recipient_domain without changing parameters", () => {
    const parameters = {
      to: "user@external.example",
      recipient_domain: "countersign.example",
    };
    const original = { ...parameters };
    expect(evaluatePolicy(policy, { tool: "send_email", parameters })).toMatchObject({
      outcome: "needs_approval",
      rule_id: "other-emails-need-approval",
    });
    expect(parameters).toEqual(original);

    expect(evaluatePolicy(policy, {
      tool: "send_email",
      parameters: { to: "user@countersign.example", recipient_domain: "external.example" },
    })).toMatchObject({
      outcome: "allow",
      rule_id: "internal-domain-emails-allowed",
    });
  });

  it.each([
    ["missing amount", {}],
    ["string amount", { amount: "5000" }],
    ["NaN amount", { amount: Number.NaN }],
    ["infinite amount", { amount: Number.POSITIVE_INFINITY }],
  ])("fails closed for %s instead of reaching a refund allow rule", (_description, parameters) => {
    expect(evaluatePolicy(policy, { tool: "issue_refund", parameters })).toMatchObject({
      outcome: "needs_approval",
      rule_id: "no_rule_match",
      matchedRule: null,
    });
  });

  it.each([
    ["equals", { field: "parameters.amount", operator: "equals", value: 500 }, { amount: "500" }],
    ["contains", { field: "parameters.label", operator: "contains", value: "port" }, { label: 123 }],
    ["in-list", { field: "parameters.amount", operator: "in-list", value: [500] }, { amount: "500" }],
  ])("fails closed on a wrong-typed %s field before a later allow", (_name, condition, parameters) => {
    const conditionalPolicy = {
      default_outcome: "needs_approval",
      rules: [
        ...policyWithCondition(condition).rules,
        {
          id: "later-allow",
          description: "Allow after the condition.",
          tool: "issue_refund",
          outcome: "allow",
        },
      ],
    };
    expect(evaluatePolicy(conditionalPolicy, { tool: "issue_refund", parameters })).toMatchObject({
      outcome: "needs_approval",
      rule_id: "no_rule_match",
      matchedRule: null,
    });
  });

  it("returns no_rule_match for a supported tool with no applicable rule", () => {
    const policyWithoutRefunds = {
      ...policy,
      rules: policy.rules.filter((rule) => rule.tool !== "issue_refund"),
    };
    expect(evaluatePolicy(policyWithoutRefunds, {
      tool: "issue_refund",
      parameters: { amount: 10 },
    })).toMatchObject({
      outcome: "needs_approval",
      rule_id: "no_rule_match",
      matchedRule: null,
    });
  });

  it("keeps rule_id consistent with matchedRule, including the fallback", () => {
    const matched = evaluatePolicy(policy, {
      tool: "delete_record",
      parameters: {},
    });
    expect(matched).toMatchObject({
      rule_id: "delete-record-blocked",
      matchedRule: { id: "delete-record-blocked" },
    });
    expect(matched.rule_id).toBe(matched.matchedRule?.id);

    const fallback = evaluatePolicy({ ...policy, rules: [] }, {
      tool: "issue_refund",
      parameters: { amount: 10 },
    });
    expect(fallback).toMatchObject({
      rule_id: "no_rule_match",
      matchedRule: null,
    });
  });

  it.each([
    ["gt match", { field: "parameters.amount", operator: "gt", value: 500 }, { amount: 501 }, "condition-match"],
    ["gt boundary", { field: "parameters.amount", operator: "gt", value: 500 }, { amount: 500 }, "no_rule_match"],
    ["equals match", { field: "parameters.amount", operator: "equals", value: 500 }, { amount: 500 }, "condition-match"],
    ["equals is strict", { field: "parameters.amount", operator: "equals", value: 500 }, { amount: "500" }, "no_rule_match"],
    ["contains match", { field: "parameters.label", operator: "contains", value: "port" }, { label: "support" }, "condition-match"],
    ["contains is case-sensitive", { field: "parameters.label", operator: "contains", value: "Port" }, { label: "support" }, "no_rule_match"],
    ["in-list match", { field: "parameters.amount", operator: "in-list", value: [500, 501] }, { amount: 500 }, "condition-match"],
    ["in-list is strict", { field: "parameters.amount", operator: "in-list", value: ["500"] }, { amount: 500 }, "no_rule_match"],
  ])("%s", (_description, condition, parameters, ruleId) => {
    expect(evaluatePolicy(policyWithCondition(condition), {
      tool: "issue_refund",
      parameters,
    })).toMatchObject({
      outcome: ruleId === "condition-match" ? "allow" : "needs_approval",
      rule_id: ruleId,
    });
  });

  it.each([
    ["unknown operator", { field: "parameters.amount", operator: "less-than", value: 500 }],
    ["gt string", { field: "parameters.amount", operator: "gt", value: "500" }],
    ["gt NaN", { field: "parameters.amount", operator: "gt", value: Number.NaN }],
    ["gt infinity", { field: "parameters.amount", operator: "gt", value: Number.POSITIVE_INFINITY }],
    ["contains non-string", { field: "parameters.label", operator: "contains", value: 42 }],
    ["empty in-list", { field: "parameters.label", operator: "in-list", value: [] }],
    ["non-primitive in-list", { field: "parameters.label", operator: "in-list", value: [{}] }],
    ["unknown source", { field: "recipient_domain", source: "parameters.other", operator: "equals", value: "countersign.example" }],
    ["reserved parameter", { field: "parameters.recipient_domain", operator: "equals", value: "countersign.example" }],
    ["uppercase derived domain", { field: "recipient_domain", source: "parameters.to", operator: "equals", value: "Countersign.Example" }],
    ["uppercase derived domain list", { field: "recipient_domain", source: "parameters.to", operator: "in-list", value: ["Countersign.Example"] }],
  ])("rejects malformed policy: %s", (_description, condition) => {
    expect(() => policySchema.parse(policyWithCondition(condition))).toThrow();
  });

  it("reports an unknown derived-field source in the validation error", () => {
    expect(() => policySchema.parse(policyWithCondition({
      field: "recipient_domain",
      source: "parameters.other",
      operator: "equals",
      value: "countersign.example",
    }))).toThrow(/source[\s\S]*parameters\.to/);
  });
});
