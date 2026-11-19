import { z } from "zod";
import { decideAction } from "../../../../../lib/actions/decide-action";
import { executeMockedTool } from "../../../../../lib/actions/execute-mocked-tool";
import { toolRegistry } from "../../../../../lib/tools";
import { isAllowedOrigin } from "../../../../../lib/config/env.mjs";
import {
  HttpError,
  MAX_REQUEST_BODY_BYTES,
  readJsonLimited,
} from "../../../../../lib/http/read-json-limited";
import {
  MAX_AGENT_REASONING_LENGTH,
} from "../../../../../lib/tools/parameters";

export const runtime = "nodejs";

const bodySchema = z.object({
  reviewer: z.string().trim().min(1).max(100),
  outcome: z.enum(["approved", "denied"]),
  reason: z.string().trim().min(1).max(MAX_AGENT_REASONING_LENGTH),
});

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  if (!isAllowedOrigin(request.headers.get("origin"))) {
    return Response.json({ message: "Cross-origin requests are not allowed." }, { status: 403 });
  }

  const { id } = await params;
  if (!z.uuid().safeParse(id).success) {
    return Response.json({ message: "Invalid decision." }, { status: 400 });
  }
  let body: unknown;
  try {
    body = await readJsonLimited(request, MAX_REQUEST_BODY_BYTES);
  } catch (error) {
    if (error instanceof HttpError) return Response.json({ message: error.message }, { status: error.status });
    throw error;
  }
  if (
    typeof body === "object"
    && body !== null
    && Object.prototype.hasOwnProperty.call(body, "editedParameters")
  ) {
    return Response.json({ message: "editedParameters is not supported." }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    // Zod's failed safeParse result always contains at least one issue.
    const issue = parsed.error.issues[0]!;
    return Response.json({
      message: `${issue.path.join(".") ? `${issue.path.join(".")}: ` : ""}${issue.message}`,
    }, { status: 400 });
  }

  const { reviewer, outcome, reason } = parsed.data;
  const result = await decideAction(id, reviewer, outcome, reason);
  if (result.kind === "invalid_edit") return Response.json({ message: "Edited parameters are invalid for this action." }, { status: 400 });
  if (result.kind === "not_found") return Response.json({ message: "Action not found." }, { status: 404 });
  if (result.kind === "conflict") return Response.json({ message: "Action is no longer pending." }, { status: 409 });
  if (result.kind === "busy") return Response.json({ message: "Database is busy." }, { status: 503 });
  if (result.outcome === "approved") {
    if (!Object.prototype.hasOwnProperty.call(toolRegistry, result.tool)) {
      throw new Error("Approved action has an unsupported tool.");
    }
    const execution = await executeMockedTool(id, result.tool, result.parameters);
    if (execution.kind === "invalid_parameters") {
      return Response.json({
        actionId: id,
        message: "Approved action parameters are invalid; tool was not run.",
      }, { status: 500 });
    }
  }
  return Response.json({
    actionId: id,
    outcome: result.outcome,
    message: result.outcome === "approved" ? "Action approved." : "Action denied.",
  });
}
