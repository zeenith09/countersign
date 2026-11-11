import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const packagePath = new URL("package.json", root);
const allowlistPath = new URL("allowed-deps.json", root);

const packageJson = JSON.parse(await readFile(packagePath, "utf8"));
const allowedDependencies = JSON.parse(await readFile(allowlistPath, "utf8"));

if (!Array.isArray(allowedDependencies) ||
    !allowedDependencies.every((dependency) => typeof dependency === "string")) {
  throw new TypeError("allowed-deps.json must contain an array of package names.");
}

const declaredDependencies = new Set(
  ["dependencies", "devDependencies", "optionalDependencies", "peerDependencies"]
    .flatMap((section) => Object.keys(packageJson[section] ?? {})),
);
const allowed = new Set(allowedDependencies);
const disallowed = [...declaredDependencies].filter((dependency) => !allowed.has(dependency));

if (disallowed.length > 0) {
  console.error(`Dependencies missing from allowed-deps.json:\n${disallowed.join("\n")}`);
  process.exitCode = 1;
} else {
  console.log("Dependency allowlist check passed.");
}
