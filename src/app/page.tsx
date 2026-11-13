import { connection } from "next/server";
import { getPrisma } from "../lib/prisma";
import { policy } from "../lib/policy/policy";
import { formatAge } from "./queue-display";
import { DecisionQueue } from "./decision-queue";
import { summarizeAction, summarizeActionParts } from "./action-summary";

async function getQueueSnapshot() {
  const actions = await getPrisma().action.findMany({
    where: {
      status: "pending",
    },
    select: { id: true, tool: true, parameters: true, agentReasoning: true, createdAt: true, policyRuleMatched: true },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });
  return { actions, now: Date.now() };
}

export default async function Home() {
  await connection();

  const { actions, now } = await getQueueSnapshot();
  return (
    <main className="mx-auto w-full max-w-4xl px-6 py-12">
      <h1 className="text-3xl font-semibold">Approval queue</h1>
      <p className="mt-2">Actions awaiting approval, oldest first.</p>

      <section aria-labelledby="queue-heading" className="mt-8">
        <h2 id="queue-heading" className="text-xl font-semibold">
          Pending actions
        </h2>
        {actions.length === 0 ? (
          <p className="mt-4">No pending actions found.</p>
        ) : (
          <DecisionQueue
            actions={actions.map((action) => ({
              id: action.id,
              tool: action.tool,
              parameters: action.parameters,
              summary: summarizeAction(action.tool, action.parameters),
              summaryParts: summarizeActionParts(action.tool, action.parameters),
              agentReasoning: action.agentReasoning,
              createdAt: action.createdAt.toISOString(),
              age: formatAge(action.createdAt, now),
              policyRuleMatched: action.policyRuleMatched,
              policyRuleDescription: policy.rules.find(
                (rule) => rule.id === action.policyRuleMatched,
              )?.description ?? null,
            }))}
          />
        )}
      </section>
    </main>
  );
}
