import { describe, expect, it, vi } from "vitest";

const { findUnique } = vi.hoisted(() => ({ findUnique: vi.fn() }));
vi.mock("../src/lib/prisma", () => ({
  getPrisma: () => ({ action: { findUnique } }),
}));

import { GET } from "../src/app/api/actions/[id]/route";

describe("action status route", () => {
  it("reads only the status for the requested action without caching", async () => {
    const id = "c076fb00-26d9-4dfd-9f31-000000000001";
    findUnique.mockResolvedValueOnce({ status: "denied" });
    const response = await GET(new Request("http://localhost"), { params: Promise.resolve({ id }) });
    expect(findUnique).toHaveBeenCalledWith({ where: { id }, select: { status: true } });
    expect(await response.json()).toEqual({ status: "denied" });
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });
});
