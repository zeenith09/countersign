import { z } from "zod";
import { decideAction } from "../../../../../lib/actions/decide-action";
import { toolRegistry } from "../../../../../lib/tools";
import {
  actionParametersSchema,
  MAX_AGENT_REASONING_LENGTH,
} from "../../../../../lib/tools/parameters";

export const runtime = "nodejs";

const bodySchema = z.object({
  reviewer: z.string().trim().min(1).max(100),
  outcome: z.enum(["approved", "denied"]),
  reason: z.string().trim().min(1).max(MAX_AGENT_REASONING_LENGTH),
  editedParameters: actionParametersSchema.optional(),
}).refine((body) => body.outcome === "approved" || body.editedParameters === undefined);

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
    const issue = parsed.error.issues[0];
    return Response.json({
      message: issue
        ? `${issue.path.join(".") ? `${issue.path.join(".")}: ` : ""}${issue.message}`
        :
        "Enter a reviewer and reason, and choose approve or deny.",
    }, { status: 400 });
  }

  const { reviewer, outcome, reason, editedParameters } = parsed.data;
  const result = editedParameters === undefined
    ? await decideAction(id, reviewer, outcome, reason)
    : await decideAction(id, reviewer, outcome, reason, undefined, editedParameters);
  if (result.kind === "invalid_edit") return Response.json({ message: "Edited parameters are invalid for this action." }, { status: 400 });
  if (result.kind === "not_found") return Response.json({ message: "Action not found." }, { status: 404 });
  if (result.kind === "conflict") return Response.json({ message: "Action is no longer pending." }, { status: 409 });
  if (result.kind === "busy") return Response.json({ message: "Database is busy." }, { status: 503 });
  if (result.outcome === "approved") {
    if (!Object.prototype.hasOwnProperty.call(toolRegistry, result.tool)) {
      throw new Error("Approved action has an unsupported tool.");
    }
    const tool = result.tool as keyof typeof toolRegistry;
    toolRegistry[tool](id);
  }
  return Response.json({
    actionId: id,
    outcome: result.outcome,
    message: result.outcome === "approved" ? "Action approved." : "Action denied.",
  });
}
