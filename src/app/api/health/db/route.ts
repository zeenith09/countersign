import { getPrisma } from "../../../../lib/prisma";

export const runtime = "nodejs";

export async function GET(): Promise<Response> {
  try {
    await getPrisma().$queryRaw`SELECT 1`;
    return Response.json({ status: "ok" }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    console.error("Database health check failed.");
    return Response.json(
      { status: "unavailable" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
