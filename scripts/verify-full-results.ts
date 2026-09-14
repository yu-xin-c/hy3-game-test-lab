import { createHash } from "node:crypto";
import { readFile, readdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const index = process.argv.indexOf("--results");
if (index < 0 || !process.argv[index + 1]) throw new Error("Missing --results");
const root = resolve(process.argv[index + 1]!);
const json = async (file: string) => JSON.parse(await readFile(file, "utf8"));
const hash = (bytes: Buffer | string) => createHash("sha256").update(bytes).digest("hex");
const summary = await json(resolve(root, "summary.json"));
const manifest = await json(resolve(root, "batch-manifest.json"));
const errors: string[] = [];
const warnings: string[] = [];
const ids = summary.tasks.map((t: any) => t.id).sort();
if (new Set(ids).size !== ids.length || JSON.stringify(ids) !== JSON.stringify(manifest.tasks.map((t: any) => t.id).sort())) errors.push("Task inventory does not match the frozen batch manifest");
if (summary.batch_id !== manifest.batch_id) errors.push("Batch ID mismatch");
let checked = 0, reviewed = 0, scenarios = 0;
for (const task of summary.tasks) {
  if (!/^[a-z][a-z0-9-]*$/.test(task.id)) throw new Error("Unsafe ID");
  if (task.status === "pending") { errors.push(`${task.id}: pending`); continue; }
  const dir = resolve(root, "evidence", task.id);
  const generation = await json(resolve(dir, "generation.json"));
  const resultBytes = await readFile(resolve(dir, "result.json"));
  const result = JSON.parse(resultBytes.toString());
  const gameDigest = createHash("sha256");
  for (const name of (await readdir(resolve(dir, "game"))).sort((a,b) => a.localeCompare(b))) {
    gameDigest.update(name).update("\0").update(await readFile(resolve(dir, "game", name))).update("\0");
  }
  const gameHash = gameDigest.digest("hex");
  if (gameHash !== generation.output_sha256 || gameHash !== result.input_hashes.game_directory_sha256) errors.push(`${task.id}: game hash`);
  if (hash(await readFile(resolve(dir, "prompt.md"))) !== generation.prompt_sha256) errors.push(`${task.id}: prompt hash`);
  if (generation.prompt_sha256 !== manifest.tasks.find((t: any) => t.id === task.id)?.prompt_sha256) errors.push(`${task.id}: frozen manifest prompt hash`);
  if (generation.manual_code_edits !== false || generation.model !== "Hy3 High") errors.push(`${task.id}: generation provenance`);
  for (const line of (await readFile(resolve(dir, "task/input-sha256.txt"), "utf8")).trim().split("\n")) {
    const [expected, originalName] = line.split(/\s+/);
    const name = originalName === "../GAME_CONTRACT.md" ? "GAME_CONTRACT.md" : originalName;
    if (!name || !["brief.md", "test-plan.json", "oracle.private.json", "GAME_CONTRACT.md"].includes(name)) throw new Error("Unsafe hash entry");
    if (hash(await readFile(resolve(dir, "task", name))) !== expected) errors.push(`${task.id}: frozen ${name}`);
  }
  const plan = await json(resolve(dir, "task/test-plan.json"));
  if ((result.scenarios ?? []).length) {
    if (hash(await readFile(resolve(dir, "task/test-plan.json"))) !== result.input_hashes.test_plan_sha256 || hash(await readFile(resolve(dir, "task/oracle.private.json"))) !== result.input_hashes.oracle_sha256) errors.push(`${task.id}: evaluated inputs`);
    for (const scenario of plan.scenarios) {
      const runs = result.scenarios.filter((s: any) => s.scenario_id === scenario.id);
      if (runs.length !== 3 || new Set(runs.map((s: any) => s.replay_index)).size !== 3) errors.push(`${task.id}/${scenario.id}: missing replay`);
      scenarios++;
    }
  }
  try {
    const judge = await json(resolve(dir, "hy3-judgment.json"));
    if (judge.model !== "hy3" || judge.source_result_sha256 !== hash(resultBytes) || judge.source_game_sha256 !== gameHash || judge.prompt_sha256 !== hash(await readFile(resolve(dir, "hy3-judge-prompt.txt")))) errors.push(`${task.id}: review provenance`);
    if (judge.verdict.task_id !== task.id || JSON.stringify(judge.verdict.scenarios.map((s: any) => s.scenario_id).sort()) !== JSON.stringify(plan.scenarios.map((s: any) => s.id).sort())) errors.push(`${task.id}: review scenarios`);
    reviewed++;
  } catch(e) { if ((e as NodeJS.ErrnoException).code === "ENOENT") errors.push(`${task.id}: missing Hy3 review`); else throw e; }
  if (generation.generator !== "CodeBuddy CLI") warnings.push(`${task.id}: IDE model selection metadata, not CLI provider telemetry`);
  else {
    const completion = await json(resolve(dir, "cli-completion.json"));
    if (completion.telemetry_truncated) warnings.push(`${task.id}: original CLI stdout truncated; usage unavailable`);
    if ((result.scenarios ?? []).length && JSON.stringify(completion.model_ids) !== JSON.stringify(["hy3"])) errors.push(`${task.id}: unverified CLI model`);
  }
  checked++;
}
const audit = { checked_at: new Date().toISOString(), tasks_expected: summary.tasks.length, tasks_checked: checked,
  reviewed, distinct_browser_scenarios: scenarios,
  integrity_pass: errors.length === 0, errors, warnings };
await writeFile(resolve(root, "integrity-audit.json"), JSON.stringify(audit,null,2) + "\n");
console.log(JSON.stringify(audit,null,2));
if (errors.length && !process.argv.includes("--allow-partial")) process.exitCode = 1;
