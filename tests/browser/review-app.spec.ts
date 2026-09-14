import { test, expect } from "@playwright/test";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startReviewServer } from "../../src/runtime/review-server";

test("review application shows action states and is read-only", async ({ page }) => {
  const root = await mkdtemp(join(tmpdir(), "review-browser-fixture-"));
  const dir = join(root, "test-game"); await mkdir(dir);
  await writeFile(join(root, "manifest.json"), JSON.stringify({ tasks: ["test-game"] }));
  await writeFile(join(dir, "status.json"), JSON.stringify({ stage: "complete", difficulty: "D1" }));
  await writeFile(join(dir, "solution-plan.json"), JSON.stringify({ steps: [{ id: 1, requirement: "落地后才能跳跃", implementation: "检查 grounded", verification: "在空中按键" }] }));
  await writeFile(join(dir, "review.json"), JSON.stringify({ verdict: { final_correct: true, process_correct: false, first_error_step: 1, apparent_pass_with_flaw: false, findings: [], limits: ["synthetic fixture"] }, findings: [] }));
  await mkdir(join(dir, "browser"));
  await writeFile(join(dir, "browser", "result.json"), JSON.stringify({ scenarios: [] }));
  await writeFile(join(dir, "browser", "events.jsonl"), [
    { scenario_id: "jump", replay_index: 0, action_index: 0, action_id: "START", elapsed_ms: 0, bridge: { state: { grounded: true, y: 100 } } },
    { scenario_id: "jump", replay_index: 0, action_index: 1, action_id: "JUMP", elapsed_ms: 16, bridge: { state: { grounded: false, y: 89 } }, samples: [{ tick: 1, state: { y: 89 } }] }
  ].map(row => JSON.stringify(row)).join("\n"));
  const server = await startReviewServer(root, 0);
  try {
    await page.goto(server.origin);
    await expect(page.getByRole("heading", { name: "公开实现方案" })).toBeVisible();
    await expect(page.getByText("检查 grounded", { exact: true })).toBeVisible();
    await page.getByText("逐步查看操作和对象状态", { exact: true }).click();
    await page.getByText("jump · 重放 1 · 操作 1 JUMP · 16 ms", { exact: true }).click();
    const jump = page.locator("details").filter({ has: page.getByText("jump · 重放 1 · 操作 1 JUMP · 16 ms", { exact: true }) }).last();
    await expect(jump.locator("pre").first()).toContainText('"before": 100');
    await expect(jump.locator("pre").first()).toContainText('"after": 89');
    await expect(page.locator("form")).toHaveCount(0);
  } finally { await server.close(); await rm(root, { recursive: true, force: true }); }
});
