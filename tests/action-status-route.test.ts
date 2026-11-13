import { beforeEach, describe, expect, it, vi } from "vitest";

const { findUnique } = vi.hoisted(() => ({ findUnique: vi.fn() }));
vi.mock("../src/lib/prisma", () => ({
  getPrisma: () => ({ action: { findUnique } }),
}));

import { GET } from "../src/app/api/actions/[id]/route";

describe("action status route", () => {
  beforeEach(() => findUnique.mockReset());

  it("rejects an invalid action ID without querying the database", async () => {
    const response = await GET(new Request("http://localhost"), {
      params: Promise.resolve({ id: "not-a-uuid" }),
    });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ message: "Invalid action." });
    expect(findUnique).not.toHaveBeenCalled();
  });

  it("returns not found when the action does not exist", async () => {
    findUnique.mockResolvedValueOnce(null);
    const response = await GET(new Request("http://localhost"), {
      params: Promise.resolve({ id: "c076fb00-26d9-4dfd-9f31-000000000001" }),
    });
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ message: "Action not found." });
  });

  it("reads only the status for the requested action without caching", async () => {
    const id = "c076fb00-26d9-4dfd-9f31-000000000001";
    findUnique.mockResolvedValueOnce({ status: "denied" });
    const response = await GET(new Request("http://localhost"), { params: Promise.resolve({ id }) });
    expect(findUnique).toHaveBeenCalledWith({ where: { id }, select: { status: true } });
    expect(await response.json()).toEqual({ status: "denied" });
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });
});
