import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(process.argv[2] ?? "results/process-15-v1");
const load = async (name: string) => JSON.parse(await readFile(resolve(root, name), "utf8"));
const scope = await load("scope.json");
const progress = await load("progress-summary.json");
const validity = await load("process-validity.json");
const gated = await load("source-gated-rescore.json");
const publicAudit = JSON.parse(await readFile(resolve("results/public-check-audit-v1/summary.json"), "utf8"));
if (scope.schema_version !== "hy3-process-15-scope.v1" || scope.selected_ids.length !== 15 || progress.completed_games !== 15 || progress.pending.length !== 0 || gated.counts.completed_games !== 15 || gated.counts.pending_games !== 0 || publicAudit.reviewed_tasks !== 15 || publicAudit.remaining_tasks !== 0) {
  throw new Error("Cannot finalize: all 15 Hy3-plan/code/browser/review runs, source audit, and sensitivity copy must finish first");
}
if (progress.rows.map((r: any) => r.id).join("\0") !== scope.selected_ids.join("\0")) throw new Error("Task order changed");
if (validity.original_full_review_wrong_answer_subset.total !== 3 || validity.supplemental_core_correct_plan_wrong_subset.total !== 1) throw new Error("Process-validity evidence changed");
const pct = (n: number, d: number) => d ? `${(100 * n / d).toFixed(1)}%` : "不可算";
const c = progress.counts;
const difficultyRows = ["D1", "D2", "D3"].map(level => ({ level, ...progress.by_difficulty[level] }));
const summary = {
  title: "15 个冻结游戏任务：Hy3 公开方案、生成代码、真浏览器试玩与复核",
  scope: { selected_ids: scope.selected_ids, difficulty: scope.difficulty, category: scope.category, excluded: ["摄像头", "视频理解", "语音交互"], historical_96_not_pooled: true },
  execution: { completed_games: 15, current_strict_manifest_conformant_games: c.contract_conformant_games,
    original_raw_final_paths_passed: c.raw_final_paths_passed, original_raw_browser_paths: c.raw_browser_paths,
    original_raw_path_pass_rate: pct(c.raw_final_paths_passed, c.raw_browser_paths),
    warning: "原固定路径与私有断言存在已核实或待核实风险；原始路径率是执行记录，不是独立游戏正确率" },
  hy3_opinion: { final_true: c.hy3_final_true, final_known: c.hy3_final_known,
    final_true_among_determinate: pct(c.hy3_final_true, c.hy3_final_known),
    process_true: c.hy3_process_true, process_known: c.hy3_process_known,
    process_true_among_determinate: pct(c.hy3_process_true, c.hy3_process_known),
    warning: "混元判定是待检验的评估器输出，不是由标准答案独立确认的最终/过程准确率" },
  supported_model_finding_types: progress.hy3_supported_defect_types,
  difficulty_rows: difficultyRows,
  validity: validity.original_full_review_wrong_answer_subset,
  correct_core_wrong_plan: validity.supplemental_core_correct_plan_wrong_subset,
  source_audit: { reviewed_tasks: 15, deduplicated_predicates: publicAudit.reviewed_predicates, model_labels: publicAudit.model_labels,
    warning: "引文存在性不等于判据语义有效" },
  sensitivity: { excluded_context_checks: gated.counts.excluded_context_checks, invalid_fixed_paths: gated.counts.invalid_fixed_paths,
    warning: "重算与追加真实输入用于排查标准问题，不覆盖冻结原结果，也不是正式正确率" },
  difficulty_boundary: "D1/D2/D3 仅 4/6/5 题，玩法组成与检查强度不同且标准风险影响原始路径；没有可可靠判定的显著下降临界难度。"
};
await writeFile(resolve(root, "final-summary.json"), JSON.stringify(summary, null, 2) + "\n");
const types = Object.entries(progress.hy3_supported_defect_types).sort((a: any, b: any) => b[1] - a[1]);
await writeFile(resolve(root, "FINAL.md"), ["# 15 题生成过程评估结果", "",
  "Hy3 为每题先写公开编号方案、再通过 Write/Edit 生成完整浏览器游戏；Chromium 发送真实输入，记录状态、事件、HUD、错误与终局；最后仍由 Hy3 审查方案、代码和执行反例。所有题目的输入、模型调用凭证、生成记录与游戏文件哈希都可在各题目录核对。历史 96 题不计入本次 15 题分母。", "",
  "题目取冻结 96 题清单的前 15 题，动作 6、益智 5、创意 2、模拟 2；不含摄像头、视频理解或语音交互。这是按原顺序固定的子集，非按 96 题玩法分布抽样。", "",
  "## 实验设计", "",
  "**题目与版本。** 96 道完整游戏任务是参考原跑批的玩法分布重新编写的，不是原始 query 的逐条复刻。正式审计按冻结清单顺序取前 15 题（D1/D2/D3 为 4/6/5），没有事后挑选成功案例。前 5 题复用已完成的原始生成记录，后 10 题新生成；两组都核对方案哈希、模型调用凭证、代码写入重建与最终游戏文件。选择规则和来源见 [scope.json](scope.json) 与 [题集说明](../../datasets/game-tasks/README.md)。", "",
  "**生成。** 每题给 CodeBuddy 的 Hy3/high 公开玩法要求和接口约定，先要求输出 3 至 8 步编号方案，再按该方案生成四个游戏文件。生成阶段不提供固定试玩路径和私有正确结果，也不允许调用浏览器测试。每次方案、生成和复核调用均保存提示、哈希及实际模型标识；代码 Write/Edit 记录必须能重建最终文件。实际生成流程见 [run-process-batch.ts](../../scripts/run-process-batch.ts)。", "",
  "**试玩。** 文件冻结后才读取每题的固定路径与私有检查。无头 Chromium 在隔离上下文中执行键盘、鼠标或触控输入；双页游戏开第二页面，计时玩法按题目设定推进虚拟时间。每次操作保存状态、事件、HUD、页面错误、网络信息和截图，再按检查点判断启动、玩法逻辑与界面证据。15 题共有 47 条不同原始路径，每条独立运行 3 次，共 141 次；本报告的 14/47 只取每条路径的首次执行，不能把三次重放当成新的题目。浏览器版本与游戏、题目、检查器哈希记录在各题 `browser/result.json`。", "",
  "**复核与对照。** 浏览器执行后，Hy3/high 审查公开要求、编号方案、最终代码、浏览器汇总和首轮轨迹，分别输出最终游戏与方案过程意见、错误类型及方案首错步。浏览器汇总包含私有检查产生的预期/实际差异，所以只有生成阶段对私有检查隔离，复核阶段不是盲评。模型意见不是金标准；对明确主张另用公开算术、地图坐标或重复真实输入核对。原固定路径和初次复核原样保存；发现测试输入或断言风险后另做诊断对照，不覆盖原成绩。", "",
  "**有效性口径。** 原始全题复核的定位验证只纳入 3 个在生成和试玩后找到、再独立确认方案错误的子断言；这是可核对子集，不是事前随机抽样。必须同时判过程有错并给出核对步才算命中。正确核心玩法、错误方案的 2048 使用不同的补充提示，单独报告真实问题和误报，不能与原始 3 题合并。这些标准不证明整份方案正确，也不足以估计总体误报率或难度拐点。逐例标准见 [PROCESS-VALIDITY.md](PROCESS-VALIDITY.md)。", "",
  "**固定代码复验。** 各题目录的 `task/`、`game/`、`browser/result.json` 和 `review.json` 保存原始证据。重新试玩现有游戏不必再次调用混元，例如从仓库根目录运行下列命令；输出须换成新的空目录，复验结果另存，不覆盖正式记录。重新让混元生成新游戏则是另一次实验，不能保证生成代码完全相同。", "",
  "```sh", "pnpm exec tsx scripts/evaluate-generated-task.ts --task particle-orchestra --task-dir results/process-15-v1/particle-orchestra/task --game-dir results/process-15-v1/particle-orchestra/game --out artifacts/particle-replay-new --generator codebuddy-hy3 --replays 3", "```", "",
  "## 过程评价体系", "",
  "审计单位不是整个游戏的一句总评，而是编号方案中的**可核对主张**。公开规则给出条件，独立算术/状态规则或真实浏览器操作给出对照，生成代码与文件写入记录说明这条主张如何被实现。逐条核对四个重点：题意有没有读错；方案预期能否由规则支持；代码和试玩结果是否兑现；检查脚本有没有额外添加题面未写的限制。最后分别报告最终游戏与方案过程，证据不足保留“未知”。", "",
  "首错保留三种不同位置：玩家第几次操作首次观察到偏离、公开方案第几步首次出现已核对的错误、相关代码在哪次文件写入产生。文件来源不能直接证明模型内部推理从哪一步出错。Particle Orchestra 的选定计分主张展示了完整链条：规则算出 100、方案第三步预期 200、代码又加 100、三次浏览器终局均为 200。方法细节见[生成过程评估](../../docs/process-evaluation.md)，逐例有效性见[定位标准](PROCESS-VALIDITY.md)。", "",
  "## 结果口径", "",
  `15/15 完成；按当前严格 manifest 合同，${c.contract_conformant_games}/15 份声明文件合规。这不保证观察对象的全部字段符合运行接口：2048 和 Pet Care Day 都因额外 protocol 字段被原 runner 在动作前拒绝。原始固定路径终局检查通过 ${c.raw_final_paths_passed}/${c.raw_browser_paths}（${pct(c.raw_final_paths_passed,c.raw_browser_paths)}），但已有固定输入和私有断言错误，这一列不能叫独立最终准确率。`, "",
  `混元对最终游戏作出确定判断的 ${c.hy3_final_known} 题中，判正确 ${c.hy3_final_true} 题（${pct(c.hy3_final_true,c.hy3_final_known)}）；对原公开方案过程作出确定判断的 ${c.hy3_process_known} 题中，判正确 ${c.hy3_process_true} 题（${pct(c.hy3_process_true,c.hy3_process_known)}）。这是评估器意见率，不是独立金标准准确率；未知不塞进正确或错误。`, "",
  "## 定位验证", "",
  `在 3 个有可独立核对原方案错误的题目中，原始全题复核同时检出过程错误并给出核对步 ${validity.original_full_review_wrong_answer_subset.detect_and_locate}/3；只看步骤数字 ${validity.original_full_review_wrong_answer_subset.step_only}/3。前者才是“判出问题并定位”的口径。2048 是正确核心玩法、错误方案验证断言的单例：补充混元复核命中真实问题 1/1，被标记样本误报 0/1；提示不同，样本太少，不并入原始全题复核。详见 [逐例标准与限制](PROCESS-VALIDITY.md)。`, "",
  "| 难度 | 题数 | 严格 manifest 合规 | 混元最终判正确/可判 | 混元过程判正确/可判 | 原始路径终局通过/路径 |", "| --- | ---: | ---: | ---: | ---: | ---: |",
  ...difficultyRows.map(r => `| ${r.level} | ${r.games} | ${r.contract_conformant_games} | ${r.hy3_final_true}/${r.hy3_final_known} | ${r.hy3_process_true}/${r.hy3_process_known} | ${r.raw_final_paths_passed}/${r.raw_browser_paths} |`), "",
  "D1/D2/D3 为 4/6/5 题，玩法与检查强度不同，已发现的标准错误会改变原始路径率。因此能列分层结果，但不能可靠地宣布某一难度是模型明显下降的临界点。", "",
  "## 错误类型与典型例子", "",
  `混元原始复核标为 supported_defect 的 finding 类型计数（同题可多项）：${types.map(([name,n]) => `${name} ${n}`).join("、") || "无"}。这不是独立确认的游戏缺陷分布；测试路径错误和公开需求歧义单列。`, "",
  "- Particle Orchestra：公开四次正确输入每次 +25，标准终分 100；原方案第 3 步与代码多加 100，Chromium 三次通关均得 200，混元检出且定位第 3 步。", "- Key Door Escape：原方案第 1 步地图陷阱坐标写错，生成代码后来修正；原复核虽给第 1 步，却同时判方案正确，不能算“检出并定位”成功。", "- Room Five in a Row：真实双页输入能加入、双方胜利，但方案第 4 步重置时钟主张不成立；原复核判过程错误而没给首错步。", "- Persistent 2048：键盘与刷新试玩分别完成胜、负、存档；原方案第 3 步错判一条上滑获胜路径，补充混元审查找到该反例。原严格观察桥因额外字段拒绝动作前检查，不能把原始 0/3 当核心玩法失败。", "- Pet Care Day：原测试同样在观察对象入口停止；保持游戏不变的鼠标/刷新/虚拟时间对照，通关、衰减判负与重开清档均 3/3。", "- Mini Farm：原方案第 1 步声称可从 Start 连续点击田地，冻结时钟下按钮尚未启用 3/3；推进 32ms 后公开三田通关 3/3，故区分时序问题与最终玩法可达性。", "- 赛车与流星：原固定输入在障碍时间边界有误；依据公开车道时间表的追加真实输入，各 3/3 获胜及 3/3 失败，原结果不覆盖。", "",
  "## 能力边界", "",
  "15 题证明工具能留下生成方案、代码写入、真实游戏路径、独立算术/地图/状态子断言与首错证据，也暴露评估器自相矛盾和测试标准误报。公开判据的混元引文审查完成 15 题、833 个去重谓词，但引文是否足以支持具体取值还需用公开规则与真输入核对。标准风险副本只作敏感性对照；不能用它替换原冻结路径成绩。没有足够多的独立正确方案与错误方案来估计稳定总体误报率或难度临界点。", ""
].join("\n"));
console.log(JSON.stringify({ complete: 15, contract: `${c.contract_conformant_games}/15`, hy3_final_opinion: `${c.hy3_final_true}/${c.hy3_final_known}`, hy3_process_opinion: `${c.hy3_process_true}/${c.hy3_process_known}`, validity_combined: `${validity.original_full_review_wrong_answer_subset.detect_and_locate}/3` }));
