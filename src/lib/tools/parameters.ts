import { z } from "zod";
import type { Prisma } from "../../generated/prisma/client";

export const MAX_AGENT_REASONING_LENGTH = 2_000;
export const MAX_PARAMETER_STRING_LENGTH = 4_000;
export const MAX_PARAMETER_JSON_LENGTH = 16_000;
export const MAX_PARAMETER_DEPTH = 8;
export const MAX_ISSUE_REFUND_AMOUNT = 10_000;
export const MAX_EMAIL_TO_LENGTH = 254;
export const MAX_EMAIL_SUBJECT_LENGTH = 120;
export const MAX_EMAIL_BODY_LENGTH = 1_000;

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

export const refundParameters = z.object({
  amount: z.number().finite().gt(0).max(MAX_ISSUE_REFUND_AMOUNT),
  orderId: z.string().regex(/^ORDER-\d+$/),
}).strict();

export const emailParameters = z.object({
  to: z.string().min(1).max(MAX_EMAIL_TO_LENGTH).refine((value) => !/[\r\n]/.test(value)),
  subject: z.string().min(1).max(MAX_EMAIL_SUBJECT_LENGTH).refine((value) => !/[\r\n]/.test(value)),
  body: z.string().min(1).max(MAX_EMAIL_BODY_LENGTH),
}).strict();

export const deleteParameters = z.object({
  recordId: z.string().regex(/^RECORD-\d+$/),
}).strict();

export function validToolParameters(tool: string, parameters: unknown): boolean {
  switch (tool) {
    case "issue_refund":
      return refundParameters.safeParse(parameters).success;
    case "send_email":
      return emailParameters.safeParse(parameters).success;
    case "delete_record":
      return deleteParameters.safeParse(parameters).success;
    default:
      return false;
  }
}

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
