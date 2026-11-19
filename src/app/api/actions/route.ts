import { handleActionSubmission } from "../../../lib/actions/submit-action";
import { isAllowedOrigin } from "../../../lib/config/env.mjs";

export const runtime = "nodejs";

export async function POST(request: Request): Promise<Response> {
  if (!isAllowedOrigin(request.headers.get("origin"))) {
    return Response.json({ message: "Cross-origin requests are not allowed." }, { status: 403 });
  }
  return handleActionSubmission(request);
}
