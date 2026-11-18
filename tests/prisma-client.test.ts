import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  PrismaClient: vi.fn(),
  PrismaPg: vi.fn(),
  adapter: { kind: "test-adapter" },
  client: { kind: "test-client" },
}));

vi.mock("@prisma/adapter-pg", () => ({
  PrismaPg: class {
    constructor(...args: unknown[]) {
      mocks.PrismaPg(...args);
      return mocks.adapter;
    }
  },
}));
vi.mock("../src/generated/prisma/client", () => ({
  PrismaClient: class {
    constructor(...args: unknown[]) {
      mocks.PrismaClient(...args);
      return mocks.client;
    }
  },
}));

describe("getPrisma", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.resetAllMocks();
    vi.unstubAllEnvs();
    Reflect.deleteProperty(globalThis, "prisma");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    Reflect.deleteProperty(globalThis, "prisma");
  });

  it("throws when DATABASE_URL is missing", async () => {
    vi.stubEnv("DATABASE_URL", "");
    const { getPrisma } = await import("../src/lib/prisma");

    expect(() => getPrisma()).toThrow("DATABASE_URL is not configured.");
    expect(mocks.PrismaPg).not.toHaveBeenCalled();
    expect(mocks.PrismaClient).not.toHaveBeenCalled();
  });

  it("creates one client and reuses it", async () => {
    vi.stubEnv("DATABASE_URL", "postgresql://test.invalid/db");
    const { getPrisma } = await import("../src/lib/prisma");

    expect(getPrisma()).toBe(mocks.client);
    expect(getPrisma()).toBe(mocks.client);
    expect(mocks.PrismaPg).toHaveBeenCalledExactlyOnceWith(
      { connectionString: "postgresql://test.invalid/db" },
      { schema: "public" },
    );
    expect(mocks.PrismaClient).toHaveBeenCalledExactlyOnceWith({ adapter: mocks.adapter });
  });
});
