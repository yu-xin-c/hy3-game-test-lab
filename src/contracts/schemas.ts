import { z } from "zod";

const StableCaseIdSchema = z.string().min(1).max(80).regex(
  /^[A-Za-z0-9][A-Za-z0-9_-]*$/,
  "case id must be safe for filenames"
);

const SameOriginEntryPathSchema = z.string().min(2).superRefine(
  (entryPath, context) => {
    if (
      !entryPath.startsWith("/") ||
      entryPath.startsWith("//") ||
      entryPath.includes("\\") ||
      entryPath.includes("?") ||
      entryPath.includes("#") ||
      entryPath.includes("\0")
    ) {
      context.addIssue({
        code: "custom",
        message: "entry_path must be a same-origin absolute pathname"
      });
      return;
    }
    let decoded: string;
    try {
      decoded = decodeURIComponent(entryPath);
    } catch {
      context.addIssue({ code: "custom", message: "entry_path has invalid encoding" });
      return;
    }
    const segments = decoded.split("/");
    if (
      decoded.startsWith("//") ||
      decoded.includes("\\") ||
      decoded.includes("\0") ||
      segments.some((segment) => segment === "." || segment === "..")
    ) {
      context.addIssue({
        code: "custom",
        message: "entry_path cannot escape its configured origin"
      });
    }
  }
);

const SafeDatasetFilePathSchema = z.string().min(1).superRefine(
  (filePath, context) => {
    if (
      filePath.startsWith("/") ||
      filePath.includes("\\") ||
      filePath.includes("\0") ||
      filePath.split("/").some((segment) => segment === "" || segment === "." || segment === "..")
    ) {
      context.addIssue({
        code: "custom",
        message: "dataset file must be a safe repository-relative path"
      });
    }
  }
);

export const DifficultySchema = z.enum(["D1", "D2", "D3"]);
export const LayerSchema = z.enum(["L1", "L2", "L3"]);
export const GateStatusSchema = z.enum([
  "pass",
  "fail",
  "blocked",
  "unverified",
  "observed_not_certified"
]);

export const ErrorTypeSchema = z.enum([
  "none",
  "artifact_failure",
  "runtime_error",
  "input_handling_error",
  "initial_state_error",
  "state_transition_error",
  "state_effect_error",
  "rule_priority_error",
  "invariant_violation",
  "terminal_condition_error",
  "missing_event",
  "state_ui_inconsistency",
  "visual_layout_error",
  "physics_penetration",
  "physics_tunneling",
  "physics_unsupported_grounding",
  "physics_jump_apex",
  "physics_support_timeout",
  "physics_world_bounds",
  "nondeterminism",
  "hardcoded_path",
  "unknown"
]);

export const RequirementSchema = z.object({
  id: z.string().min(1),
  layer: LayerSchema,
  severity: z.enum(["must", "should"]),
  statement: z.string().min(1),
  depends_on: z.array(z.string()).default([]),
  observable: z.array(z.string()).min(1)
});

export const ControlSchema = z.object({
  action_id: z.string().min(1),
  actor: z.enum(["primary", "secondary"]).default("primary"),
  device: z.enum(["keyboard", "mouse", "touch", "camera"]),
  key_event: z.enum(["press", "down", "up"]).default("press"),
  code: z.string().min(1).optional(),
  selector: z.string().min(1).optional(),
  x_ratio: z.number().min(0).max(1).optional(),
  y_ratio: z.number().min(0).max(1).optional(),
  fixture_frame: z.string().min(1).optional()
}).strict().superRefine((control, context) => {
  if (control.device === "keyboard" && !control.code) {
    context.addIssue({
      code: "custom",
      path: ["code"],
      message: "keyboard control requires code"
    });
  }
  if (
    (control.device === "mouse" || control.device === "touch") &&
    !control.selector &&
    !control.code &&
    (control.x_ratio === undefined || control.y_ratio === undefined)
  ) {
    context.addIssue({
      code: "custom",
      path: ["selector"],
      message: "pointer control requires selector or x_ratio/y_ratio"
    });
  }
  if (control.device !== "keyboard" && control.key_event !== "press") {
    context.addIssue({
      code: "custom",
      path: ["key_event"],
      message: "pointer controls only support press"
    });
  }
  if (control.device === "camera" && !control.fixture_frame) {
    context.addIssue({
      code: "custom",
      path: ["fixture_frame"],
      message: "camera control requires fixture_frame"
    });
  }
});

const InputScenarioStepSchema = z.object({
  kind: z.literal("input"),
  action_id: z.string().min(1),
  advance_ms: z.number().int().min(0).default(0),
  checkpoints: z.array(z.string()).default([])
}).strict();

const AdvanceTimeScenarioStepSchema = z.object({
  kind: z.literal("advance_time"),
  advance_ms: z.number().int().positive(),
  checkpoints: z.array(z.string()).default([])
}).strict();

const AdvanceFramesScenarioStepSchema = z.object({
  kind: z.literal("advance_frames"),
  frames: z.number().int().positive(),
  frame_ms: z.number().positive().default(1000 / 60),
  sample_every: z.number().int().positive().default(1),
  checkpoints: z.array(z.string()).default([])
}).strict().superRefine((step, context) => {
  if (step.sample_every > step.frames) {
    context.addIssue({
      code: "custom",
      path: ["sample_every"],
      message: "sample_every must be less than or equal to frames"
    });
  }
});

const ReloadScenarioStepSchema = z.object({
  kind: z.literal("reload"),
  actor: z.enum(["primary", "secondary"]).default("primary"),
  checkpoints: z.array(z.string()).default([])
}).strict();

const DiscriminatedScenarioStepSchema = z.discriminatedUnion("kind", [
  InputScenarioStepSchema,
  AdvanceTimeScenarioStepSchema,
  AdvanceFramesScenarioStepSchema,
  ReloadScenarioStepSchema
]);

export const ScenarioStepSchema = z.preprocess((value) => {
  if (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    !("kind" in value)
  ) {
    return { ...value, kind: "input" };
  }
  return value;
}, DiscriminatedScenarioStepSchema);

export const ScenarioClockSchema = z.object({
  mode: z.enum(["real", "virtual"]).default("real"),
  start_time_ms: z.number().nonnegative().default(0),
  setup_ms: z.number().int().nonnegative().default(0)
}).strict();

export const ScenarioSchema = z.object({
  id: z.string().min(1),
  description: z.string().min(1),
  seed: z.number().int(),
  clock: ScenarioClockSchema.default({
    mode: "real",
    start_time_ms: 0,
    setup_ms: 0
  }),
  steps: z.array(ScenarioStepSchema).min(1)
}).superRefine((scenario, context) => {
  if (scenario.clock.mode === "virtual") return;
  for (const [index, step] of scenario.steps.entries()) {
    if (step.kind === "advance_frames" || step.kind === "advance_time") {
      context.addIssue({
        code: "custom",
        path: ["steps", index, "kind"],
        message: `${step.kind} requires a virtual clock`
      });
    }
  }
});

export const PublicCaseSchema = z.object({
  schema_version: z.enum([
    "gametestlab.case.v1",
    "gametestlab.case.v2",
    "gametestlab.case.v3"
  ]),
  id: StableCaseIdSchema,
  title: z.string().min(1),
  difficulty: z.object({
    level: DifficultySchema,
    rationale: z.string().min(1)
  }),
  source: z.object({
    type: z.enum(["project_authored", "open_source", "hy3_generated"]),
    description: z.string().min(1),
    license: z.string().min(1)
  }),
  game: z.object({
    entry_path: SameOriginEntryPathSchema,
    surface: z.enum(["dom", "canvas2d", "webgl"]),
    viewport: z.object({
      width: z.number().int().positive(),
      height: z.number().int().positive()
    }),
    selectors: z.object({
      score: z.string().min(1).default("[data-testid='score']"),
      status: z.string().min(1).default("[data-testid='status']"),
      surface: z.string().min(1).default("canvas")
    }).default({
      score: "[data-testid='score']",
      status: "[data-testid='status']",
      surface: "canvas"
    })
  }),
  controls: z.array(ControlSchema).min(1),
  requirements: z.array(RequirementSchema).min(1),
  scenarios: z.array(ScenarioSchema).min(1)
}).superRefine((publicCase, context) => {
  if (publicCase.schema_version === "gametestlab.case.v3") return;
  for (const [index, control] of publicCase.controls.entries()) {
    if (
      (publicCase.schema_version === "gametestlab.case.v1" &&
        (control.key_event !== "press" || control.selector !== undefined)) ||
      control.actor !== "primary" ||
      control.device === "camera"
    ) {
      context.addIssue({
        code: "custom",
        path: ["controls", index],
        message: "this control requires a newer case schema"
      });
    }
  }
  for (const [scenarioIndex, scenario] of publicCase.scenarios.entries()) {
    if (
      (publicCase.schema_version === "gametestlab.case.v1" &&
        (scenario.clock.mode !== "real" ||
          scenario.steps.some((step) => step.kind !== "input"))) ||
      (publicCase.schema_version === "gametestlab.case.v2" &&
        scenario.steps.some((step) => step.kind === "reload"))
    ) {
      context.addIssue({
        code: "custom",
        path: ["scenarios", scenarioIndex],
        message: "this scenario step requires a newer case schema"
      });
    }
  }
});

const PhysicsInvariantBaseShape = {
  id: z.string().min(1),
  player_path: z.string().min(1).default("player"),
  platforms_path: z.string().min(1).default("platforms"),
  epsilon: z.number().nonnegative().default(0.5)
};

export const NoPenetrationInvariantSchema = z.object({
  ...PhysicsInvariantBaseShape,
  type: z.literal("no_penetration"),
  platform_id: z.string().min(1).optional()
}).strict();

export const NoTunnelingInvariantSchema = z.object({
  ...PhysicsInvariantBaseShape,
  type: z.literal("no_tunneling"),
  platform_id: z.string().min(1).optional()
}).strict();

export const GroundedHasSupportInvariantSchema = z.object({
  ...PhysicsInvariantBaseShape,
  type: z.literal("grounded_has_support"),
  platform_id: z.string().min(1).optional()
}).strict();

export const JumpApexReachesInvariantSchema = z.object({
  ...PhysicsInvariantBaseShape,
  type: z.literal("jump_apex_reaches"),
  platform_id: z.string().min(1),
  jump_event: z.string().min(1).default("player_jumped")
}).strict();

export const EventuallySupportedInvariantSchema = z.object({
  ...PhysicsInvariantBaseShape,
  type: z.literal("eventually_supported"),
  platform_id: z.string().min(1),
  min_consecutive_samples: z.number().int().positive().default(2)
}).strict();

export const WorldBoundsInvariantSchema = z.object({
  ...PhysicsInvariantBaseShape,
  type: z.literal("world_bounds"),
  bounds_path: z.string().min(1)
}).strict();

export const PhysicsInvariantSchema = z.discriminatedUnion("type", [
  NoPenetrationInvariantSchema,
  NoTunnelingInvariantSchema,
  GroundedHasSupportInvariantSchema,
  JumpApexReachesInvariantSchema,
  EventuallySupportedInvariantSchema,
  WorldBoundsInvariantSchema
]);

const CheckpointExpectedSchema = z.object({
  state: z.record(z.string(), z.unknown()).default({}),
  ui: z.record(z.string(), z.unknown()).default({}),
  state_tolerances: z.record(z.string(), z.number().finite().nonnegative()).optional(),
  ui_text: z.record(z.string(), z.discriminatedUnion("mode", [
    z.object({ mode: z.literal("equals"), value: z.string(), ignore_case: z.boolean().default(false) }).strict(),
    z.object({ mode: z.literal("nonempty") }).strict()
  ])).optional(),
  event_scope: z.enum(["current_action", "since_previous_checkpoint"]).optional(),
  event_types: z.array(z.string()).default([]),
  physics: z.array(PhysicsInvariantSchema).default([])
}).strict().superRefine((expected, context) => {
  if (
    Object.keys(expected.state).length === 0 &&
    Object.keys(expected.ui).length === 0 &&
    Object.keys(expected.ui_text ?? {}).length === 0 &&
    expected.event_types.length === 0 &&
    expected.physics.length === 0
  ) {
    context.addIssue({
      code: "custom",
      message: "checkpoint must contain at least one assertion"
    });
  }
  for (const path of Object.keys(expected.state_tolerances ?? {})) {
    if (typeof expected.state[path] !== "number" || !Number.isFinite(expected.state[path])) {
      context.addIssue({ code: "custom", path: ["state_tolerances", path], message: "tolerance requires a finite numeric state expectation" });
    }
  }
});

export const CheckpointExpectationSchema = z.object({
  id: z.string().min(1),
  action_index: z.number().int().min(0),
  layer: LayerSchema,
  requirement_ids: z.array(z.string()).min(1),
  terminal: z.boolean().default(false),
  expected: CheckpointExpectedSchema
}).strict().superRefine((checkpoint, context) => {
  if (
    checkpoint.terminal &&
    Object.keys(checkpoint.expected.state).length === 0 &&
    Object.keys(checkpoint.expected.ui).length === 0 &&
    Object.keys(checkpoint.expected.ui_text ?? {}).length === 0 &&
    checkpoint.expected.event_types.length === 0
  ) {
    context.addIssue({
      code: "custom",
      path: ["expected"],
      message: "terminal checkpoint needs a state, UI, or event outcome assertion"
    });
  }
});

export const PrivateOracleSchema = z.object({
  schema_version: z.enum(["gametestlab.oracle.v1", "gametestlab.oracle.v2"]),
  case_id: z.string().min(1),
  scenario_id: z.string().min(1),
  checkpoints: z.array(CheckpointExpectationSchema).min(1),
  fault_ground_truth: z.object({
    sample_kind: z.enum(["clean", "faulty", "lucky_pass"]),
    first_divergence_checkpoint: z.string().nullable(),
    root_requirement_id: z.string().nullable(),
    root_layer: LayerSchema.nullable(),
    error_type: ErrorTypeSchema,
    final_outcome_correct: z.boolean()
  })
}).superRefine((oracle, context) => {
  if (oracle.schema_version !== "gametestlab.oracle.v1") return;
  if (oracle.checkpoints.some((checkpoint) => checkpoint.expected.physics.length > 0)) {
    context.addIssue({
      code: "custom",
      path: ["checkpoints"],
      message: "physics invariants require oracle.v2"
    });
  }
  if (oracle.fault_ground_truth.error_type.startsWith("physics_")) {
    context.addIssue({
      code: "custom",
      path: ["fault_ground_truth", "error_type"],
      message: "physics error types require oracle.v2"
    });
  }
});

export const DatasetManifestEntrySchema = z.object({
  case_file: SafeDatasetFilePathSchema,
  oracle_file: SafeDatasetFilePathSchema,
  fixture_variant: z.string().min(1)
}).strict();

export const DatasetManifestSchema = z.object({
  schema_version: z.literal("gametestlab.dataset.v1"),
  name: z.string().min(1),
  version: z.string().min(1),
  description: z.string().min(1),
  cases: z.array(DatasetManifestEntrySchema).min(1)
});

export const TimelineSampleSchema = z.object({
  sample_index: z.number().int().min(0),
  action_index: z.number().int().min(0).default(0),
  frame_index: z.number().int().min(0).optional(),
  elapsed_ms: z.number().nonnegative(),
  tick: z.number().int().min(0),
  status: z.string(),
  state: z.record(z.string(), z.unknown()),
  event_types: z.array(z.string())
}).strict();

export const RuntimeErrorEvidenceSchema = z.object({
  source: z.enum(["console", "pageerror", "network", "runner"]),
  message: z.string(),
  action_index: z.number().int().min(0).nullable(),
  frame_index: z.number().int().min(0).nullable(),
  elapsed_ms: z.number().nonnegative()
}).strict();

export const ObservationSchema = z.object({
  action_index: z.number().int().min(0),
  checkpoint_id: z.string().min(1),
  state: z.record(z.string(), z.unknown()),
  ui: z.record(z.string(), z.unknown()),
  event_types: z.array(z.string()),
  event_types_since_checkpoint: z.array(z.string()).optional(),
  samples: z.array(TimelineSampleSchema).default([]),
  runtime_errors: z.array(z.string()).default([]),
  runtime_error_evidence: z.array(RuntimeErrorEvidenceSchema).default([]),
  evidence: z.object({
    screenshot: z.string().optional(),
    state_hash: z.string().optional()
  }).default({})
});

export const FailureSchema = z.object({
  action_index: z.number().int().min(0),
  sample_index: z.number().int().min(0).optional(),
  frame_index: z.number().int().min(0).optional(),
  tick: z.number().int().min(0).optional(),
  elapsed_ms: z.number().nonnegative().optional(),
  checkpoint_id: z.string().min(1),
  layer: LayerSchema,
  requirement_ids: z.array(z.string()),
  error_type: ErrorTypeSchema,
  diffs: z.array(z.object({
    channel: z.enum(["runtime", "state", "ui", "event", "physics"]),
    path: z.string(),
    expected: z.unknown(),
    actual: z.unknown()
  }))
});

export const CaseEvaluationSchema = z.object({
  schema_version: z.enum([
    "gametestlab.evaluation.v1",
    "gametestlab.evaluation.v2"
  ]),
  case_id: z.string(),
  difficulty: DifficultySchema,
  final_outcome_correct: z.boolean(),
  process_correct: z.boolean(),
  lucky_pass_detected: z.boolean(),
  gates: z.object({
    L1: GateStatusSchema,
    L2: GateStatusSchema,
    L3: GateStatusSchema
  }),
  highest_certified_level: z.enum(["none", "L1", "L2", "L3"]),
  first_failure: FailureSchema.nullable(),
  all_failures: z.array(FailureSchema)
});

export type Difficulty = z.infer<typeof DifficultySchema>;
export type Layer = z.infer<typeof LayerSchema>;
export type ScenarioStep = z.infer<typeof ScenarioStepSchema>;
export type ScenarioClock = z.infer<typeof ScenarioClockSchema>;
export type PhysicsInvariant = z.infer<typeof PhysicsInvariantSchema>;
export type TimelineSample = z.infer<typeof TimelineSampleSchema>;
export type PublicCase = z.infer<typeof PublicCaseSchema>;
export type PrivateOracle = z.infer<typeof PrivateOracleSchema>;
export type DatasetManifest = z.infer<typeof DatasetManifestSchema>;
export type Observation = z.infer<typeof ObservationSchema>;
export type Failure = z.infer<typeof FailureSchema>;
export type CaseEvaluation = z.infer<typeof CaseEvaluationSchema>;
