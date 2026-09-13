import { cp, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { relative, resolve } from "node:path";

function arg(name: string) {
  const i = process.argv.indexOf(name);
  const value = i >= 0 ? process.argv[i + 1] : undefined;
  if (!value || value.startsWith("--")) throw new Error(`Missing ${name}`);
  return value;
}
const batch = resolve(arg("--batch-dir"));
const output = resolve(arg("--out-dir"));
const manifest = JSON.parse(await readFile(resolve(batch, "batch-manifest.json"), "utf8"));
const readJson = async (path: string) => JSON.parse(await readFile(path, "utf8"));
async function maybeJson(path: string) {
  try { return await readJson(path); } catch (e) { if ((e as NodeJS.ErrnoException).code === "ENOENT") return null; throw e; }
}
async function copyIfExists(source: string, destination: string) {
  try { await cp(source, destination, { recursive: true }); } catch (e) { if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e; }
}
const tasks: any[] = [];
const review: any[] = [];
const errorTypes: Record<string, number> = {};
await mkdir(output, { recursive: true });
await cp(resolve(batch, "batch-manifest.json"), resolve(output, "batch-manifest.json"));
for (const task of manifest.tasks) {
  if (!/^[a-z][a-z0-9-]*$/.test(task.id)) throw new Error("Unsafe task ID");
  const generated = resolve(batch, "generated", task.id);
  const generation = await maybeJson(resolve(generated, "generation.json"));
  const result = await maybeJson(resolve(batch, "runs", `${task.id}-playthrough/result.json`));
  const judgment = await maybeJson(resolve(batch, "judgments", task.id, "judgment.json"));
  if (!generation || !result) {
    tasks.push({ id: task.id, difficulty: task.difficulty, category: task.category, status: "pending", reason: !generation ? "generation_not_recorded" : "evaluation_not_recorded" });
    continue;
  }
  const digest = createHash("sha256");
  for (const entry of (await readdir(resolve(generated, "files"), { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
    if (!entry.isFile() || entry.isSymbolicLink()) throw new Error(`Nonregular generated file: ${task.id}`);
    digest.update(entry.name).update("\0").update(await readFile(resolve(generated, "files", entry.name))).update("\0");
  }
  const gameHash = digest.digest("hex");
  if (gameHash !== generation.output_sha256 || gameHash !== result.input_hashes.game_directory_sha256) throw new Error(`Changed game: ${task.id}`);
  const prompt = await readFile(resolve(batch, "public", task.id, "prompt.md"));
  const promptHash = createHash("sha256").update(prompt).digest("hex");
  if (promptHash !== task.prompt_sha256 || promptHash !== generation.prompt_sha256) throw new Error(`Changed prompt: ${task.id}`);
  const scenarios = result.scenarios ?? [];
  const groups = [...new Set<string>(scenarios.map((s: any) => s.scenario_id))].map(id => {
    const runs = scenarios.filter((s: any) => s.scenario_id === id);
    const finalPasses = runs.filter((s: any) => s.evaluation.final_outcome_correct).length;
    const processPasses = runs.filter((s: any) => s.evaluation.process_correct).length;
    const failures = runs.map((s: any) => s.evaluation.first_failure).filter(Boolean);
    for (const failure of failures) errorTypes[failure.error_type] = (errorTypes[failure.error_type] ?? 0) + 1;
    const hashes = runs.map((s: any) => createHash("sha256").update(JSON.stringify(s.observations.map((o: any) => ({ action_index: o.action_index, checkpoint_id: o.checkpoint_id, state: o.state, event_types: o.event_types })))).digest("hex"));
    review.push({ task_id: task.id, scenario_id: id, replay_index: runs[0].replay_index,
      source_game_sha256: gameHash,
      selection: "one_per_scenario_including_clean_controls", evidence: `evidence/${task.id}/result.json`,
      reviewer: null, reviewed_at: null, evidence_sufficient: null, final_correct: null, process_correct: null,
      first_actual_error_action: null, error_type: null, explanation: null });
    return { id, runs: runs.length, final_passes: finalPasses, process_passes: processPasses,
      stable_verdicts: new Set(runs.map((s: any) => `${s.evaluation.process_correct}/${s.evaluation.final_outcome_correct}`)).size === 1 && runs.length > 1,
      stable_checkpoint_states: new Set(hashes).size === 1 && runs.length > 1, checkpoint_state_hashes: hashes,
      first_failures: failures };
  });
  tasks.push({ id: task.id, difficulty: task.difficulty, category: task.category, status: result.status,
    hy3_review: judgment?.verdict ?? null,
    generator: generation.generator, model: generation.model, tokens: generation.reported_tokens, credits: generation.credits_used,
    aggregate: result.aggregate ?? null, contract: result.contract ?? null,
    all_paths_final_correct: scenarios.length > 0 && scenarios.every((s: any) => s.evaluation.final_outcome_correct),
    all_paths_process_correct: scenarios.length > 0 && scenarios.every((s: any) => s.evaluation.process_correct),
    scenarios: groups, error: result.error ?? null });
  const destination = resolve(output, "evidence", task.id);
  await mkdir(resolve(destination, "game"), { recursive: true });
  for (const name of ["index.html", "styles.css", "game.js", "game.manifest.json"]) await copyIfExists(resolve(generated, "files", name), resolve(destination, "game", name));
  for (const name of ["generation-process.json", "cli-completion.json"]) await copyIfExists(resolve(generated, name), resolve(destination, name));
  await writeFile(resolve(destination, "generation.json"), `${JSON.stringify({ ...generation, source_result_file: generation.result_file, result_file: "result.json" }, null, 2)}\n`);
  let toolAudit: any = { telemetry_available: false, calls: [] };
  try {
    const raw = await readJson(resolve(generated, "cli-output.raw.json"));
    toolAudit = { telemetry_available: true, calls: raw.filter((m: any) => m.type === "function_call").map((m: any) => {
      let args: any;
      try { args = typeof m.arguments === "string" ? JSON.parse(m.arguments) : m.arguments; } catch { args = null; }
      const file = typeof args?.file_path === "string" ? resolve(generated, "files", args.file_path) : null;
      const inDirectory = file ? file.startsWith(resolve(generated, "files") + "/") : null;
      const result = raw.find((r: any) => r.type === "function_call_result" && r.callId === m.callId);
      return { tool: m.name, call_id: m.callId, timestamp: m.timestamp, status: result?.status ?? "unknown",
        argument_sha256: createHash("sha256").update(JSON.stringify(m.arguments)).digest("hex"),
        within_generated_directory: inDirectory,
        file: inDirectory ? relative(resolve(generated, "files"), file!) : file ? "outside_generated_directory" : null,
        arguments: inDirectory ? { ...args, file_path: relative(resolve(generated, "files"), file!) } : null,
        outside_write_empty: !inDirectory && m.name === "Write" && args?.content === "" };
    }) };
  } catch (e) { if (!(e instanceof SyntaxError) && (e as NodeJS.ErrnoException).code !== "ENOENT") throw e; }
  await writeFile(resolve(destination, "generation-tools.json"), `${JSON.stringify(toolAudit, null, 2)}\n`);
  try {
    const stderr = await readFile(resolve(generated, "cli-stderr.log"), "utf8");
    await writeFile(resolve(destination, "generation-diagnostic.json"), JSON.stringify({ rate_limited: /429|使用量已超出频率限制/.test(stderr),
      reset_time_text: stderr.match(/将在\s*([^\n]+?)\s*重置/)?.[1] ?? null,
      stderr_sha256: createHash("sha256").update(stderr).digest("hex") }, null, 2) + "\n");
  } catch(e) { if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e; }
  await cp(resolve(batch, "public", task.id, "prompt.md"), resolve(destination, "prompt.md"));
  for (const name of ["result.json", "events.jsonl", "screenshots"]) await copyIfExists(resolve(batch, "runs", `${task.id}-playthrough`, name), resolve(destination, name));
  await copyIfExists(resolve(batch, "private", task.id), resolve(destination, "task"));
  if (judgment) {
    const resultHash = createHash("sha256").update(await readFile(resolve(batch, "runs", `${task.id}-playthrough/result.json`))).digest("hex");
    if (judgment.model !== "hy3" || judgment.source_game_sha256 !== gameHash || judgment.source_result_sha256 !== resultHash) throw new Error(`Judge provenance mismatch: ${task.id}`);
    await cp(resolve(batch, "judgments", task.id, "judgment.json"), resolve(destination, "hy3-judgment.json"));
    await cp(resolve(batch, "judgments", task.id, "prompt.txt"), resolve(destination, "hy3-judge-prompt.txt"));
    const reviewAttempts = [];
    for (const name of (await readdir(resolve(batch, "judgments", task.id))).filter(name => /^response\..*\.json$/.test(name)).sort()) {
      const messages = await readJson(resolve(batch, "judgments", task.id, name));
      const answer = messages.findLast((m: any) => m.type === "result");
      reviewAttempts.push({ source_file: name, model_ids: [...new Set(messages.filter((m: any) => m.role === "assistant" && m.providerData?.requestModelId).map((m: any) => m.providerData.requestModelId))],
        is_error: answer?.is_error ?? null, original_answer: answer?.result ?? null, usage: answer?.usage ?? null });
    }
    await writeFile(resolve(destination, "hy3-review-attempts.json"), `${JSON.stringify(reviewAttempts, null, 2)}\n`);
  }
}
const recorded = tasks.filter(task => task.status !== "pending");
const modelScenarios = tasks.flatMap(t => (t.hy3_review?.scenarios ?? []).map((s: any) => ({ task_id: t.id, difficulty: t.difficulty, ...s })));
const modelCounts = (rows: any[]) => ({ reviewed_scenarios: rows.length,
  final_known: rows.filter(s => s.final_outcome_correct !== null).length,
  final_correct: rows.filter(s => s.final_outcome_correct === true).length,
  process_known: rows.filter(s => s.process_correct !== null).length,
  process_correct: rows.filter(s => s.process_correct === true).length,
  lucky_pass: rows.filter(s => s.final_outcome_correct === true && s.process_correct === false).length,
  oracle_issue_scenarios: rows.filter(s => s.oracle_issues.length > 0).length });
const disagreements = tasks.flatMap(t => (t.hy3_review?.scenarios ?? []).flatMap((m: any) => {
  const rule = t.scenarios?.find((s: any) => s.id === m.scenario_id);
  if (!rule || m.process_correct === null || m.process_correct === (rule.process_passes === rule.runs)) return [];
  return [{ task_id: t.id, scenario_id: m.scenario_id, rule_process_correct: rule.process_passes === rule.runs,
    hy3_process_correct: m.process_correct, evidence: m.evidence, oracle_issues: m.oracle_issues }];
}));
const countGroup = (group: any[]) => ({ tasks: group.length, recorded: group.filter(t => t.status !== "pending").length,
  browser_tested_tasks: group.filter(t => t.aggregate?.scenario_runs > 0).length,
  infrastructure_failures: group.filter(t => ["infrastructure_failure", "evaluation_failure"].includes(t.status)).length,
  scoreable_tasks: group.filter(t => ["evaluated", "evaluated_with_contract_findings", "generation_failure"].includes(t.status)).length,
  all_paths_final_correct: group.filter(t => t.all_paths_final_correct).length,
  all_paths_process_correct: group.filter(t => t.all_paths_process_correct).length,
  path_runs: group.reduce((n, t) => n + (t.aggregate?.scenario_runs ?? 0), 0),
  final_passes: group.reduce((n, t) => n + (t.aggregate?.final_passes ?? 0), 0),
  process_passes: group.reduce((n, t) => n + (t.aggregate?.process_passes ?? 0), 0) });
const summary = { batch_id: manifest.batch_id, generated_at: new Date().toISOString(), scoring_status: "raw_assertions_pending_human_validation",
  hy3_reviewed_tasks: tasks.filter(t => t.hy3_review).length,
  all_model_reviews_completed: tasks.filter(t => t.hy3_review).length === manifest.tasks.length,
  all_tasks_recorded: recorded.length === manifest.tasks.length, totals: countGroup(tasks),
  all_browser_tests_completed: tasks.filter(t => t.aggregate?.scenario_runs > 0).length === manifest.tasks.length,
  by_difficulty: Object.fromEntries(["D1", "D2", "D3"].map(level => [level, countGroup(tasks.filter(t => t.difficulty === level))])),
  model_review: { status: "not_human_ground_truth", totals: modelCounts(modelScenarios),
    by_difficulty: Object.fromEntries(["D1", "D2", "D3"].map(level => [level, modelCounts(modelScenarios.filter(s => s.difficulty === level))])),
    process_disagreements: disagreements },
  first_error_types_per_replay: errorTypes, human_validation: { completed: false, localization_accuracy: null, false_positive_rate: null }, tasks };
await writeFile(resolve(output, "summary.json"), `${JSON.stringify(summary, null, 2)}\n`);
// Append new scenarios while preserving every prior human field and its evidence identity.
const previousReviews = await maybeJson(resolve(output, "human-review.json")) ?? [];
const reviewKey = (entry: any) => `${entry.task_id}/${entry.scenario_id}/${entry.replay_index}`;
const previousByKey = new Map(previousReviews.map((entry: any) => [reviewKey(entry), entry]));
for (const entry of review) {
  const prior: any = previousByKey.get(reviewKey(entry));
  if (prior && prior.source_game_sha256 !== entry.source_game_sha256) throw new Error("Human review evidence changed");
  if (!prior) previousByKey.set(reviewKey(entry), entry);
}
await writeFile(resolve(output, "human-review.json"), `${JSON.stringify([...previousByKey.values()], null, 2)}\n`);
const lines = ["# Hy3 全量评测记录", "", `批次 ${manifest.batch_id}：已记录 ${recorded.length}/${tasks.length} 题。${summary.all_tasks_recorded ? "所有题目已有记录。" : "尚未完成全量。"}`,
  `实际完成浏览器测试 ${summary.totals.browser_tested_tasks}/${tasks.length} 题。已有尝试记录不等于全部完成测试；生成中断单独列出。`,
  `混元复核 ${summary.hy3_reviewed_tasks}/${tasks.length} 题。生成和模型复核均使用 Hy3；浏览器执行与确定性断言由 Playwright 完成。模型复核不冒充人工抽检。`,
  "", "以下为冻结规则的原始结果，未完成人工验证，不能直接作为消除误报后的模型分数。生成失败和评测基础设施失败保留在逐题记录中；未生成题不按失败评分。",
  "三次重放用于复现检查，不是三个独立游戏样本。游戏级通过要求该游戏的所有路径、所有重放都通过；路径级数据分别给出分子和分母。", "",
  "| 难度 | 已记录/任务 | 所有路径终局正确 | 所有路径过程正确 | 终局断言通过/路径运行 | 过程通过/路径运行 |",
  "| --- | ---: | ---: | ---: | ---: | ---: |",
  ...Object.entries(summary.by_difficulty).map(([level, g]) => `| ${level} | ${g.recorded}/${g.tasks} | ${g.all_paths_final_correct}/${g.scoreable_tasks} | ${g.all_paths_process_correct}/${g.scoreable_tasks} | ${g.final_passes}/${g.path_runs} | ${g.process_passes}/${g.path_runs} |`),
  `基础设施异常 ${summary.totals.infrastructure_failures} 题，不进入游戏正确率分母；仍保留在完整清单中。`,
  "", "## 逐题结果", "", "| 游戏 | 难度 | 状态 | 终局通过 | 过程通过 |", "| --- | --- | --- | ---: | ---: |",
  ...tasks.map(t => `| ${t.id} | ${t.difficulty} | ${t.status} | ${t.aggregate ? `${t.aggregate.final_passes}/${t.aggregate.scenario_runs}` : "—"} | ${t.aggregate ? `${t.aggregate.process_passes}/${t.aggregate.scenario_runs}` : "—"} |`),
  "", "## 验证与限制", "", "`summary.json` 保留逐题首错、类型和重复结果。`human-review.json` 的人审字段初始为空，需要真人根据题面、代码和逐步证据填写；不把助手诊断当作人工抽检。定位准确率与误报率在人审完成前记为未验证。",
  "已知 Signal Memory 有题面未规定的 phase 名称约束，诊断结果另存于旧结果目录，不覆盖本表。其他游戏也需检查类似隐藏约束。未核验的界面质量不算通过。",
  "", "本批包含 IDE 与 CLI 两种生成入口，逐题记录 generator；CLI 固定 hy3/high，初始仅有 Write，后续开放 Read/Write/Edit 以完成文件自查，不把私有检查规则交给生成模型。工具配置记录在 generation.json/cli-completion.json；入口差异不应被解释为纯模型差异。"];
await writeFile(resolve(output, "README.md"), `${lines.join("\n")}\n`);
const report = ["# Hy3 游戏评测分析", "", `批次：${manifest.batch_id}。快照：${summary.generated_at}。已记录 ${recorded.length}/${tasks.length}，混元复核 ${summary.hy3_reviewed_tasks}/${tasks.length}。`, "",
  ...(manifest.recovery_of_batch ? [`本批是 ${manifest.recovery_of_batch} 的基础设施异常补跑，不覆盖第一次尝试，不与首轮分数混合。`, ""] : []),
  "## 方法与范围", "", `本批 ${tasks.length} 题来自参考用户玩法分布构造的自建题集，不包含摄像头类。D1/D2/D3 分别为 ${summary.by_difficulty.D1!.tasks}/${summary.by_difficulty.D2!.tasks}/${summary.by_difficulty.D3!.tasks} 题。公开生成需求、固定操作路径和私有检查规则在生成前冻结。生成与模型复核均为 Hy3，高推理档。每个生成游戏按相同路径重放三次，保留状态、事件、界面、截图和文件哈希。`, "",
  "CLI 与初始 IDE 的运行入口不同，工具权限也有调整，逐题元数据保留这些差异。本批是端到端应用实验，不是严格控制所有环境变量的模型排行榜。生成代码没有人工修复。", "",
  "## 原始规则结果", "", "原始规则包含已知误报，以下只能解释为断言通过情况。游戏级分母排除基础设施异常，分子要求所有路径及三次重放都通过。", "",
  "| 难度 | 可评分游戏 | 终局全通过 | 过程全通过 |", "| --- | ---: | ---: | ---: |",
  ...Object.entries(summary.by_difficulty).map(([d,g]) => `| ${d} | ${g.scoreable_tasks} | ${g.all_paths_final_correct} | ${g.all_paths_process_correct} |`), "",
  `路径运行共 ${summary.totals.path_runs} 次，终局通过 ${summary.totals.final_passes} 次，过程通过 ${summary.totals.process_passes} 次。重复路径不是独立样本。基础设施异常 ${summary.totals.infrastructure_failures} 题，不用于评价游戏质量。`, "",
  "## 混元复核", "", "混元输入为公开需求、原始代码、私有检查规则、第一轮逐步记录和三轮判定结果。它会同时质疑游戏实现与测试规则。它没有读取截图，不能声称完成视觉质量评分。", "",
  "| 难度 | 终局正确/可判断场景 | 过程正确/可判断场景 | 指出规则问题的场景 |", "| --- | ---: | ---: | ---: |",
  ...Object.entries(summary.model_review.by_difficulty).map(([d,g]) => `| ${d} | ${g.final_correct}/${g.final_known} | ${g.process_correct}/${g.process_known} | ${g.oracle_issue_scenarios} |`), "",
  `模型与原始过程判定有 ${disagreements.length} 处不一致。它们是需要复查的候选，不直接等同于已确认误报。混元复核不是人工真值；同一模型生成与复核也可能共享偏差。`, "",
  "## 错误类型", "", "按原始检查器的首次失败计数，含三次重放。不一致的内部字段也可能进入状态类，因此不能全部解释成真实逻辑错误。", "",
  "| 首错类型 | 路径运行次数 |", "| --- | ---: |", ...Object.entries(errorTypes).map(([k,v]) => `| ${k} | ${v} |`), "",
  "## 代表案例", "", "Target Rush：第 0 步 START 点击被遮罩拦截，游戏停留在菜单。原始日志和 Hy3 复核均指出 `#end-overlay` 的 `display:flex` 覆盖 `hidden`，导致点击超时。见 evidence/target-rush。", "",
  "Signal Memory：题面未规定内部 phase 的具体命名，冻结规则却检查了这些名称。原始 3/12，通过去掉三条未声明名称约束诊断重算为 12/12。原代码、原分数都保留；重算是同一记录的诊断，不是新实验或人工验证。见 results/codebuddy-hy3-v4。", "",
  "## 结论与限制", "", "流程能够把真实输入、内部状态和错误步骤联系起来，也能暴露检查规则本身的问题。当前不能仅根据原始通过率确定能力随难度下降的边界：题型、规则误报与执行故障都会影响比较。", "",
  "部分目录题的检查路径使用简化的分阶段操作。碰撞、跳跃可达性、长时间经营、多玩家同步等未被每题充分覆盖，不能把路径通过当作完整游戏质量保证。模型指出的未执行代码风险单独保留，不冒充已经复现的缺陷。", "",
  "真人抽检尚未完成，首错定位准确率和误报率记为未验证。human-review.json 保留待填写记录。视频由参赛者负责。"];
await writeFile(resolve(output, "analysis.md"), `${report.join("\n")}\n`);
console.log(`Exported ${recorded.length}/${tasks.length} task records.`);
