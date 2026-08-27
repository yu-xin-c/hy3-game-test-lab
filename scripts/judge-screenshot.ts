import { resolve } from "node:path";
import { judgeScreenshot } from "../src/evaluation/visual-judge";

function argument(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index < 0 ? undefined : process.argv[index + 1];
}

const screenshot = argument("--screenshot");
const requirementId = argument("--requirement-id");
const requirement = argument("--requirement");

if (!screenshot || !requirementId || !requirement) {
  throw new Error(
    "Usage: pnpm eval:visual -- --screenshot <png> --requirement-id <id> --requirement <text>"
  );
}

const verdict = await judgeScreenshot({
  screenshotPath: resolve(screenshot),
  requirementId,
  publicRequirement: requirement
});

console.log(JSON.stringify(verdict, null, 2));
