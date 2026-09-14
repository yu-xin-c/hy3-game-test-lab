import { test, expect } from "@playwright/test";
import { resolve } from "node:path";
import { mkdir } from "node:fs/promises";
import { startReviewServer } from "../../src/runtime/review-server";
test("exploration application presents recorded paths and separates diagnostic review", async ({ page, request }) => {
  const server = await startReviewServer(resolve("results/process-v1"), 0, undefined, resolve("results/exploration-v1"));
  try {
    await page.goto(server.origin + "/exploration");
    await expect(page.getByRole("heading", { name: "游戏探索记录" })).toBeVisible();
    await expect(page.locator("#case option")).toHaveCount(3);
    await page.getByLabel("选择游戏").selectOption("mini-farm");
    await expect(page.locator("#summary")).toContainText("26 步记录");
    await expect(page.locator("#summary")).toContainText("3/3");
    await page.getByRole("button", { name: "查看步骤 23", exact: true }).click();
    await expect(page.locator("#after")).toContainText('"status": "lost"');
    await expect(page.locator("#before")).toContainText('"status": "playing"');
    await expect(page.locator("#review")).toContainText("复核未提出缺陷，不代表全部要求已通过");
    await page.getByLabel("选择游戏").selectOption("zen-garden");
    await expect(page.locator("#review")).toContainText("复核未提出缺陷");
    await expect(page.locator("#diagnostic")).toContainText("game.js:128");
    await expect(page.locator("#diagnostic")).toContainText("工具写入步骤 3");
    await page.getByRole("button", { name: "查看步骤 8", exact: true }).click();
    await expect(page.locator("#after")).toContainText("Playing");
    await expect(page.locator("#after")).toContainText('"status": "lost"');
    await expect(page.locator("form")).toHaveCount(0);
    expect((await request.post(server.origin + "/api/exploration")).status()).toBe(404);
    expect((await request.get(server.origin + "/api/exploration/decision-0/response.raw.jsonl")).status()).toBe(404);
    await mkdir(resolve("artifacts"), { recursive: true });
    await page.screenshot({ path: resolve("artifacts/exploration-ui.png"), fullPage: true });
  } finally { await server.close(); }
});
