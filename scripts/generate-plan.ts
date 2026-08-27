import { readFile } from "node:fs/promises";
import { basename, resolve } from "node:path";
import { loadCase } from "../src/contracts/loaders";
import { generateHy3TestPlan } from "../src/agents/prd-planner";

function argument(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index < 0 ? undefined : process.argv[index + 1];
}

const casePath = resolve(
  argument("--case") ?? "datasets/cases/clean-control/case.json"
);
const prdPath = resolve(
  argument("--prd") ?? "examples/coin-collector/PRD.md"
);
const output = resolve(
  argument("--out") ??
    `artifacts/plans/${new Date().toISOString().replaceAll(":", "-")}`
);

const [publicCase, prd] = await Promise.all([
  loadCase(casePath),
  readFile(prdPath, "utf8")
]);

const result = await generateHy3TestPlan({
  prd,
  publicCase,
  outputDirectory: output
});

console.log(
  `Hy3 plan for ${basename(prdPath)} validated and written to ${result.outputDirectory}`
);
console.log(
  `${result.plan.requirements.length} requirements, ${result.plan.scenarios.length} scenarios`
);
