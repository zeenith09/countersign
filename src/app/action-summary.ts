import type { Prisma } from "../generated/prisma/client";

export function summarizeAction(tool: string, parameters: Prisma.JsonValue): string {
  if (parameters === null || typeof parameters !== "object" || Array.isArray(parameters)) {
    return "Summary unavailable: action parameters are not an object.";
  }

  if (tool === "issue_refund") {
    const { amount, currency, orderId } = parameters;
    if (typeof amount !== "number" || !Number.isFinite(amount) ||
        typeof currency !== "string" || !/^[A-Za-z]{3}$/.test(currency) ||
        typeof orderId !== "string" || !orderId) {
      return "Summary unavailable: refund parameters are incomplete or invalid.";
    }

    const formattedAmount = new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      minimumFractionDigits: 0,
    }).format(amount);
    return `The agent wants to refund ${formattedAmount} for order ${orderId}.`;
  }

  if (tool === "delete_record") {
    const { recordId } = parameters;
    if (typeof recordId !== "string" || !recordId) {
      return "Summary unavailable: record ID is missing or invalid.";
    }
    return `The agent wants to delete record ${recordId}.`;
  }

  if (tool === "send_email") {
    const { to, subject } = parameters;
    if (typeof to !== "string" || !to || typeof subject !== "string" || !subject) {
      return "Summary unavailable: email parameters are incomplete or invalid.";
    }
    return `The agent wants to send an email to ${to} with the subject ‘${subject}’.`;
  }

  return "Summary unavailable: unsupported action.";
}
