import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTypeScript from "eslint-config-next/typescript";

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
        patterns: [
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
        ],
      }],
      "no-restricted-properties": ["error", {
        object: "process",
        property: "env",
        message: "Read environment variables only through src/lib/config/env.mjs.",
      }],
    },
  },
  {
    files: ["src/lib/config/env.mjs"],
    rules: { "no-restricted-properties": "off" },
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
