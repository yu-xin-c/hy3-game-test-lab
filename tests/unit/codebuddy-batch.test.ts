import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { tmpdir } from "node:os";
import { expect, test } from "vitest";

test("batch preserves a >64 KiB CLI result, records invalid game output, and resumes without regeneration", async () => {
  const batch = await mkdtemp(resolve(tmpdir(), "hy3-batch-test-"));
  try {
    const taskId = "target-rush";
    await mkdir(resolve(batch, `generated/${taskId}/files`), { recursive: true });
    await mkdir(resolve(batch, `public/${taskId}`), { recursive: true });
    await mkdir(resolve(batch, "runs"));
    for (const name of ["brief.md", "GAME_CONTRACT.md"]) {
      const source = name === "brief.md" ? `datasets/game-tasks/${taskId}/${name}` : `datasets/game-tasks/${name}`;
      await writeFile(resolve(batch, `public/${taskId}/${name}`), await readFile(source));
    }
    const prompt = "test-only prompt";
    await writeFile(resolve(batch, `public/${taskId}/prompt.md`), prompt);
    await writeFile(resolve(batch, "batch-manifest.json"), JSON.stringify({ batch_id: "test-only", tasks: [{ id: taskId, difficulty: "D1", category: "action", prompt_sha256: createHash("sha256").update(prompt).digest("hex") }] }));
    const fakeCli = resolve(batch, "fake-cli");
    const messages = [{ role: "assistant", providerData: { requestModelId: "hy3", rawUsage: { total_tokens: 5, credit: 0 } }, content: [{ type: "output_text", text: "x".repeat(150000) }] }, { type: "result", is_error: false, subtype: "success" }];
    await writeFile(fakeCli, `#!/usr/bin/env node\nprocess.stdout.write(${JSON.stringify(JSON.stringify(messages))}); process.exit(0);\n`, { mode: 0o700 });
    const run = () => execFileSync(process.execPath, ["--import", "tsx", "scripts/run-codebuddy-batch.ts", "--batch-dir", batch, "--cli", fakeCli, "--limit", "1"], { stdio: "pipe" });
    expect(run().toString()).toContain("generation_failure");
    const completion = JSON.parse(await readFile(resolve(batch, `generated/${taskId}/cli-completion.json`), "utf8"));
    expect(completion).toMatchObject({ success: true, total_tokens: 5, model_ids: ["hy3"] });
    const metadata = await readFile(resolve(batch, `generated/${taskId}/generation.json`), "utf8");
    expect(JSON.parse(metadata).result).toBe("generation_failure");
    expect(run().toString()).toContain("0 new games");
    expect(await readFile(resolve(batch, `generated/${taskId}/generation.json`), "utf8")).toBe(metadata);
  } finally { await rm(batch, { recursive: true, force: true }); }
}, 15000);
