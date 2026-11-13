import type { Prisma } from "../generated/prisma/client";

export type SummaryPart =
  | { type: "text"; value: string }
  | { type: "identifier"; kind: "order" | "record"; value: string };

export function getSummaryIdentifierHref(part: Extract<SummaryPart, { type: "identifier" }>): string | null {
  const isExactMatch = (pattern: RegExp): boolean =>
    pattern.test(part.value) && pattern.exec(part.value)?.[0] === part.value;

  if (part.kind === "order" && isExactMatch(/^ORDER-[0-9]+$/)) {
    return `/orders/${part.value}`;
  }
  if (part.kind === "record" && isExactMatch(/^RECORD-[0-9]+$/)) {
    return `/records/${part.value}`;
  }
  return null;
}

function isOrderId(value: string): boolean {
  return /^ORDER-[0-9]+$/.test(value) && /^ORDER-[0-9]+$/.exec(value)?.[0] === value;
}

function isRecordId(value: string): boolean {
  return /^RECORD-[0-9]+$/.test(value) && /^RECORD-[0-9]+$/.exec(value)?.[0] === value;
}

export function summarizeActionParts(tool: string, parameters: Prisma.JsonValue): SummaryPart[] {
  if (parameters === null || typeof parameters !== "object" || Array.isArray(parameters)) {
    return [{ type: "text", value: summarizeAction(tool, parameters) }];
  }

  if (tool === "issue_refund") {
    const { amount, currency, orderId } = parameters;
    if (typeof amount !== "number" || !Number.isFinite(amount) ||
        typeof currency !== "string" || !/^[A-Za-z]{3}$/.test(currency) ||
        typeof orderId !== "string" || !orderId) {
      return [{ type: "text", value: summarizeAction(tool, parameters) }];
    }

    const formattedAmount = new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      minimumFractionDigits: 0,
    }).format(amount);
    const identifierPart: SummaryPart = isOrderId(orderId)
      ? { type: "identifier", kind: "order", value: orderId }
      : { type: "text", value: orderId };
    return [
      { type: "text", value: `The agent wants to refund ${formattedAmount} for order ` },
      identifierPart,
      { type: "text", value: "." },
    ];
  }

  if (tool === "delete_record") {
    const { recordId } = parameters;
    if (typeof recordId !== "string" || !recordId) {
      return [{ type: "text", value: summarizeAction(tool, parameters) }];
    }
    const identifierPart: SummaryPart = isRecordId(recordId)
      ? { type: "identifier", kind: "record", value: recordId }
      : { type: "text", value: recordId };
    return [
      { type: "text", value: "The agent wants to delete record " },
      identifierPart,
      { type: "text", value: "." },
    ];
  }

  return [{ type: "text", value: summarizeAction(tool, parameters) }];
}

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
