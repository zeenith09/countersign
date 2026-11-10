import { z } from "zod";
import { seedActions } from "./seed-actions";
import { isSeedPayload } from "./seed-identity";

type StoredSeed = {
  id: string;
  agentId: string;
  agentReasoning: string;
  tool: string;
  parameters: unknown;
  policyRuleMatched: string | null;
};

export async function submitSeedActions(
  existing: StoredSeed[],
  findById: (id: string) => Promise<StoredSeed | null>,
  gatewayUrl: string,
  target: string,
): Promise<void> {
  for (const action of existing) {
    if (!isSeedPayload(action) || !action.policyRuleMatched) {
      throw new Error(`Seed action ${action.id} conflicts or has not been assessed; no records were changed.`);
    }
  }
  const existingIds = new Set(existing.map((action) => action.id));
  for (const action of seedActions) {
    if (existingIds.has(action.id)) {
      console.log(`Skipping existing seed action ${action.id}.`);
      continue;
    }
    const response = await fetch(gatewayUrl, {
      method: "POST",
      headers: { "content-type": "application/json", "x-seed-database-target": target },
      body: JSON.stringify(action),
    });
    if (response.status === 409) {
      const stored = await findById(action.id);
      if (stored && isSeedPayload(stored) && stored.policyRuleMatched) {
        console.log(`Skipping existing seed action ${action.id}.`);
        continue;
      }
    }
    if (response.status !== 201 && response.status !== 403) {
      throw new Error(`Gateway rejected seed action ${action.id} (HTTP ${response.status}): ${await response.text()}`);
    }
    const decision = z.object({
      actionId: z.literal(action.id),
      outcome: z.enum(["allow", "needs_approval", "block"]),
      ruleId: z.string().min(1),
      status: z.enum(["auto_allowed", "pending", "blocked"]),
    }).parse(await response.json());
    if ((response.status === 403) !== (decision.outcome === "block") ||
        (decision.outcome === "allow" && decision.status !== "auto_allowed") ||
        (decision.outcome === "needs_approval" && decision.status !== "pending") ||
        (decision.outcome === "block" && decision.status !== "blocked")) {
      throw new Error(`Gateway returned an inconsistent decision for ${action.id}.`);
    }
    console.log(`Submitted ${action.id}: ${decision.status} (${decision.ruleId}).`);
  }
}
