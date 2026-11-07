import { beforeEach, describe, expect, it, vi } from "vitest";

const { getPrisma, queryRaw } = vi.hoisted(() => ({
  getPrisma: vi.fn(),
  queryRaw: vi.fn(),
}));

vi.mock("../src/lib/prisma", () => ({ getPrisma }));

import { GET, runtime } from "../src/app/api/health/db/route";

describe("database health route response handling (simulated client)", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    getPrisma.mockReturnValue({ $queryRaw: queryRaw });
  });

  it("returns 200 after executing SELECT 1", async () => {
    queryRaw.mockResolvedValue([{ "?column?": 1 }]);

    const response = await GET();

    expect(runtime).toBe("nodejs");
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(queryRaw).toHaveBeenCalledOnce();
    expect(queryRaw.mock.calls[0][0][0]).toBe("SELECT 1");
  });

  it("returns 503 without exposing a query error", async () => {
    const detail = "sensitive database error";
    queryRaw.mockRejectedValue(new Error(detail));
    const log = vi.spyOn(console, "error").mockImplementation(() => {});

    try {
      const response = await GET();

      expect(response.status).toBe(503);
      expect(response.headers.get("cache-control")).toBe("no-store");
      expect(await response.text()).not.toContain(detail);
      expect(log).toHaveBeenCalledOnce();
      expect(log.mock.calls[0].join(" ")).not.toContain(detail);
    } finally {
      log.mockRestore();
    }
  });

  it("returns 503 when client initialization fails", async () => {
    getPrisma.mockImplementation(() => {
      throw new Error("sensitive initialization error");
    });
    const log = vi.spyOn(console, "error").mockImplementation(() => {});

    try {
      const response = await GET();

      expect(response.status).toBe(503);
      expect(await response.text()).not.toContain("sensitive initialization error");
      expect(queryRaw).not.toHaveBeenCalled();
    } finally {
      log.mockRestore();
    }
  });
});
