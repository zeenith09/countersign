import {
  actionSchema,
  policySchema,
  type PolicyCondition,
  type PolicyOutcome,
} from "./schema";

// Parsed actions retain their tool name and original parameters.
type Action = {
  tool: string;
  parameters: unknown;
};

// Matched rule details can be shown to a reviewer.
type MatchedRule = {
  id: string;
  description: string;
};

// rule_id is the canonical identifier; matchedRule is null for the fallback.
export type PolicyEvaluation = {
  outcome: PolicyOutcome;
  rule_id: string;
  matchedRule: MatchedRule | null;
};

function isObject(value: unknown): value is Record<string, unknown> {
  // Only non-null, non-array objects can supply named parameters.
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function deriveRecipientDomain(value: unknown): string | undefined {
  // A missing or non-string address cannot produce an internal domain.
  if (typeof value !== "string") {
    return undefined;
  }

  const atIndex = value.indexOf("@");
  // Require a non-empty local part and exactly one @.
  if (atIndex <= 0 || atIndex !== value.lastIndexOf("@")) {
    return undefined;
  }

  const localPart = value.slice(0, atIndex);
  // Normalize only the derived domain; do not modify submitted parameters.
  const domain = value.slice(atIndex + 1).trim().toLowerCase();
  // Reject invalid local-part characters and invalid dot placement.
  if (
    !/^[A-Za-z0-9._%+-]+$/.test(localPart) ||
    localPart.startsWith(".") ||
    localPart.endsWith(".") ||
    localPart.includes("..")
  ) {
    return undefined;
  }

  const labels = domain.split(".");
  // Require at least two valid domain labels before comparing the domain.
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
    // Derive the domain from to, never from a caller-supplied recipient_domain.
    value = isObject(parameters) ? deriveRecipientDomain(parameters.to) : undefined;
    if (value === undefined) {
      // Missing or malformed addresses fall through to the email approval rule.
      return "no_match";
    }
  } else {
    // Ordinary conditions read a named field from the original parameters.
    const key = condition.field.slice("parameters.".length);
    if (!isObject(parameters) || !Object.prototype.hasOwnProperty.call(parameters, key)) {
      // A missing ordinary field fails closed rather than reaching a later allow.
      return "invalid";
    }
    value = parameters[key];
  }

  switch (condition.operator) {
    case "gt":
      // Greater-than requires a finite number.
      if (typeof value !== "number" || !Number.isFinite(value)) return "invalid";
      return value > condition.value ? "match" : "no_match";
    case "equals":
      // Equality requires the same type and uses strict comparison.
      if (typeof value !== typeof condition.value || (value === null) !== (condition.value === null)) {
        return "invalid";
      }
      return value === condition.value ? "match" : "no_match";
    case "contains":
      // String containment is case-sensitive.
      if (typeof value !== "string") return "invalid";
      return value.includes(condition.value) ? "match" : "no_match";
    case "in-list":
      // List membership requires a compatible type and uses strict equality.
      if (!condition.value.some((entry) =>
        typeof value === typeof entry && (value === null) === (entry === null)
      )) {
        return "invalid";
      }
      return condition.value.some((entry) => entry === value) ? "match" : "no_match";
  }
}

export function evaluatePolicy(policyInput: unknown, actionInput: unknown): PolicyEvaluation {
  // Validate both inputs before making any policy decision.
  const policy = policySchema.parse(policyInput);
  const action: Action = actionSchema.parse(actionInput);
  // An unmatched or invalid ordinary condition requires approval.
  const fallback: PolicyEvaluation = {
    outcome: policy.default_outcome,
    rule_id: "no_rule_match",
    matchedRule: null,
  };

  // Rules are checked in order; the first matching rule wins.
  for (const rule of policy.rules) {
    if (rule.tool !== action.tool) {
      continue;
    }
    const conditions = rule.conditions?.map((condition) =>
      evaluateCondition(condition, action.parameters)
    ) ?? [];
    // Invalid ordinary values fail closed even if a later rule could allow.
    if (conditions.includes("invalid")) {
      return fallback;
    }
    if (conditions.includes("no_match")) {
      // A non-matching rule does not decide the outcome.
      continue;
    }

    // Return the outcome and the matched rule's ID and description.
    return {
      outcome: rule.outcome,
      rule_id: rule.id,
      matchedRule: { id: rule.id, description: rule.description },
    };
  }

  // No rule matched, so use the approval fallback.
  return fallback;
}
