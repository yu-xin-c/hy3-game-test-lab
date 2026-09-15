import { readFile, readdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium, type Page } from "@playwright/test";
import { contentHash } from "../src/evaluation/generation-provenance";
import { startStaticServer } from "../src/runtime/static-server";

const root = resolve(process.argv[2] ?? "results/process-15-v1/room-five-in-row");
const brief = await readFile(resolve(root, "task/brief.md"), "utf8");
for (const rule of ["P1 与 P2 严格轮流落子", "P1 测试路径在第0行从左到右落五子", "Restart 同步清空棋盘、回合、步数和房间状态"]) {
  if (!brief.includes(rule)) throw new Error(`Public rule changed: ${rule}`);
}
const names = (await readdir(resolve(root, "game"))).sort((a, b) => a.localeCompare(b));
let bundle = "";
for (const name of names) bundle += name + "\0" + await readFile(resolve(root, "game", name), "utf8") + "\0";
const browserRecord = JSON.parse(await readFile(resolve(root, "browser/result.json"), "utf8"));
if (contentHash(bundle) !== browserRecord.input_hashes.game_directory_sha256) throw new Error("Game changed since original Chromium execution");
const server = await startStaticServer({ rootDirectory: resolve(root, "game"), exposure: "isolated-root" });
const browser = await chromium.launch({ headless: true });
const read = (page: Page) => page.evaluate(() => ({
  observation: (window as any).__GAMETESTLAB__.observe(),
  events: (window as any).__GAMETESTLAB__.getEvents({ afterSeq: 0 }),
  hud: {
    score: document.querySelector('[data-testid="score"]')?.textContent,
    status: document.querySelector('[data-testid="status"]')?.textContent
  }
}));
const waitMoves = async (pages: Page[], moves: number) => {
  for (const page of pages) await page.waitForFunction((count: number) => (window as any).__GAMETESTLAB__.observe().state.moves === count, moves);
};
const rows: any[] = [];
try {
  for (let replay = 0; replay < 3; replay++) for (const scenario of ["primary-win-and-restart", "secondary-win"]) {
    const context = await browser.newContext({ viewport: { width: 800, height: 600 }, locale: "zh-CN", timezoneId: "Asia/Shanghai" });
    try {
      const primary = await context.newPage(), secondary = await context.newPage();
      await Promise.all([primary.goto(server.origin + "/index.html"), secondary.goto(server.origin + "/index.html")]);
      await Promise.all([primary.waitForFunction(() => (window as any).__GAMETESTLAB__?.isReady()), secondary.waitForFunction(() => (window as any).__GAMETESTLAB__?.isReady())]);
      await primary.click("#start-btn");
      const afterStart = await read(primary);
      await secondary.click("#join-btn");
      await Promise.all([primary.waitForFunction(() => (window as any).__GAMETESTLAB__.observe().state.status === "playing"),
        secondary.waitForFunction(() => (window as any).__GAMETESTLAB__.observe().state.status === "playing")]);
      const joined = [await read(primary), await read(secondary)];
      const pages = [primary, secondary];
      if (scenario === "primary-win-and-restart") {
        for (let i = 0; i < 5; i++) {
          await primary.click(`#cell-r0-c${i}`); await waitMoves(pages, 2 * i + 1);
          if (i < 4) { await secondary.click(`#cell-r4-c${i}`); await waitMoves(pages, 2 * i + 2); }
        }
        const terminal = [await read(primary), await read(secondary)];
        await primary.click("#restart-btn"); await waitMoves(pages, 0);
        const restarted = [await read(primary), await read(secondary)];
        await primary.waitForFunction(() => (window as any).__GAMETESTLAB__.observe().tick >= 5);
        const tickBeforeReset = await read(primary);
        const tickAfterReset = await primary.evaluate(() => {
          const bridge = (window as any).__GAMETESTLAB__;
          bridge.reset({ seed: 1 });
          return { observation: bridge.observe(), events: bridge.getEvents({ afterSeq: 0 }) };
        });
        rows.push({ replay, scenario, afterStart, joined, terminal, restarted, tick_probe: { before: tickBeforeReset.observation,
          after: tickAfterReset.observation, events_after: tickAfterReset.events } });
      } else {
        for (let i = 0; i < 4; i++) {
          await primary.click(`#cell-r0-c${i}`); await waitMoves(pages, 2 * i + 1);
          await secondary.click(`#cell-r4-c${i}`); await waitMoves(pages, 2 * i + 2);
        }
        await primary.click("#cell-r1-c0"); await waitMoves(pages, 9);
        await secondary.click("#cell-r4-c4"); await waitMoves(pages, 10);
        const terminal = [await read(primary), await read(secondary)];
        rows.push({ replay, scenario, afterStart, joined, terminal });
      }
    } catch (error) { rows.push({ replay, scenario, error: String((error as Error).message) }); }
    finally { await context.close(); }
  }
} finally { await browser.close(); await server.close(); }
const goodStart = rows.filter(r => !r.error && r.afterStart.observation.state.status === "menu" && r.afterStart.events.some((e: any) => e.type === "room_created") &&
  r.joined.every((p: any) => p.observation.state.status === "playing" && p.observation.state.connected === true)).length;
const primaryWins = rows.filter(r => r.scenario === "primary-win-and-restart" && !r.error &&
  r.terminal[0].observation.state.status === "won" && r.terminal[1].observation.state.status === "lost" &&
  r.terminal.every((p: any) => p.observation.state.winner === "P1" && p.observation.state.moves === 9)).length;
const secondaryWins = rows.filter(r => r.scenario === "secondary-win" && !r.error &&
  r.terminal[0].observation.state.status === "lost" && r.terminal[1].observation.state.status === "won" &&
  r.terminal.every((p: any) => p.observation.state.winner === "P2" && p.observation.state.moves === 10)).length;
const roomClears = rows.filter(r => r.scenario === "primary-win-and-restart" && !r.error &&
  r.restarted.every((p: any) => p.observation.state.status === "menu" && p.observation.state.connected === false && p.observation.state.moves === 0)).length;
const tickResets = rows.filter(r => r.scenario === "primary-win-and-restart" && !r.error &&
  r.tick_probe.before.tick >= 5 && r.tick_probe.after.tick === 0 && r.tick_probe.after.event_epoch > r.tick_probe.before.event_epoch).length;
const result = { scope: "Extra actual two-page pointer play; original frozen paths and private oracle unchanged", game_directory_sha256: contentHash(bundle),
  replays: 3, start_waits_for_join: goodStart, primary_win_passes: primaryWins, secondary_win_passes: secondaryWins,
  restart_room_clear_passes: roomClears, plan_step4_tick_reset_passes: tickResets, rows };
await writeFile(resolve(root, "grounded-room-probe.json"), JSON.stringify(result, null, 2) + "\n");
console.log(JSON.stringify({ start_waits_for_join: goodStart, primary_win_passes: primaryWins, secondary_win_passes: secondaryWins,
  restart_room_clear_passes: roomClears, plan_step4_tick_reset_passes: tickResets, replays: 3, errors: rows.filter(r => r.error).length }));
