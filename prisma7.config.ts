import "dotenv/config";
import { defineConfig, env } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "jiti prisma/seed.ts",
  },
  datasource: {
    url: env("DIRECT_URL"),
    ...(process.env.SHADOW_DIRECT_URL
      ? { shadowDatabaseUrl: process.env.SHADOW_DIRECT_URL }
      : {}),
  },
});
