import { readEnv } from "../../src/lib/config/env.mjs";

const expectedEndpoint = "ep-lively-heart-b54javzi";

export function testConnection(options: { direct?: boolean } = {}): string {
  const value = readEnv("DATABASE_URL_TEST");
  if (!value) throw new Error("DATABASE_URL_TEST is required.");
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("DATABASE_URL_TEST must be a valid Postgres connection URL.");
  }
  if (url.protocol !== "postgres:" && url.protocol !== "postgresql:") {
    throw new Error("DATABASE_URL_TEST must be a Postgres connection URL.");
  }
  const hostname = url.hostname.toLowerCase();
  if (readEnv("CI") === "true" && hostname === "127.0.0.1" && url.port === "5432" && url.pathname === "/countersign_test") {
    return value;
  }
  if (!hostname.endsWith(".neon.tech") || hostname.split(".")[0].replace(/-pooler$/, "") !== expectedEndpoint) {
    throw new Error("DATABASE_URL_TEST does not target the configured test endpoint.");
  }
  if (options.direct && hostname.split(".")[0].endsWith("-pooler")) {
    throw new Error("DATABASE_URL_TEST must use the direct endpoint for migrations.");
  }
  return value;
}
