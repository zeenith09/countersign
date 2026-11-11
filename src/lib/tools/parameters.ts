import { z } from "zod";
import type { Prisma } from "../../generated/prisma/client";

export const MAX_AGENT_REASONING_LENGTH = 2_000;
export const MAX_PARAMETER_STRING_LENGTH = 4_000;
export const MAX_PARAMETER_JSON_LENGTH = 16_000;
export const MAX_PARAMETER_DEPTH = 8;

function isJsonObject(value: unknown): value is Prisma.InputJsonObject {
  return value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    z.json().safeParse(value).success;
}

export const actionParametersSchema = z.custom<Prisma.InputJsonObject>(
  isJsonObject,
  { message: "Parameters must be a JSON object." },
).superRefine((parameters, context) => {
  const serialized = JSON.stringify(parameters);
  if (serialized.length > MAX_PARAMETER_JSON_LENGTH) {
    context.addIssue({
      code: "custom",
      message: `Parameters must be ${MAX_PARAMETER_JSON_LENGTH.toLocaleString("en-US")} characters or fewer.`,
    });
    return;
  }

  function checkValue(value: unknown, path: (string | number)[], depth: number): void {
    if (depth > MAX_PARAMETER_DEPTH) {
      context.addIssue({
        code: "custom",
        message: `Parameter nesting must not exceed ${MAX_PARAMETER_DEPTH} levels.`,
        path,
      });
      return;
    }

    if (typeof value === "string" && value.length > MAX_PARAMETER_STRING_LENGTH) {
      context.addIssue({
        code: "custom",
        message: `Parameter strings must be ${MAX_PARAMETER_STRING_LENGTH.toLocaleString("en-US")} characters or fewer.`,
        path,
      });
      return;
    }

    if (Array.isArray(value)) {
      if (value.length > 100) {
        context.addIssue({
          code: "custom",
          message: "Parameter arrays must contain no more than 100 items.",
          path,
        });
        return;
      }
      value.forEach((entry, index) => checkValue(entry, [...path, index], depth + 1));
      return;
    }

    if (value !== null && typeof value === "object") {
      const entries = Object.entries(value);
      if (entries.length > 100) {
        context.addIssue({
          code: "custom",
          message: "Parameter objects must contain no more than 100 fields.",
          path,
        });
        return;
      }
      for (const [key, entry] of entries) {
        if (key.length > 100) {
          context.addIssue({
            code: "custom",
            message: "Parameter field names must be 100 characters or fewer.",
            path: [...path, key],
          });
        }
        checkValue(entry, [...path, key], depth + 1);
      }
    }
  }

  checkValue(parameters, [], 0);
});

export const refundParameters = z.strictObject({
  amount: z.number().finite().nonnegative(),
  currency: z.string().regex(/^[A-Za-z]{3}$/),
  orderId: z.string().min(1).max(100),
});

export const emailParameters = z.strictObject({
  to: z.string().min(1).max(254),
  subject: z.string().min(1).max(200),
  body: z.string().max(MAX_PARAMETER_STRING_LENGTH),
});

export const deleteParameters = z.strictObject({
  recordId: z.string().min(1).max(100),
});

export function validEditedParameters(tool: string, parameters: unknown): boolean {
  switch (tool) {
    case "issue_refund":
      return refundParameters.safeParse(parameters).success;
    case "send_email":
      return emailParameters.safeParse(parameters).success;
    default:
      return false;
  }
}
