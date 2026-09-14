import { chromium } from "@playwright/test";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { startStaticServer } from "../src/runtime/static-server";
import { contentHash } from "../src/evaluation/generation-provenance";

const root = resolve("results/process-v1/platform-rescue");
const output = resolve(root, "landing-timing-diagnostic");
await mkdir(output, { recursive: false });
const files = ["game.js", "game.manifest.json", "index.html", "styles.css"];
const hashes = Object.fromEntries(await Promise.all(files.map(async file => [file, contentHash(await readFile(resolve(root, "game", file), "utf8"))])));
const server = await startStaticServer({ rootDirectory: resolve(root, "game"), exposure: "isolated-root" });
const browser = await chromium.launch();
const runs: any[] = [];
try {
  for (const mode of ["immediate", "grounded-input"]) for (let repeat = 0; repeat < 3; repeat++) {
    const context = await browser.newContext({ viewport: { width: 900, height: 760 } });
    try {
      await context.route("**/*", route => new URL(route.request().url()).origin === server.origin ? route.continue() : route.abort());
      const page = await context.newPage();
      const errors: string[] = [];
      page.on("pageerror", error => errors.push(error.message));
      await page.clock.install({ time: 1_700_000_000_000 });
      await page.clock.pauseAt(1_700_000_000_000);
      await page.goto(server.origin);
      await page.evaluate(() => window.__GAMETESTLAB__!.reset({ seed: 404 }));
      const box = await page.locator("#start-btn").boundingBox();
      if (!box) throw new Error("Start not visible");
      await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
      const trace: any[] = [];
      const observe = () => page.evaluate(async () => (await window.__GAMETESTLAB__!.observe()).state as any);
      if (mode === "grounded-input") {
        // No state writes: settle under gravity, then send ordinary keyboard inputs.
        for (let i = 0; i < 20; i++) { if ((await observe()).player.grounded) break; await page.clock.runFor(16); }
      }
      await page.keyboard.down("ArrowRight");
      let jumps = 0;
      const supports = new Set<string>();
      for (let frame = 0; frame < 240; frame++) {
        const state = await observe();
        let input: string | null = null;
        const support = state.player?.support_id;
        if (mode === "immediate" ? frame === 0 || frame === 20 || frame === 40
          : state.player?.grounded && ["ground", "platform-1", "platform-2"].includes(support) && !supports.has(support)) {
          await page.keyboard.press("Space"); input = "Space"; jumps++; supports.add(support);
        }
        trace.push({ frame, input, state });
        if (["won", "lost"].includes(state.status)) break;
        await page.clock.runFor(16);
      }
      await page.keyboard.up("ArrowRight");
      const events = await page.evaluate(() => window.__GAMETESTLAB__!.getEvents({ afterSeq: 0 }));
      runs.push({ mode, repeat, jumps, final: await observe(), errors, events, trace });
    } finally { await context.close(); }
  }
} finally { await browser.close(); await server.close(); }
await writeFile(resolve(output, "result.json"), JSON.stringify({
  purpose: "Diagnostic input-timing comparison, not a replacement for the frozen benchmark path or a human label",
  generator: "hy3", seed: 404, game_hashes: hashes, code_modified: false, state_written: false, runs
}, null, 2));
console.log(JSON.stringify(runs.map(r => ({ mode: r.mode, repeat: r.repeat, status: r.final.status, lives: r.final.lives, has_key: r.final.has_key, jumps: r.jumps }))));
