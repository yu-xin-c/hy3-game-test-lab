import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { contentHash, reconstructGeneration } from "../src/evaluation/generation-provenance";
const root = resolve("results/error-mining-v1");
const summary = JSON.parse(await readFile(resolve(root, "summary.json"), "utf8"));
const cases = [];
for (const finding of summary.findings) {
  const code: Record<string, string> = {};
  for (const name of ["game.js", "game.manifest.json", "index.html", "styles.css"]) code[name] = await readFile(resolve(finding.source, "game", name), "utf8");
  if (contentHash(Object.entries(code).map(([name, text]) => name + "\0" + text + "\0").join("")) !== finding.game_sha256) throw new Error("Changed game");
  const tools = JSON.parse(await readFile(resolve(finding.source, "generation-tools.json"), "utf8"));
  const history = reconstructGeneration(tools.calls, code);
  cases.push({ id: finding.id, difficulty: finding.difficulty, code,
    public_prompt: await readFile(resolve(finding.source, "prompt.md"), "utf8"),
    runs: finding.runs, history: { complete: history.complete, steps: history.steps },
    game_sha256: finding.game_sha256 });
}
await writeFile(resolve(root, "review-cases.json"), JSON.stringify({ cases }, null, 2));
console.log(`Prepared ${cases.length} human review cases; no annotations created`);
