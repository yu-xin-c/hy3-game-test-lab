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
const typeLabels: Record<string, string> = {
  implementation_mismatch: "实现与方案不符", invalid_assumption: "错误假设", requirement_misread: "题意误读",
};
await writeFile(resolve(root, "FINAL.md"), ["# 15 个游戏的生成与检查", "",
  "这份报告只统计固定选出的 15 题。每题都让混元先写游戏方案，再生成代码。游戏写完后，我们用真实浏览器试玩，最后让混元检查方案和游戏哪里出了问题。早期另外跑过的游戏不计入这里的结果。", "",
  "## 实验怎么做", "",
  "题库有 96 道完整游戏任务。它参考原跑批的玩法分布重新编写，没有使用原始提问逐条复刻。本次按事先固定的顺序取前 15 题：动作 6 题、益智 5 题、创意 2 题、模拟 2 题；基础 4 题、中等 6 题、高难 5 题。前 5 题沿用已经完成的原始生成记录，后 10 题新生成。选择方法和题目清单见 [范围记录](scope.json)。", "",
  "生成和检查都使用 CodeBuddy 中的混元 Hy3/high。生成时，混元只看到公开玩法要求和接口说明。它先写一份 3 到 8 步的编号方案，再写出网页游戏的四个文件。固定试玩步骤和正确结果留到游戏完成后才交给测试程序。每次调用保存了提示和实际模型记录；生成代码也能从文件写入记录重新核对。", "",
  "测试程序在浏览器里操作游戏，使用真实键盘、鼠标或触控。计时游戏按设定推进时间，双人游戏同时打开两个页面。每次操作后读取游戏状态和界面，并保存事件、报错、网络记录和截图。15 题共有 47 条不同的试玩路径。每条路径在新的浏览器环境中跑 3 次，共 141 次。下文的路径通过数只取各路径第一次运行，重复运行用于确认结果是否稳定。", "",
  "试玩结束后，混元阅读原要求、编号方案、生成代码和浏览器记录，分别判断游戏是否合格、方案是否成立，并指出可疑的出错步骤。它会看到测试程序给出的预期值与实际值，所以事后检查并非盲评。我们再用公开规则计算分数、核对地图，或重复实际操作，检查混元的判断。原测试和原复核不改。后来发现测试步骤有误，我们另跑对照，把两组结果分开记录。详细流程见 [生成过程评估](../../docs/process-evaluation.md)。", "",
  "## 检查什么", "",
  "游戏能启动、按规则进行并走到胜负结果，是一项检查。另一项检查是生成前那份方案：它对计分、重开、跳跃等玩法的判断是否站得住，代码又有没有照着实现。报告分别写下首次出问题的玩家操作、方案步骤和相关代码位置。代码写入顺序只能帮助找到来源，无法说明混元内部何时想错。", "",
  "## 测试结果", "",
  `15 题都完成了生成、试玩和复核。按当前提交格式检查，有 ${c.contract_conformant_games}/15 题合规。原固定路径的终点检查通过 ${c.raw_final_paths_passed}/${c.raw_browser_paths}（${pct(c.raw_final_paths_passed,c.raw_browser_paths)}）。已有几条测试步骤或正确结果写得不妥，这个比例只描述原测试记录，不能当成游戏正确率。`, "",
  `混元给出明确游戏判断的 ${c.hy3_final_known} 题中，有 ${c.hy3_final_true} 题判正确；给出明确方案判断的 ${c.hy3_process_known} 题中，有 ${c.hy3_process_true} 题判正确。其余题保留“无法判断”。这些数字是混元的意见，下面另用可直接核对的例子检查它是否判对。`, "",
  "| 难度 | 题数 | 提交格式合规 | 游戏判正确/有判断 | 方案判正确/有判断 | 原路径到达正确终点 |", "| --- | ---: | ---: | ---: | ---: | ---: |",
  ...difficultyRows.map(r => `| ${r.level} | ${r.games} | ${r.contract_conformant_games} | ${r.hy3_final_true}/${r.hy3_final_known} | ${r.hy3_process_true}/${r.hy3_process_known} | ${r.raw_final_paths_passed}/${r.raw_browser_paths} |`), "",
  "三档各只有 4、6、5 题，而且游戏类型和测试难度混在一起。现有数据看不出混元从哪一档开始明显变差。", "",
  "## 错误步骤检查", "",
  `我们找到 3 个能单独确认的方案错误，再对照原始的混元检查结果。要求它既判出方案有错，又指出对应步骤，实际做到 ${validity.original_full_review_wrong_answer_subset.detect_and_locate}/3。只看步骤数字会得到 ${validity.original_full_review_wrong_answer_subset.step_only}/3，但其中有一次混元同时说“方案正确”，所以不能算定位成功。这 3 个例子是在试玩后找到的，并非随机挑出的题目。`, "",
  "另有一个 2048 游戏：实际试玩能通关、失败和存档，原方案却把一条获胜路径写成失败。补充的混元检查找到了这个问题。被它标出的这个样本是真问题，误报为 0/1。补充检查使用了另一份提示，不能和前面 3 题放在一起算总体准确率。逐例证据见 [错误步骤检查](PROCESS-VALIDITY.md)。", "",
  "## 几个具体例子", "",
  "粒子乐队的规则是四次正确输入各加 25 分，终分应是 100。方案第 3 步和生成代码都多加了 100。浏览器三次试玩均得 200，混元也找到了第 3 步。钥匙开门的方案第 1 步写错陷阱坐标，代码生成时修正了；混元虽然给出第 1 步，却仍说方案正确。联机五子棋的方案第 4 步说重开后时间归零，实际没有归零；混元判断有错，但没指出第 4 步。", "",
  "测试本身也会出问题。2048 和宠物照料的原测试在真正操作游戏前，就因读取状态时多出一个字段而停止。换用针对玩法的真实输入后，核心胜负和存档路径可以走通。种田游戏在按下开始后立刻点田地会失败，等待 32 毫秒再点则能通关；公开要求没有规定必须零延迟点击。赛车和流星游戏的原通关输入撞上了障碍，按公开时间表另做的获胜、失败路径各运行三次，结果都符合规则。这些追加测试没有改写原成绩。", "",
  `混元原复核记录的错误标签中，${types.map(([name,n]) => `${typeLabels[name] ?? name} ${n}`).join("、") || "没有明确记录"}。一题可能有多条标签，其中也可能夹着测试问题；这些数目还不是独立确认的游戏缺陷数量。`, "",
  "## 现阶段的限制", "",
  "原测试里有输入时机和检查条件写错的例子。公开检查条件虽已逐项审过，引用到题目原文也不保证具体数值写对。我们只对少数清楚的方案判断做了计算或实际操作核对，因此能展示如何发现和定位错误，还不能给出稳定的总体定位率、误报率或难度分界。", "",
  "原始提示、代码、浏览器记录和模型检查结果保存在每题目录。想对现有代码重新试玩，不需要再次调用混元；命令见 [复验说明](../../docs/process-evaluation.md)。重新生成一份游戏属于新实验，结果不会自动等同于这里的原始游戏。", ""
].join("\n"));
console.log(JSON.stringify({ complete: 15, contract: `${c.contract_conformant_games}/15`, hy3_final_opinion: `${c.hy3_final_true}/${c.hy3_final_known}`, hy3_process_opinion: `${c.hy3_process_true}/${c.hy3_process_known}`, validity_combined: `${validity.original_full_review_wrong_answer_subset.detect_and_locate}/3` }));
