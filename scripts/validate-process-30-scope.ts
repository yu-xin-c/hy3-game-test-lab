import { readFile, writeFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";
import { contentHash, reconstructGeneration } from "../src/evaluation/generation-provenance";

const index = process.argv.indexOf("--root");
if (index < 0 || !process.argv[index + 1]) throw new Error("Provide --root");
const root = resolve(process.argv[index + 1]!);
const json = async (path: string) => JSON.parse(await readFile(path, "utf8"));
const consolidatedText = await readFile(resolve("results/consolidated/summary.json"), "utf8");
const inventoryText = await readFile(resolve("results/public-check-audit-v1/inventory.json"), "utf8");
const summary = JSON.parse(consolidatedText), inventory = JSON.parse(inventoryText);
const selected = summary.tasks.slice(0, 30);
const selectedIds = selected.map((task: any) => task.id);
if (selected.length !== 30 || JSON.stringify(inventory.slice(0, 30).map((p: any) => p.task_id)) !== JSON.stringify(selectedIds)) throw new Error("Process scope differs from frozen 30-task public-check inventory");
const auditScope = await json(resolve("results/public-check-audit-v1/scope.json"));
if (auditScope.task_limit !== 30 || auditScope.selection !== "first_n_in_frozen_inventory") throw new Error("Frozen public-check scope changed");
const reusedIds = ["target-rush", "platform-rescue", "signal-memory"];
if (reusedIds.some(id => !selectedIds.includes(id))) throw new Error("Original Hy3 public-plan tasks outside selected 30");
const batch = await json(resolve(root, "manifest.json"));
const newIds = selectedIds.filter((id: string) => !reusedIds.includes(id));
if (batch.generator !== "hy3" || batch.reviewer !== "hy3" || JSON.stringify(batch.tasks) !== JSON.stringify(newIds)) throw new Error("27-task batch manifest is not the chosen 30 minus three original tasks");
const baseline = [];
for (const id of reusedIds) {
  const dir = resolve("results/process-v1", id), status = await json(resolve(dir, "status.json"));
  if (status.stage !== "complete") throw new Error(`Original Hy3 process not complete: ${id}`);
  for (const call of ["plan-call", "generation-call", "review-call"]) {
    const receipt = await json(resolve(dir, call, "receipt.json"));
    if (receipt.model !== "hy3" || receipt.model_verified !== true || receipt.prompt_sha256 !== contentHash(await readFile(resolve(dir, call, "prompt.txt"), "utf8"))) throw new Error(`Invalid original ${call} receipt: ${id}`);
  }
  const planText = await readFile(resolve(dir, "solution-plan.json"), "utf8"), plan = JSON.parse(planText);
  if (!Array.isArray(plan.steps) || plan.steps.length < 3 || plan.steps.some((step: any, i: number) => step.id !== i + 1)) throw new Error(`Original numbered solution invalid: ${id}`);
  const gameDir = resolve(dir, "game"), names = (await readdir(gameDir)).sort();
  const game = Object.fromEntries(await Promise.all(names.map(async name => [name, await readFile(resolve(gameDir, name), "utf8")] as const)));
  const reconstruction = reconstructGeneration((await json(resolve(dir, "generation-tools.json"))).calls, game);
  if (!reconstruction.complete) throw new Error(`Original game differs from public tool history: ${id}`);
  baseline.push({ id, source: `results/process-v1/${id}`, plan_sha256: contentHash(planText), generation_reconstructed: true });
}
const countBy = (field: string) => Object.fromEntries([...new Set(selected.map((task: any) => task[field]))].sort().map(key => [key, selected.filter((task: any) => task[field] === key).length]));
const scope = { schema_version: "hy3-process-30-scope.v1", selection: "first 30 in frozen 96-task inventory", selected_ids: selectedIds,
  existing_public_plan_games: baseline, new_public_plan_game_ids: newIds, total: 30, reused: 3, to_generate: 27,
  difficulty: countBy("difficulty"), category: countBy("category"), consolidated_sha256: contentHash(consolidatedText), public_check_inventory_sha256: contentHash(inventoryText),
  representativeness_limit: "This fixed first-30 subset is action-heavy; report its exact composition, do not claim stratified representativeness of all 96 tasks." };
await writeFile(resolve(root, "scope.json"), JSON.stringify(scope, null, 2) + "\n");
console.log(JSON.stringify({ total: scope.total, reused: scope.reused, to_generate: scope.to_generate, difficulty: scope.difficulty, category: scope.category }));
