import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { seedActions } from "../prisma/seed-actions";
import { AssessmentStatus, formatAge } from "../src/app/queue-display";

const { connection, findMany } = vi.hoisted(() => ({
  connection: vi.fn(),
  findMany: vi.fn(),
}));

vi.mock("next/server", () => ({ connection }));
vi.mock("../src/lib/prisma", () => ({
  getPrisma: () => ({ action: { findMany } }),
}));

import Home from "../src/app/page";

describe("approval queue", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it("requests only pending seed records ordered oldest first and displays their details", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T12:00:00Z"));
    findMany.mockResolvedValue([
      {
        id: seedActions[0].id,
        tool: seedActions[0].tool,
        parameters: seedActions[0].parameters,
        agentReasoning: seedActions[0].agentReasoning,
        createdAt: new Date("2026-01-01T10:00:00Z"),
      },
    ]);

    const markup = renderToStaticMarkup(await Home());

    expect(connection).toHaveBeenCalledOnce();
    expect(findMany).toHaveBeenCalledWith({
      where: {
        id: { in: seedActions.map((action) => action.id) },
        status: "pending",
      },
      select: { id: true, tool: true, parameters: true, agentReasoning: true, createdAt: true },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    });
    expect(markup).toContain(seedActions[0].tool);
    expect(markup).toContain(seedActions[0].agentReasoning);
    expect(markup).toContain("2 hours ago");
    expect(markup).toContain("Risk not assessed");
    expect(markup).toContain('aria-pressed="false"');
    expect(markup).toContain(`Select ${seedActions[0].tool}: ${seedActions[0].agentReasoning}`);
    expect(markup).not.toContain('class="truncate"');
  });

  it("supports the four assessment statuses as text", () => {
    expect(renderToStaticMarkup(<AssessmentStatus status="not_assessed" />)).toContain("Risk not assessed");
    expect(renderToStaticMarkup(<AssessmentStatus status="pending" />)).toContain("Assessment pending");
    expect(renderToStaticMarkup(<AssessmentStatus status="unavailable" />)).toContain("Risk assessment unavailable");
    expect(renderToStaticMarkup(<AssessmentStatus status="failed" />)).toContain("Assessment failed");
  });

  it("formats the requested relative age example", () => {
    expect(formatAge(new Date("2026-01-01T10:00:00Z"), Date.parse("2026-01-01T12:00:00Z"))).toBe("2 hours ago");
  });
});
