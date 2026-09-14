import { spawn } from "node:child_process";
import { openSync, closeSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
const ci = process.argv.indexOf("--cli"), oi = process.argv.indexOf("--out");
if (ci < 0 || oi < 0 || !process.argv[ci + 1] || !process.argv[oi + 1]) throw new Error("Provide --cli and --out");
const out = resolve(process.argv[oi + 1]!);
await mkdir(out, { recursive: false });
const raw = resolve(out, "response.raw.jsonl"), fd = openSync(raw, "wx"), err = openSync(resolve(out, "stderr.log"), "wx");
let timedOut = false;
const code = await new Promise<number | null>((done, reject) => {
  const child = spawn(resolve(process.argv[ci + 1]!), ["--model", "hy3", "--effort", "high", "--agent", "cli", "--strict-mcp-config", "--tools", "", "--settings", '{"autoMemoryEnabled":false}', "--no-session-persistence", "--max-turns", "1", "--output-format", "stream-json", "-p", "只回复 OK。"], { cwd: out, stdio: ["ignore", fd, err] });
  const timer = setTimeout(() => { timedOut = true; child.kill("SIGTERM"); }, 90_000);
  child.once("error", reject);
  child.once("close", code => { clearTimeout(timer); closeSync(fd); closeSync(err); done(code); });
});
const bytes = await readFile(raw), stderr = await readFile(resolve(out, "stderr.log"), "utf8");
const types: string[] = [];
for (const line of bytes.toString().trim().split("\n")) { try { const m = JSON.parse(line); types.push(m.type ?? "unknown"); } catch { /* record only parseable message types */ } }
const result = { requested_model: "hy3", output_format: "stream-json", timeout_ms: 90_000, timed_out: timedOut, exit_code: code,
  response_bytes: bytes.length, message_types: types, rate_limit_in_stderr: /429|使用量已超出频率限制/.test(stderr),
  purpose: "connectivity diagnostic only, not an evaluation sample" };
await writeFile(resolve(out, "diagnostic.json"), JSON.stringify(result, null, 2));
console.log(JSON.stringify(result));
