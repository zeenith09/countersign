import {
  actionSchema,
  policySchema,
  type PolicyCondition,
  type PolicyOutcome,
} from "./schema";

type Action = {
  tool: string;
  parameters: unknown;
};

type MatchedRule = {
  id: string;
  description: string;
};

export type PolicyEvaluation = {
  outcome: PolicyOutcome;
  rule_id: string;
  matchedRule: MatchedRule | null;
};

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function deriveRecipientDomain(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const atIndex = value.indexOf("@");
  if (atIndex <= 0 || atIndex !== value.lastIndexOf("@")) {
    return undefined;
  }

  const localPart = value.slice(0, atIndex);
  const domain = value.slice(atIndex + 1).trim().toLowerCase();
  if (
    !/^[A-Za-z0-9._%+-]+$/.test(localPart) ||
    localPart.startsWith(".") ||
    localPart.endsWith(".") ||
    localPart.includes("..")
  ) {
    return undefined;
  }

  const labels = domain.split(".");
  if (
    labels.length < 2 ||
    labels.some((label) =>
      !/^[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?$/.test(label)
    )
  ) {
    return undefined;
  }

  return domain;
}

function evaluateCondition(
  condition: PolicyCondition,
  parameters: unknown,
): "match" | "no_match" | "invalid" {
  let value: unknown;
  if (condition.field === "recipient_domain") {
    value = isObject(parameters) ? deriveRecipientDomain(parameters.to) : undefined;
    if (value === undefined) {
      return "no_match";
    }
  } else {
    const key = condition.field.slice("parameters.".length);
    if (!isObject(parameters) || !Object.prototype.hasOwnProperty.call(parameters, key)) {
      return "invalid";
    }
    value = parameters[key];
  }

  switch (condition.operator) {
    case "gt":
      if (typeof value !== "number" || !Number.isFinite(value)) return "invalid";
      return value > condition.value ? "match" : "no_match";
    case "equals":
      if (typeof value !== typeof condition.value || (value === null) !== (condition.value === null)) {
        return "invalid";
      }
      return value === condition.value ? "match" : "no_match";
    case "contains":
      if (typeof value !== "string") return "invalid";
      return value.includes(condition.value) ? "match" : "no_match";
    case "in-list":
      if (!condition.value.some((entry) =>
        typeof value === typeof entry && (value === null) === (entry === null)
      )) {
        return "invalid";
      }
      return condition.value.some((entry) => entry === value) ? "match" : "no_match";
  }
}

export function evaluatePolicy(policyInput: unknown, actionInput: unknown): PolicyEvaluation {
  const policy = policySchema.parse(policyInput);
  const action: Action = actionSchema.parse(actionInput);
  const fallback: PolicyEvaluation = {
    outcome: policy.default_outcome,
    rule_id: "no_rule_match",
    matchedRule: null,
  };

  for (const rule of policy.rules) {
    if (rule.tool !== action.tool) {
      continue;
    }
    const conditions = rule.conditions?.map((condition) =>
      evaluateCondition(condition, action.parameters)
    ) ?? [];
    if (conditions.includes("invalid")) {
      return fallback;
    }
    if (conditions.includes("no_match")) {
      continue;
    }

    return {
      outcome: rule.outcome,
      rule_id: rule.id,
      matchedRule: { id: rule.id, description: rule.description },
    };
  }

  return fallback;
}
