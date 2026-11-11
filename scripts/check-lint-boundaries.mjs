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
];

let failed = false;
for (const fixture of fixtures) {
  const fixturePath = new URL(`../tests/fixtures/lint-boundaries/${fixture.file}`, import.meta.url);
  const source = await readFile(fixturePath, "utf8");
  const [result] = await eslint.lintText(source, {
    filePath: path.join(root, fixture.lintPath),
  });
  const rejected = result.messages.some((message) => message.ruleId === fixture.ruleId);

  if (!rejected) {
    console.error(`Lint boundary fixture passed unexpectedly: ${fixture.file} (${fixture.ruleId})`);
    failed = true;
  } else {
    console.log(`Lint boundary fixture rejected: ${fixture.file}`);
  }
}

if (failed) {
  process.exitCode = 1;
} else {
  console.log("All lint boundary fixtures were rejected as expected.");
}
