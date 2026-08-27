import { z } from "zod";

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
  device: z.enum(["keyboard", "mouse", "touch"]),
  code: z.string().optional(),
  x_ratio: z.number().min(0).max(1).optional(),
  y_ratio: z.number().min(0).max(1).optional()
});

export const ScenarioStepSchema = z.object({
  action_id: z.string().min(1),
  advance_ms: z.number().int().min(0).default(0),
  checkpoints: z.array(z.string()).default([])
});

export const ScenarioSchema = z.object({
  id: z.string().min(1),
  description: z.string().min(1),
  seed: z.number().int(),
  steps: z.array(ScenarioStepSchema).min(1)
});

export const PublicCaseSchema = z.object({
  schema_version: z.literal("prd2play.case.v1"),
  id: z.string().min(1),
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
    entry_path: z.string().startsWith("/"),
    surface: z.enum(["dom", "canvas2d", "webgl"]),
    viewport: z.object({
      width: z.number().int().positive(),
      height: z.number().int().positive()
    })
  }),
  controls: z.array(ControlSchema).min(1),
  requirements: z.array(RequirementSchema).min(1),
  scenarios: z.array(ScenarioSchema).min(1)
});

export const CheckpointExpectationSchema = z.object({
  id: z.string().min(1),
  action_index: z.number().int().min(0),
  layer: LayerSchema,
  requirement_ids: z.array(z.string()).min(1),
  terminal: z.boolean().default(false),
  expected: z.object({
    state: z.record(z.string(), z.unknown()).default({}),
    ui: z.record(z.string(), z.unknown()).default({}),
    event_types: z.array(z.string()).default([])
  })
});

export const PrivateOracleSchema = z.object({
  schema_version: z.literal("prd2play.oracle.v1"),
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
});

export const DatasetManifestEntrySchema = z.object({
  case_file: z.string().min(1),
  oracle_file: z.string().min(1),
  fixture_variant: z.string().min(1)
});

export const DatasetManifestSchema = z.object({
  schema_version: z.literal("prd2play.dataset.v1"),
  name: z.string().min(1),
  version: z.string().min(1),
  description: z.string().min(1),
  cases: z.array(DatasetManifestEntrySchema).min(1)
});

export const ObservationSchema = z.object({
  action_index: z.number().int().min(0),
  checkpoint_id: z.string().min(1),
  state: z.record(z.string(), z.unknown()),
  ui: z.record(z.string(), z.unknown()),
  event_types: z.array(z.string()),
  runtime_errors: z.array(z.string()).default([]),
  evidence: z.object({
    screenshot: z.string().optional(),
    state_hash: z.string().optional()
  }).default({})
});

export const FailureSchema = z.object({
  action_index: z.number().int().min(0),
  checkpoint_id: z.string().min(1),
  layer: LayerSchema,
  requirement_ids: z.array(z.string()),
  error_type: ErrorTypeSchema,
  diffs: z.array(z.object({
    channel: z.enum(["runtime", "state", "ui", "event"]),
    path: z.string(),
    expected: z.unknown(),
    actual: z.unknown()
  }))
});

export const CaseEvaluationSchema = z.object({
  schema_version: z.literal("prd2play.evaluation.v1"),
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
export type PublicCase = z.infer<typeof PublicCaseSchema>;
export type PrivateOracle = z.infer<typeof PrivateOracleSchema>;
export type DatasetManifest = z.infer<typeof DatasetManifestSchema>;
export type Observation = z.infer<typeof ObservationSchema>;
export type Failure = z.infer<typeof FailureSchema>;
export type CaseEvaluation = z.infer<typeof CaseEvaluationSchema>;
