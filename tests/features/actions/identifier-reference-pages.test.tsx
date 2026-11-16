import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

const { connection, findMany, notFound } = vi.hoisted(() => ({
  connection: vi.fn(),
  findMany: vi.fn(),
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
}));

vi.mock("next/server", () => ({ connection }));
vi.mock("next/navigation", () => ({ notFound }));
vi.mock("../../../src/lib/prisma", () => ({
  getPrisma: () => ({ action: { findMany } }),
}));

import OrderPage from "../../../src/app/orders/[id]/page";
import RecordPage from "../../../src/app/records/[id]/page";

describe("identifier reference pages", () => {
  afterEach(() => vi.clearAllMocks());

  it("renders the exact order page with matching actions and a console link", async () => {
    findMany.mockResolvedValue([{
      id: "action-1",
      tool: "issue_refund",
      parameters: { orderId: "ORDER-1005", amount: 5000, currency: "USD" },
      status: "pending",
    }]);

    const markup = renderToStaticMarkup(await OrderPage({ params: Promise.resolve({ id: "ORDER-1005" }) }));
    expect(markup).toContain("<h1");
    expect(markup).toContain("<h1 class=\"text-3xl font-semibold\">Order ORDER-1005</h1>");
    expect(markup).toContain("This read-only page displays mock data.");
    expect(markup).toContain('href="/"');
    expect(markup).toContain("Open approval console");
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { tool: "issue_refund" } }));
  });

  it("renders the exact record page with matching actions and a console link", async () => {
    findMany.mockResolvedValue([{
      id: "action-2",
      tool: "delete_record",
      parameters: { recordId: "RECORD-1006" },
      status: "pending",
    }]);

    const markup = renderToStaticMarkup(await RecordPage({ params: Promise.resolve({ id: "RECORD-1006" }) }));
    expect(markup).toContain("<h1 class=\"text-3xl font-semibold\">Record RECORD-1006</h1>");
    expect(markup).toContain("The agent wants to delete record RECORD-1006.");
    expect(markup).toContain('href="/"');
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { tool: "delete_record" } }));
  });

  it.each([
    ["order", () => OrderPage({ params: Promise.resolve({ id: "ORDER-1005/../x" }) })],
    ["record", () => RecordPage({ params: Promise.resolve({ id: "javascript:alert(1)" }) })],
  ])("returns not-found for an invalid %s identifier", async (_kind, render) => {
    await expect(render()).rejects.toThrow("NEXT_NOT_FOUND");
    expect(findMany).not.toHaveBeenCalled();
  });

  it("returns not-found when no action references the valid identifier", async () => {
    findMany.mockResolvedValue([]);
    await expect(OrderPage({ params: Promise.resolve({ id: "ORDER-9999" }) })).rejects.toThrow("NEXT_NOT_FOUND");
  });
});
