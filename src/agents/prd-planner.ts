import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { z } from "zod";
import { RequirementSchema, type PublicCase } from "../contracts/schemas";
import { Hy3Client, loadHy3Config } from "../llm/hy3-client";

const PlanCheckpointSchema = z.object({
  id: z.string().min(1),
  layer: z.enum(["L1", "L2", "L3"]),
  requirement_ids: z.array(z.string()).min(1),
  assertion_intent: z.string().min(1),
  evidence_channels: z.array(z.string()).min(1)
});

const PlanStepSchema = z.object({
  action_id: z.string().min(1),
  reason: z.string().min(1),
  checkpoints: z.array(PlanCheckpointSchema).default([])
});

export const Hy3TestPlanSchema = z.object({
  schema_version: z.literal("prd2play.hy3-plan.v1"),
  summary: z.string().min(1),
  requirements: z.array(RequirementSchema).min(1),
  scenarios: z.array(
    z.object({
      id: z.string().min(1),
      description: z.string().min(1),
      preconditions: z.array(z.string()).default([]),
      steps: z.array(PlanStepSchema).min(1)
    })
  ).min(1),
  risks: z.array(z.string()).default([]),
  unknowns: z.array(z.string()).default([])
});

export type Hy3TestPlan = z.infer<typeof Hy3TestPlanSchema>;

const SYSTEM_PROMPT = `You are the planning component of PRD2Play, a browser-game
verification system. Convert a public product requirements document into an auditable,
layered test plan. L1 covers boot/runtime/input readiness, L2 covers state transitions,
rules and terminal conditions, and L3 covers visible UI/state consistency and semantic
visual quality. Use only the action IDs supplied by the caller. Do not invent private
expected values, hidden oracle data, implementation details, or claims that a test has
already passed. Return one JSON object and no prose. The object must use schema_version
"prd2play.hy3-plan.v1" and this exact shape:
{
  "schema_version": "prd2play.hy3-plan.v1",
  "summary": "...",
  "requirements": [{
    "id": "RUN-01|LOGIC-...|UI-...", "layer": "L1|L2|L3",
    "severity": "must|should", "statement": "...",
    "depends_on": ["requirement id"], "observable": ["public evidence channel"]
  }],
  "scenarios": [{
    "id": "...", "description": "...", "preconditions": ["..."],
    "steps": [{
      "action_id": "one supplied action id", "reason": "...",
      "checkpoints": [{
        "id": "...", "layer": "L1|L2|L3",
        "requirement_ids": ["..."], "assertion_intent": "...",
        "evidence_channels": ["..."]
      }]
    }]
  }],
  "risks": ["..."], "unknowns": ["..."]
}`;

function stripFence(value: string): string {
  return value
    .replace(/^\s*```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/i, "")
    .trim();
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function validatePlanReferences(plan: Hy3TestPlan, publicCase: PublicCase): void {
  const actionIds = new Set(publicCase.controls.map((item) => item.action_id));
  const requirements = new Map<string, Hy3TestPlan["requirements"][number]>();
  for (const requirement of plan.requirements) {
    if (requirements.has(requirement.id)) {
      throw new Error(`Hy3 plan contains duplicate requirement ${requirement.id}`);
    }
    requirements.set(requirement.id, requirement);
  }
  for (const requirement of plan.requirements) {
    for (const dependency of requirement.depends_on) {
      if (!requirements.has(dependency)) {
        throw new Error(
          `Hy3 plan requirement ${requirement.id} depends on unknown ${dependency}`
        );
      }
    }
  }
  for (const scenario of plan.scenarios) {
    for (const step of scenario.steps) {
      if (!actionIds.has(step.action_id)) {
        throw new Error(`Hy3 plan uses undeclared action ${step.action_id}`);
      }
      for (const checkpoint of step.checkpoints) {
        for (const requirementId of checkpoint.requirement_ids) {
          const requirement = requirements.get(requirementId);
          if (!requirement) {
            throw new Error(
              `Hy3 checkpoint ${checkpoint.id} references unknown ${requirementId}`
            );
          }
          if (requirement.layer !== checkpoint.layer) {
            throw new Error(
              `Hy3 checkpoint ${checkpoint.id} layer does not match ${requirementId}`
            );
          }
        }
      }
    }
  }
}

export interface GeneratePlanInput {
  prd: string;
  publicCase: PublicCase;
  outputDirectory?: string;
}

export interface GeneratedPlanArtifacts {
  plan: Hy3TestPlan;
  outputDirectory?: string;
}

export async function generateHy3TestPlan(
  input: GeneratePlanInput,
  client: Pick<Hy3Client, "complete"> = new Hy3Client()
): Promise<GeneratedPlanArtifacts> {
  const publicContext = {
    case_id: input.publicCase.id,
    title: input.publicCase.title,
    difficulty: input.publicCase.difficulty,
    surface: input.publicCase.game.surface,
    controls: input.publicCase.controls,
    public_prd: input.prd
  };
  const userPrompt = JSON.stringify(publicContext, null, 2);
  const rawResponse = await client.complete(SYSTEM_PROMPT, userPrompt);
  const parsed = Hy3TestPlanSchema.parse(
    JSON.parse(stripFence(rawResponse)) as unknown
  );
  validatePlanReferences(parsed, input.publicCase);

  if (!input.outputDirectory) return { plan: parsed };

  const outputDirectory = resolve(input.outputDirectory);
  await mkdir(outputDirectory, { recursive: true });
  const hy3 = loadHy3Config();
  const manifest = {
    schema_version: "prd2play.hy3-run.v1",
    created_at: new Date().toISOString(),
    case_id: input.publicCase.id,
    provider: "Hy3 OpenAI-compatible API",
    base_url: hy3.baseUrl,
    model: hy3.model,
    reasoning_effort: hy3.reasoningEffort,
    request_sha256: sha256(`${SYSTEM_PROMPT}\n${userPrompt}`),
    response_sha256: sha256(rawResponse),
    secret_fields_persisted: false,
    oracle_in_prompt: false
  };
  await Promise.all([
    writeFile(
      resolve(outputDirectory, "request.public.json"),
      `${JSON.stringify({ system: SYSTEM_PROMPT, user: publicContext }, null, 2)}\n`,
      "utf8"
    ),
    writeFile(resolve(outputDirectory, "response.raw.txt"), rawResponse, "utf8"),
    writeFile(
      resolve(outputDirectory, "plan.json"),
      `${JSON.stringify(parsed, null, 2)}\n`,
      "utf8"
    ),
    writeFile(
      resolve(outputDirectory, "manifest.json"),
      `${JSON.stringify(manifest, null, 2)}\n`,
      "utf8"
    )
  ]);
  return { plan: parsed, outputDirectory };
}
