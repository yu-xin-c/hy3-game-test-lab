import { createReadStream } from "node:fs";
import { realpath, stat } from "node:fs/promises";
import { createServer, type Server, type ServerResponse } from "node:http";
import { extname, isAbsolute, relative, resolve, sep } from "node:path";

const CONTENT_TYPES: Readonly<Record<string, string>> = {
  ".css": "text/css; charset=utf-8",
  ".gif": "image/gif",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".wasm": "application/wasm",
  ".webp": "image/webp"
};

export interface StaticServerOptions {
  rootDirectory: string;
  host?: string;
  port?: number;
  /**
   * `examples-only` is for a repository root and prevents the game from
   * fetching datasets/oracles. `isolated-root` is safe only when rootDirectory
   * itself contains nothing except one generated, read-only game bundle.
   */
  exposure?: "examples-only" | "isolated-root";
}

export interface RunningStaticServer {
  host: string;
  port: number;
  origin: string;
  close(): Promise<void>;
}

function sendText(
  response: ServerResponse,
  statusCode: number,
  message: string
): void {
  response.writeHead(statusCode, {
    "cache-control": "no-store",
    "content-type": "text/plain; charset=utf-8",
    "x-content-type-options": "nosniff"
  });
  response.end(message);
}

function isInsideRoot(root: string, candidate: string): boolean {
  const pathFromRoot = relative(root, candidate);
  return (
    pathFromRoot === "" ||
    (!pathFromRoot.startsWith(`..${sep}`) &&
      pathFromRoot !== ".." &&
      !isAbsolute(pathFromRoot))
  );
}

async function resolveRequestFile(
  canonicalRoot: string,
  canonicalExposureRoot: string,
  requestPathname: string,
  exposure: NonNullable<StaticServerOptions["exposure"]>
): Promise<string | null> {
  let decodedPath: string;
  try {
    decodedPath = decodeURIComponent(requestPathname);
  } catch {
    return null;
  }

  if (decodedPath.includes("\0") || decodedPath.includes("\\")) return null;
  // The browser under test is untrusted: it must never be able to fetch the
  // private oracle, environment files, source tree, or prior artifacts from
  // its own origin. Node reads datasets directly; HTTP only serves fixtures.
  if (
    exposure === "examples-only" &&
    decodedPath !== "/examples" &&
    !decodedPath.startsWith("/examples/")
  ) {
    return null;
  }

  // Prefixing with `.` makes even a decoded absolute URL path relative to the
  // configured root. The containment check below rejects every `..` escape.
  let candidate = resolve(canonicalRoot, `.${decodedPath}`);
  if (!isInsideRoot(canonicalRoot, candidate)) return null;

  let candidateStat;
  try {
    candidateStat = await stat(candidate);
  } catch {
    return null;
  }
  if (candidateStat.isDirectory()) candidate = resolve(candidate, "index.html");

  let canonicalCandidate: string;
  try {
    canonicalCandidate = await realpath(candidate);
  } catch {
    return null;
  }

  // realpath closes the symlink traversal gap left by lexical normalization.
  if (!isInsideRoot(canonicalRoot, canonicalCandidate)) return null;
  if (!isInsideRoot(canonicalExposureRoot, canonicalCandidate)) return null;
  const fileStat = await stat(canonicalCandidate);
  return fileStat.isFile() ? canonicalCandidate : null;
}

function closeServer(server: Server): Promise<void> {
  return new Promise((resolveClose, rejectClose) => {
    server.close((error) => {
      if (error) rejectClose(error);
      else resolveClose();
    });
  });
}

export async function startStaticServer(
  options: StaticServerOptions
): Promise<RunningStaticServer> {
  const canonicalRoot = await realpath(resolve(options.rootDirectory));
  const host = options.host ?? "127.0.0.1";
  const port = options.port ?? 0;
  const exposure = options.exposure ?? "examples-only";
  const canonicalExposureRoot = exposure === "examples-only"
    ? await realpath(resolve(canonicalRoot, "examples"))
    : canonicalRoot;

  if (!Number.isInteger(port) || port < 0 || port > 65_535) {
    throw new Error(`Invalid static-server port: ${String(port)}`);
  }

  const server = createServer(async (request, response) => {
    try {
      response.setHeader("x-content-type-options", "nosniff");
      response.setHeader("referrer-policy", "no-referrer");

      if (request.method !== "GET" && request.method !== "HEAD") {
        response.setHeader("allow", "GET, HEAD");
        sendText(response, 405, "Method not allowed\n");
        return;
      }

      const url = new URL(request.url ?? "/", `http://${host}`);
      if (url.pathname === "/healthz") {
        response.writeHead(200, {
          "cache-control": "no-store",
          "content-type": "text/plain; charset=utf-8"
        });
        response.end(request.method === "HEAD" ? undefined : "ok\n");
        return;
      }

      const filePath = await resolveRequestFile(
        canonicalRoot,
        canonicalExposureRoot,
        url.pathname,
        exposure
      );
      if (!filePath) {
        sendText(response, 404, "Not found\n");
        return;
      }

      const fileStat = await stat(filePath);
      const contentType =
        CONTENT_TYPES[extname(filePath).toLowerCase()] ??
        "application/octet-stream";
      response.writeHead(200, {
        "cache-control": "no-store",
        "content-length": fileStat.size,
        "content-type": contentType
      });
      if (request.method === "HEAD") {
        response.end();
        return;
      }

      const stream = createReadStream(filePath);
      stream.on("error", () => {
        if (!response.headersSent) sendText(response, 500, "Read error\n");
        else response.destroy();
      });
      stream.pipe(response);
    } catch {
      if (!response.headersSent) sendText(response, 400, "Bad request\n");
      else response.destroy();
    }
  });

  await new Promise<void>((resolveListen, rejectListen) => {
    const onError = (error: Error) => {
      server.off("listening", onListening);
      rejectListen(error);
    };
    const onListening = () => {
      server.off("error", onError);
      resolveListen();
    };
    server.once("error", onError);
    server.once("listening", onListening);
    server.listen(port, host);
  });

  const address = server.address();
  if (!address || typeof address === "string") {
    await closeServer(server);
    throw new Error("Static server did not expose a TCP address");
  }

  let closed = false;
  return {
    host,
    port: address.port,
    origin: `http://${host}:${String(address.port)}`,
    async close() {
      if (closed) return;
      closed = true;
      await closeServer(server);
    }
  };
}
