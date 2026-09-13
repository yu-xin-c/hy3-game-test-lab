import { createHash } from "node:crypto";
import { readFile, readdir, writeFile } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";

function arg(name: string): string {
  const index = process.argv.indexOf(name);
  const value = index >= 0 ? process.argv[index + 1] : undefined;
  if (!value || value.startsWith("--")) throw new Error(`Missing ${name}`);
  return value;
}
function count(name: string): number {
  const value = Number(arg(name));
  if (!Number.isFinite(value) || value < 0) throw new Error(`Invalid ${name}`);
  return value;
}
const batch = resolve(arg("--batch-dir"));
const taskId = arg("--task");
if (!/^[a-z][a-z0-9-]*$/.test(taskId)) throw new Error("Unsafe task ID");
const manifest = JSON.parse(await readFile(resolve(batch, "batch-manifest.json"), "utf8"));
const task = manifest.tasks.find((entry: { id: string }) => entry.id === taskId);
if (!task) throw new Error("Task not in batch");
const resultPath = resolve(arg("--result"));
const local = relative(resolve(batch, "runs"), resultPath);
if (local === ".." || local.startsWith("../") || isAbsolute(local)) throw new Error("Result outside batch runs");
const result = JSON.parse(await readFile(resultPath, "utf8"));
if (result.task_id !== taskId || result.generator !== "codebuddy-hy3" ||
    result.evaluation_context !== "frozen_task_evaluation" ||
    !["evaluated", "evaluated_with_contract_findings"].includes(result.status)) {
  throw new Error("Expected a completed frozen CodeBuddy task evaluation");
}
const generationDirectory = resolve(batch, "generated", taskId);
const gameDirectory = resolve(generationDirectory, "files");
const entries = await readdir(gameDirectory, { withFileTypes: true });
const names = entries.map(entry => entry.name).sort();
if (entries.some(entry => !entry.isFile() || entry.isSymbolicLink()) ||
    JSON.stringify(names) !== JSON.stringify(["game.js", "game.manifest.json", "index.html", "styles.css"])) {
  throw new Error("Expected exactly four regular game files");
}
const hash = createHash("sha256");
for (const name of names.sort((a, b) => a.localeCompare(b))) {
  hash.update(name).update("\0").update(await readFile(resolve(gameDirectory, name))).update("\0");
}
const outputHash = hash.digest("hex");
const promptHash = createHash("sha256").update(await readFile(resolve(batch, "public", taskId, "prompt.md"))).digest("hex");
if (promptHash !== task.prompt_sha256 || outputHash !== result.input_hashes.game_directory_sha256) {
  throw new Error("Prompt or generated code changed since preparation/evaluation");
}
// These values are transcribed from CodeBuddy's UI, not inferred from the model output.
// Calling this command attests to one generation attempt with no manual code edits.
const record = {
  schema_version: "gametestlab.codebuddy-generation.v1",
  batch_id: manifest.batch_id,
  task_id: taskId,
  generator: "CodeBuddy CN",
  model: arg("--model"),
  prompt_sha256: promptHash,
  output_sha256: outputHash,
  attempt: 1,
  manual_code_edits: false,
  credits_used: count("--credits"),
  reported_tokens: count("--tokens"),
  reported_duration_seconds: count("--duration-seconds"),
  result: result.status,
  result_file: relative(generationDirectory, resultPath),
  scoring_status: "provisional_requires_oracle_review"
};
await writeFile(resolve(generationDirectory, "generation.json"), `${JSON.stringify(record, null, 2)}\n`, { flag: "wx" });
console.log(`Recorded ${taskId}; prompt and output hashes verified.`);
