import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ESLint } from "eslint";

const root = fileURLToPath(new URL("../", import.meta.url));
const eslint = new ESLint({ cwd: root });
const fixtures = [
  {
    file: "policy-retrieval.txt",
    lintPath: "src/lib/policy/lint-boundary.fixture.ts",
    ruleId: "no-restricted-imports",
  },
  {
    file: "gateway-explanation.txt",
    lintPath: "src/lib/actions/lint-boundary.fixture.ts",
    ruleId: "no-restricted-imports",
  },
  {
    file: "core-model-sdk.txt",
    lintPath: "src/lib/policy/lint-boundary.fixture.ts",
    ruleId: "no-restricted-imports",
  },
  {
    file: "non-demo-model-sdk.txt",
    lintPath: "src/app/lint-boundary.fixture.ts",
    ruleId: "no-restricted-imports",
  },
  {
    file: "mocked-tool-network-import.txt",
    lintPath: "src/lib/tools/lint-boundary.fixture.ts",
    ruleId: "no-restricted-imports",
  },
  {
    file: "mocked-tool-fetch.txt",
    lintPath: "src/lib/tools/lint-boundary.fixture.ts",
    ruleId: "no-restricted-globals",
  },
  {
    file: "mocked-tool-property-fetch.txt",
    lintPath: "src/lib/tools/lint-boundary.fixture.ts",
    ruleId: "no-restricted-syntax",
  },
  {
    file: "environment-outside-config.txt",
    lintPath: "src/lib/actions/lint-boundary.fixture.ts",
    ruleId: "no-restricted-syntax",
  },
  ...["src/lib/actions/decide-action.ts", "src/lib/audit/chain.ts", "src/lib/tools/lint-boundary.fixture.ts"].map((lintPath) => ({
    file: "environment-outside-config.txt", lintPath, ruleId: "no-restricted-syntax",
    message: "Read environment variables only through src/lib/config/env.mjs.", lines: [1],
  })),
  ...["src/lib/actions/decide-action.ts", "src/lib/audit/chain.ts", "src/lib/tools/lint-boundary.fixture.ts", "src/lib/config/env.mjs"].flatMap((lintPath) => [
    {
      file: "transaction-isolation.txt", lintPath, ruleId: "no-restricted-syntax",
      message: "Do not set isolationLevel; transactions must stay on READ COMMITTED.", lines: [1, 2],
    },
    {
      file: "session-advisory-locks.txt", lintPath, ruleId: "no-restricted-syntax",
      message: "Use transaction-level advisory locks, not session-level advisory locks.", lines: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
    },
    {
      file: "transaction-array.txt", lintPath, ruleId: "no-restricted-syntax",
      message: "Use an interactive $transaction instead of the array form.", lines: [1, 2],
    },
    { file: "transaction-allowed.txt", lintPath, ruleId: "no-restricted-syntax", allowed: true },
  ]),
  ...["src/lib/actions/decide-action.ts", "src/app/api/actions/[id]/decision/route.ts"].map((lintPath) => ({
    file: "decision-action-update.txt", lintPath, ruleId: "no-restricted-syntax",
    message: "Use a conditional action.updateMany for decisions.", lines: [1, 2, 3, 4],
  })),
  {
    file: "audit-stringify.txt", lintPath: "src/lib/audit/chain.ts", ruleId: "no-restricted-syntax",
    message: "Use canonicalJson for audit hashing.", lines: [1, 2],
  },
];

let failed = false;
for (const fixture of fixtures) {
  const fixturePath = new URL(`../tests/fixtures/lint-boundaries/${fixture.file}`, import.meta.url);
  const source = await readFile(fixturePath, "utf8");
  const [result] = await eslint.lintText(source, {
    filePath: path.join(root, fixture.lintPath),
  });
  const messages = result.messages.filter((message) =>
    message.ruleId === fixture.ruleId && (!fixture.message || message.message === fixture.message),
  );
  const rejected = fixture.lines
    ? fixture.lines.every((line) => messages.some((message) => message.line === line))
    : messages.length > 0;
  const valid = fixture.allowed ? !rejected : rejected;

  if (!valid || result.fatalErrorCount) {
    console.error(`Lint boundary fixture failed: ${fixture.file} at ${fixture.lintPath} (${fixture.ruleId})`);
    for (const message of result.messages) console.error(`  ${message.line}:${message.column} ${message.ruleId ?? "parse"} ${message.message}`);
    failed = true;
  } else {
    console.log(`Lint boundary fixture ${fixture.allowed ? "accepted" : "rejected"}: ${fixture.file} at ${fixture.lintPath}`);
  }
}

if (failed) {
  process.exitCode = 1;
} else {
  console.log("All lint boundary fixtures behaved as expected.");
}
