import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { readEnv } from "../src/lib/config/env.mjs";
import { PrismaClient } from "../src/generated/prisma/client";
import { seedActions } from "./seed-actions";
import { databaseTarget } from "./seed-identity";
import { submitSeedActions } from "./seed-runner";

async function main() {
  const connectionString = readEnv("SEED_DATABASE_URL");
  const gatewayUrl = readEnv("SEED_GATEWAY_URL");
  if (!connectionString || !gatewayUrl) {
    throw new Error("Set SEED_DATABASE_URL and SEED_GATEWAY_URL for the intended development database and gateway.");
  }
  const target = databaseTarget(connectionString);
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }, { schema: "public" }) });
  try {
    const existing = await prisma.action.findMany({ where: { id: { in: seedActions.map((action) => action.id) } } });
    await submitSeedActions(existing, (id) => prisma.action.findUnique({ where: { id } }), gatewayUrl, target);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error("Failed to seed actions:", error);
  process.exitCode = 1;
});
