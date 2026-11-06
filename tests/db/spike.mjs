import { createServer } from "vite";

const server = await createServer({
  configFile: false,
  server: { middlewareMode: true },
  appType: "custom",
});

try {
  const { runSpike } = await server.ssrLoadModule("/tests/db/standalone.ts");
  await runSpike();
} finally {
  await server.close();
}
