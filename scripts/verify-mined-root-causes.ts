import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium } from "@playwright/test";
import { startStaticServer } from "../src/runtime/static-server";
import { contentHash } from "../src/evaluation/generation-provenance";
const root = resolve("results/error-mining-v1");
const out = resolve(root, "causal-checks");
await mkdir(out, { recursive: false });
const data = JSON.parse(await readFile(resolve(root, "summary.json"), "utf8"));
const browser = await chromium.launch();
const results: any[] = [];
try {
  for (const id of ["particle-orchestra", "zen-garden"]) {
    const source = data.findings.find((f: any) => f.id === id).source;
    const path = resolve(source, "game/game.js");
    const original = await readFile(path, "utf8");
    const before = id === "particle-orchestra" ? "state.score += 100;" : "function wrongAction() {";
    const after = id === "particle-orchestra" ? "/* diagnostic: suppress duplicate victory bonus */" : "function wrongAction() {\n    try { return diagnosticOriginalWrongAction(); } finally { updateHUD(); updateOverlay(); }\n  }\n  function diagnosticOriginalWrongAction() {";
    if (original.split(before).length !== 2) throw new Error("Non-unique intervention anchor");
    const patched = original.replace(before, after);
    const server = await startStaticServer({ rootDirectory: resolve(source, "game"), exposure: "isolated-root" });
    const runs: any[] = [];
    try {
      for (const condition of ["original", "diagnostic-intervention"]) for (let repeat = 0; repeat < 3; repeat++) {
        const context = await browser.newContext({ viewport: { width: 1000, height: 800 } });
        try {
          await context.route("**/*", async route => {
            const url = new URL(route.request().url());
            if (url.origin !== server.origin) { await route.abort(); return; }
            if (condition === "diagnostic-intervention" && url.pathname === "/game.js") { await route.fulfill({ contentType: "text/javascript", body: patched }); return; }
            await route.continue();
          });
          const page = await context.newPage();
          const errors: string[] = [];
          page.on("pageerror", e => errors.push(e.message));
          await page.clock.install({ time: 1_700_000_000_000 }); await page.clock.pauseAt(1_700_000_000_000);
          await page.goto(server.origin); await page.evaluate(() => window.__GAMETESTLAB__!.reset({ seed: 404 }));
          await page.clock.runFor(100); await page.locator("#start-btn").click({ timeout: 1500 }); await page.clock.runFor(100);
          if (id === "particle-orchestra") {
            for (const key of ["Digit1", "Digit3", "Digit4", "Digit2"]) { await page.keyboard.press(key); await page.clock.runFor(100); }
          } else {
            for (let i = 0; i < 2; i++) { await page.locator("#wrong-action").click({ timeout: 1500 }); await page.clock.runFor(100); }
          }
          await page.clock.runFor(1000);
          const state = await page.evaluate(async () => (await window.__GAMETESTLAB__!.observe()).state);
          const hud = await page.locator('[data-testid="status"]').textContent();
          runs.push({ condition, repeat, state, hud, errors });
        } finally { await context.close(); }
      }
    } finally { await server.close(); }
    if (await readFile(path, "utf8") !== original) throw new Error("Original game changed");
    results.push({ id, original_sha256: contentHash(original), intervention_sha256: contentHash(patched), before, after, runs });
  }
} finally { await browser.close(); }
await writeFile(resolve(out, "result.json"), JSON.stringify({
  kind: "Assistant-designed controlled browser intervention, not Hy3 generation or a replacement benchmark score",
  original_files_unchanged: true, human_validation: null, results
}, null, 2));
console.log(JSON.stringify(results.map(r => ({ id: r.id, runs: r.runs.map((x: any) => ({ condition: x.condition, status: x.state.status, score: x.state.score, hud: x.hud })) }))));
