import { isDeepStrictEqual } from "node:util";
import { createHash } from "node:crypto";
import { seedActions } from "./seed-actions";

type SeedPayload = {
  id: string;
  agentId: string;
  tool: string;
  parameters: unknown;
  agentReasoning: string;
};

export function isSeedPayload(action: SeedPayload): boolean {
  const expected = seedActions.find((seed) => seed.id === action.id);
  return expected !== undefined &&
    action.agentId === expected.agentId &&
    action.tool === expected.tool &&
    action.agentReasoning === expected.agentReasoning &&
    isDeepStrictEqual(action.parameters, expected.parameters);
}

export function databaseTarget(connectionString: string): string {
  const url = new URL(connectionString);
  if (!["postgres:", "postgresql:"].includes(url.protocol) || !url.hostname || url.pathname === "/") {
    throw new Error("A PostgreSQL database URL with a database name is required.");
  }
  const host = url.hostname.toLowerCase().replace(/-pooler(?=\.)/, "");
  return createHash("sha256").update(`${host}:${url.port || "5432"}${url.pathname}`).digest("hex");
}
