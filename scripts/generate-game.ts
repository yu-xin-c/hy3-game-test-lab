import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { generateGameFromBrief } from "../src/agents/game-generator";
import { USER_BRIEF_SCHEMA_VERSION } from "../src/contracts/generation";

function argument(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  if (index < 0) return undefined;
  const value = process.argv[index + 1];
  if (!value || value.startsWith("--")) {
    throw new Error(`${name} requires a value`);
  }
  return value;
}

const briefPath = resolve(
  argument("--brief") ?? "examples/coin-collector/USER_BRIEF.md"
);
const outputRoot = argument("--out-root");
const runId = argument("--run-id");
const rawRequest = await readFile(briefPath, "utf8");

const result = await generateGameFromBrief({
  brief: {
    schema_version: USER_BRIEF_SCHEMA_VERSION,
    raw_request: rawRequest
  },
  ...(outputRoot ? { outputRoot: resolve(outputRoot) } : {}),
  ...(runId ? { runId } : {}),
  prdReviewStatus: process.argv.includes("--approved")
    ? "approved"
    : "pending"
});

console.log(`Frozen PRD: ${resolve(result.outputDirectory, "prd/frozen.json")}`);
console.log(`PRD SHA-256: ${result.manifest.frozen_prd_sha256}`);
console.log(`Game files: ${resolve(result.outputDirectory, "game/files")}`);
console.log(`Audit manifest: ${resolve(result.outputDirectory, "manifest.json")}`);
console.log(`PRD review status: ${result.manifest.prd_review_status}`);
