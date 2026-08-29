import { readFile } from "node:fs/promises";
import { extname } from "node:path";
import { z } from "zod";

export const VisualVerdictSchema = z.object({
  schema_version: z.literal("gametestlab.visual-verdict.v1"),
  verdict: z.enum(["pass", "fail", "uncertain"]),
  confidence: z.number().min(0).max(1),
  requirement_id: z.string().min(1),
  rationale: z.string().min(1),
  visible_evidence: z.array(z.string()).default([]),
  possible_false_positive: z.boolean().default(false)
});

export type VisualVerdict = z.infer<typeof VisualVerdictSchema>;

interface VisionResponse {
  choices?: Array<{ message?: { content?: string } }>;
  error?: { message?: string };
}

export interface VisualJudgeConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
}

function loadVisualConfig(): VisualJudgeConfig | null {
  const baseUrl = process.env.MULTIMODAL_BASE_URL;
  const apiKey = process.env.MULTIMODAL_API_KEY;
  const model = process.env.MULTIMODAL_MODEL;
  return baseUrl && apiKey && model ? { baseUrl, apiKey, model } : null;
}

function mimeType(path: string): string {
  const extension = extname(path).toLowerCase();
  if (extension === ".jpg" || extension === ".jpeg") return "image/jpeg";
  if (extension === ".webp") return "image/webp";
  return "image/png";
}

function stripFence(value: string): string {
  return value
    .replace(/^\s*```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/i, "")
    .trim();
}

export async function judgeScreenshot(options: {
  screenshotPath: string;
  requirementId: string;
  publicRequirement: string;
  config?: VisualJudgeConfig;
}): Promise<VisualVerdict | { verdict: "unverified"; reason: string }> {
  const config = options.config ?? loadVisualConfig();
  if (!config) {
    return {
      verdict: "unverified",
      reason: "MULTIMODAL_BASE_URL, MULTIMODAL_API_KEY and MULTIMODAL_MODEL are not all set"
    };
  }

  const image = await readFile(options.screenshotPath);
  const imageUrl = `data:${mimeType(options.screenshotPath)};base64,${image.toString("base64")}`;
  const endpoint = `${config.baseUrl.replace(/\/$/, "")}/chat/completions`;
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${config.apiKey}`
    },
    body: JSON.stringify({
      model: config.model,
      temperature: 0,
      messages: [
        {
          role: "system",
          content:
            "You are the optional L3 visual assessor in GameTestLab. Judge only visible evidence for the supplied public requirement. If the screenshot is ambiguous or the requirement cannot be established visually, return uncertain. Return one JSON object with schema_version gametestlab.visual-verdict.v1, verdict, confidence, requirement_id, rationale, visible_evidence, and possible_false_positive."
        },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `Requirement ${options.requirementId}: ${options.publicRequirement}`
            },
            { type: "image_url", image_url: { url: imageUrl } }
          ]
        }
      ]
    })
  });
  const payload = (await response.json()) as VisionResponse;
  if (!response.ok) {
    throw new Error(
      `Visual judge failed (${response.status}): ${payload.error?.message ?? "unknown error"}`
    );
  }
  const content = payload.choices?.[0]?.message?.content;
  if (!content) throw new Error("Visual judge returned an empty response");
  return VisualVerdictSchema.parse(JSON.parse(stripFence(content)) as unknown);
}
