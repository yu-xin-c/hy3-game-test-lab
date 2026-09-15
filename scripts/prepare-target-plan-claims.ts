import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium, type Page } from "@playwright/test";
import { startStaticServer } from "../src/runtime/static-server";
import { contentHash, reconstructGeneration } from "../src/evaluation/generation-provenance";

const at = process.argv.indexOf("--out");
if (at < 0 || !process.argv[at + 1]) throw new Error("Provide --out NEW_DIRECTORY");
const out = resolve(process.argv[at + 1]!);
const source = resolve("results/process-v1/target-rush"), baseline = resolve("results/plan-claims-v3");
const planText = await readFile(resolve(source, "solution-plan.json"), "utf8");
const plan = JSON.parse(planText);
if (plan.steps.length !== 6 || plan.steps.some((s: any, i: number) => s.id !== i + 1)) throw new Error("Original plan changed");
const gameFiles = Object.fromEntries(await Promise.all(["game.js", "game.manifest.json", "index.html", "styles.css"].map(async name => [name, await readFile(resolve(source, "game", name), "utf8")] as const)));
const toolLog = JSON.parse(await readFile(resolve(source, "generation-tools.json"), "utf8"));
if (!reconstructGeneration(toolLog.calls, gameFiles).complete) throw new Error("Game generation reconstruction failed");
const oldInput = await readFile(resolve(baseline, "input-sha256.txt"), "utf8");
for (const name of ["observations.json", "packets.json", "gold.json"]) if (!oldInput.includes(`${contentHash(await readFile(resolve(baseline, name), "utf8"))}  ${name}`)) throw new Error("Baseline hash mismatch");
const oldGold = JSON.parse(await readFile(resolve(baseline, "gold.json"), "utf8"));
const oldPackets = JSON.parse(await readFile(resolve(baseline, "packets.json"), "utf8"));
const firstTwo = oldGold.find((g: any) => g.id === "target-rush-prefix-2");
if (JSON.stringify(firstTwo.selected_assertion_results) !== "[true,true]") throw new Error("Original first two step results changed");
const sourceRepetitions = oldPackets.find((p: any) => p.id === "target-rush-prefix-2").repetitions;
await mkdir(out, { recursive: false });
const browser = await chromium.launch();
const server = await startStaticServer({ rootDirectory: resolve(source, "game"), exposure: "isolated-root" });
const observe = async (page: Page) => page.evaluate(() => ({
  bridge: { protocol: window.__GAMETESTLAB__!.protocol, ready: window.__GAMETESTLAB__!.isReady() },
  observation: window.__GAMETESTLAB__!.observe(),
  events: window.__GAMETESTLAB__!.getEvents({ afterSeq: 0 }),
  hud: { score: document.querySelector('[data-testid="score"]')?.textContent, status: document.querySelector('[data-testid="status"]')?.textContent }
}));
const resetStart = async (page: Page) => { await page.evaluate(() => window.__GAMETESTLAB__!.reset({ seed: 42 })); await page.locator("#start-btn").click(); };
const blank = async (page: Page) => { const b = await page.locator("#game").boundingBox(); if (!b) throw new Error("Game surface absent"); await page.mouse.click(b.x + 20, b.y + 100); };
const repetitions: any[] = [];
try {
  for (let repeat = 1; repeat <= 3; repeat++) {
    const context = await browser.newContext({ viewport: { width: 800, height: 600 } });
    try {
      await context.route("**/*", route => new URL(route.request().url()).origin === server.origin ? route.continue() : route.abort());
      const page = await context.newPage();
      await page.clock.install({ time: 1700000000000 });
      await page.clock.pauseAt(1700000000000);
      await page.goto(server.origin);
      await resetStart(page);
      const before3 = await observe(page);
      await page.locator("#target").click(); const hit3 = await observe(page);
      await blank(page); const miss3 = await observe(page);
      await page.locator('[data-testid="score"]').click(); const hud3 = await observe(page);

      await resetStart(page);
      const winStates = [];
      for (let n = 0; n < 5; n++) { await page.locator("#target").click(); winStates.push(await observe(page)); }
      const beforePostWin = await observe(page); await blank(page); const postWin = await observe(page);
      await resetStart(page);
      const lossStates = [];
      for (let n = 0; n < 3; n++) { await blank(page); lossStates.push(await observe(page)); }
      const beforePostLoss = await observe(page); await blank(page); const postLoss = await observe(page);
      await resetStart(page);
      await page.clock.runFor(20032); const timedOut = await observe(page);

      await resetStart(page); await page.locator("#restart-btn").click(); const buttonRestart = await observe(page);
      await resetStart(page); await page.keyboard.press("r"); const keyRestart = await observe(page);
      await resetStart(page); for (let n = 0; n < 5; n++) await page.locator("#target").click();
      await page.locator("#restart-btn").click(); const terminalRestart = await observe(page);

      await page.evaluate(() => window.__GAMETESTLAB__!.reset({ seed: 42 })); const bridgeReset = await observe(page);
      await page.locator("#start-btn").click(); await page.locator("#target").click();
      const bridgePlaying = await observe(page);
      const filtered = await page.evaluate(() => window.__GAMETESTLAB__!.getEvents({ afterSeq: 1 }));
      repetitions.push({ repeat, step3: { before: before3, hit: hit3, miss: miss3, hud: hud3 },
        step4: { winStates, beforePostWin, postWin, lossStates, beforePostLoss, postLoss, timedOut },
        step5: { buttonRestart, keyRestart, terminalRestart }, step6: { reset: bridgeReset, playing: bridgePlaying, filtered } });
    } finally { await context.close(); }
  }
} finally { await browser.close(); await server.close(); }
const has = (s: any, type: string) => s.events.some((e: any) => e.type === type);
const noNew = (a: any, b: any) => a.observation.latest_event_seq === b.observation.latest_event_seq && a.events.length === b.events.length;
const checks = repetitions.map(r => ({ repeat: r.repeat,
  step3: r.step3.hit.observation.state.score === r.step3.before.observation.state.score + 1 && has(r.step3.hit, "target_hit") &&
    r.step3.miss.observation.state.misses === r.step3.hit.observation.state.misses + 1 && has(r.step3.miss, "target_missed") &&
    r.step3.hud.observation.state.misses === r.step3.miss.observation.state.misses,
  step4: r.step4.winStates.at(-1).observation.status === "won" && has(r.step4.winStates.at(-1), "game_won") &&
    r.step4.lossStates.at(-1).observation.status === "lost" && has(r.step4.lossStates.at(-1), "game_lost") &&
    r.step4.timedOut.observation.status === "lost" && has(r.step4.timedOut, "game_lost") &&
    noNew(r.step4.beforePostWin, r.step4.postWin) && noNew(r.step4.beforePostLoss, r.step4.postLoss),
  step5: [r.step5.buttonRestart, r.step5.keyRestart, r.step5.terminalRestart].every((s: any) =>
    s.observation.status === "menu" && s.observation.state.score === 0 && s.observation.state.misses === 0 &&
    s.observation.state.remaining_ms === 20000 && s.observation.state.target_index === 0 && s.events[0]?.type === "game_reset"),
  step6: [r.step6.reset, r.step6.playing].every((s: any) => s.bridge.protocol === "gametestlab/2" && s.bridge.ready === true &&
    ["status", "score", "misses", "remaining_ms", "target_index"].every(k => k in s.observation.state)) &&
    r.step6.playing.events.every((e: any, i: number) => e.seq === i + 1) &&
    r.step6.playing.observation.latest_event_seq === r.step6.playing.events.length &&
    r.step6.filtered.every((e: any) => e.seq > 1) && r.step6.playing.hud.score?.includes("Score:") &&
    r.step6.playing.hud.status?.trim().toLowerCase() === "playing"
}));
const results = [3, 4, 5, 6].map(step => ({ step, observed_three_contexts: checks.map(c => c[`step${step}` as keyof typeof c]),
  selected_assertion_valid: checks.every(c => c[`step${step}` as keyof typeof c] === true) }));
const packets = [];
const gold = [];
for (const length of [3, 4, 5, 6]) {
  const selected = [true, true, ...results.slice(0, length - 2).map(r => r.selected_assertion_valid)];
  const first = selected.indexOf(false);
  const id = `target-rush-prefix-${length}`;
  gold.push({ id, has_error: first >= 0, first_error_step: first >= 0 ? first + 1 : null, selected_assertion_results: selected });
  packets.push({ id, steps: plan.steps.slice(0, length),
    scope: `仅核验原文步骤1至${length}的verification中已执行部分：1 Start/事件，2 seed=42五目标复现，3 HIT/MISS/HUD，4 五HIT/三MISS/计时归零及终局后事件，5按钮/KeyR重开，6只读桥/事件过滤/HUD。步骤${length + 1}以后不在本包。代码实现细节与未执行条件证据不足，不能因所选检查通过宣称整份方案正确。`,
    baseline_first_two: sourceRepetitions, observed_steps: repetitions.map(r => ({ repeat: r.repeat,
      ...Object.fromEntries([3, 4, 5, 6].filter(s => s <= length).map(s => [`step${s}`, r[`step${s}`]])) })) });
}
await writeFile(resolve(out, "observations.json"), JSON.stringify({ plan_sha256: contentHash(planText), game_hashes: Object.fromEntries(Object.entries(gameFiles).map(([k, v]) => [k, contentHash(v)])), repetitions }, null, 2));
await writeFile(resolve(out, "checks.json"), JSON.stringify({ scope: "Selected executable verification assertions only", checks, results }, null, 2));
await writeFile(resolve(out, "packets.json"), JSON.stringify(packets, null, 2));
await writeFile(resolve(out, "gold.json"), JSON.stringify(gold, null, 2));
const frozenNames = ["observations.json", "checks.json", "packets.json", "gold.json"];
await writeFile(resolve(out, "input-sha256.txt"), (await Promise.all(frozenNames.map(async name => `${contentHash(await readFile(resolve(out, name), "utf8"))}  ${name}`))).join("\n") + "\n");
console.log(JSON.stringify({ results, gold }));
