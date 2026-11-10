import { z } from "zod";

export const refundParameters = z.strictObject({
  amount: z.number(),
  currency: z.string(),
  orderId: z.string(),
});

export const emailParameters = z.strictObject({
  to: z.string(),
  subject: z.string(),
  body: z.string(),
});

export const deleteParameters = z.strictObject({
  recordId: z.string(),
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
