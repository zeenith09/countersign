import { afterEach, describe, expect, it, vi } from "vitest";
import { testConnection } from "./test-target";

describe("test database target guard", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("requires a test URL without falling back to other database variables", () => {
    vi.stubEnv("DATABASE_URL_TEST", "");
    vi.stubEnv("DATABASE_URL", "postgresql://user@ep-lively-heart-b54javzi.us-east-2.aws.neon.tech/db");
    expect(() => testConnection()).toThrow("DATABASE_URL_TEST is required.");
  });

  it("rejects production, spike, and unconfigured local targets", () => {
    vi.stubEnv("CI", "false");
    for (const host of ["ep-odd-boat-b5tqlzho.us-east-2.aws.neon.tech", "ep-winter-wave-b5uo4p26.us-east-2.aws.neon.tech", "127.0.0.1"]) {
      vi.stubEnv("DATABASE_URL_TEST", `postgresql://user@${host}:5432/countersign_test`);
      expect(() => testConnection()).toThrow("DATABASE_URL_TEST does not target the configured test endpoint.");
    }
  });

  it("allows only the configured local service in CI", () => {
    vi.stubEnv("CI", "true");
    vi.stubEnv("DATABASE_URL_TEST", "postgresql://user@127.0.0.1:5432/countersign_test");
    expect(testConnection()).toBeDefined();
    vi.stubEnv("DATABASE_URL_TEST", "postgresql://user@127.0.0.1:5432/other");
    expect(() => testConnection()).toThrow("DATABASE_URL_TEST does not target the configured test endpoint.");
  });

  it("requires the direct test endpoint for migrations", () => {
    vi.stubEnv("DATABASE_URL_TEST", "postgresql://user@ep-lively-heart-b54javzi-pooler.us-east-2.aws.neon.tech/db");
    expect(testConnection()).toBeDefined();
    expect(() => testConnection({ direct: true })).toThrow("DATABASE_URL_TEST must use the direct endpoint for migrations.");
  });
});
