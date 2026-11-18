import { getPrisma } from "../../../lib/prisma";
import { getConsoleReadModel } from "../../../lib/console/read-model";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const prisma = getPrisma();
  try {
    const snapshot = await getConsoleReadModel(prisma);
    return Response.json(snapshot, { headers: { "Cache-Control": "no-store" } });
  } catch {
    console.error("Failed to load console snapshot.");
    return Response.json({ message: "Console data could not be loaded." }, { status: 500 });
  }
}
