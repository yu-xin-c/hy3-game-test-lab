import { readFile } from "node:fs/promises";
import { expect, it } from "vitest";
import { stageRuleReference } from "../../src/evaluation/stage-rule-reference";
const load = async () => stageRuleReference(await readFile(new URL("../../datasets/game-tasks/fruit-combo/brief.md", import.meta.url), "utf8"))!;
it("follows the public ordered stages and ignores terminal input", async () => {
  const model = await load();
  for (const action of ["START", "STAGE_1", "STAGE_2", "STAGE_3"]) model.input(action);
  expect(model.snapshot()).toEqual({ status: "won", progress: 3, score: 30, lives: 2 });
  const terminal = model.snapshot();
  expect(model.input("WRONG")).toEqual(terminal);
});
it("checks the two-error path and preserves uncertainty after partial progress", async () => {
  const model = await load();
  model.input("START"); model.input("WRONG"); model.input("WRONG");
  expect(model.snapshot()).toEqual({ status: "lost", progress: 0, score: 0, lives: 0 });
  model.input("RESTART"); model.input("START"); model.input("STAGE_1"); model.input("WRONG");
  expect(model.snapshot()).toEqual({ status: "playing", progress: 0, lives: 1 });
});
it("does not silently apply this model to a different task family", () => {
  expect(stageRuleReference("Three stages with different scoring.")).toBeNull();
});
