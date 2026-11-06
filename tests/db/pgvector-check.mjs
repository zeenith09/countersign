// Prerequisite check for the RAG stretch. Targets the isolated spike branch only.
// Run: RUN_DB_SPIKE=1 SPIKE_DIRECT_URL=<spike direct URL> node tests/db/pgvector-check.mjs
import pg from "pg";

function fail(message) {
  console.error(`FAIL: ${message}`);
  process.exit(1);
}

if (process.env.RUN_DB_SPIKE !== "1") fail("set RUN_DB_SPIKE=1 to opt in.");

const connectionString = process.env.SPIKE_DIRECT_URL;
if (!connectionString) fail("SPIKE_DIRECT_URL is not set.");

let hostname;
try {
  hostname = new URL(connectionString).hostname.toLowerCase();
} catch {
  fail("SPIKE_DIRECT_URL is not a valid URL.");
}
if (!hostname.endsWith(".neon.tech")) {
  fail("SPIKE_DIRECT_URL must use a Neon endpoint.");
}
const normalizedHostname = hostname.replace(/-pooler(?=\.)/, "");
const endpointId = normalizedHostname.split(".")[0];
if (endpointId !== "ep-winter-wave-b5uo4p26") {
  fail(`SPIKE_DIRECT_URL resolves to endpoint ${endpointId}; expected spike endpoint ep-winter-wave-b5uo4p26.`);
}
if (hostname.includes("-pooler.")) {
  fail("SPIKE_DIRECT_URL must be a direct (non-pooled) Neon host.");
}

const client = new pg.Client({ connectionString });
try {
  await client.connect();

  const available = await client.query(
    "SELECT name, default_version, installed_version FROM pg_available_extensions WHERE name = $1",
    ["vector"],
  );
  if (available.rows.length !== 1) fail("the vector extension is not available.");
  console.log("Catalog before enabling:", JSON.stringify(available.rows[0]));

  await client.query("CREATE EXTENSION IF NOT EXISTS vector");
  const installed = await client.query(
    "SELECT extname, extversion FROM pg_extension WHERE extname = $1",
    ["vector"],
  );
  if (installed.rows.length !== 1) fail("the vector extension is not installed.");
  console.log("Installed extension:", JSON.stringify(installed.rows[0]));

  const query = `SELECT label, embedding <-> '[1,0,0]'::vector AS distance
FROM (VALUES
  ('a', '[1,0,0]'::vector),
  ('b', '[0,1,0]'::vector),
  ('c', '[0,0,1]'::vector)
) AS v(label, embedding)
ORDER BY distance, label`;
  const result = await client.query(query);
  console.log("Similarity query:\n" + query);
  console.log("Similarity results:", JSON.stringify(result.rows));
  if (result.rows.length !== 3) fail("expected exactly three result rows.");
  if (result.rows[0].label !== "a" || Number(result.rows[0].distance) !== 0) {
    fail("the identical vector should be the nearest result.");
  }
  console.log("PASS");
} catch (error) {
  fail(`database error code ${error.code ?? "unknown"}`);
} finally {
  await client.end();
}
