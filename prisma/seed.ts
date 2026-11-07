import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { seedActions } from "./seed-actions";

async function main() {
  const connectionString = process.env.SEED_DATABASE_URL;
  if (!connectionString) {
    throw new Error("SEED_DATABASE_URL must point to the intended development database.");
  }

  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString }, { schema: "public" }),
  });

  try {
    const result = await prisma.action.createMany({
      data: [...seedActions],
      skipDuplicates: true,
    });
    console.log(`Inserted ${result.count} seed actions; existing seed IDs were left unchanged.`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error("Failed to seed actions:", error);
  process.exitCode = 1;
});
