import { handleActionSubmission } from "../../../lib/actions/submit-action";

export const runtime = "nodejs";

export async function POST(request: Request): Promise<Response> {
  return handleActionSubmission(request);
}
