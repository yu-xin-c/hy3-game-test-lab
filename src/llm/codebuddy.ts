import { spawn } from "node:child_process";
import { openSync, closeSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { contentHash } from "../evaluation/generation-provenance";

export function decodeCodeBuddyResponse(text: string): any[] {
  try { const old = JSON.parse(text); if (Array.isArray(old)) return old; } catch { /* try JSONL */ }
  const envelopes = text.trim().split("\n").filter(Boolean).map(line => JSON.parse(line));
  const messages: any[] = [];
  const seen = new Set<string>();
  for (const envelope of envelopes) {
    if (envelope.type === "result") { messages.push(envelope); continue; }
    const message = envelope.message;
    if (!message || !Array.isArray(message.content)) continue;
    if (message.role === "assistant") messages.push({ role: "assistant", type: "message",
      providerData: { requestModelId: message.model },
      content: message.content.filter((c: any) => c.type === "text").map((c: any) => c.text).join("\n") });
    for (const block of message.content) {
      if (block.type === "tool_use" && !seen.has(block.id)) {
        seen.add(block.id);
        messages.push({ type: "function_call", callId: block.id, name: block.name, arguments: block.input });
      }
      if (block.type === "tool_result") messages.push({ type: "function_call_result", callId: block.tool_use_id,
        status: block.is_error ? "failed" : "completed" });
    }
  }
  return messages;
}

export async function callCodeBuddy(options: { cli: string; cwd: string; output: string; prompt: string; tools?: boolean }): Promise<{ messages: any[]; text: string; usage: unknown }> {
  await mkdir(options.output, { recursive: true });
  const promptPath = resolve(options.output, "prompt.txt");
  try { await writeFile(promptPath, options.prompt, { flag: "wx" }); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST" || await readFile(promptPath, "utf8") !== options.prompt) throw error;
  }
  let rawPath = resolve(options.output, "response.raw.json");
  let text: string;
  try {
    try { text = await readFile(rawPath, "utf8"); }
    catch (e) { if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e; rawPath = resolve(options.output, "response.raw.jsonl"); text = await readFile(rawPath, "utf8"); }
  }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    const fd = openSync(rawPath, "wx");
    const err = openSync(resolve(options.output, "stderr.log"), "wx");
    const args = ["--model", "hy3", "--effort", "high", "--agent", "cli", "--strict-mcp-config",
      "--tools", options.tools ? "Read,Write,Edit" : "", "--settings", '{"autoMemoryEnabled":false}',
      "--no-session-persistence", "--max-turns", options.tools ? "40" : "5", "-p", "--output-format", "stream-json"];
    if (options.tools) args.push("--allowedTools", "Read", "Write", "Edit", "--permission-mode", "acceptEdits");
    const code = await new Promise<number | null>((done, reject) => {
      const child = spawn(options.cli, args, { cwd: options.cwd, stdio: ["pipe", fd, err] });
      let forceTimer: ReturnType<typeof setTimeout> | undefined;
      const timer = setTimeout(() => {
        child.kill("SIGTERM");
        forceTimer = setTimeout(() => child.kill("SIGKILL"), 5_000);
      }, 20 * 60_000);
      child.once("error", reject);
      child.once("close", code => { clearTimeout(timer); clearTimeout(forceTimer); closeSync(fd); closeSync(err); done(code); });
      child.stdin?.on("error", () => {});
      child.stdin?.end(options.prompt);
    });
    if (code !== 0) {
      const stderr = await readFile(resolve(options.output, "stderr.log"), "utf8");
      if (/429|使用量已超出频率限制/.test(stderr)) throw new Error("Hy3 rate limit; stop dispatching further tasks");
      throw new Error(`CodeBuddy failed (${code}); evidence retained at ${options.output}`);
    }
    text = await readFile(rawPath, "utf8");
  }
  let messages: any[];
  try { messages = decodeCodeBuddyResponse(text); } catch { throw new Error("Incomplete CodeBuddy response retained; use a new run directory to retry"); }
  if (!Array.isArray(messages)) throw new Error("Unexpected CodeBuddy envelope");
  const providers = messages.filter(m => m.role === "assistant" && m.providerData?.requestModelId);
  const result = messages.findLast(m => m.type === "result");
  if (result?.is_error && /input length too long/i.test(JSON.stringify(result.errors))) throw new Error("Hy3 input too long; compact repeated evidence before retrying");
  if (!providers.length || providers.some(m => m.providerData.requestModelId !== "hy3") || result?.is_error !== false) throw new Error("Unverified Hy3 completion");
  await writeFile(resolve(options.output, "receipt.json"), JSON.stringify({ model: "hy3", model_verified: true,
    output_format: rawPath.endsWith("jsonl") ? "stream-json" : "json",
    prompt_sha256: contentHash(options.prompt), response_sha256: contentHash(text), usage: result.usage }, null, 2));
  return { messages, text: String(result.result), usage: result.usage };
}

export function parseModelJson(text: string): unknown {
  return JSON.parse(text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, ""));
}
