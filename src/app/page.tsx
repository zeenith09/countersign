import { connection } from "next/server";
import { seedActions } from "../../prisma/seed-actions";
import { getPrisma } from "../lib/prisma";
import { formatAge } from "./queue-display";
import { QueueList } from "./queue-list";

async function getQueueSnapshot() {
  const actions = await getPrisma().action.findMany({
    where: {
      id: { in: seedActions.map((action) => action.id) },
      status: "pending",
    },
    select: { id: true, tool: true, parameters: true, agentReasoning: true, createdAt: true },
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
      <p className="mt-2">Seeded pending actions, oldest first.</p>

      <section aria-labelledby="queue-heading" className="mt-8">
        <h2 id="queue-heading" className="text-xl font-semibold">
          Pending actions
        </h2>
        {actions.length === 0 ? (
          <p className="mt-4">No seeded pending actions found.</p>
        ) : (
          <QueueList
            actions={actions.map((action) => ({
              id: action.id,
              tool: action.tool,
              parameters: action.parameters,
              summary: action.agentReasoning,
              createdAt: action.createdAt.toISOString(),
              age: formatAge(action.createdAt, now),
            }))}
          />
        )}
      </section>
    </main>
  );
}
