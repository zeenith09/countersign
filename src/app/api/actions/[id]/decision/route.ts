import { z } from "zod";
import { decideAction } from "../../../../../lib/actions/decide-action";
import { toolRegistry } from "../../../../../lib/tools";

export const runtime = "nodejs";

const bodySchema = z.object({
  reviewer: z.string().trim().min(1),
  outcome: z.enum(["approved", "denied"]),
  reason: z.string().trim().min(1),
});

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) {
    return Response.json({ message: "Invalid decision." }, { status: 400 });
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch (error) {
    if (error instanceof SyntaxError) {
      return Response.json({ message: "Invalid decision." }, { status: 400 });
    }
    throw error;
  }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({
      message: "Enter a reviewer and reason, and choose approve or deny.",
    }, { status: 400 });
  }

  const { reviewer, outcome, reason } = parsed.data;
  const result = await decideAction(id, reviewer, outcome, reason);
  if (result.kind === "not_found") return Response.json({ message: "Action not found." }, { status: 404 });
  if (result.kind === "conflict") return Response.json({ message: "Action is no longer pending." }, { status: 409 });
  if (result.kind === "busy") return Response.json({ message: "Database is busy." }, { status: 503 });
  if (result.outcome === "approved") {
    if (!Object.prototype.hasOwnProperty.call(toolRegistry, result.tool)) {
      throw new Error("Approved action has an unsupported tool.");
    }
    const tool = result.tool as keyof typeof toolRegistry;
    toolRegistry[tool](id, result.parameters);
  }
  return Response.json({ actionId: id, outcome: result.outcome });
}
