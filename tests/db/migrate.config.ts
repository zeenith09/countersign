import { defineConfig } from "prisma/config";
import { testConnection } from "./test-target";

export default defineConfig({
  schema: "../../prisma/schema.prisma",
  migrations: { path: "../../prisma/migrations" },
  datasource: { url: testConnection({ direct: true }) },
});
