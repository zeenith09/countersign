import "dotenv/config";
import { GoogleGenAI } from "@google/genai";
import { z } from "zod";
import { readEnv } from "../src/lib/config/env.mjs";
import {
  deleteParameters,
  emailParameters,
  MAX_AGENT_REASONING_LENGTH,
  refundParameters,
} from "../src/lib/tools/parameters";

const MAX_PROPOSALS_PER_RUN = 5;
const MAX_MODEL_CALLS_PER_RUN = 1;
const proposal = z.discriminatedUnion("tool", [
  z.object({ tool: z.literal("issue_refund"), parameters: refundParameters }),
  z.object({ tool: z.literal("send_email"), parameters: emailParameters }),
  z.object({ tool: z.literal("delete_record"), parameters: deleteParameters }),
]).and(z.object({
  agentReasoning: z.string().min(1).max(MAX_AGENT_REASONING_LENGTH),
}));

async function main() {
  const GEMINI_API_KEY = readEnv("GEMINI_API_KEY");
  const GEMINI_MODEL = readEnv("GEMINI_MODEL");
  const DEMO_GATEWAY_URL = readEnv("DEMO_GATEWAY_URL");
  if (!GEMINI_API_KEY || !GEMINI_MODEL || !DEMO_GATEWAY_URL) {
    throw new Error("Set GEMINI_API_KEY, GEMINI_MODEL, and DEMO_GATEWAY_URL before running the demo.");
  }
  const client = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
  let modelCalls = 0;
  if (modelCalls >= MAX_MODEL_CALLS_PER_RUN) {
    throw new Error(`The demo agent may make at most ${MAX_MODEL_CALLS_PER_RUN} model call per run.`);
  }
  modelCalls += 1;
  const response = await client.models.generateContent({
    model: GEMINI_MODEL,
    contents: `Generate five fictional support action proposals as a JSON array.
Each item has tool, parameters, and agentReasoning. Use only these tools:
issue_refund: amount (number in USD), currency, orderId;
send_email: to, subject, body;
delete_record: recordId.
Include a $750 refund, a smaller refund, an email to customer@example.com,
an email to support@countersign.example, and a request to delete a duplicate record.
Use fictional data only. Do not decide whether an action is allowed.`,
    config: { responseMimeType: "application/json" },
  });
  if (!response.text) throw new Error("The model returned no proposals.");
  const actions = z.array(proposal)
    .max(MAX_PROPOSALS_PER_RUN)
    .length(MAX_PROPOSALS_PER_RUN)
    .parse(JSON.parse(response.text));
  if (!actions.some((a) => a.tool === "issue_refund" && a.parameters.amount === 750) ||
      !actions.some((a) => a.tool === "send_email" && a.parameters.to === "customer@example.com") ||
      !actions.some((a) => a.tool === "delete_record")) {
    throw new Error("The model omitted required demo scenarios; no actions were submitted.");
  }
  for (const action of actions) {
    const result = await fetch(DEMO_GATEWAY_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ agentId: "demo-agent", ...action }),
    });
    const body: unknown = await result.json();
    const decision = z.object({
      actionId: z.string(), outcome: z.enum(["allow", "needs_approval", "block"]),
      ruleId: z.string(), status: z.string(),
    }).safeParse(body);
    if (!decision.success || (result.status !== 201 && !(result.status === 403 && decision.data.outcome === "block"))) {
      throw new Error(`Gateway rejected the submission (HTTP ${result.status}).`);
    }
    console.log(action.tool, decision.data);
  }
}

main().catch((error: unknown) => {
  console.error("Demo agent failed:", error instanceof Error ? error.name : "Unknown error.");
  process.exitCode = 1;
});
