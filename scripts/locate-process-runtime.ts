import { readFile, readdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { contentHash, locateRuntimeFrame, reconstructGeneration } from "../src/evaluation/generation-provenance";

const at = process.argv.indexOf("--task-root");
if (at < 0 || !process.argv[at + 1]) throw new Error("Provide --task-root");
const root = resolve(process.argv[at + 1]!);
const readJson = async (path: string) => JSON.parse(await readFile(path, "utf8"));
const result = await readJson(resolve(root, "browser/result.json"));
const calls = (await readJson(resolve(root, "generation-tools.json"))).calls;
const names = (await readdir(resolve(root, "game"))).sort((a, b) => a.localeCompare(b));
const game = Object.fromEntries(await Promise.all(names.map(async name => [name, await readFile(resolve(root, "game", name), "utf8")] as const)));
let bundle = "";
for (const name of names) bundle += name + "\0" + game[name] + "\0";
if (contentHash(bundle) !== result.input_hashes.game_directory_sha256) throw new Error("Executed game differs from generated files");
const reconstruction = reconstructGeneration(calls, game);
if (!reconstruction.complete) throw new Error("Write/Edit history cannot reconstruct executed game");
const rows = result.scenarios.filter((scenario: any) => scenario.replay_index === 0).map((scenario: any) => {
  const first = scenario.evaluation.first_failure;
  const runtime = first?.diffs?.filter((diff: any) => diff.channel === "runtime" && typeof diff.actual === "string") ?? [];
  const frames = runtime.map((diff: any) => locateRuntimeFrame(reconstruction, diff.actual)).filter(Boolean);
  return { scenario_id: scenario.scenario_id, first_observable_action_index: first?.action_index ?? null,
    first_observable_error_type: first?.error_type ?? null, executed_runtime_frame: frames[0] ?? null,
    runtime_error_present: runtime.length > 0 };
});
const located = rows.filter((row: any) => row.executed_runtime_frame !== null).length;
const report = { scope: "first real-browser failure frame per scenario; not a plan-step judgment or proven root cause", task_id: result.task_id,
  game_directory_sha256: result.input_hashes.game_directory_sha256, generation_reconstructed: true,
  located_runtime_scenarios: located, scenarios: rows };
await writeFile(resolve(root, "runtime-source.json"), JSON.stringify(report, null, 2) + "\n");
console.log(JSON.stringify({ task_id: result.task_id, scenarios: rows.length, located_runtime_scenarios: located }));
