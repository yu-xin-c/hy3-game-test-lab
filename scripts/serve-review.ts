import { resolve } from "node:path";
import { startReviewServer } from "../src/runtime/review-server";
const i = process.argv.indexOf("--results");
const directory = resolve(i >= 0 ? process.argv[i + 1]! : "results/process-v1");
const server = await startReviewServer(directory, 4175, resolve("results/error-mining-v1"));
console.log(`GameTestLab review: ${server.origin}`);
for (const signal of ["SIGINT", "SIGTERM"] as const) process.once(signal, () => { void server.close().then(() => process.exit(0)); });
