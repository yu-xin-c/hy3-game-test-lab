import { readFile, writeFile } from "node:fs/promises";
import { errorDistribution } from "../src/evaluation/error-distribution";
const source = JSON.parse(await readFile("results/consolidated/summary.json", "utf8"));
const distribution = errorDistribution(source.tasks);
if (distribution.reviewed_scenarios !== source.model_review.totals.reviewed_scenarios || distribution.negative_process_scenarios !== source.model_review.totals.process_known - source.model_review.totals.process_correct) throw new Error("Distribution does not reconcile with source totals");
await writeFile("results/consolidated/error-distribution.json", JSON.stringify({ source: "summary.json", counting_unit: "historical Hy3-reviewed scenario, not confirmed distinct bug or replay", ...distribution }, null, 2));
const percentage = (n: number, d: number) => d ? (100 * n / d).toFixed(2) + "%" : "不可计算";
await writeFile("results/consolidated/error-distribution.md", ["# 错误类型与难度分层", "",
  `口径：${distribution.reviewed_scenarios} 个历史Hy3复核场景中，${distribution.negative_process_scenarios} 个被判过程有问题，${distribution.unknown_process_scenarios} 个不可判定。每个场景保留其一个原始主标签；三次重放不重复计数。标签是历史模型判断，不是已经排除测试问题的独立缺陷数量。`, "",
  "| 原始错误标签 | 场景数 | 占负向判断比例 | 涉及游戏数 |", "| --- | ---: | ---: | ---: |",
  ...distribution.labels.map(g => `| ${g.error_type} | ${g.count} | ${percentage(g.count, distribution.negative_process_scenarios)} | ${g.task_ids.length} |`), "",
  "## Hy3复核按难度分层", "", "| 难度 | 最终正确/可判定 | 比例 | 过程正确/可判定 | 比例 |", "| --- | ---: | ---: | ---: | ---: |",
  ...["D1", "D2", "D3"].map(d => { const s = source.model_review.by_difficulty[d]; return `| ${d} | ${s.final_correct}/${s.final_known} | ${percentage(s.final_correct, s.final_known)} | ${s.process_correct}/${s.process_known} | ${percentage(s.process_correct, s.process_known)} |`; }), "",
  "分层并不单调：D1 的模型过程判断通过率低于 D2/D3，D2 到 D3 仅小幅变化。结合原始规则结果的另一趋势，当前不能确定统一的能力下降临界难度。启动、交互阻塞和检查标准差异会影响统计，不能只把通过率差归因于玩法难度。", "",
  "真实错误复验与输入时机对照另见 ../error-mining-v1 和 ../process-v1；后续诊断不回写旧标签，保留分析可追溯性。"
].join("\n"));
console.log(JSON.stringify({ labels: distribution.labels.length, negative_scenarios: distribution.negative_process_scenarios, unknown: distribution.unknown_process_scenarios }));
