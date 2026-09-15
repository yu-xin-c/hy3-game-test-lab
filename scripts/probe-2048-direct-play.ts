import { readFile, readdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium } from "@playwright/test";
import { contentHash } from "../src/evaluation/generation-provenance";
import { startStaticServer } from "../src/runtime/static-server";

const root = resolve(process.argv[2] ?? "results/process-15-v1/persistent-2048");
const brief = await readFile(resolve(root, "task/brief.md"), "utf8");
for (const rule of ["初始第0行为 [2,2,0,0]", "第二步向下合出 8 时获胜", "刷新后该状态必须恢复"]) {
  if (!brief.includes(rule)) throw new Error(`Public 2048 rule changed: ${rule}`);
}
const originalPlan = JSON.parse(await readFile(resolve(root, "solution-plan.json"), "utf8"));
if (!originalPlan.steps[2]?.verification.includes("ArrowRight 再 ArrowUp（不产生 8）")) throw new Error("Original plan claim changed");
const names = (await readdir(resolve(root, "game"))).sort((a, b) => a.localeCompare(b));
let bundle = "";
for (const name of names) bundle += name + "\0" + await readFile(resolve(root, "game", name), "utf8") + "\0";
const original = JSON.parse(await readFile(resolve(root, "browser/result.json"), "utf8"));
if (contentHash(bundle) !== original.input_hashes.game_directory_sha256) throw new Error("Executed game changed");
if (!String(original.scenarios[0].evaluation.first_failure.diffs[0].actual).includes('Unrecognized key: \\\"protocol\\\"')) {
  throw new Error("Original setup failure is not the known extra observe.protocol field");
}
const server = await startStaticServer({ rootDirectory: resolve(root, "game"), exposure: "isolated-root" });
const browser = await chromium.launch({ headless: true });
const rows: any[] = [];
try {
  for (let replay = 0; replay < 3; replay++) for (const scenario of ["right-down-refresh", "right-up-plan-counterexample", "right-left-loss"]) {
    const context = await browser.newContext({ viewport: { width: 800, height: 600 }, locale: "zh-CN", timezoneId: "Asia/Shanghai" });
    try {
      const page = await context.newPage();
      const read = () => page.evaluate(() => ({ observation: (window as any).__GAMETESTLAB__.observe(),
        event_types: (window as any).__GAMETESTLAB__.getEvents({ afterSeq: 0 }).map((e: any) => e.type),
        storage_keys: Object.keys(localStorage), hud: { score: document.querySelector('[data-testid="score"]')?.textContent,
          status: document.querySelector('[data-testid="status"]')?.textContent } }));
      await page.goto(server.origin + "/index.html");
      await page.waitForFunction(() => (window as any).__GAMETESTLAB__?.isReady());
      const initial = await read();
      await page.click("#start-btn");
      const started = await read();
      await page.keyboard.press("ArrowRight");
      const afterRight = await read();
      let restored: any = null;
      if (scenario === "right-down-refresh") {
        await page.reload(); await page.waitForFunction(() => (window as any).__GAMETESTLAB__?.isReady());
        restored = await read();
      }
      await page.keyboard.press(scenario === "right-down-refresh" ? "ArrowDown" : scenario === "right-up-plan-counterexample" ? "ArrowUp" : "ArrowLeft");
      const terminal = await read();
      await page.keyboard.press("ArrowRight");
      const frozen = await read();
      let restarted: any = null;
      if (scenario === "right-down-refresh") { await page.click("#restart-btn"); restarted = await read(); }
      rows.push({ replay, scenario, initial, started, afterRight, restored, terminal, frozen, restarted });
    } catch (error) { rows.push({ replay, scenario, error: String((error as Error).message) }); }
    finally { await context.close(); }
  }
} finally { await browser.close(); await server.close(); }
const basic = (r: any) => !r.error && r.initial.observation.state.grid[0].join(",") === "2,2,0,0" &&
  r.started.observation.state.status === "playing" && r.afterRight.observation.state.moves === 1 &&
  r.afterRight.observation.state.grid[0][3] === 4 && r.afterRight.observation.state.grid[1][3] === 4;
const winDown = rows.filter(r => r.scenario === "right-down-refresh" && basic(r) &&
  JSON.stringify(r.afterRight.observation.state.grid) === JSON.stringify(r.restored?.observation.state.grid) &&
  r.restored?.observation.state.moves === 1 && r.restored?.event_types.includes("state_loaded") &&
  r.terminal.observation.state.status === "won" && r.terminal.observation.state.max_tile === 8 &&
  r.terminal.observation.state.moves === 2 && r.frozen.observation.state.moves === 2 &&
  r.restarted?.observation.state.status === "menu" && r.restarted?.observation.state.moves === 0 && r.restarted?.storage_keys.length === 0).length;
const winUp = rows.filter(r => r.scenario === "right-up-plan-counterexample" && basic(r) &&
  r.terminal.observation.state.status === "won" && r.terminal.observation.state.max_tile === 8 && r.terminal.observation.state.moves === 2).length;
const loss = rows.filter(r => r.scenario === "right-left-loss" && basic(r) &&
  r.terminal.observation.state.status === "lost" && r.terminal.observation.state.max_tile < 8 && r.terminal.observation.state.moves === 2).length;
const result = { scope: "Direct actual keyboard/reload probe bypasses only the harness strict observe-object parser; original browser result and game unchanged",
  game_directory_sha256: contentHash(bundle), original_plan_step3_claim: originalPlan.steps[2].verification,
  observe_extra_protocol_present: rows.every(r => r.error || r.initial.observation.protocol === "gametestlab/2"),
  replays: 3, right_down_refresh_win_passes: winDown, right_up_plan_counterexample_passes: winUp, right_left_loss_passes: loss, rows };
await writeFile(resolve(root, "direct-probe.json"), JSON.stringify(result, null, 2) + "\n");
console.log(JSON.stringify({ right_down_refresh_win_passes: winDown, right_up_plan_counterexample_passes: winUp,
  right_left_loss_passes: loss, replays: 3, errors: rows.filter(r => r.error).length }));
