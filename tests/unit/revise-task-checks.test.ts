import { readFile } from "node:fs/promises";
import { expect, it } from "vitest";
import { GameTaskOracleSchema, GameTaskPlanSchema } from "../../src/contracts/game-tasks";
import { reviseTaskChecks } from "../../src/contracts/revise-task-checks";

it("revises checks without changing archived input or applying timing twice", async () => {
  for (const id of ["target-rush", "key-door-escape", "mini-farm", "science-lab"]) {
    const root = new URL(`../../results/codebuddy-hy3-pilot/evidence/${id}/task/`, import.meta.url);
    const plan = GameTaskPlanSchema.parse(JSON.parse(await readFile(new URL("test-plan.json", root), "utf8")));
    const oracle = GameTaskOracleSchema.parse(JSON.parse(await readFile(new URL("oracle.private.json", root), "utf8")));
    const before = JSON.stringify({ plan, oracle });
    const revised = reviseTaskChecks(plan, oracle);
    expect(JSON.stringify({ plan, oracle })).toBe(before);
    expect(reviseTaskChecks(revised.plan, revised.oracle)).toEqual(revised);
    expect(revised.oracle.scenarios.every(s => s.checkpoints.some(cp => cp.layer === "L1"))).toBe(true);
    if (id === "science-lab") expect(revised.plan.scenarios.map(s => s.id)).toContain("skip-mixing");
  }
});
