import { z } from "zod";
import { GameEventSchema, GameObservationSchema } from "../runtime/bridge";
import {
  CaseEvaluationSchema,
  DifficultySchema,
  ObservationSchema,
  PrivateOracleSchema,
  ScenarioClockSchema,
  TimelineSampleSchema
} from "./schemas";

const Sha256Schema = z.string().regex(/^[a-f0-9]{64}$/);

export const BrowserConsoleRecordSchema = z.object({
  type: z.string(),
  text: z.string(),
  location: z.object({
    url: z.string(),
    line_number: z.number().int().nonnegative(),
    column_number: z.number().int().nonnegative()
  }).strict(),
  action_index: z.number().int().nonnegative().nullable()
}).strict();

export const BrowserPageErrorRecordSchema = z.object({
  name: z.string(),
  message: z.string(),
  stack: z.string().nullable(),
  action_index: z.number().int().nonnegative().nullable()
}).strict();

export const RuntimeDiagnosticSchema = z.object({
  source: z.enum(["console", "pageerror", "network", "runner"]),
  message: z.string(),
  action_index: z.number().int().nonnegative().nullable(),
  frame_index: z.number().int().nonnegative().nullable(),
  elapsed_ms: z.number().nonnegative()
}).strict();

export const BrowserNetworkRecordSchema = z.object({
  kind: z.enum(["request", "response", "request_failed", "websocket"]),
  url: z.string().url(),
  method: z.string().min(1),
  resource_type: z.string(),
  status: z.number().int().min(100).max(599).nullable(),
  status_text: z.string().nullable(),
  failure: z.string().nullable(),
  action_index: z.number().int().nonnegative().nullable()
}).strict();

const AggregateMetricsSchema = z.object({
  sample_count: z.number().int().nonnegative(),
  final_answer_accuracy: z.number().min(0).max(1),
  process_correctness: z.number().min(0).max(1),
  localization_exact_accuracy: z.number().min(0).max(1),
  localization_within_one_accuracy: z.number().min(0).max(1),
  false_positive_rate: z.number().min(0).max(1),
  lucky_pass_recall: z.number().min(0).max(1),
  error_type_macro_f1: z.number().min(0).max(1),
  error_type_distribution: z.record(z.string(), z.number().int().nonnegative()),
  by_difficulty: z.record(
    DifficultySchema,
    z.object({
      count: z.number().int().nonnegative(),
      final_accuracy: z.number().min(0).max(1),
      process_correctness: z.number().min(0).max(1)
    }).strict()
  )
}).strict();

const OracleGroundTruthSchema = PrivateOracleSchema.shape.fault_ground_truth;

const BrowserEvidenceV1Schema = z.object({
  url: z.string().url(),
  console: z.array(BrowserConsoleRecordSchema),
  page_errors: z.array(BrowserPageErrorRecordSchema),
  diagnostics: z.array(z.string())
}).strict();

const BrowserEvidenceV2Schema = z.object({
  url: z.string().url(),
  console: z.array(BrowserConsoleRecordSchema),
  page_errors: z.array(BrowserPageErrorRecordSchema),
  network: z.array(BrowserNetworkRecordSchema),
  diagnostics: z.array(RuntimeDiagnosticSchema)
}).strict();

const CaseResultCommon = {
  case_id: z.string().min(1),
  title: z.string().min(1),
  difficulty: z.object({
    level: DifficultySchema,
    rationale: z.string().min(1)
  }).strict(),
  fixture_variant: z.string().min(1),
  case_file: z.string().min(1),
  oracle_file: z.string().min(1),
  oracle_ground_truth: OracleGroundTruthSchema,
  evaluation: CaseEvaluationSchema,
  observations: z.array(ObservationSchema)
};

export const CaseResultArtifactV1Schema = z.object({
  schema_version: z.literal("gametestlab.case-result.v1"),
  ...CaseResultCommon,
  browser: BrowserEvidenceV1Schema
}).strict().superRefine((artifact, context) => {
  if (artifact.evaluation.schema_version !== "gametestlab.evaluation.v1") {
    context.addIssue({
      code: "custom",
      path: ["evaluation", "schema_version"],
      message: "case-result.v1 requires evaluation.v1"
    });
  }
});

export const CaseResultArtifactV2Schema = z.object({
  schema_version: z.literal("gametestlab.case-result.v2"),
  ...CaseResultCommon,
  observations: z.array(ObservationSchema).min(1),
  input_hashes: z.object({
    case_sha256: Sha256Schema,
    oracle_sha256: Sha256Schema,
    game_directory_sha256: Sha256Schema
  }).strict(),
  browser: BrowserEvidenceV2Schema
}).strict().superRefine((artifact, context) => {
  if (artifact.evaluation.schema_version !== "gametestlab.evaluation.v2") {
    context.addIssue({
      code: "custom",
      path: ["evaluation", "schema_version"],
      message: "case-result.v2 requires evaluation.v2"
    });
  }
  if (artifact.case_id !== artifact.evaluation.case_id) {
    context.addIssue({
      code: "custom",
      path: ["evaluation", "case_id"],
      message: "case-result.v2 case_id must match evaluation.case_id"
    });
  }
});

export const CaseResultArtifactSchema = z.discriminatedUnion("schema_version", [
  CaseResultArtifactV1Schema,
  CaseResultArtifactV2Schema
]);

const ArtifactFilesSchema = z.object({
  action_trace: z.literal("events.jsonl"),
  case_results: z.literal("cases.json"),
  summary: z.literal("summary.json")
}).strict();

export const RunSummaryV1Schema = z.object({
  schema_version: z.literal("gametestlab.run-summary.v1"),
  run_id: z.string().min(1),
  created_at: z.string().datetime(),
  finished_at: z.string().datetime(),
  dataset: z.object({
    name: z.string().min(1),
    version: z.string().min(1),
    manifest: z.string().min(1)
  }).strict(),
  runtime: z.object({
    browser: z.literal("chromium"),
    browser_version: z.string().min(1),
    headless: z.literal(true),
    hy3_api_used: z.boolean()
  }).strict(),
  artifact_files: ArtifactFilesSchema,
  metrics: AggregateMetricsSchema
}).strict();

export const RunSummaryV2Schema = z.object({
  schema_version: z.literal("gametestlab.run-summary.v2"),
  run_id: z.string().min(1),
  created_at: z.string().datetime(),
  finished_at: z.string().datetime(),
  dataset: z.object({
    name: z.string().min(1),
    version: z.string().min(1),
    manifest: z.string().min(1),
    manifest_sha256: Sha256Schema
  }).strict(),
  runtime: z.object({
    browser: z.literal("chromium"),
    browser_version: z.string().min(1),
    headless: z.literal(true),
    hy3_api_used: z.boolean(),
    node_version: z.string().min(1),
    playwright_version: z.string().min(1),
    os: z.string().min(1),
    git_commit: z.string().regex(/^[a-f0-9]{40,64}$/),
    git_dirty: z.boolean()
  }).strict(),
  artifact_files: ArtifactFilesSchema,
  metrics: AggregateMetricsSchema
}).strict();

export const RunSummaryArtifactSchema = z.discriminatedUnion("schema_version", [
  RunSummaryV1Schema,
  RunSummaryV2Schema
]);

const LegacyGameObservationSchema = z.object({
  tick: z.number().int().nonnegative(),
  status: z.enum(["menu", "playing", "won", "lost"]),
  state: z.record(z.string(), z.unknown()),
  latest_event_seq: z.number().int().nonnegative()
}).strict();

export const StoredTraceV1Schema = z.object({
  run_id: z.string().min(1),
  schema_version: z.literal("gametestlab.trace.v1"),
  case_id: z.string().min(1),
  scenario_id: z.string().min(1),
  action_index: z.number().int().nonnegative(),
  action_id: z.string().min(1),
  checkpoint_ids: z.array(z.string()),
  bridge: LegacyGameObservationSchema.nullable(),
  ui: z.record(z.string(), z.unknown()),
  canvas: z.record(z.string(), z.unknown()),
  game_events: z.array(GameEventSchema),
  runtime_errors: z.array(z.string()),
  screenshot: z.string().nullable(),
  state_hash: Sha256Schema
}).strict();

export const StoredTraceV2Schema = z.object({
  run_id: z.string().min(1),
  schema_version: z.literal("gametestlab.trace.v2"),
  case_id: z.string().min(1),
  scenario_id: z.string().min(1),
  seed: z.number().int(),
  clock: ScenarioClockSchema,
  action_index: z.number().int().nonnegative(),
  action_id: z.string().min(1),
  step_kind: z.enum(["input", "advance_time", "advance_frames"]),
  checkpoint_ids: z.array(z.string()),
  elapsed_ms: z.number().nonnegative(),
  samples: z.array(TimelineSampleSchema),
  bridge: GameObservationSchema.nullable(),
  ui: z.record(z.string(), z.unknown()),
  canvas: z.record(z.string(), z.unknown()),
  game_events: z.array(GameEventSchema),
  console: z.array(BrowserConsoleRecordSchema),
  page_errors: z.array(BrowserPageErrorRecordSchema),
  network: z.array(BrowserNetworkRecordSchema),
  diagnostics: z.array(RuntimeDiagnosticSchema),
  runtime_errors: z.array(z.string()),
  screenshot: z.string().nullable(),
  state_hash: Sha256Schema
}).strict();

export const StoredTraceV3Schema = z.object({
  run_id: z.string().min(1),
  schema_version: z.literal("gametestlab.trace.v3"),
  case_id: z.string().min(1),
  scenario_id: z.string().min(1),
  seed: z.number().int(),
  clock: ScenarioClockSchema,
  action_index: z.number().int().nonnegative(),
  action_id: z.string().min(1),
  step_kind: z.enum(["input", "advance_time", "advance_frames", "reload"]),
  checkpoint_ids: z.array(z.string()),
  elapsed_ms: z.number().nonnegative(),
  samples: z.array(TimelineSampleSchema),
  bridge: GameObservationSchema.nullable(),
  ui: z.record(z.string(), z.unknown()),
  canvas: z.record(z.string(), z.unknown()),
  game_events: z.array(GameEventSchema),
  console: z.array(BrowserConsoleRecordSchema),
  page_errors: z.array(BrowserPageErrorRecordSchema),
  network: z.array(BrowserNetworkRecordSchema),
  diagnostics: z.array(RuntimeDiagnosticSchema),
  runtime_errors: z.array(z.string()),
  screenshot: z.string().nullable(),
  state_hash: Sha256Schema
}).strict();

export const StoredTraceArtifactSchema = z.discriminatedUnion("schema_version", [
  StoredTraceV1Schema,
  StoredTraceV2Schema,
  StoredTraceV3Schema
]);

export const LatestRunPointerSchema = z.object({
  schema_version: z.literal("gametestlab.latest-run.v1"),
  run_id: z.string().min(1),
  run_path: z.string().min(1),
  summary_path: z.string().min(1),
  updated_at: z.string().datetime()
}).strict();

export type CaseResultArtifactV2 = z.infer<typeof CaseResultArtifactV2Schema>;
export type RunSummaryV2 = z.infer<typeof RunSummaryV2Schema>;
