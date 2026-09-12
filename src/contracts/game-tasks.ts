import { z } from "zod";
import {
  CheckpointExpectationSchema,
  DifficultySchema,
  RequirementSchema,
  ScenarioClockSchema
} from "./schemas";

export const GAME_TASK_SET_SCHEMA_VERSION =
  "gametestlab.game-task-set.v1" as const;
export const GAME_TASK_PLAN_SCHEMA_VERSION =
  "gametestlab.game-task-plan.v1" as const;
export const GAME_TASK_ORACLE_SCHEMA_VERSION =
  "gametestlab.game-task-oracle.v1" as const;

const TaskIdSchema = z
  .string()
  .min(1)
  .max(80)
  .regex(/^[a-z][a-z0-9-]*$/, "must be a lowercase stable task ID");

export const GameCategorySchema = z.enum([
  "action",
  "puzzle",
  "creative",
  "simulation",
  "education"
]);

export const GameFeatureSchema = z.enum([
  "3d",
  "camera",
  "multiplayer",
  "persistence",
  "leaderboard",
  "touch"
]);

const TaskControlSchema = z.object({
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
    context.addIssue({ code: "custom", path: ["code"], message: "keyboard control requires code" });
  }
  if (
    (control.device === "mouse" || control.device === "touch") &&
    !control.selector &&
    (control.x_ratio === undefined || control.y_ratio === undefined)
  ) {
    context.addIssue({ code: "custom", path: ["selector"], message: "pointer control requires selector or ratios" });
  }
  if (control.device !== "keyboard" && control.key_event !== "press") {
    context.addIssue({ code: "custom", path: ["key_event"], message: "pointer controls only support press" });
  }
  if (control.device === "camera" && !control.fixture_frame) {
    context.addIssue({ code: "custom", path: ["fixture_frame"], message: "camera control requires fixture_frame" });
  }
});

const TaskInputStepSchema = z.object({
  kind: z.literal("input"),
  action_id: z.string().min(1),
  advance_ms: z.number().int().nonnegative().default(0),
  checkpoints: z.array(z.string()).default([])
}).strict();

const TaskAdvanceTimeStepSchema = z.object({
  kind: z.literal("advance_time"),
  advance_ms: z.number().int().positive(),
  checkpoints: z.array(z.string()).default([])
}).strict();

const TaskAdvanceFramesStepSchema = z.object({
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

const TaskReloadStepSchema = z.object({
  kind: z.literal("reload"),
  actor: z.enum(["primary", "secondary"]).default("primary"),
  checkpoints: z.array(z.string()).default([])
}).strict();

const TaskScenarioSchema = z.object({
  id: z.string().min(1),
  description: z.string().min(1),
  seed: z.number().int(),
  clock: ScenarioClockSchema,
  steps: z.array(z.discriminatedUnion("kind", [
    TaskInputStepSchema,
    TaskAdvanceTimeStepSchema,
    TaskAdvanceFramesStepSchema,
    TaskReloadStepSchema
  ])).min(1)
}).strict();

const TaskManifestEntrySchema = z.object({
  id: TaskIdSchema,
  directory: TaskIdSchema,
  difficulty: DifficultySchema,
  category: GameCategorySchema,
  features: z.array(GameFeatureSchema).default([])
}).strict();

export const GameTaskSetManifestSchema = z.object({
  schema_version: z.literal(GAME_TASK_SET_SCHEMA_VERSION),
  name: z.string().min(1),
  version: z.string().min(1),
  description: z.string().min(1),
  contract_file: z.literal("GAME_CONTRACT.md"),
  tasks: z.array(TaskManifestEntrySchema).min(1)
}).strict().superRefine((manifest, context) => {
  const ids = new Set<string>();
  const directories = new Set<string>();
  for (const [index, task] of manifest.tasks.entries()) {
    if (ids.has(task.id)) {
      context.addIssue({
        code: "custom",
        path: ["tasks", index, "id"],
        message: `duplicate task ID ${task.id}`
      });
    }
    if (directories.has(task.directory)) {
      context.addIssue({
        code: "custom",
        path: ["tasks", index, "directory"],
        message: `duplicate task directory ${task.directory}`
      });
    }
    ids.add(task.id);
    directories.add(task.directory);
  }
});

export const GameTaskPlanSchema = z.object({
  checking_policy_version: z.string().min(1).optional(),
  schema_version: z.literal(GAME_TASK_PLAN_SCHEMA_VERSION),
  task_id: TaskIdSchema,
  title: z.string().min(1),
  difficulty: z.object({
    level: DifficultySchema,
    rationale: z.string().min(1)
  }).strict(),
  category: GameCategorySchema,
  features: z.array(GameFeatureSchema).default([]),
  environment: z.object({
    pages: z.union([z.literal(1), z.literal(2)]).default(1),
    fake_camera: z.boolean().default(false),
    persistent_storage: z.boolean().default(false)
  }).strict().default({ pages: 1, fake_camera: false, persistent_storage: false }),
  surface: z.enum(["dom", "canvas2d", "webgl"]),
  viewport: z.object({
    width: z.number().int().positive(),
    height: z.number().int().positive()
  }).strict(),
  selectors: z.object({
    score: z.string().min(1),
    status: z.string().min(1),
    surface: z.string().min(1)
  }).strict(),
  controls: z.array(TaskControlSchema).min(1),
  requirements: z.array(RequirementSchema).min(1),
  scenarios: z.array(TaskScenarioSchema).min(3)
}).strict();

const ScenarioOracleSchema = z.object({
  scenario_id: z.string().min(1),
  checkpoints: z.array(CheckpointExpectationSchema).min(1)
}).strict();

export const GameTaskOracleSchema = z.object({
  schema_version: z.literal(GAME_TASK_ORACLE_SCHEMA_VERSION),
  task_id: TaskIdSchema,
  scenarios: z.array(ScenarioOracleSchema).min(3)
}).strict();

export type GameTaskSetManifest = z.infer<typeof GameTaskSetManifestSchema>;
export type GameTaskPlan = z.infer<typeof GameTaskPlanSchema>;
export type GameTaskOracle = z.infer<typeof GameTaskOracleSchema>;
