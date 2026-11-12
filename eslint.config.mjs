import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTypeScript from "eslint-config-next/typescript";

const sharedRestrictedImportPatterns = [
  {
    regex: "^(drizzle-orm|typeorm|sequelize|knex|mongoose|objection|bookshelf|waterline|@mikro-orm/)",
    message: "Use the project's Prisma ORM; do not add a second ORM.",
  },
  {
    regex: "^(bullmq|bull|bee-queue|agenda|pg-boss|graphile-worker|amqplib|amqp-connection-manager|kafkajs|p-queue|piscina|bree|inngest)(/|$)|^@(?:temporalio|trigger\\.dev)/",
    message: "Do not add a queue or worker library.",
  },
  {
    regex: "^(axios|got|node-fetch|cross-fetch|isomorphic-fetch|ky|superagent|request|needle|undici|ofetch|wretch)(/|$)",
    message: "Use the built-in fetch API instead of an HTTP client dependency.",
  },
];

const modelSdkPattern = {
  regex: "^(?:@google/genai|@google-cloud/vertexai|@anthropic-ai/sdk|openai|@mistralai/mistralai|cohere-ai|@cohere-ai/cohere|@aws-sdk/client-bedrock-runtime|@huggingface/inference|replicate|ollama|ai)(?:/|$)",
  message: "Model SDK imports are allowed only in scripts/demo-agent.ts.",
};

const coreRestrictedImportPatterns = [
  ...sharedRestrictedImportPatterns,
  modelSdkPattern,
  {
    regex: "(^|[/.-])(?:retrieval|explanation)([/.-]|$)",
    message: "The policy and gateway paths must not depend on retrieval or explanation code.",
  },
];

const mockedToolRestrictedImportPatterns = [
  ...sharedRestrictedImportPatterns,
  modelSdkPattern,
  {
    regex: "^(?:node:)?(?:http|https|http2|net|tls|dgram|dns)(?:/|$)|^(?:ws|websocket|socket\\.io-client)(?:/|$)",
    message: "Mocked tools must not import network libraries.",
  },
];

const environmentAccessSyntax = {
  selector: "MemberExpression[object.name='process'][property.name='env'], MemberExpression[object.name='process'][computed=true][property.value='env']",
  message: "Read environment variables only through src/lib/config/env.mjs.",
};

const transactionSyntax = [
  {
    selector: "Property[key.name='isolationLevel'], Property[key.value='isolationLevel']",
    message: "Do not set isolationLevel; transactions must stay on READ COMMITTED.",
  },
  {
    selector: "CallExpression[callee.type='MemberExpression'][callee.property.name='$transaction'][arguments.0.type='ArrayExpression'], CallExpression[callee.type='MemberExpression'][callee.property.value='$transaction'][arguments.0.type='ArrayExpression']",
    message: "Use an interactive $transaction instead of the array form.",
  },
  {
    selector: "Literal[value=/\\bpg_(?:try_)?advisory_lock(?:_shared)?\\b/i], TemplateElement[value.cooked=/\\bpg_(?:try_)?advisory_lock(?:_shared)?\\b/i]",
    message: "Use transaction-level advisory locks, not session-level advisory locks.",
  },
];

const actionDecisionSyntax = {
  selector: "CallExpression[callee.type='MemberExpression'][callee.property.name='update'][callee.object.property.name='action'], CallExpression[callee.type='MemberExpression'][callee.property.value='update'][callee.object.property.name='action'], CallExpression[callee.type='MemberExpression'][callee.property.name='update'][callee.object.property.value='action'], CallExpression[callee.type='MemberExpression'][callee.property.value='update'][callee.object.property.value='action']",
  message: "Use a conditional action.updateMany for decisions.",
};

const auditHashSyntax = {
  selector: "CallExpression[callee.object.name='JSON'][callee.property.name='stringify'], CallExpression[callee.object.name='JSON'][callee.property.value='stringify']",
  message: "Use canonicalJson for audit hashing.",
};

const mockedToolNetworkCallSyntax = [
  {
    selector: "CallExpression[callee.type='MemberExpression'][callee.property.name='fetch']",
    message: "Mocked tools must only log; they must not make network requests.",
  },
  {
    selector: "CallExpression[callee.type='MemberExpression'][callee.computed=true][callee.property.value='fetch']",
    message: "Mocked tools must only log; they must not make network requests.",
  },
];

const localRules = {
  "no-any-with-explanation": {
    meta: {
      type: "problem",
      docs: { description: "require an explanatory comment next to explicit any types" },
      schema: [],
      messages: {
        missingExplanation: "Add an explanatory comment immediately before or after this any type.",
      },
    },
    create(context) {
      return {
        TSAnyKeyword(node) {
          const comments = context.sourceCode.getAllComments();
          const hasExplanation = comments.some((comment) => {
            const sameLineAfter = comment.loc.start.line === node.loc.end.line &&
              comment.range[0] >= node.range[1];
            const immediatelyBefore = node.loc.start.line - comment.loc.end.line <= 1 &&
              comment.loc.end.line <= node.loc.start.line;
            if (!sameLineAfter && !immediatelyBefore) return false;

            const text = comment.value
              .replace(/eslint-disable-next-line\s+[^-]+--/, "")
              .replace(/eslint-disable-line\s+[^-]+--/, "")
              .replace(/eslint-disable\s+[^-]+--/, "")
              .trim();
            return text.length >= 15;
          });

          if (!hasExplanation) {
            context.report({ node, messageId: "missingExplanation" });
          }
        },
      };
    },
  },
  "require-eslint-disable-description": {
    meta: {
      type: "problem",
      docs: { description: "require descriptions on ESLint disable comments" },
      schema: [],
      messages: {
        missingDescription: "Add `--` and a brief explanation to this ESLint disable comment.",
      },
    },
    create(context) {
      return {
        Program() {
          for (const comment of context.sourceCode.getAllComments()) {
            if (!/^eslint-disable(?:-next-line|-line)?\b/.test(comment.value.trim())) continue;
            const description = comment.value.split("--", 2)[1]?.trim();
            if (!description || description.length < 10) {
              context.report({ loc: comment.loc, messageId: "missingDescription" });
            }
          }
        },
      };
    },
  },
};

export default defineConfig([
  ...nextVitals,
  ...nextTypeScript,
  {
    plugins: { local: { rules: localRules } },
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/ban-ts-comment": ["error", {
        "ts-expect-error": "allow-with-description",
        "ts-ignore": "allow-with-description",
        "ts-nocheck": true,
        "ts-check": false,
        minimumDescriptionLength: 10,
      }],
      "local/no-any-with-explanation": "error",
      "local/require-eslint-disable-description": "error",
      "no-restricted-imports": ["error", {
        patterns: [...sharedRestrictedImportPatterns, modelSdkPattern],
      }],
      "no-restricted-syntax": ["error", environmentAccessSyntax, ...transactionSyntax],
    },
  },
  {
    files: [
      "src/lib/policy/**/*.{js,mjs,cjs,jsx,ts,tsx}",
      "src/lib/actions/**/*.{js,mjs,cjs,jsx,ts,tsx}",
      "src/app/api/actions/**/*.{js,mjs,cjs,jsx,ts,tsx}",
    ],
    rules: {
      "no-restricted-imports": ["error", { patterns: coreRestrictedImportPatterns }],
    },
  },
  {
    files: [
      "src/lib/tools/**/*.{js,mjs,cjs,jsx,ts,tsx}",
      "src/lib/mocked-tools/**/*.{js,mjs,cjs,jsx,ts,tsx}",
    ],
    rules: {
      "no-restricted-imports": ["error", { patterns: mockedToolRestrictedImportPatterns }],
      "no-restricted-globals": ["error", {
        name: "fetch",
        message: "Mocked tools must only log; they must not make network requests.",
      }],
      "no-restricted-syntax": ["error", environmentAccessSyntax, ...transactionSyntax, ...mockedToolNetworkCallSyntax],
    },
  },
  {
    files: ["src/lib/actions/decide-action.ts", "src/app/api/actions/**/decision/route.ts"],
    rules: {
      "no-restricted-syntax": ["error", environmentAccessSyntax, ...transactionSyntax, actionDecisionSyntax],
    },
  },
  {
    files: ["src/lib/audit/chain.ts"],
    rules: {
      "no-restricted-syntax": ["error", environmentAccessSyntax, ...transactionSyntax, auditHashSyntax],
    },
  },
  {
    files: ["scripts/demo-agent.ts"],
    rules: {
      "no-restricted-imports": ["error", { patterns: sharedRestrictedImportPatterns }],
    },
  },
  {
    files: ["src/lib/config/env.mjs"],
    rules: { "no-restricted-syntax": ["error", ...transactionSyntax] },
  },
  {
    files: ["jest.config.js"],
    rules: { "@typescript-eslint/no-require-imports": "off" },
  },
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "src/generated/**",
    "tests/db/generated/**",
  ]),
]);
