import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { expect, test } from "vitest";

test("generation recording verifies evidence and refuses overwrite or changed code", async () => {
  const batch = await mkdtemp(resolve(tmpdir(), "codebuddy-record-test-"));
  try {
    const game = resolve(batch, "generated/demo/files");
    const publicDir = resolve(batch, "public/demo");
    await Promise.all([mkdir(game, { recursive: true }), mkdir(publicDir, { recursive: true }), mkdir(resolve(batch, "runs"))]);
    const hash = createHash("sha256");
    for (const name of ["game.js", "game.manifest.json", "index.html", "styles.css"].sort((a, b) => a.localeCompare(b))) {
      await writeFile(resolve(game, name), name);
      hash.update(name).update("\0").update(name).update("\0");
    }
    await writeFile(resolve(publicDir, "prompt.md"), "prompt");
    await writeFile(resolve(batch, "batch-manifest.json"), JSON.stringify({ batch_id: "test", tasks: [{ id: "demo", prompt_sha256: createHash("sha256").update("prompt").digest("hex") }] }));
    const result = resolve(batch, "runs/result.json");
    await writeFile(result, JSON.stringify({ task_id: "demo", generator: "codebuddy-hy3", evaluation_context: "frozen_task_evaluation", status: "evaluated", input_hashes: { game_directory_sha256: hash.digest("hex") } }));
    const run = () => execFileSync(process.execPath, ["--import", "tsx", "scripts/record-codebuddy-generation.ts", "--batch-dir", batch, "--task", "demo", "--result", result, "--model", "Hy3 High", "--credits", "0", "--tokens", "123", "--duration-seconds", "5"], { stdio: "pipe" });
    expect(run().toString()).toContain("hashes verified");
    const metadataPath = resolve(batch, "generated/demo/generation.json");
    const original = await readFile(metadataPath, "utf8");
    expect(JSON.parse(original)).toMatchObject({ reported_tokens: 123, attempt: 1, manual_code_edits: false });
    expect(run).toThrow();
    await writeFile(resolve(game, "game.js"), "changed");
    expect(run).toThrow();
    expect(await readFile(metadataPath, "utf8")).toBe(original);
  } finally {
    await rm(batch, { recursive: true, force: true });
  }
});
