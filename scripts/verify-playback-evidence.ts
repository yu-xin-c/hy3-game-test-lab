import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { checkFirstRoundPlayback } from "../src/evaluation/playback-timing";
import { contentHash } from "../src/evaluation/generation-provenance";

const index = process.argv.indexOf("--evidence");
if (index < 0 || !process.argv[index + 1]) throw new Error("Provide --evidence DIRECTORY");
const root = resolve(process.argv[index + 1]!);
const checks = [];
for (const scenario of ["idle-reset", "playback-reset", "playback-reset-start"]) {
  for (let repeat = 1; repeat <= 3; repeat++) {
    const file = `${scenario}-${repeat}.json`;
    const text = await readFile(resolve(root, file), "utf8");
    checks.push({ file, trace_sha256: contentHash(text), ...checkFirstRoundPlayback(JSON.parse(text)) });
  }
}
await writeFile(resolve(root, "timing-checks.json"), JSON.stringify({
  rule_source: "Signal Memory public brief: first round has two colors; each highlight 400ms plus gap 200ms; ignore inputs during playback.",
  boundary_policy: "32ms conservative early-boundary tolerance; this check does not certify menu-reset semantics or whole-game correctness.",
  checks
}, null, 2));
console.log(JSON.stringify(checks.map(({ file, verdict, first_observed_step }) => ({ file, verdict, first_observed_step }))));
