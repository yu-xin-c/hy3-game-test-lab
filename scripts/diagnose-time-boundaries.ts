import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium } from "@playwright/test";
import { GameTaskPlanSchema } from "../src/contracts/game-tasks";
import { taskPlanToPublicCase } from "../src/contracts/task-adapter";
import { PublicCaseSchema } from "../src/contracts/schemas";
import { runPlaythrough } from "../src/runtime/playthrough";
import { startStaticServer } from "../src/runtime/static-server";

function arg(name: string): string {
  const value = process.argv[process.argv.indexOf(name) + 1];
  if (!process.argv.includes(name) || !value || value.startsWith("--")) throw new Error(`Missing ${name}`);
  return value;
}
const taskId = arg("--task");
if (!/^[a-z][a-z0-9-]*$/.test(taskId)) throw new Error("Unsafe task ID");
const gameDirectory = resolve(arg("--game-dir"));
const output = resolve(arg("--out"));
const scenarioId = arg("--scenario");
const plan = GameTaskPlanSchema.parse(JSON.parse(await readFile(
  new URL(`../datasets/game-tasks/${taskId}/test-plan.json`, import.meta.url), "utf8"
)));
let publicCase = taskPlanToPublicCase(plan);
const pathIndex = process.argv.indexOf("--path");
const pathText = pathIndex < 0 ? null : await readFile(resolve(arg("--path")), "utf8");
if (pathText !== null) {
  publicCase = PublicCaseSchema.parse({ ...publicCase, scenarios: [JSON.parse(pathText)] });
}
const scenario = publicCase.scenarios.find((item) => item.id === scenarioId);
if (!scenario) throw new Error(`Unknown scenario ${scenarioId}`);
if (plan.environment.pages !== 1 || publicCase.controls.some((c) => c.device === "camera")) {
  throw new Error("This diagnostic only supports single-page, non-camera tasks");
}
const hash = createHash("sha256");
for (const file of (await readdir(gameDirectory)).sort((a, b) => a.localeCompare(b))) {
  hash.update(file).update("\0").update(await readFile(resolve(gameDirectory, file))).update("\0");
}
await mkdir(output, { recursive: false });
const server = await startStaticServer({ rootDirectory: gameDirectory, exposure: "isolated-root" });
const executablePath = process.env.GAMETESTLAB_CHROMIUM_EXECUTABLE;
const browser = await chromium.launch({ headless: true, ...(executablePath ? { executablePath } : {}) });
const runs: unknown[] = [];
try {
  for (const graceMs of [0, 32]) {
    for (let replay = 1; replay <= 3; replay++) {
      const diagnosticCase = structuredClone(publicCase);
      const diagnosticScenario = diagnosticCase.scenarios.find((item) => item.id === scenarioId)!;
      for (const step of diagnosticScenario.steps) {
        if ((step.kind === "advance_time" || step.kind === "input") && step.advance_ms > 0) {
          step.advance_ms += graceMs;
        }
      }
      const context = await browser.newContext({ viewport: plan.viewport });
      try {
        const page = await context.newPage();
        const result = await runPlaythrough({
          page, baseURL: server.origin, publicCase: diagnosticCase,
          scenarioId, fixtureVariant: "time-diagnostic", acceptMissingBridgeProtocol: true,
          evidenceDirectory: resolve(output, `grace-${graceMs}-replay-${replay}`), evidencePathRoot: output
        });
        const traceFile = `grace-${graceMs}-replay-${replay}.jsonl`;
        await writeFile(resolve(output, traceFile), result.trace.map((row) => JSON.stringify(row)).join("\n") + "\n");
        const last = result.trace.at(-1);
        await page.clock.runFor(32);
        const afterRender = await page.evaluate(async (selectors) => {
          const observation = await window.__GAMETESTLAB__?.observe();
          return {
            state: observation?.state,
            score_text: document.querySelector(selectors.score)?.textContent,
            status_text: document.querySelector(selectors.status)?.textContent
          };
        }, plan.selectors);
        runs.push({ grace_ms: graceMs, replay, final_state: last?.bridge?.state ?? null,
          final_ui: last?.ui ?? null, elapsed_ms: last?.elapsed_ms, trace_file: traceFile,
          after_final_32_ms: afterRender,
          runtime_errors: result.trace.flatMap((row) => row.runtime_errors) });
        console.log(`${taskId} grace=${graceMs} replay=${replay} final=${last?.bridge?.status}`);
      } finally { await context.close(); }
    }
  }
} finally { await browser.close(); await server.close(); }
await writeFile(resolve(output, "diagnostic.json"), JSON.stringify({
  task_id: taskId, scenario_id: scenarioId, game_sha256: hash.digest("hex"),
  custom_path_sha256: pathText === null ? null : createHash("sha256").update(pathText).digest("hex"),
  scoring_status: "diagnostic_only_not_a_score",
  intervention: "Compare original waits with 32 ms added to every positive time advance. Preserve inputs, seed and generated game. Separately observe 32 ms after the final action for rendering lag. No oracle scoring.",
  browser: browser.version(), runs
}, null, 2) + "\n");
