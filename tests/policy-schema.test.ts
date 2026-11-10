import { afterEach, describe, expect, it, vi } from "vitest";
import { actionSchema, policySchema } from "../src/lib/policy/schema";

describe("incoming action schema", () => {
  it.each(["unknown_tool", "", "  arbitrary tool  "])(
    "accepts the tool string %j without changing it",
    (tool) => {
      const parameters = {
        to: "User@EXAMPLE.COM",
        recipient_domain: "caller-supplied.example",
      };

      expect(actionSchema.parse({ tool, parameters })).toEqual({ tool, parameters });
    },
  );

  it("rejects a non-string tool name", () => {
    expect(() => actionSchema.parse({ tool: 42, parameters: {} })).toThrow();
  });
});

describe("policy schema and loading", () => {
  afterEach(() => {
    vi.doUnmock("../src/lib/policy/policy.json");
    vi.resetModules();
  });

  it.each([
    { field: "parameters.amount", operator: "gt", value: 500 },
    { field: "parameters.amount", operator: "equals", value: 500 },
    { field: "parameters.label", operator: "contains", value: "urgent" },
    { field: "parameters.amount", operator: "in-list", value: [500, 501] },
  ])("accepts the $operator condition", (condition) => {
    expect(policySchema.safeParse({
      default_outcome: "needs_approval",
      rules: [{
        id: "example",
        description: "An example rule.",
        tool: "example",
        conditions: [condition],
        outcome: "needs_approval",
      }],
    }).success).toBe(true);
  });

  it("throws a readable error when loading a malformed policy", async () => {
    vi.resetModules();
    vi.doMock("../src/lib/policy/policy.json", () => ({
      default: {
        default_outcome: "needs_approval",
        rules: [{
          id: "example",
          description: "An example rule.",
          tool: "example",
          conditions: [{
            field: "recipient_domain",
            source: "parameters.other",
            operator: "equals",
            value: "countersign.example",
          }],
          outcome: "allow",
        }],
      },
    }));

    await expect(import("../src/lib/policy/policy")).rejects.toThrow(
      /recipient_domain requires source parameters\.to/,
    );
  });
});
