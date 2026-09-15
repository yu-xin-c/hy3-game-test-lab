import { readFile, writeFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";
import { contentHash, reconstructGeneration } from "../src/evaluation/generation-provenance";

const at = process.argv.indexOf("--root");
if (at < 0 || !process.argv[at + 1]) throw new Error("Provide --root");
const root = resolve(process.argv[at + 1]!);
const json = async (path: string) => JSON.parse(await readFile(path, "utf8"));
const consolidatedText = await readFile(resolve("results/consolidated/summary.json"), "utf8");
const inventoryText = await readFile(resolve("results/public-check-audit-v1/inventory.json"), "utf8");
const selected = JSON.parse(consolidatedText).tasks.slice(0, 15);
const selectedIds = selected.map((task: any) => task.id);
if (selected.length !== 15 || JSON.stringify(JSON.parse(inventoryText).slice(0, 15).map((p: any) => p.task_id)) !== JSON.stringify(selectedIds)) throw new Error("15-task process scope differs from the public-check inventory");
const auditScope = await json(resolve("results/public-check-audit-v1/scope.json"));
if (auditScope.task_limit !== 15 || auditScope.selection !== "first_n_in_frozen_inventory") throw new Error("Public-check scope is not 15 tasks");
const sources = [
  { id: "target-rush", source: "results/process-v1/target-rush" },
  { id: "maze-collector", source: "results/process-30-v1/maze-collector" },
  { id: "key-door-escape", source: "results/process-30-v1/key-door-escape" },
  { id: "platform-rescue", source: "results/process-v1/platform-rescue" },
  { id: "signal-memory", source: "results/process-v1/signal-memory" }
];
if (JSON.stringify(sources.map(s => s.id)) !== JSON.stringify(selectedIds.slice(0, 5))) throw new Error("Reused complete games do not match the first five selected tasks");
const freshIds = selectedIds.slice(5);
const batch = await json(resolve(root, "manifest.json"));
if (batch.generator !== "hy3" || batch.reviewer !== "hy3" || JSON.stringify(batch.tasks) !== JSON.stringify(freshIds)) throw new Error("New batch must contain only the remaining ten selected tasks");
const reused = [];
for (const item of sources) {
  const dir = resolve(item.source), status = await json(resolve(dir, "status.json"));
  if (status.stage !== "complete") throw new Error(`Source game incomplete: ${item.id}`);
  for (const call of ["plan-call", "generation-call", "review-call"]) {
    const receipt = await json(resolve(dir, call, "receipt.json"));
    if (receipt.model !== "hy3" || receipt.model_verified !== true || receipt.prompt_sha256 !== contentHash(await readFile(resolve(dir, call, "prompt.txt"), "utf8"))) throw new Error(`Invalid Hy3 ${call}: ${item.id}`);
  }
  const planText = await readFile(resolve(dir, "solution-plan.json"), "utf8"), plan = JSON.parse(planText);
  if (!Array.isArray(plan.steps) || plan.steps.length < 3 || plan.steps.some((s: any, i: number) => s.id !== i + 1)) throw new Error(`Invalid original plan: ${item.id}`);
  const names = (await readdir(resolve(dir, "game"))).sort();
  const game = Object.fromEntries(await Promise.all(names.map(async name => [name, await readFile(resolve(dir, "game", name), "utf8")] as const)));
  if (!reconstructGeneration((await json(resolve(dir, "generation-tools.json"))).calls, game).complete) throw new Error(`Original Write/Edit history incomplete: ${item.id}`);
  reused.push({ ...item, plan_sha256: contentHash(planText), generation_reconstructed: true });
}
const countBy = (key: string) => Object.fromEntries([...new Set(selected.map((s: any) => s[key]))].sort().map(value => [value, selected.filter((s: any) => s[key] === value).length]));
const scope = { schema_version: "hy3-process-15-scope.v1", selection: "first fifteen from frozen ninety-six-task inventory",
  selected_ids: selectedIds, reused_completed_games: reused, new_game_ids: freshIds, total: 15, reused: 5, to_generate: 10,
  difficulty: countBy("difficulty"), category: countBy("category"), consolidated_sha256: contentHash(consolidatedText),
  public_check_inventory_sha256: contentHash(inventoryText), representativeness_limit: "The fixed subset has no education game; difficulty and category are confounded." };
await writeFile(resolve(root, "scope.json"), JSON.stringify(scope, null, 2) + "\n");
console.log(JSON.stringify({ total: scope.total, reused: scope.reused, to_generate: scope.to_generate, difficulty: scope.difficulty, category: scope.category }));
