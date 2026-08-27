import { resolve } from "node:path";
import { startStaticServer } from "../src/runtime/static-server";

function parsePort(raw: string | undefined): number {
  if (raw === undefined) return 4173;
  const port = Number(raw);
  if (!Number.isInteger(port) || port < 0 || port > 65_535) {
    throw new Error(`PRD2PLAY_PORT must be an integer from 0 to 65535, got ${raw}`);
  }
  return port;
}

async function main(): Promise<void> {
  const rootDirectory = resolve(process.env.PRD2PLAY_ROOT ?? process.cwd());
  const server = await startStaticServer({
    rootDirectory,
    host: process.env.PRD2PLAY_HOST ?? "127.0.0.1",
    port: parsePort(process.env.PRD2PLAY_PORT)
  });

  console.log(`PRD2Play demo server: ${server.origin}`);
  console.log(`Serving files from: ${rootDirectory}`);

  let stopping = false;
  const stop = async (signal: NodeJS.Signals) => {
    if (stopping) return;
    stopping = true;
    console.log(`Received ${signal}; closing demo server.`);
    await server.close();
  };

  process.once("SIGINT", () => {
    void stop("SIGINT");
  });
  process.once("SIGTERM", () => {
    void stop("SIGTERM");
  });
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack : String(error));
  process.exitCode = 1;
});
