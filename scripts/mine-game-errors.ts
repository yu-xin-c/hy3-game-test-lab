import { readFile, mkdir, writeFile } from "node:fs/promises";
import { resolve, relative } from "node:path";
import { chromium } from "@playwright/test";
import { startStaticServer } from "../src/runtime/static-server";
import { contentHash, reconstructGeneration, locateExcerpt } from "../src/evaluation/generation-provenance";

const out = resolve("results/error-mining-v1");
await mkdir(out, { recursive: false });
const json = async (path: string) => JSON.parse(await readFile(path, "utf8"));
const summary = await json("results/consolidated/summary.json");
const candidates = summary.tasks.flatMap((task: any) => task.hy3_review.scenarios.filter((s: any) => s.process_correct === false).map((s: any) => ({ task_id: task.id, source: task.source_results, difficulty: task.difficulty, ...s })));
await writeFile(resolve(out, "candidates.json"), JSON.stringify({ scanned_games: summary.tasks.length, selection: "Historical Hy3 process=false; candidates, not confirmed defects", candidates }, null, 2));
const specs = [
  { id: "particle-orchestra", kind: "score_double_count", rule: "完整输入 A、C、D、B 时获胜并得到100分。", excerpt: "state.score += 100;" },
  { id: "zen-garden", kind: "stale_terminal_hud", rule: "第二次错误操作时立即失败，HUD 应显示 Lost。", excerpt: "function wrongAction() {" },
  { id: "science-circuit", kind: "restart_unavailable", rule: "局内重开入口应可见可用。", excerpt: null }
];
const browser = await chromium.launch();
const findings: any[] = [];
try {
  for (const spec of specs) {
    const task = summary.tasks.find((t: any) => t.id === spec.id);
    const source = resolve("results/consolidated", task.source_results, "evidence", spec.id);
    const game: Record<string, string> = {};
    const names = ["game.js", "game.manifest.json", "index.html", "styles.css"];
    for (const file of names) game[file] = await readFile(resolve(source, "game", file), "utf8");
    const hash = contentHash(names.map(name => name + "\0" + game[name] + "\0").join(""));
    const generation = await json(resolve(source, "generation.json"));
    if (generation.model_id !== "hy3" || generation.output_sha256 !== hash) throw new Error(`Unverified historical game: ${spec.id}`);
    const tools = await json(resolve(source, "generation-tools.json"));
    const history = reconstructGeneration(tools.calls, game);
    const runs: any[] = [];
    const server = await startStaticServer({ rootDirectory: resolve(source, "game"), exposure: "isolated-root" });
    try {
      for (let repeat = 0; repeat < 3; repeat++) {
        const context = await browser.newContext({ viewport: { width: 1000, height: 800 } });
        try {
          const requests: string[] = [], errors: string[] = [];
          await context.route("**/*", async route => { if (new URL(route.request().url()).origin !== server.origin) { requests.push(route.request().url()); await route.abort(); } else await route.continue(); });
          const page = await context.newPage();
          page.on("pageerror", error => errors.push(error.message));
          await page.clock.install({ time: 1_700_000_000_000 });
          await page.clock.pauseAt(1_700_000_000_000);
          await page.goto(server.origin);
          await page.evaluate(() => window.__GAMETESTLAB__!.reset({ seed: 404 }));
          await page.clock.runFor(100);
          const trace: any[] = [];
          const sample = async (action: string) => {
            const state = await page.evaluate(async () => (await window.__GAMETESTLAB__!.observe()).state);
            const hud = await page.locator('[data-testid="status"]').textContent();
            const scoreHud = await page.locator('[data-testid="score"]').textContent();
            trace.push({ action, state, hud, scoreHud });
          };
          await sample("menu");
          await page.locator("#start-btn").click({ timeout: 1500 });
          await page.clock.runFor(100); await sample("START + 100ms");
          if (spec.id === "particle-orchestra") {
            for (const key of ["Digit1", "Digit3", "Digit4", "Digit2"]) { await page.keyboard.press(key); await page.clock.runFor(100); await sample(key + " + 100ms"); }
          } else if (spec.id === "zen-garden") {
            for (let i = 0; i < 2; i++) { await page.locator("#wrong-action").click({ timeout: 1500 }); await page.clock.runFor(100); await sample("WRONG + 100ms"); }
          } else {
            await page.locator("#stage-1").click({ timeout: 1500 }); await page.clock.runFor(100); await sample("STAGE_1 + 100ms");
          }
          // Deliberately allow many real rendering callbacks before claiming a persistent defect.
          await page.clock.runFor(1000); await sample("wait 1000ms");
          const restartVisible = await page.locator("#restart-btn").isVisible();
          const final = trace.at(-1);
          const reproduced = spec.id === "particle-orchestra" ? final.state.status === "won" && final.state.score !== 100
            : spec.id === "zen-garden" ? final.state.status === "lost" && final.hud?.trim() !== "Lost" : final.state.status === "playing" && !restartVisible;
          await page.screenshot({ path: resolve(out, `${spec.id}-${repeat}.png`) });
          runs.push({ repeat, reproduced, restartVisible, trace, errors, external_requests: requests });
        } finally { await context.close(); }
      }
    } finally { await server.close(); }
    const finding = { ...spec, source: relative(process.cwd(), source), difficulty: task.difficulty, generator: "hy3", game_sha256: hash,
      history_complete: history.complete, history_issues: history.issues,
      code_provenance: spec.excerpt ? locateExcerpt(history, "game.js", spec.excerpt) : null,
      first_reasoning_error: null, human_review: null, runs,
      scope: "Browser-reproduced candidate; source provenance is not an independently confirmed reasoning-error step" };
    findings.push(finding);
    await writeFile(resolve(out, `${spec.id}.json`), JSON.stringify(finding, null, 2));
    console.log(JSON.stringify({ id: spec.id, reproduced: runs.filter(r => r.reproduced).length, repeats: runs.length, history: history.complete }));
  }
} finally { await browser.close(); }
await writeFile(resolve(out, "summary.json"), JSON.stringify({ scanned_games: 96, historical_candidates: candidates.length, tested_games: findings.length, browser_runs: findings.reduce((n, f) => n + f.runs.length, 0), findings }, null, 2));
