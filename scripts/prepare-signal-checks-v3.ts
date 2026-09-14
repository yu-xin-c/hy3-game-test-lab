import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { GameTaskOracleSchema, GameTaskPlanSchema } from "../src/contracts/game-tasks";
import { contentHash } from "../src/evaluation/generation-provenance";

const source = resolve("results/process-v1/signal-memory/task");
const index = process.argv.indexOf("--out");
if (index < 0 || !process.argv[index + 1]) throw new Error("Provide --out NEW_DIRECTORY");
const out = resolve(process.argv[index + 1]!);
const planText = await readFile(resolve(source, "test-plan.json"), "utf8");
const oracleText = await readFile(resolve(source, "oracle.private.json"), "utf8");
const plan = GameTaskPlanSchema.parse(JSON.parse(planText));
const oracle = GameTaskOracleSchema.parse(JSON.parse(oracleText));
plan.checking_policy_version = "2026-09-15.signal-semantic-v3";
const changes: { checkpoint: string; removed: Record<string, unknown>; reason: string }[] = [];
for (const scenario of oracle.scenarios) for (const cp of scenario.checkpoints) {
  if (!["SM-CP-WON", "SM-CP-LOST", "SM-CP-RESET"].includes(cp.id)) continue;
  const removed: Record<string, unknown> = {};
  for (const key of cp.id === "SM-CP-WON" ? ["phase", "round", "progress"] : ["phase"]) {
    removed[key] = cp.expected.state[key];
    delete cp.expected.state[key];
  }
  changes.push({ checkpoint: cp.id, removed, reason: "Public brief defines terminal status/score/lives and reset values, not internal terminal phase labels or post-win counters. Active-round checks are retained." });
}
// Public Canvas quadrants use positions relative to the named game surface.
for (const control of plan.controls) {
  if (["RED", "GREEN", "BLUE", "YELLOW"].includes(control.action_id)) control.selector = "#signal-canvas";
}
const scenarioId = "restart-during-playback";
const cpId = "SM-CP-RESTART-PLAYBACK-IGNORED";
const input = (action_id: string, checkpoints: string[] = []) => ({ kind: "input" as const, action_id, advance_ms: 0, checkpoints });
const clock = structuredClone(plan.scenarios[0]!.clock);
plan.scenarios.push({ id: scenarioId, description: "播放300ms时重开并开始新局；950ms时点击红色仍须忽略，不能计分。",
  seed: 404, clock, steps: [input("START"), { kind: "advance_time", advance_ms: 300, checkpoints: [] },
    input("RESTART"), input("START"), { kind: "advance_time", advance_ms: 950, checkpoints: [] }, input("RED", [cpId])] });
oracle.scenarios.push({ scenario_id: scenarioId, checkpoints: [{ id: cpId, action_index: 5, layer: "L2",
  requirement_ids: ["SM-PLAYBACK", "SM-RESET"], terminal: true,
  expected: { state: { status: "playing", score: 0, lives: 3, progress: 0 }, ui: {},
    event_scope: "current_action", event_types: ["input_ignored"], physics: [] } }] });
GameTaskPlanSchema.parse(plan);
GameTaskOracleSchema.parse(oracle);
await mkdir(out, { recursive: false });
const files: Record<string, string> = {
  "brief.md": await readFile(resolve(source, "brief.md"), "utf8"),
  "GAME_CONTRACT.md": await readFile(resolve(source, "GAME_CONTRACT.md"), "utf8"),
  "test-plan.json": JSON.stringify(plan, null, 2) + "\n",
  "oracle.private.json": JSON.stringify(oracle, null, 2) + "\n"
};
for (const [name, text] of Object.entries(files)) await writeFile(resolve(out, name), text);
await writeFile(resolve(out, "input-sha256.txt"), Object.entries(files).map(([name, text]) => `${contentHash(text)}  ${name === "GAME_CONTRACT.md" ? "../GAME_CONTRACT.md" : name}`).join("\n") + "\n");
await writeFile(resolve(out, "revision.json"), JSON.stringify({ source: "results/process-v1/signal-memory/task",
  source_plan_sha256: contentHash(planText), source_oracle_sha256: contentHash(oracleText),
  public_brief_changed: false, game_changed: false, changes,
  controls: "Canvas quadrant coordinates explicitly relative to #signal-canvas, already named in public brief.",
  added_scenario: scenarioId, scope: "Retrospective rule correction and coverage addition, not a new generated game or preregistered benchmark."
}, null, 2));
