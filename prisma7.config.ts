import "dotenv/config";
import { defineConfig, env } from "prisma/config";
import { readEnv } from "./src/lib/config/env.mjs";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "jiti prisma/seed.ts",
  },
  datasource: {
    url: env("DIRECT_URL"),
    ...(readEnv("SHADOW_DIRECT_URL")
      ? { shadowDatabaseUrl: readEnv("SHADOW_DIRECT_URL") }
      : {}),
  },
});
