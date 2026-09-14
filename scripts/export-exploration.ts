import { mkdir, readFile, readdir, copyFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { contentHash } from "../src/evaluation/generation-provenance";
const source = process.argv[2], destination = process.argv[3];
if (!source || !destination) throw new Error("Usage: export-exploration.ts SOURCE NEW_DESTINATION");
const root = resolve(source), out = resolve(destination);
const entries = await readdir(root);
const files: string[] = entries.filter(name => ["trace.json", "summary.json", "review.json"].includes(name));
if (!files.includes("trace.json") && !files.includes("review.json")) throw new Error("No exploration or review evidence");
for (const dir of entries.filter(name => /^decision-\d+(?:-format-retry)?$/.test(name) || name === "call")) {
  const receipt = JSON.parse(await readFile(resolve(root, dir, "receipt.json"), "utf8"));
  const prompt = await readFile(resolve(root, dir, "prompt.txt"), "utf8");
  if (receipt.model !== "hy3" || receipt.model_verified !== true || receipt.prompt_sha256 !== contentHash(prompt)) throw new Error(`Unverified call: ${dir}`);
  files.push(`${dir}/prompt.txt`, `${dir}/receipt.json`);
}
// Explicit allowlist: never copy provider raw responses, stderr, or unrelated files.
await mkdir(out, { recursive: false });
for (const name of files) {
  if (name.includes("/")) await mkdir(resolve(out, name.split("/")[0]!), { recursive: true });
  await copyFile(resolve(root, name), resolve(out, name));
}
await writeFile(resolve(out, "export-manifest.json"), JSON.stringify({ files: await Promise.all(files.map(async name => ({ file: name, sha256: contentHash(await readFile(resolve(out, name), "utf8")) }))),
  scope: "Allowlisted evidence export; prompt hashes verified; raw provider output excluded."
}, null, 2));
console.log(JSON.stringify({ exported_files: files.length }));
