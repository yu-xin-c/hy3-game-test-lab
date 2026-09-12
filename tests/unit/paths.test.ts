import { mkdtemp, mkdir, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { resolveRegularFileInsideRoot } from "../../src/contracts/paths";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) =>
    rm(root, { recursive: true, force: true })
  ));
});

describe("repository path containment", () => {
  it("accepts regular files and rejects escapes, missing files, and symlinks", async () => {
    const root = await mkdtemp(join(tmpdir(), "gametestlab-paths-"));
    roots.push(root);
    await mkdir(resolve(root, "examples/game"), { recursive: true });
    await mkdir(resolve(root, "datasets"));
    await writeFile(resolve(root, "examples/game/index.html"), "ok", "utf8");
    await writeFile(resolve(root, "datasets/oracle.json"), "secret", "utf8");
    await symlink(
      resolve(root, "examples/game/index.html"),
      resolve(root, "examples/game/link.html")
    );
    await symlink(resolve(root, "datasets"), resolve(root, "examples/leak"));

    await expect(resolveRegularFileInsideRoot(
      root,
      "examples/game/index.html",
      { requiredPrefix: "examples", rejectSymlink: true }
    )).resolves.toBe(await realpath(resolve(root, "examples/game/index.html")));
    await expect(resolveRegularFileInsideRoot(root, "../outside.html"))
      .rejects.toThrow(/escapes/);
    await expect(resolveRegularFileInsideRoot(root, "examples/game/missing.html"))
      .rejects.toThrow();
    await expect(resolveRegularFileInsideRoot(
      root,
      "examples/game/link.html",
      { rejectSymlink: true }
    )).rejects.toThrow(/Symbolic-link|symbolic-link/);
    await expect(resolveRegularFileInsideRoot(
      root,
      "examples/leak/oracle.json",
      { requiredPrefix: "examples" }
    )).rejects.toThrow(/stay inside examples/);
  });
});
