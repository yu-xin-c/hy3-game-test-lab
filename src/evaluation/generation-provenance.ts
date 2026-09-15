import { createHash } from "node:crypto";

export interface GenerationCall {
  tool: string;
  call_id?: string;
  status: string;
  within_generated_directory?: boolean;
  file?: string;
  arguments?: Record<string, unknown>;
}
export const contentHash = (text: string) => createHash("sha256").update(text).digest("hex");

/** Tool indices are one-based and include reads; they are not reasoning steps. */
export function reconstructGeneration(calls: GenerationCall[], finalFiles: Record<string, string>) {
  const files: Record<string, string> = {};
  const owners: Record<string, number[]> = {};
  const steps: { step: number; call_id: string | null; tool: string; file: string; sha256: string }[] = [];
  const issues: string[] = [];
  for (const [index, call] of calls.entries()) {
    if (call.status !== "completed" || !["Write", "Edit"].includes(call.tool)) continue;
    const file = call.file;
    if (!call.within_generated_directory || !file || !(file in finalFiles)) {
      issues.push(`step ${index + 1}: unverified file scope`);
      continue;
    }
    const args = call.arguments ?? {};
    if (call.tool === "Write" && typeof args.content === "string") {
      files[file] = args.content;
      owners[file] = Array(args.content.length).fill(index + 1);
    } else if (call.tool === "Edit" && typeof args.old_string === "string" && typeof args.new_string === "string") {
      const before = files[file];
      const old = args.old_string;
      if (before === undefined || !old || !before.includes(old) ||
          (args.replace_all !== true && before.indexOf(old) !== before.lastIndexOf(old))) {
        issues.push(`step ${index + 1}: edit cannot be replayed unambiguously`);
        continue;
      }
      let cursor = 0;
      let text = "";
      const attribution: number[] = [];
      while (cursor <= before.length) {
        const at = before.indexOf(old, cursor);
        if (at < 0) {
          text += before.slice(cursor);
          attribution.push(...owners[file]!.slice(cursor));
          break;
        }
        text += before.slice(cursor, at) + args.new_string;
        attribution.push(...owners[file]!.slice(cursor, at), ...Array(args.new_string.length).fill(index + 1));
        cursor = at + old.length;
        if (args.replace_all !== true) {
          text += before.slice(cursor);
          attribution.push(...owners[file]!.slice(cursor));
          break;
        }
      }
      files[file] = text;
      owners[file] = attribution;
    } else {
      issues.push(`step ${index + 1}: unsupported mutation arguments`);
      continue;
    }
    steps.push({ step: index + 1, call_id: call.call_id ?? null, tool: call.tool, file, sha256: contentHash(files[file]!) });
  }
  const verifiedFiles = Object.fromEntries(Object.entries(finalFiles).map(([name, text]) => [name, files[name] === text]));
  return { files, owners, steps, issues, verifiedFiles,
    complete: calls.length > 0 && issues.length === 0 && Object.values(verifiedFiles).every(Boolean) };
}

export function locateExcerpt(reconstruction: ReturnType<typeof reconstructGeneration>, file: string, excerpt: string) {
  const text = reconstruction.files[file];
  if (!reconstruction.complete || !excerpt || text === undefined || !text.includes(excerpt)) return null;
  const offset = text.indexOf(excerpt);
  if (offset !== text.lastIndexOf(excerpt)) return null;
  return {
    file, line: text.slice(0, offset).split("\n").length,
    contributing_tool_steps: [...new Set(reconstruction.owners[file]!.slice(offset, offset + excerpt.length))].sort((a, b) => a - b),
    meaning: "code provenance only; not proof of earliest reasoning error"
  };
}

/** Match the first executed frame in a verified generated file, not an inferred root cause. */
export function locateRuntimeFrame(reconstruction: ReturnType<typeof reconstructGeneration>, stack: string) {
  if (!reconstruction.complete || !stack) return null;
  const frames = stack.matchAll(/(?:https?:\/\/[^\s)]*\/)?([A-Za-z0-9._-]+\.(?:js|mjs|html)):([1-9]\d*):([1-9]\d*)/g);
  for (const frame of frames) {
    const file = frame[1]!, line = Number(frame[2]), column = Number(frame[3]);
    const source = reconstruction.files[file];
    if (source === undefined) continue;
    const lines = source.split("\n"), sourceLine = lines[line - 1];
    if (sourceLine === undefined || column > sourceLine.length || sourceLine.length === 0) continue;
    let offset = column - 1;
    for (let i = 0; i < line - 1; i++) offset += lines[i]!.length + 1;
    const owner = reconstruction.owners[file]?.[offset];
    if (!owner) continue;
    return { file, line, column, source_line: sourceLine, source_line_sha256: contentHash(sourceLine), contributing_tool_step: owner,
      meaning: "executed stack frame and code provenance; first observable divergence and reasoning root cause are separate" };
  }
  return null;
}
