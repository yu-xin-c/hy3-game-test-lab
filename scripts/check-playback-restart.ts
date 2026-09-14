import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium } from "@playwright/test";
import { startStaticServer } from "../src/runtime/static-server";
import { contentHash, reconstructGeneration, locateExcerpt } from "../src/evaluation/generation-provenance";

// Targeted diagnostic, not a blind discovery-rate experiment. Only real input
// changes the game after initial seeded reset; the probe is read-only.
const source = resolve("results/process-v1/signal-memory");
const outArg = process.argv.indexOf("--out");
if (outArg < 0 || !process.argv[outArg + 1]) throw new Error("Provide --out NEW_DIRECTORY");
const out = resolve(process.argv[outArg + 1]!);
const game: Record<string, string> = {};
const hashes = JSON.parse(await readFile(resolve(source, "game-hashes.json"), "utf8"));
for (const name of Object.keys(hashes)) {
  game[name] = await readFile(resolve(source, "game", name), "utf8");
  if (contentHash(game[name]!) !== hashes[name]) throw new Error(`Source changed: ${name}`);
}
await mkdir(out, { recursive: false });
const server = await startStaticServer({ rootDirectory: resolve(source, "game"), exposure: "isolated-root" });
const browser = await chromium.launch();
const runs: any[] = [];
try {
  for (const scenario of ["idle-reset", "playback-reset", "playback-reset-start"] as const) {
    for (let repeat = 1; repeat <= 3; repeat++) {
      const context = await browser.newContext({ viewport: { width: 800, height: 600 } });
      try {
        await context.route("**/*", route => new URL(route.request().url()).origin === server.origin ? route.continue() : route.abort());
        const page = await context.newPage();
        const errors: string[] = [];
        page.on("pageerror", error => errors.push(error.message));
        await page.clock.install({ time: 1700000000000 });
        await page.clock.pauseAt(1700000000000);
        await page.goto(server.origin);
        await page.evaluate(() => window.__GAMETESTLAB__!.reset({ seed: 404 }));
        const steps: any[] = [];
        const snapshot = () => page.evaluate(() => ({
          probe: window.__GAMETESTLAB__!.observe(),
          events: window.__GAMETESTLAB__!.getEvents({ afterSeq: 0 }),
          text: document.body.innerText
        }));
        const record = async (action: string, execute: () => Promise<unknown>) => {
          const before = await snapshot();
          await execute();
          steps.push({ step: steps.length, action, before, after: await snapshot() });
        };
        await record("initial wait 100ms", () => page.clock.runFor(100));
        if (scenario !== "idle-reset") {
          await record("click Start", () => page.locator("#start-btn").click());
          await record("wait 300ms", () => page.clock.runFor(300));
        }
        await record("click Restart", () => page.locator("#restart-btn").click());
        if (scenario === "playback-reset-start") await record("click Start", () => page.locator("#start-btn").click());
        await record("wait 950ms", () => page.clock.runFor(950));
        // In a fresh round the public 2*(400+200)ms playback is still running.
        // A real click here must be ignored, not scored, for reset-start.
        if (scenario === "playback-reset-start") {
          await record("click RED during new-round playback", () => page.locator("#signal-canvas").click({ position: { x: 200, y: 150 } }));
        }
        await record("wait 500ms", () => page.clock.runFor(500));
        const run = { scenario, repeat, errors, steps };
        runs.push(run);
        await writeFile(resolve(out, `${scenario}-${repeat}.json`), JSON.stringify(run, null, 2));
        console.log(JSON.stringify({ scenario, repeat, final: steps.at(-1).after.probe.state, errors }));
      } finally { await context.close(); }
    }
  }
} finally { await browser.close(); await server.close(); }
for (const [name, hash] of Object.entries(hashes)) {
  if (contentHash(await readFile(resolve(source, "game", name), "utf8")) !== hash) throw new Error("Source changed during run");
}
const history = JSON.parse(await readFile(resolve(source, "generation-tools.json"), "utf8"));
const reconstruction = reconstructGeneration(history.calls, game);
const excerpt = "if (i >= seq.length) {\n        currentHighlight = null;\n        state.phase = \"input\";\n        emit(\"input_phase_started\", {});\n        return;\n      }";
await writeFile(resolve(out, "summary.json"), JSON.stringify({
  source: "results/process-v1/signal-memory", game_hashes: hashes,
  environment: { browser: "Chromium", viewport: { width: 800, height: 600 }, seed: 404, clock_epoch_ms: 1700000000000 },
  scope: "Targeted original-game diagnostic prompted by source inspection; not autonomous discovery or verifier accuracy.",
  scenarios: ["idle-reset", "playback-reset", "playback-reset-start"].map(scenario => {
    const group = runs.filter(run => run.scenario === scenario);
    return { scenario, repeats: group.length,
      exact_trace_repeatability: group.every(run => JSON.stringify(run.steps) === JSON.stringify(group[0].steps)),
      final_states: group.map(run => run.steps.at(-1).after.probe.state) };
  }),
  candidate_callback: { excerpt, provenance: locateExcerpt(reconstruction, "game.js", excerpt) },
  public_plan_mapping: { related_steps: [3, 5], earliest_error_step: null,
    reason: "Playback scheduling and reset are related; a missing cancellation mechanism cannot be attributed to one earliest public-plan step from this run alone." }
}, null, 2));
