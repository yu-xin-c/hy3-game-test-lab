import { readFile, readdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium } from "@playwright/test";
import { contentHash } from "../src/evaluation/generation-provenance";
import { startStaticServer } from "../src/runtime/static-server";

const root = resolve(process.argv[2] ?? "results/process-15-v1/mini-farm");
const brief = await readFile(resolve(root, "task/brief.md"), "utf8");
for (const rule of ["虚拟时间累计3000ms后变为 ready", "三块田各收获一次后获胜", "从 Start 起15000ms仍未收获三块田则失败"]) {
  if (!brief.includes(rule)) throw new Error(`Mini Farm public rule changed: ${rule}`);
}
const originalPlan = JSON.parse(await readFile(resolve(root, "solution-plan.json"), "utf8"));
if (!originalPlan.steps[0]?.verification.includes("#start-btn、#plot-1、#plant-btn、#water-btn")) throw new Error("Original step1 direct-click assertion changed");
const names = (await readdir(resolve(root, "game"))).sort((a, b) => a.localeCompare(b));
let bundle = "";
for (const name of names) bundle += name + "\0" + await readFile(resolve(root, "game", name), "utf8") + "\0";
const browserResult = JSON.parse(await readFile(resolve(root, "browser/result.json"), "utf8"));
if (contentHash(bundle) !== browserResult.input_hashes.game_directory_sha256) throw new Error("Executed game changed");
const server = await startStaticServer({ rootDirectory: resolve(root, "game"), exposure: "isolated-root" });
const browser = await chromium.launch({ headless: true });
const rows: any[] = [];
try {
  for (let replay = 0; replay < 3; replay++) {
    const context = await browser.newContext({ viewport: { width: 800, height: 600 }, locale: "zh-CN", timezoneId: "Asia/Shanghai" });
    try {
      const page = await context.newPage();
      await page.clock.install({ time: 1_700_000_000_000 });
      const read = () => page.evaluate(() => ({ observation: (window as any).__GAMETESTLAB__.observe(),
        events: (window as any).__GAMETESTLAB__.getEvents({ afterSeq: 0 }).map((e: any) => e.type),
        buttons: { plot1: !(document.querySelector("#plot-1") as HTMLButtonElement).disabled,
          plant: !(document.querySelector("#plant-btn") as HTMLButtonElement).disabled },
        storage: localStorage.getItem("mini_farm_state") }));
      await page.goto(server.origin + "/index.html");
      await page.waitForFunction(() => (window as any).__GAMETESTLAB__?.isReady());
      await page.clock.pauseAt(await page.evaluate(() => Date.now()));
      const initial = await read();
      await page.click("#start-btn");
      const immediate = await read();
      await page.clock.runFor(32);
      const frame32 = await read();
      const harvests: any[] = [];
      for (let p = 1; p <= 3; p++) {
        await page.click(`#plot-${p}`);
        await page.click("#plant-btn");
        await page.click("#water-btn");
        await page.clock.runFor(3032);
        const ready = await read();
        await page.click("#harvest-btn");
        const harvested = await read();
        harvests.push({ plot: p, ready, harvested });
      }
      const terminal = await read();
      rows.push({ replay, initial, immediate, frame32, harvests, terminal });
    } catch (error) { rows.push({ replay, error: String((error as Error).message) }); }
    finally { await context.close(); }
  }
} finally { await browser.close(); await server.close(); }
const startsDisabled = rows.filter(r => !r.error && r.immediate.observation.state.status === "playing" &&
  r.immediate.events.includes("game_started") && !r.immediate.buttons.plot1 && !r.immediate.buttons.plant).length;
const restoredAfterFrame = rows.filter(r => !r.error && r.frame32.observation.state.status === "playing" && r.frame32.buttons.plot1 && r.frame32.buttons.plant).length;
const win = rows.filter(r => !r.error && r.harvests.length === 3 && r.harvests.every((h: any, i: number) =>
  h.ready.observation.state.plots[i].status === "ready" && h.harvested.observation.state.plots[i].status === "harvested" &&
  h.harvested.observation.state.coins === (i + 1) * 10) && r.terminal.observation.state.status === "won" &&
  r.terminal.observation.state.coins === 30 && r.terminal.observation.state.best_coins === 30 && r.terminal.events.includes("game_won")).length;
const out = { scope: "Selected original-plan step1 direct-click timing and public grounded play; generated code and original browser scores unchanged",
  game_directory_sha256: contentHash(bundle), replays: 3, immediate_buttons_disabled_after_start: startsDisabled,
  buttons_enabled_after_32ms_frame: restoredAfterFrame, grounded_three_plot_win_passes: win,
  original_plan_step1_verification: originalPlan.steps[0].verification, rows };
await writeFile(resolve(root, "start-timing-probe.json"), JSON.stringify(out, null, 2) + "\n");
console.log(JSON.stringify({ immediate_buttons_disabled_after_start: startsDisabled, buttons_enabled_after_32ms_frame: restoredAfterFrame,
  grounded_three_plot_win_passes: win, errors: rows.filter(r => r.error).length }));
