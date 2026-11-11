import { PrismaPg } from "@prisma/adapter-pg";
import { readEnv } from "../config/env.mjs";
import { PrismaClient } from "../../generated/prisma/client";

const globalForPrisma = globalThis as typeof globalThis & {
  prisma?: PrismaClient;
};

export function getPrisma(): PrismaClient {
  if (!globalForPrisma.prisma) {
    const connectionString = readEnv("DATABASE_URL");
    if (!connectionString) {
      throw new Error("DATABASE_URL is not configured.");
    }

    globalForPrisma.prisma = new PrismaClient({
      adapter: new PrismaPg({ connectionString }, { schema: "public" }),
    });
  }

  return globalForPrisma.prisma;
}
