import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, realpath, writeFile } from "node:fs/promises";
import { resolve, relative } from "node:path";
import { fileURLToPath } from "node:url";



export async function startReviewServer(rootDirectory: string, port = 4175, miningDirectory?: string, explorationDirectory?: string) {
  const root = await realpath(rootDirectory), token = randomUUID();
  const miningRoot = miningDirectory ? await realpath(miningDirectory) : null;
  const explorationRoot = explorationDirectory ? await realpath(explorationDirectory) : null;
  const optional = async (path: string) => { try { return JSON.parse(await readFile(path, "utf8")); } catch (e) { if ((e as NodeJS.ErrnoException).code === "ENOENT") return null; throw e; } };
  const ids = async (): Promise<string[]> => {
    const manifest = await optional(resolve(root, "manifest.json"));
    const values = manifest?.tasks ?? [];
    if (!Array.isArray(values) || values.some(v => typeof v !== "string" || !/^[a-z][a-z0-9-]*$/.test(v))) throw new Error("Invalid manifest");
    return values;
  };
  const server = createServer(async (request, response) => {
    response.setHeader("Cache-Control", "no-store");
    response.setHeader("X-Content-Type-Options", "nosniff");
    const send = (code: number, data: unknown) => { response.writeHead(code, { "Content-Type": "application/json; charset=utf-8" }); response.end(JSON.stringify(data)); };
    try {
      const host = request.headers.host;
      if (host !== `127.0.0.1:${actualPort}` && host !== `localhost:${actualPort}`) { send(403, { error: "Invalid host" }); return; }
      const url = new URL(request.url ?? "/", `http://${host}`);
      if (explorationRoot && request.method === "GET" && url.pathname === "/exploration") {
        response.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Content-Security-Policy": "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'" });
        response.end(await readFile(fileURLToPath(new URL("../ui/exploration.html", import.meta.url)))); return;
      }
      if (explorationRoot && request.method === "GET" && url.pathname === "/api/exploration") {
        const cases = await Promise.all(["zen-garden", "science-circuit", "mini-farm"].map(async id => {
          const dir = resolve(explorationRoot, id);
          return { id, trace: await optional(resolve(dir, "trace.json")), summary: await optional(resolve(dir, "summary.json")),
            review: await optional(resolve(dir, "review/review.json")),
            diagnostic_review: await optional(resolve(dir, "cross-check-review/review.json")),
            replays: await Promise.all([1, 2, 3].map(n => optional(resolve(dir, `replay-${n}/summary.json`)))) };
        }));
        send(200, { cases: cases.filter(c => c.trace), scope: "探索工程验证；不是未知游戏发现率或推理定位准确率" }); return;
      }
      if (miningRoot && (url.pathname === "/mined" || url.pathname.startsWith("/api/mined") || url.pathname.startsWith("/mined-artifact/"))) {
        const dataset = await optional(resolve(miningRoot, "review-cases.json"));
        const cases = dataset?.cases ?? [];
        if (cases.some((c: any) => !/^[a-z][a-z0-9-]*$/.test(c.id))) throw new Error("Invalid mined IDs");
        if (request.method === "GET" && url.pathname === "/mined") {
          response.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Content-Security-Policy": "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'" });
          response.end(await readFile(fileURLToPath(new URL("../ui/mined-review.html", import.meta.url)))); return;
        }
        if (request.method === "GET" && url.pathname === "/api/mined") {
          send(200, { token, cases: await Promise.all(cases.map(async (c: any) => ({ ...c,
            review: await optional(resolve(miningRoot, c.id + "-full-review.json")) }))) }); return;
        }
        const selected = /^\/api\/mined\/([a-z][a-z0-9-]*)$/.exec(url.pathname);
        const item = selected && cases.find((c: any) => c.id === selected[1]);
        const asset = /^\/mined-artifact\/([a-z][a-z0-9-]*)-([0-2])\.png$/.exec(url.pathname);
        if (request.method === "GET" && asset && cases.some((c: any) => c.id === asset[1])) {
          response.writeHead(200, { "Content-Type": "image/png" }); response.end(await readFile(resolve(miningRoot, asset[1] + "-" + asset[2] + ".png"))); return;
        }
        send(404, {}); return;
      }
      if (request.method === "GET" && url.pathname === "/") {
        response.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Content-Security-Policy": "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self'; frame-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'" });
        response.end(await readFile(fileURLToPath(new URL("../ui/review-app.html", import.meta.url)))); return;
      }
      const taskIds = await ids();
      if (request.method === "GET" && url.pathname === "/api/cases") {
        const cases = await Promise.all(taskIds.map(async id => ({ id,
          status: await optional(resolve(root, id, "status.json")), review: await optional(resolve(root, id, "review.json")) })));
        send(200, { cases }); return;
      }
      const match = /^\/api\/cases\/([a-z][a-z0-9-]*)(\/review)?$/.exec(url.pathname);
      if (match && taskIds.includes(match[1]!)) {
        const id = match[1]!, dir = resolve(root, id);
        if (request.method === "GET" && !match[2]) {
          const code: Record<string, string> = {};
          for (const name of ["index.html", "styles.css", "game.js", "game.manifest.json"]) {
            try { code[name] = await readFile(resolve(dir, "game", name), "utf8"); } catch (e) { if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e; }
          }
          send(200, { id, plan: await optional(resolve(dir, "solution-plan.json")), status: await optional(resolve(dir, "status.json")),
            review: await optional(resolve(dir, "review.json")),
            provenance: await optional(resolve(dir, "generation-provenance.json")), snapshots: await optional(resolve(dir, "snapshots.json")),
            tools: await optional(resolve(dir, "generation-tools.json")),
            diagnostic: await optional(resolve(dir, "landing-timing-diagnostic/result.json")),
            diagnostic_review: await optional(resolve(dir, "landing-timing-diagnostic/review.json")),
            result: await optional(resolve(dir, "browser/result.json")), task: await optional(resolve(dir, "task/test-plan.json")), code }); return;
        }

      }
      const asset = /^\/artifact\/([a-z][a-z0-9-]*)\/(.+)$/.exec(url.pathname);
      if (request.method === "GET" && asset && taskIds.includes(asset[1]!)) {
        const requested = decodeURIComponent(asset[2]!);
        if (!/^(game\/(index\.html|styles\.css|game\.js|game\.manifest\.json)|browser\/(result\.json|events\.jsonl|screenshots\/[a-zA-Z0-9/_.-]+\.png))$/.test(requested)) { send(404, {}); return; }
        const dir = await realpath(resolve(root, asset[1]!));
        const path = await realpath(resolve(dir, requested));
        if (relative(dir, path).startsWith("..")) { send(403, {}); return; }
        const mime = path.endsWith(".png") ? "image/png" : path.endsWith(".html") ? "text/html" : path.endsWith(".css") ? "text/css" : path.endsWith(".js") ? "text/javascript" : "application/json";
        response.writeHead(200, { "Content-Type": mime, "Content-Security-Policy": "sandbox allow-scripts; default-src 'self' 'unsafe-inline'; connect-src 'none'" });
        response.end(await readFile(path)); return;
      }
      send(404, { error: "Not found" });
    } catch (error) { send(400, { error: error instanceof Error ? error.message : "Request failed" }); }
  });
  let actualPort = port;
  await new Promise<void>((done, reject) => { server.once("error", reject); server.listen(port, "127.0.0.1", done); });
  const address = server.address(); if (!address || typeof address === "string") throw new Error("Missing server address");
  actualPort = address.port;
  return { origin: `http://127.0.0.1:${actualPort}`, close: () => new Promise<void>((done, reject) => { server.closeAllConnections(); server.close(e => e ? reject(e) : done()); }) };
}
