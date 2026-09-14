import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { contentHash } from "../src/evaluation/generation-provenance";
import { keyDoorReference } from "../src/evaluation/key-door-reference";

const index = process.argv.indexOf("--out");
if (index < 0 || !process.argv[index + 1]) throw new Error("Provide --out NEW_DIRECTORY");
const out = resolve(process.argv[index + 1]!);
const source = "results/infra-recovery/evidence/key-door-escape/task";
const brief = await readFile(resolve(source, "brief.md"), "utf8");
const planText = await readFile(resolve(source, "test-plan.json"), "utf8");
const oracleText = await readFile(resolve(source, "oracle.private.json"), "utf8");
const match = /```text\s*\n([#SKDTE.\n]+)\n```/.exec(brief);
if (!match) throw new Error("Public map missing");
const map = match[1]!.split("\n");
const plan = JSON.parse(planText), oracle = JSON.parse(oracleText);
const rows = [], traces = [];
for (const scenario of plan.scenarios) {
  const reference = keyDoorReference(map);
  const expected = oracle.scenarios.find((s: any) => s.scenario_id === scenario.id);
  if (!expected) throw new Error("Missing oracle scenario");
  const trace = [];
  for (const [action_index, action] of scenario.steps.entries()) {
    if (!["input", "advance_time"].includes(action.kind)) throw new Error("Unsupported step");
    const observation = action.kind === "input" ? reference.input(action.action_id) : reference.snapshot();
    trace.push({ action_index, action, ...observation });
    for (const cp of expected.checkpoints.filter((c: any) => c.action_index === action_index)) {
      for (const [path, expectedValue] of Object.entries(cp.expected.state)) {
        const actual = path.split(".").reduce((value: any, key: string) => value?.[key], observation.state);
        const unknown = observation.unknown_fields.includes(path) || actual === undefined;
        rows.push({ scenario_id: scenario.id, checkpoint: cp.id, action_index, path, expected: expectedValue,
          reference: unknown ? null : actual, verdict: unknown ? "not_determined" : JSON.stringify(actual) === JSON.stringify(expectedValue) ? "matched" : "mismatch" });
      }
    }
  }
  traces.push({ scenario_id: scenario.id, trace });
}
await mkdir(out, { recursive: false });
await writeFile(resolve(out, "result.json"), JSON.stringify({ source, brief_sha256: contentHash(brief),
  plan_sha256: contentHash(planText), oracle_sha256: contentHash(oracleText), map,
  reference_sha256: contentHash(await readFile("src/evaluation/key-door-reference.ts", "utf8")),
  scope: "Independent public-rule state reference; no generated game code or Hy3 judgments used. UI/events/controls not certified.",
  counts: rows.reduce((a: Record<string, number>, r) => ({ ...a, [r.verdict]: (a[r.verdict] ?? 0) + 1 }), {}), rows, traces
}, null, 2));
console.log(JSON.stringify(rows.reduce((a: Record<string, number>, r) => ({ ...a, [r.verdict]: (a[r.verdict] ?? 0) + 1 }), {})));
