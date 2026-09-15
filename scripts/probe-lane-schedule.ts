import { readFile, readdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium } from "@playwright/test";
import { GameTaskPlanSchema } from "../src/contracts/game-tasks";
import { PublicCaseSchema } from "../src/contracts/schemas";
import { taskPlanToPublicCase } from "../src/contracts/task-adapter";
import { contentHash } from "../src/evaluation/generation-provenance";
import { runPlaythrough } from "../src/runtime/playthrough";
import { startStaticServer } from "../src/runtime/static-server";

const root = resolve(process.argv[2] ?? "results/process-15-v1/neon-lane-racer");
const plan = GameTaskPlanSchema.parse(JSON.parse(await readFile(resolve(root, "task/test-plan.json"), "utf8")));
const specs = {
  "neon-lane-racer": { public_rule: ["1000ms 的车道1", "2000ms 的车道0", "3000ms 的车道1", "4000ms 的车道2"],
    schedule: [[1000, 1], [2000, 0], [3000, 1], [4000, 2]], safe_lanes: [0, 1, 2, 1], progress: "passed", loss_event: "car_crashed", seed: 602 },
  "meteor-survivor": { public_rule: ["1000/2000/3000/4000ms 的流星依次落在轨道1/0/2/1"],
    schedule: [[1000, 1], [2000, 0], [3000, 2], [4000, 1]], safe_lanes: [2, 1, 1, 2], progress: "wave", loss_event: "meteor_hit", seed: 604 }
} as const;
const spec = specs[plan.task_id as keyof typeof specs];
if (!spec) throw new Error("Only the two frozen lane-schedule tasks are supported");
const brief = await readFile(resolve(root, "task/brief.md"), "utf8");
for (const rule of spec.public_rule) if (!brief.includes(rule)) throw new Error(`Public schedule changed: ${rule}`);
const base = taskPlanToPublicCase(plan);
const clock = plan.scenarios[0]!.clock;
const input = (action_id: string, checkpoint?: string) => ({ kind: "input" as const, action_id, advance_ms: 0, checkpoints: checkpoint ? [checkpoint] : [] });
const wait = (advance_ms: number, checkpoint: string) => ({ kind: "advance_time" as const, advance_ms, checkpoints: [checkpoint] });
const winSteps: Array<ReturnType<typeof input> | ReturnType<typeof wait>> = [input("START", "GR-START")];
let lane = 1;
for (let wave = 0; wave < 4; wave++) {
  const safe = spec.safe_lanes[wave]!;
  while (lane < safe) { winSteps.push(input("RIGHT")); lane++; }
  while (lane > safe) { winSteps.push(input("LEFT")); lane--; }
  winSteps.push(wait(wave === 0 ? 1100 : 1000, `GR-PASS-${wave + 1}`));
}
winSteps.push(wait(1000, "GR-WON"));
const scenarios = [
  { id: "grounded-win", description: "Avoid each obstacle lane from the public schedule", seed: spec.seed, clock, steps: winSteps },
  { id: "grounded-loss", description: "Stay in starting lane 1 until public 1000ms obstacle", seed: spec.seed, clock,
    steps: [input("START", "GR-LOSS-START"), wait(1100, "GR-LOST")] }
];
const publicCase = PublicCaseSchema.parse({ ...base, scenarios });
const names = (await readdir(resolve(root, "game"))).sort((a, b) => a.localeCompare(b));
let bundle = "";
for (const name of names) bundle += name + "\0" + await readFile(resolve(root, "game", name), "utf8") + "\0";
const browserRecord = JSON.parse(await readFile(resolve(root, "browser/result.json"), "utf8"));
if (contentHash(bundle) !== browserRecord.input_hashes.game_directory_sha256) throw new Error("Executed game changed");
const server = await startStaticServer({ rootDirectory: resolve(root, "game"), exposure: "isolated-root" });
const browser = await chromium.launch({ headless: true });
const rows: any[] = [];
try {
  for (let replay = 0; replay < 3; replay++) for (const scenario of scenarios) {
    const context = await browser.newContext({ viewport: plan.viewport, locale: "zh-CN", timezoneId: "Asia/Shanghai" });
    try {
      const page = await context.newPage();
      const path = await runPlaythrough({ page, baseURL: server.origin, publicCase, scenarioId: scenario.id,
        fixtureVariant: "grounded", acceptMissingBridgeProtocol: true });
      const checkpoints = path.observations.map(o => ({ id: o.checkpoint_id, action_index: o.action_index,
        state: o.state, event_types: o.event_types, ui: { scoreText: o.ui.scoreText, statusText: o.ui.statusText } }));
      rows.push({ replay, scenario: scenario.id, checkpoints, page_errors: path.page_errors, console_errors: path.console.filter(c => c.type === "error") });
    } finally { await context.close(); }
  }
} finally { await browser.close(); await server.close(); }
const wins = rows.filter(r => r.scenario === "grounded-win").filter(r => {
  const final = r.checkpoints.at(-1);
  return final?.state.status === "won" && final?.state[spec.progress] === 4 && final?.state.score === 500 &&
    (plan.task_id === "neon-lane-racer" ? final?.state.collisions === 0 : final?.state.best_score === 500) &&
    r.checkpoints.slice(1, -1).every((c: any, index: number) => c.state.status === "playing" &&
      c.state[spec.progress] === index + 1 && c.state.score === 100 * (index + 1) && c.state.lane === spec.safe_lanes[index]);
}).length;
const losses = rows.filter(r => r.scenario === "grounded-loss").filter(r => {
  const final = r.checkpoints.at(-1);
  return final?.state.status === "lost" && final?.event_types.includes(spec.loss_event) &&
    (plan.task_id === "neon-lane-racer" ? final?.state.collisions === 1 : final?.state.wave === 0);
}).length;
const result = { scope: "Additional public-schedule browser probe; frozen original result and private oracle are unchanged",
  task_id: plan.task_id, game_directory_sha256: contentHash(bundle), public_schedule: spec.schedule,
  grounded_win_passes: wins, grounded_loss_passes: losses, replays: 3, rows };
await writeFile(resolve(root, "grounded-probe.json"), JSON.stringify(result, null, 2) + "\n");
console.log(JSON.stringify({ grounded_win_passes: wins, grounded_loss_passes: losses, replays: 3 }));
