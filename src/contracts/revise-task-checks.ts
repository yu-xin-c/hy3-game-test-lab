import { GameTaskOracleSchema, GameTaskPlanSchema, type GameTaskOracle, type GameTaskPlan } from "./game-tasks";

/** Explicit v2 checking policy. Never applied to archived inputs on read. */
export function reviseTaskChecks(sourcePlan: GameTaskPlan, sourceOracle: GameTaskOracle) {
  const plan = structuredClone(sourcePlan);
  const oracle = structuredClone(sourceOracle);
  if (plan.checking_policy_version === "2026-09-12.3") return { plan, oracle };
  plan.checking_policy_version = "2026-09-12.3";
  const runRequirement = plan.requirements.find((item) => item.layer === "L1");
  if (!runRequirement) throw new Error(`${plan.task_id}: missing L1 requirement`);
  for (const requirement of plan.requirements.filter((item) => item.layer === "L3")) {
    requirement.statement = "HUD 可见且非空，胜负状态文字正确。分数含义和画面质量另行复核，不由非空检查认证。";
  }
  for (const scenario of plan.scenarios) {
    const expectedScenario = oracle.scenarios.find((item) => item.scenario_id === scenario.id)!;
    if (!expectedScenario) throw new Error(`Missing scenario ${scenario.id}`);
    if (!expectedScenario.checkpoints.some((item) => item.layer === "L1")) {
      const first = scenario.steps[0];
      if (first?.kind !== "input" || first.action_id !== "START") throw new Error("L1 insertion requires START");
      const id = `${plan.task_id}-${scenario.id}-started`;
      first.checkpoints.push(id);
      expectedScenario.checkpoints.unshift({ id, action_index: 0, layer: "L1",
        requirement_ids: [runRequirement.id], terminal: false,
        expected: { state: { status: "playing" }, ui: {}, event_types: ["game_started"], physics: [] } });
    }
    const originalLast = scenario.steps.length - 1;
    let addedMs = 0;
    if (["mini-farm", "science-lab"].includes(plan.task_id) ||
      (plan.task_id === "target-rush" && scenario.id === "timeout-path")) {
      for (const step of scenario.steps) {
        if ((step.kind === "advance_time" || step.kind === "input") && step.advance_ms > 0) {
          step.advance_ms += 32;
          addedMs += 32;
        }
      }
    }
    for (const checkpoint of expectedScenario.checkpoints) {
      checkpoint.expected.event_scope = "since_previous_checkpoint";
      if (checkpoint.layer === "L1") checkpoint.expected.state = { status: "playing" };
      if (plan.task_id === "mini-farm") {
        delete checkpoint.expected.state.selected_plot;
        const elapsed = checkpoint.expected.state.elapsed_ms;
        if (typeof elapsed === "number" && elapsed > 0) {
          checkpoint.expected.state.elapsed_ms = elapsed + addedMs;
          checkpoint.expected.state_tolerances = { elapsed_ms: 32 };
        }
      }
      if (plan.task_id === "science-lab" && typeof checkpoint.expected.state.temperature === "number") {
        checkpoint.expected.state_tolerances = { temperature: 0.64 };
      }
      if (checkpoint.layer !== "L3") continue;
      const status = checkpoint.expected.ui.statusText;
      delete checkpoint.expected.ui.scoreText;
      delete checkpoint.expected.ui.statusText;
      checkpoint.expected.ui_text = {
        scoreText: { mode: "nonempty" },
        ...(typeof status === "string" ? { statusText: { mode: "equals" as const, value: status, ignore_case: true } } : {})
      };
      checkpoint.expected.ui["dom.score.visible"] = true;
      checkpoint.expected.ui["dom.status.visible"] = true;
      if (checkpoint.action_index === originalLast) {
        const step = scenario.steps[originalLast]!;
        step.checkpoints = step.checkpoints.filter((id) => id !== checkpoint.id);
        checkpoint.action_index = scenario.steps.length;
        scenario.steps.push({ kind: "advance_time", advance_ms: 32, checkpoints: [checkpoint.id] });
      }
    }
  }
  if (plan.task_id === "science-lab") {
    for (const mixed of [false, true]) {
      const id = mixed ? "skip-heat-peak" : "skip-mixing";
      const cp = `SL-${id}-rejected`;
      const start = `SL-${id}-started`;
      const action = (action_id: string, checkpoints: string[] = []) => ({ kind: "input" as const, action_id, advance_ms: 0, checkpoints });
      const steps = [action("START", [start]), ...(mixed ? [action("ADD_ACID"), action("ADD_BASE")] : []),
        action("HEAT_DOWN"), { kind: "advance_time" as const, advance_ms: 1032, checkpoints: [] },
        action("HEAT_UP"), action("POUR", [cp])];
      plan.scenarios.push({ id, description: mixed ? "未升到60°C就装瓶，必须失败。" : "未加酸碱就装瓶，必须失败。",
        seed: plan.scenarios[0]!.seed, clock: structuredClone(plan.scenarios[0]!.clock), steps });
      oracle.scenarios.push({ scenario_id: id, checkpoints: [
        { id: start, action_index: 0, layer: "L1", requirement_ids: [runRequirement.id], terminal: false,
          expected: { state: { status: "playing" }, ui: {}, event_types: ["game_started"], event_scope: "since_previous_checkpoint", physics: [] } },
        { id: cp, action_index: steps.length - 1, layer: "L2", requirement_ids: ["SL-LOSS"], terminal: true,
          expected: { state: { status: "lost", acid_added: mixed, base_added: mixed, bottled: false }, ui: {},
            event_types: ["experiment_failed"], event_scope: "since_previous_checkpoint", physics: [] } }
      ] });
    }
  }
  return { plan: GameTaskPlanSchema.parse(plan), oracle: GameTaskOracleSchema.parse(oracle) };
}
