import "dotenv/config";

export interface Hy3Config {
  baseUrl: string;
  apiKey: string;
  model: string;
  reasoningEffort: "no_think" | "low" | "high";
}

interface ChatCompletionResponse {
  choices?: Array<{ message?: { content?: string } }>;
  error?: { message?: string };
}

export function loadHy3Config(): Hy3Config {
  return {
    baseUrl: process.env.HY3_BASE_URL ?? "http://127.0.0.1:8000/v1",
    apiKey: process.env.HY3_API_KEY ?? "EMPTY",
    model: process.env.HY3_MODEL ?? "hy3",
    reasoningEffort:
      (process.env.HY3_REASONING_EFFORT as Hy3Config["reasoningEffort"]) ??
      "high"
  };
}

function stripCodeFence(value: string): string {
  return value
    .replace(/^\s*```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/i, "")
    .trim();
}

export class Hy3Client {
  constructor(private readonly config: Hy3Config = loadHy3Config()) {}

  async complete(system: string, user: string): Promise<string> {
    const endpoint = `${this.config.baseUrl.replace(/\/$/, "")}/chat/completions`;
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${this.config.apiKey}`
      },
      body: JSON.stringify({
        model: this.config.model,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user }
        ],
        temperature: 0.9,
        top_p: 1.0,
        chat_template_kwargs: {
          reasoning_effort: this.config.reasoningEffort
        }
      })
    });
    const payload = (await response.json()) as ChatCompletionResponse;
    if (!response.ok) {
      throw new Error(
        `Hy3 request failed (${response.status}): ${payload.error?.message ?? "unknown error"}`
      );
    }
    const content = payload.choices?.[0]?.message?.content;
    if (!content) throw new Error("Hy3 returned an empty completion");
    return content;
  }

  async completeJson<T>(system: string, user: string): Promise<T> {
    return JSON.parse(stripCodeFence(await this.complete(system, user))) as T;
  }
}
