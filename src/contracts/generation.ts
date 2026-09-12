import { z } from "zod";

export const USER_BRIEF_SCHEMA_VERSION = "gametestlab.user-brief.v1" as const;
export const GENERATED_PRD_SCHEMA_VERSION = "gametestlab.generated-prd.v1" as const;
export const GAME_MANIFEST_SCHEMA_VERSION = "gametestlab.game-manifest.v3" as const;
export const GAME_PACKAGE_SCHEMA_VERSION = "gametestlab.game-package.v2" as const;
export const GENERATION_RUN_SCHEMA_VERSION = "gametestlab.generation-run.v2" as const;

const IdentifierSchema = z
  .string()
  .min(1)
  .max(80)
  .regex(/^[A-Za-z][A-Za-z0-9_-]*$/, "must be a stable identifier");

const SourceIntentSchema = z
  .object({
    id: IdentifierSchema,
    intent: z.string().min(1),
    source_quote: z.string().min(1)
  })
  .strict();

export const UserBriefSchema = z
  .object({
    schema_version: z.literal(USER_BRIEF_SCHEMA_VERSION),
    raw_request: z.string().min(1),
    source_intents: z.array(SourceIntentSchema).default([])
  })
  .strict()
  .superRefine((brief, context) => {
    const seen = new Set<string>();
    for (const [index, sourceIntent] of brief.source_intents.entries()) {
      if (seen.has(sourceIntent.id)) {
        context.addIssue({
          code: "custom",
          path: ["source_intents", index, "id"],
          message: `duplicate source intent ${sourceIntent.id}`
        });
      }
      seen.add(sourceIntent.id);
      if (!brief.raw_request.includes(sourceIntent.source_quote)) {
        context.addIssue({
          code: "custom",
          path: ["source_intents", index, "source_quote"],
          message: "source_quote must occur verbatim in raw_request"
        });
      }
    }
  });

const PrdControlSchema = z
  .object({
    id: IdentifierSchema,
    input: z.string().min(1),
    behavior: z.string().min(1)
  })
  .strict();

const PrdRuleSchema = z
  .object({
    id: IdentifierSchema,
    statement: z.string().min(1)
  })
  .strict();

const PrdUiRequirementSchema = z
  .object({
    id: IdentifierSchema,
    element: z.string().min(1),
    behavior: z.string().min(1)
  })
  .strict();

const AcceptanceCriterionSchema = z
  .object({
    id: IdentifierSchema,
    statement: z.string().min(1),
    evidence: z.string().min(1),
    source_quote: z.string().min(1).optional(),
    source_intent_ids: z.array(IdentifierSchema).default([])
  })
  .strict()
  .superRefine((criterion, context) => {
    if (!criterion.source_quote && criterion.source_intent_ids.length === 0) {
      context.addIssue({
        code: "custom",
        path: ["source_quote"],
        message:
          "acceptance criterion needs source_quote or source_intent_ids"
      });
    }
  });

function reportDuplicateIds(
  values: ReadonlyArray<{ id: string }>,
  path: string,
  context: z.RefinementCtx
): void {
  const seen = new Set<string>();
  for (const [index, value] of values.entries()) {
    if (seen.has(value.id)) {
      context.addIssue({
        code: "custom",
        path: [path, index, "id"],
        message: `duplicate identifier ${value.id}`
      });
    }
    seen.add(value.id);
  }
}

export const GeneratedPrdSchema = z
  .object({
    schema_version: z.literal(GENERATED_PRD_SCHEMA_VERSION),
    title: z.string().min(1),
    user_goal: z.string().min(1),
    controls: z.array(PrdControlSchema).min(1),
    rules: z.array(PrdRuleSchema).min(1),
    ui: z.array(PrdUiRequirementSchema).min(1),
    acceptance_criteria: z.array(AcceptanceCriterionSchema).min(1),
    assumptions: z.array(z.string().min(1)).default([])
  })
  .strict()
  .superRefine((prd, context) => {
    reportDuplicateIds(prd.controls, "controls", context);
    reportDuplicateIds(prd.rules, "rules", context);
    reportDuplicateIds(prd.ui, "ui", context);
    reportDuplicateIds(prd.acceptance_criteria, "acceptance_criteria", context);
  });

const GameControlSchema = z
  .object({
    action_id: IdentifierSchema,
    actor: z.enum(["primary", "secondary"]).default("primary"),
    device: z.enum(["keyboard", "mouse", "touch", "camera"]),
    key_event: z.enum(["press", "down", "up"]).default("press"),
    code: z.string().min(1).optional(),
    selector: z.string().min(1).optional(),
    x_ratio: z.number().min(0).max(1).optional(),
    y_ratio: z.number().min(0).max(1).optional(),
    fixture_frame: z.string().min(1).optional(),
    description: z.string().min(1)
  })
  .strict()
  .superRefine((control, context) => {
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

const StateFieldSchema = z
  .object({
    type: z.enum([
      "string",
      "number",
      "integer",
      "boolean",
      "object",
      "array",
      "null"
    ]),
    description: z.string().min(1)
  })
  .strict();

const StateSchema = z
  .object({
    fields: z
      .record(z.string().min(1), StateFieldSchema)
      .refine((fields) => Object.keys(fields).length > 0, {
        message: "state schema needs at least one field"
      }),
    required: z.array(z.string().min(1)).default([])
  })
  .strict()
  .superRefine((schema, context) => {
    for (const [index, field] of schema.required.entries()) {
      if (!(field in schema.fields)) {
        context.addIssue({
          code: "custom",
          path: ["required", index],
          message: `required state field ${field} is not declared`
        });
      }
    }
  });

const GameEventSchema = z
  .object({
    type: IdentifierSchema,
    description: z.string().min(1),
    payload_fields: z
      .record(z.string().min(1), StateFieldSchema)
      .default({})
  })
  .strict();

export const GameManifestSchema = z
  .object({
    schema_version: z.literal(GAME_MANIFEST_SCHEMA_VERSION),
    entry_path: z.literal("index.html"),
    surface: z.enum(["dom", "canvas2d", "webgl"]),
    viewport: z
      .object({
        width: z.number().int().positive().max(4096),
        height: z.number().int().positive().max(4096)
      })
      .strict(),
    controls: z.array(GameControlSchema).min(1),
    hud_selectors: z
      .record(z.string().min(1), z.string().min(1))
      .refine((selectors) => Object.keys(selectors).length > 0, {
        message: "at least one HUD selector is required"
      }),
    state_schema: StateSchema,
    event_schema: z.array(GameEventSchema).min(1),
    bridge: z
      .object({
        protocol: z.literal("gametestlab/2"),
        evidence_only: z.literal(true),
        actions_via_real_input: z.literal(true)
      })
      .strict()
  })
  .strict()
  .superRefine((manifest, context) => {
    for (const [path, values] of [
      ["controls", manifest.controls.map((control) => control.action_id)],
      ["event_schema", manifest.event_schema.map((event) => event.type)]
    ] as const) {
      const seen = new Set<string>();
      for (const [index, value] of values.entries()) {
        if (seen.has(value)) {
          context.addIssue({
            code: "custom",
            path: [path, index],
            message: `duplicate identifier ${value}`
          });
        }
        seen.add(value);
      }
    }
  });

export const GAME_PACKAGE_FILE_ALLOWLIST = [
  "index.html",
  "styles.css",
  "game.js",
  "game.manifest.json"
] as const;

export const SafeGameFilePathSchema = z.enum(GAME_PACKAGE_FILE_ALLOWLIST);

const GamePackageFileSchema = z
  .object({
    path: SafeGameFilePathSchema,
    content: z.string().min(1).max(1_000_000)
  })
  .strict();

function htmlAttribute(tag: string, name: string): string | null {
  const match = new RegExp(
    `\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`,
    "i"
  ).exec(tag);
  return match?.[1] ?? match?.[2] ?? match?.[3] ?? null;
}

function hasHtmlAsset(
  html: string,
  tagName: "script" | "link",
  attribute: "src" | "href",
  expectedPath: string
): boolean {
  const tags = html.match(new RegExp(`<${tagName}\\b[^>]*>`, "gi")) ?? [];
  return tags.some((tag) => {
    const value = htmlAttribute(tag, attribute)?.split(/[?#]/, 1)[0];
    if (value !== expectedPath && value !== `./${expectedPath}`) return false;
    if (tagName === "link") {
      return htmlAttribute(tag, "rel")?.toLowerCase() === "stylesheet";
    }
    return true;
  });
}

function hasBridgeAssignment(source: string): boolean {
  try {
    // Parse only; the generated source is never executed in the validator.
    Function(source);
  } catch {
    return false;
  }
  let cleaned = "";
  let index = 0;
  let mode: "code" | "line" | "block" | "string" = "code";
  let quote = "";
  while (index < source.length) {
    const character = source[index] ?? "";
    const next = source[index + 1] ?? "";
    if (mode === "line") {
      if (character === "\n") {
        mode = "code";
        cleaned += "\n";
      } else cleaned += " ";
      index += 1;
      continue;
    }
    if (mode === "block") {
      if (character === "*" && next === "/") {
        cleaned += "  ";
        index += 2;
        mode = "code";
      } else {
        cleaned += character === "\n" ? "\n" : " ";
        index += 1;
      }
      continue;
    }
    if (mode === "string") {
      if (character === "\\") {
        cleaned += "  ";
        index += 2;
      } else {
        cleaned += character === "\n" ? "\n" : " ";
        index += 1;
        if (character === quote) mode = "code";
      }
      continue;
    }
    if (character === "/" && next === "/") {
      cleaned += "  ";
      index += 2;
      mode = "line";
    } else if (character === "/" && next === "*") {
      cleaned += "  ";
      index += 2;
      mode = "block";
    } else if (character === '"' || character === "'" || character === "`") {
      quote = character;
      mode = "string";
      cleaned += " ";
      index += 1;
    } else {
      cleaned += character;
      index += 1;
    }
  }
  return /\bwindow\s*\.\s*__GAMETESTLAB__\s*=/.test(cleaned);
}

export const GeneratedGamePackageSchema = z
  .object({
    schema_version: z.literal(GAME_PACKAGE_SCHEMA_VERSION),
    files: z.array(GamePackageFileSchema).length(GAME_PACKAGE_FILE_ALLOWLIST.length)
  })
  .strict()
  .superRefine((gamePackage, context) => {
    const byPath = new Map<string, string>();
    for (const [index, file] of gamePackage.files.entries()) {
      if (byPath.has(file.path)) {
        context.addIssue({
          code: "custom",
          path: ["files", index, "path"],
          message: `duplicate game file ${file.path}`
        });
      }
      byPath.set(file.path, file.content);
    }
    for (const requiredPath of GAME_PACKAGE_FILE_ALLOWLIST) {
      if (!byPath.has(requiredPath)) {
        context.addIssue({
          code: "custom",
          path: ["files"],
          message: `missing required game file ${requiredPath}`
        });
      }
    }

    const indexHtml = byPath.get("index.html") ?? "";
    if (
      !hasHtmlAsset(indexHtml, "script", "src", "game.js") ||
      !hasHtmlAsset(indexHtml, "link", "href", "styles.css")
    ) {
      context.addIssue({
        code: "custom",
        path: ["files"],
        message: "index.html must load game.js and styles.css"
      });
    }

    const remoteScheme = /(?:https?|wss?):\s*\/\//i;
    const protocolRelativeHtml = /\b(?:src|href|action|poster)\s*=\s*(?:["']\s*)?\/\//i;
    const protocolRelativeText = /["'`]\s*\/\/[A-Za-z0-9]/;
    if ([...byPath.values()].some((content) =>
      remoteScheme.test(content) ||
      protocolRelativeHtml.test(content) ||
      protocolRelativeText.test(content)
    )) {
      context.addIssue({
        code: "custom",
        path: ["files"],
        message: "game package must not load remote dependencies"
      });
    }

    const gameJs = byPath.get("game.js") ?? "";
    if (!hasBridgeAssignment(gameJs)) {
      context.addIssue({
        code: "custom",
        path: ["files"],
        message: "game.js must assign window.__GAMETESTLAB__"
      });
    }
    for (const requiredToken of [
      "gametestlab/2",
      "isReady",
      "reset",
      "observe",
      "getEvents",
      "event_epoch"
    ]) {
      if (!gameJs.includes(requiredToken)) {
        context.addIssue({
          code: "custom",
          path: ["files"],
          message: `game.js bridge is missing ${requiredToken}`
        });
      }
    }

    const manifestText = byPath.get("game.manifest.json");
    if (manifestText) {
      let manifest: unknown;
      try {
        manifest = JSON.parse(manifestText) as unknown;
      } catch {
        context.addIssue({
          code: "custom",
          path: ["files"],
          message: "game.manifest.json must contain valid JSON"
        });
        return;
      }
      const manifestResult = GameManifestSchema.safeParse(manifest);
      if (!manifestResult.success) {
        context.addIssue({
          code: "custom",
          path: ["files"],
          message: `invalid game.manifest.json: ${manifestResult.error.message}`
        });
      }
    }
  });

const GenerationCallAuditSchema = z
  .object({
    phase: z.enum(["prd", "game"]),
    input_basis: z.enum(["user_brief", "frozen_prd"]),
    request_file: z.string().min(1),
    response_file: z.string().min(1),
    request_sha256: z.string().regex(/^[a-f0-9]{64}$/),
    response_sha256: z.string().regex(/^[a-f0-9]{64}$/)
  })
  .strict();

export const GenerationRunManifestSchema = z
  .object({
    schema_version: z.literal(GENERATION_RUN_SCHEMA_VERSION),
    run_id: z.string().min(1),
    created_at: z.string().datetime(),
    prd_review_status: z.enum(["pending", "approved"]),
    user_brief_file: z.string().min(1),
    frozen_prd_file: z.string().min(1),
    frozen_prd_sha256: z.string().regex(/^[a-f0-9]{64}$/),
    game_package_file: z.string().min(1),
    game_directory: z.string().min(1),
    smoke_file: z.string().min(1),
    runtime_smoke_passed: z.literal(true),
    calls: z.tuple([GenerationCallAuditSchema, GenerationCallAuditSchema]),
    secret_fields_persisted: z.literal(false),
    second_response_mutated_frozen_prd: z.literal(false),
    actions_via_real_input: z.literal(true)
  })
  .strict();

export type UserBriefInput = z.input<typeof UserBriefSchema>;
export type UserBrief = z.infer<typeof UserBriefSchema>;
export type GeneratedPrd = z.infer<typeof GeneratedPrdSchema>;
export type GameManifest = z.infer<typeof GameManifestSchema>;
export type GeneratedGamePackage = z.infer<typeof GeneratedGamePackageSchema>;
export type GenerationRunManifest = z.infer<typeof GenerationRunManifestSchema>;

export function gameManifestFromPackage(
  gamePackage: GeneratedGamePackage
): GameManifest {
  const file = gamePackage.files.find(
    (candidate) => candidate.path === "game.manifest.json"
  );
  if (!file) throw new Error("game package has no game.manifest.json");
  return GameManifestSchema.parse(JSON.parse(file.content) as unknown);
}
