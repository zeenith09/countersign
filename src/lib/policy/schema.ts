import { z } from "zod";

const outcomeSchema = z.enum(["allow", "needs_approval", "block"]);

const primitiveSchema = z.union([z.string(), z.number(), z.boolean(), z.null()]);

const conditionSourceSchema = z.object({
  field: z.string(),
  source: z.string().optional(),
});

const conditionSchema = z.discriminatedUnion("operator", [
  conditionSourceSchema.extend({
    operator: z.literal("gt"),
    value: z.number(),
  }).strict(),
  conditionSourceSchema.extend({
    operator: z.literal("equals"),
    value: primitiveSchema,
  }).strict(),
  conditionSourceSchema.extend({
    operator: z.literal("contains"),
    value: z.string(),
  }).strict(),
  conditionSourceSchema.extend({
    operator: z.literal("in-list"),
    value: z.array(primitiveSchema).min(1),
  }).strict(),
]).superRefine((condition, context) => {
  if (condition.field === "recipient_domain") {
    if (condition.source !== "parameters.to") {
      context.addIssue({
        code: "custom",
        message: "recipient_domain requires source parameters.to.",
        path: ["source"],
      });
    }

    const values = Array.isArray(condition.value) ? condition.value : [condition.value];
    if (values.some((value) => typeof value !== "string" || value !== value.toLowerCase())) {
      context.addIssue({
        code: "custom",
        message: "recipient_domain values must be lowercase strings.",
        path: ["value"],
      });
    }
    return;
  }

  if (
    !/^parameters\.[A-Za-z_][A-Za-z0-9_]*$/.test(condition.field) ||
    condition.field === "parameters.recipient_domain"
  ) {
    context.addIssue({
      code: "custom",
      message: "Unknown or reserved condition field.",
      path: ["field"],
    });
  }
  if (condition.source !== undefined) {
    context.addIssue({
      code: "custom",
      message: "A source is only supported for recipient_domain.",
      path: ["source"],
    });
  }
});

const ruleSchema = z.object({
  id: z.string().trim().min(1),
  description: z.string().trim().min(1),
  tool: z.string().trim().min(1),
  conditions: z.array(conditionSchema).min(1).optional(),
  outcome: outcomeSchema,
}).strict();

export const policySchema = z.object({
  default_outcome: z.literal("needs_approval"),
  rules: z.array(ruleSchema),
}).strict().superRefine((policy, context) => {
  const ids = new Set<string>();
  policy.rules.forEach((rule, index) => {
    if (ids.has(rule.id)) {
      context.addIssue({
        code: "custom",
        message: `Duplicate rule id: ${rule.id}`,
        path: ["rules", index, "id"],
      });
    }
    ids.add(rule.id);
  });
});

export type Policy = z.infer<typeof policySchema>;
export type PolicyOutcome = z.infer<typeof outcomeSchema>;
export type PolicyCondition = z.infer<typeof conditionSchema>;

export const actionSchema = z.object({
  tool: z.string(),
  parameters: z.unknown().refine((parameters) => parameters !== undefined),
}).strict();
