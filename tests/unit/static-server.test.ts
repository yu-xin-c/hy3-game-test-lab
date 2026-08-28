import { describe, expect, it } from "vitest";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { startStaticServer } from "../../src/runtime/static-server";

const repositoryRoot = resolve(import.meta.dirname, "../..");

describe("fixture-only static server", () => {
  it("serves health and examples while denying repository-private files", async () => {
    const server = await startStaticServer({
      rootDirectory: repositoryRoot,
      port: 0
    });

    try {
      const paths = [
        "/datasets/manifest.json",
        "/datasets/cases/clean-control/oracle.private.json",
        "/examples/%2e%2e/datasets/manifest.json",
        "/examples/%252e%252e/datasets/manifest.json",
        "/%2e%2e/%2e%2e/etc/passwd"
      ];
      expect((await fetch(`${server.origin}/healthz`)).status).toBe(200);
      expect(
        (await fetch(`${server.origin}/examples/coin-collector/index.html`))
          .status
      ).toBe(200);
      for (const path of paths) {
        expect((await fetch(`${server.origin}${path}`)).status, path).toBe(404);
      }
    } finally {
      await server.close();
    }
  });

  it("rejects state-changing HTTP methods", async () => {
    const server = await startStaticServer({
      rootDirectory: repositoryRoot,
      port: 0
    });
    try {
      const response = await fetch(
        `${server.origin}/examples/coin-collector/index.html`,
        { method: "POST" }
      );
      expect(response.status).toBe(405);
      expect(response.headers.get("allow")).toBe("GET, HEAD");
    } finally {
      await server.close();
    }
  });

  it("can expose one isolated generated-game directory without exposing its parent", async () => {
    const temporaryRoot = await mkdtemp(resolve(tmpdir(), "prd2play-server-"));
    const gameRoot = resolve(temporaryRoot, "game");
    await mkdir(gameRoot);
    await writeFile(resolve(gameRoot, "index.html"), "<h1>generated</h1>");
    await writeFile(resolve(temporaryRoot, "oracle.private.json"), "secret");
    const server = await startStaticServer({
      rootDirectory: gameRoot,
      port: 0,
      exposure: "isolated-root"
    });
    try {
      expect((await fetch(`${server.origin}/index.html`)).status).toBe(200);
      expect(
        (await fetch(`${server.origin}/../oracle.private.json`)).status
      ).toBe(404);
    } finally {
      await server.close();
      await rm(temporaryRoot, { recursive: true });
    }
  });
});
