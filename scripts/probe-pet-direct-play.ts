import { readFile, readdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium } from "@playwright/test";
import { contentHash } from "../src/evaluation/generation-provenance";
import { startStaticServer } from "../src/runtime/static-server";

const root = resolve(process.argv[2] ?? "results/process-15-v1/pet-care-day");
const brief = await readFile(resolve(root, "task/brief.md"), "utf8");
for (const rule of ["初始 hunger、happiness、energy 都是2", "游戏中每2000ms三项各减1", "刷新后必须恢复当前进度"]) {
  if (!brief.includes(rule)) throw new Error(`Pet public rule changed: ${rule}`);
}
const names = (await readdir(resolve(root, "game"))).sort((a, b) => a.localeCompare(b));
let bundle = "";
for (const name of names) bundle += name + "\0" + await readFile(resolve(root, "game", name), "utf8") + "\0";
const original = JSON.parse(await readFile(resolve(root, "browser/result.json"), "utf8"));
if (contentHash(bundle) !== original.input_hashes.game_directory_sha256) throw new Error("Executed game changed");
if (!String(original.scenarios[0].evaluation.first_failure.diffs[0].actual).includes("Unrecognized key")) throw new Error("Original setup failure changed");
const server = await startStaticServer({ rootDirectory: resolve(root, "game"), exposure: "isolated-root" });
const browser = await chromium.launch({ headless: true });
const rows: any[] = [];
try {
  for (let replay = 0; replay < 3; replay++) for (const scenario of ["win-refresh", "loss-virtual-time", "restart-clears-save"]) {
    const context = await browser.newContext({ viewport: { width: 800, height: 600 }, locale: "zh-CN", timezoneId: "Asia/Shanghai" });
    try {
      const page = await context.newPage();
      await page.clock.install({ time: 1_700_000_000_000 });
      const read = () => page.evaluate(() => ({ observation: (window as any).__GAMETESTLAB__.observe(),
        event_types: (window as any).__GAMETESTLAB__.getEvents({ afterSeq: 0 }).map((e: any) => e.type),
        storage: localStorage.getItem("petcare.save"), hud: { score: document.querySelector('[data-testid="score"]')?.textContent,
          status: document.querySelector('[data-testid="status"]')?.textContent } }));
      await page.goto(server.origin + "/index.html");
      await page.waitForFunction(() => (window as any).__GAMETESTLAB__?.isReady());
      const initial = await read();
      await page.click("#start-btn");
      const started = await read();
      let fed: any = null, restored: any = null, terminal: any = null, frozen: any = null, restarted: any = null;
      if (scenario === "loss-virtual-time") {
        await page.clock.runFor(2000);
        const afterDecay = await read();
        await page.clock.runFor(4000);
        terminal = await read();
        await page.clock.runFor(2000);
        frozen = await read();
        rows.push({ replay, scenario, initial, started, afterDecay, terminal, frozen });
      } else {
        await page.click("#feed-btn"); fed = await read();
        await page.reload(); await page.waitForFunction(() => (window as any).__GAMETESTLAB__?.isReady());
        restored = await read();
        if (scenario === "win-refresh") {
          await page.click("#play-btn"); await page.click("#sleep-btn");
          terminal = await read();
          await page.click("#feed-btn"); frozen = await read();
        } else { await page.click("#restart-btn"); restarted = await read(); }
        rows.push({ replay, scenario, initial, started, fed, restored, terminal, frozen, restarted });
      }
    } catch (error) { rows.push({ replay, scenario, error: String((error as Error).message) }); }
    finally { await context.close(); }
  }
} finally { await browser.close(); await server.close(); }
const basic = (r: any) => !r.error && r.initial.observation.state.status === "menu" &&
  [r.initial.observation.state.hunger, r.initial.observation.state.happiness, r.initial.observation.state.energy].join(",") === "2,2,2" &&
  r.started.observation.state.status === "playing" && r.started.event_types.includes("game_started");
const win = rows.filter(r => r.scenario === "win-refresh" && basic(r) && r.fed.observation.state.hunger === 3 &&
  r.restored.observation.state.hunger === 3 && r.restored.event_types.includes("state_loaded") &&
  r.terminal.observation.state.status === "won" && [r.terminal.observation.state.hunger,r.terminal.observation.state.happiness,r.terminal.observation.state.energy].join(",") === "3,3,3" &&
  r.terminal.event_types.includes("game_won") && JSON.stringify(r.terminal.observation.state) === JSON.stringify(r.frozen.observation.state)).length;
const loss = rows.filter(r => r.scenario === "loss-virtual-time" && basic(r) &&
  [r.afterDecay.observation.state.hunger,r.afterDecay.observation.state.happiness,r.afterDecay.observation.state.energy].join(",") === "1,1,1" &&
  r.terminal.observation.state.status === "lost" && r.terminal.observation.state.hunger === 0 && r.terminal.event_types.includes("game_lost") &&
  JSON.stringify(r.terminal.observation.state) === JSON.stringify(r.frozen.observation.state)).length;
const restart = rows.filter(r => r.scenario === "restart-clears-save" && basic(r) && r.fed.storage !== null &&
  r.restored.observation.state.hunger === 3 && r.restarted.observation.state.status === "menu" && r.restarted.storage === null &&
  [r.restarted.observation.state.hunger,r.restarted.observation.state.happiness,r.restarted.observation.state.energy].join(",") === "2,2,2" &&
  r.restarted.event_types.includes("game_reset")).length;
const result = { scope: "Direct actual mouse/reload/virtual-time probe bypasses only the strict observe-object parser; original game/browser scores unchanged",
  game_directory_sha256: contentHash(bundle), replays: 3, observe_extra_protocol_present: rows.every(r => r.error || r.initial.observation.protocol === "gametestlab/2"),
  win_refresh_passes: win, loss_virtual_time_passes: loss, restart_clears_save_passes: restart, rows };
await writeFile(resolve(root, "direct-probe.json"), JSON.stringify(result, null, 2) + "\n");
console.log(JSON.stringify({ replays: 3, win_refresh_passes: win, loss_virtual_time_passes: loss, restart_clears_save_passes: restart,
  errors: rows.filter(r => r.error).length }));
