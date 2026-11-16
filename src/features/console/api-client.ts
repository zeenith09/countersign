import { z } from "zod";
import {
  actionStatusSchema,
  consoleSnapshotSchema,
  type ActionDecision,
  type ConsoleSnapshot,
  type ConsoleStatus,
} from "./contract";

const DECISION_REQUEST_TIMEOUT_MS = 45_000;
const STATUS_REQUEST_TIMEOUT_MS = 15_000;

export async function fetchConsoleSnapshot(): Promise<ConsoleSnapshot> {
  const response = await fetch("/api/console", { cache: "no-store" });
  if (!response.ok) throw new Error("Console data could not be loaded.");
  const parsed = consoleSnapshotSchema.safeParse(await response.json());
  if (!parsed.success) throw new Error("The console received an invalid response.");
  return parsed.data;
}

export async function fetchActionStatus(id: string): Promise<ConsoleStatus | null> {
  try {
    const response = await fetch(`/api/actions/${encodeURIComponent(id)}`, {
      cache: "no-store",
      signal: AbortSignal.timeout(STATUS_REQUEST_TIMEOUT_MS),
    });
    if (!response.ok) return null;
    const result = actionStatusResponseSchema.safeParse(await response.json());
    return result.success ? result.data.status : null;
  } catch {
    return null;
  }
}

export function postActionDecision(id: string, decision: ActionDecision): Promise<Response> {
  return fetch(`/api/actions/${encodeURIComponent(id)}/decision`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(decision),
    signal: AbortSignal.timeout(DECISION_REQUEST_TIMEOUT_MS),
  });
}

export function postActionProposal(payload: unknown): Promise<Response> {
  return fetch("/api/actions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

const actionStatusResponseSchema = z.object({ status: actionStatusSchema });
