import type { GameManifest } from "./generation";
import {
  PrivateOracleSchema,
  PublicCaseSchema,
  type PrivateOracle,
  type PublicCase
} from "./schemas";
import type { GameTaskOracle, GameTaskPlan } from "./game-tasks";

function sameValue(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function expectedStateFields(oracle: GameTaskOracle): Set<string> {
  return new Set(
    oracle.scenarios.flatMap((scenario) =>
      scenario.checkpoints.flatMap((checkpoint) =>
        Object.keys(checkpoint.expected.state).map((path) => path.split(".")[0] ?? path)
      )
    )
  );
}

function expectedEventTypes(oracle: GameTaskOracle): Set<string> {
  return new Set(
    oracle.scenarios.flatMap((scenario) =>
      scenario.checkpoints.flatMap((checkpoint) => checkpoint.expected.event_types)
    )
  );
}

export function assertGameManifestMatchesTask(
  plan: GameTaskPlan,
  oracle: GameTaskOracle,
  manifest: GameManifest
): void {
  const errors: string[] = [];
  if (manifest.entry_path !== "index.html") errors.push("entry_path must be index.html");
  if (manifest.surface !== plan.surface) {
    errors.push(`surface is ${manifest.surface}, expected ${plan.surface}`);
  }
  if (!sameValue(manifest.viewport, plan.viewport)) {
    errors.push("viewport does not match the task plan");
  }

  const taskControls = new Map(plan.controls.map((control) => [control.action_id, control]));
  const manifestControls = new Map(
    manifest.controls.map((control) => [control.action_id, control])
  );
  for (const [actionId, taskControl] of taskControls) {
    const gameControl = manifestControls.get(actionId);
    if (!gameControl) {
      errors.push(`missing control ${actionId}`);
      continue;
    }
    for (const field of [
      "actor",
      "device",
      "key_event",
      "code",
      "selector",
      "x_ratio",
      "y_ratio",
      "fixture_frame"
    ] as const) {
      if (!sameValue(gameControl[field], taskControl[field])) {
        errors.push(`control ${actionId}.${field} does not match`);
      }
    }
  }
  for (const actionId of manifestControls.keys()) {
    if (!taskControls.has(actionId)) errors.push(`unexpected control ${actionId}`);
  }

  for (const key of ["score", "status"] as const) {
    if (manifest.hud_selectors[key] !== plan.selectors[key]) {
      errors.push(`hud selector ${key} does not match`);
    }
  }
  const manifestStateFields = new Set(Object.keys(manifest.state_schema.fields));
  for (const field of expectedStateFields(oracle)) {
    if (!manifestStateFields.has(field)) errors.push(`state schema is missing ${field}`);
  }
  const manifestEventTypes = new Set(
    manifest.event_schema.map((event) => event.type)
  );
  for (const eventType of expectedEventTypes(oracle)) {
    if (!manifestEventTypes.has(eventType)) {
      errors.push(`event schema is missing ${eventType}`);
    }
  }
  if (errors.length > 0) {
    throw new Error(`Generated game does not match task ${plan.task_id}:\n- ${errors.join("\n- ")}`);
  }
}

export function taskPlanToPublicCase(plan: GameTaskPlan): PublicCase {
  return PublicCaseSchema.parse({
    schema_version: "gametestlab.case.v3",
    id: plan.task_id,
    title: plan.title,
    difficulty: plan.difficulty,
    source: {
      type: "hy3_generated",
      description: "Generated from a frozen GameTestLab game task",
      license: "evaluation artifact"
    },
    game: {
      entry_path: "/index.html",
      surface: plan.surface,
      viewport: plan.viewport,
      selectors: plan.selectors
    },
    controls: plan.controls,
    requirements: plan.requirements,
    scenarios: plan.scenarios
  });
}

export function taskScenarioToPrivateOracle(
  plan: GameTaskPlan,
  taskOracle: GameTaskOracle,
  scenarioId: string
): PrivateOracle {
  const scenario = taskOracle.scenarios.find(
    (candidate) => candidate.scenario_id === scenarioId
  );
  if (!scenario) {
    throw new Error(`${plan.task_id} has no oracle for scenario ${scenarioId}`);
  }
  return PrivateOracleSchema.parse({
    schema_version: "gametestlab.oracle.v2",
    case_id: plan.task_id,
    scenario_id: scenarioId,
    checkpoints: scenario.checkpoints,
    fault_ground_truth: {
      sample_kind: "clean",
      first_divergence_checkpoint: null,
      root_requirement_id: null,
      root_layer: null,
      error_type: "none",
      final_outcome_correct: true
    }
  });
}

export interface AdaptedGameTask {
  publicCase: PublicCase;
  scenarioOracles: PrivateOracle[];
}

export function adaptGameTask(
  plan: GameTaskPlan,
  oracle: GameTaskOracle,
  manifest: GameManifest
): AdaptedGameTask {
  if (plan.task_id !== oracle.task_id) {
    throw new Error("Task plan and oracle IDs do not match");
  }
  assertGameManifestMatchesTask(plan, oracle, manifest);
  return {
    publicCase: taskPlanToPublicCase(plan),
    scenarioOracles: plan.scenarios.map((scenario) =>
      taskScenarioToPrivateOracle(plan, oracle, scenario.id)
    )
  };
}
