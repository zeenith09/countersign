import { z } from "zod";
import { getPrisma } from "../../../../lib/prisma";

export const runtime = "nodejs";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) {
    return Response.json({ message: "Invalid action." }, { status: 400 });
  }
  const action = await getPrisma().action.findUnique({
    where: { id },
    select: { status: true },
  });
  if (!action) return Response.json({ message: "Action not found." }, { status: 404 });
  return Response.json({ status: action.status }, { headers: { "Cache-Control": "no-store" } });
}
