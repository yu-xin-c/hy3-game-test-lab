import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { Presentation, PresentationFile } from "@oai/artifact-tool";

const workspaceDir = path.resolve(process.env.HY3_DECK_WORKSPACE ?? ".");
const SKILL_DIR = process.env.HY3_PRESENTATIONS_SKILL_DIR;
const RUNTIME_PYTHON = process.env.HY3_PRESENTATIONS_PYTHON;
if (!path.isAbsolute(SKILL_DIR ?? "") || !path.isAbsolute(RUNTIME_PYTHON ?? "")) {
  throw new Error("Provide absolute HY3_PRESENTATIONS_SKILL_DIR and HY3_PRESENTATIONS_PYTHON");
}
const buildDir = path.join(workspaceDir, "artifacts/process15-deck/build");
const finalPath = path.join(workspaceDir, "docs/evaluation-slides-15-cn-v5.pptx");
const data = JSON.parse(await fs.readFile(path.join(workspaceDir, "results/process-15-v1/final-summary.json"), "utf8"));
if (data.execution.completed_games !== 15 || data.scope.selected_ids.length !== 15) throw new Error("Deck requires finalized 15-game results");
await fs.mkdir(buildDir, { recursive: true });
const { finalizePresentation, applyPresentationChartFont } = await import(pathToFileURL(path.join(SKILL_DIR, "container_tools/artifact_tool_utils.mjs")).href);
const FONT = "Arial Unicode MS";
const DARK = "#17242A", PAPER = "#FAF8F1", GREEN = "#1B6D57", MINT = "#D4EABF", INK = "#26352F", MUTED = "#6F7A73", CORAL = "#C95E48";
const ppt = Presentation.create({ slideSize: { width: 1280, height: 720 } });
const text = (slide, value, x, y, w, h, size, color = INK, bold = false) => {
  const shape = slide.shapes.add({ geometry: "textbox", position: { left: x, top: y, width: w, height: h }, fill: "none", line: { fill: "none", width: 0 } });
  shape.text = value;
  shape.text.style = { typeface: FONT, fontSize: size, color, bold, autoFit: "none" };
  return shape;
};
const rule = (slide, x, y, w, color = GREEN, weight = 2) => slide.shapes.add({
  geometry: "line", position: { left: x, top: y, width: w, height: 0 },
  fill: "none", line: { style: "solid", fill: color, width: weight },
});
const page = (n, dark = false) => {
  const slide = ppt.slides.add();
  slide.background.fill = dark ? DARK : PAPER;
  text(slide, "游戏评测实验室", 68, 36, 290, 32, 16, dark ? MINT : GREEN, true);
  text(slide, String(n).padStart(2, "0"), 1160, 655, 50, 32, 14, dark ? MINT : MUTED);
  return slide;
};
const chart = (slide, config) => {
  const item = slide.charts.add("bar", config);
  applyPresentationChartFont(item, { fontFamily: FONT });
  return item;
};

{
  const s = page(1, true);
  text(s, "游戏生成过程评估", 70, 175, 850, 90, 62, PAPER, true);
  text(s, "定位玩法错误出现的步骤", 72, 280, 850, 72, 34, MINT);
  text(s, "混元生成与复核，浏览器实际操作游戏", 73, 380, 850, 48, 25, PAPER);
  text(s, "15", 970, 212, 230, 180, 132, MINT, true);
  text(s, "道固定游戏题", 965, 412, 260, 40, 22, PAPER);
  text(s, "公开方案、生成代码、真实试玩、错误定位", 73, 450, 1000, 40, 23, PAPER);
  s.speakerNotes.textFrame.setText("正式范围：results/process-15-v1/scope.json；15 题全部完成见 results/process-15-v1/FINAL.md。历史 96 题不并入本报告。");
}
{
  const s = page(2);
  const counts = data.scope.category;
  text(s, "十五题覆盖的玩法", 68, 100, 900, 60, 42, GREEN, true);
  chart(s, {
    position: { left: 75, top: 185, width: 1090, height: 370 },
    categories: ["动作", "益智", "创意", "模拟"],
    series: [{ name: "题数", values: [counts.action, counts.puzzle, counts.creative, counts.simulation], fill: GREEN }],
    barOptions: { direction: "column", grouping: "clustered", gapWidth: 75 },
    hasLegend: false, chartFill: PAPER, plotAreaFill: PAPER,
    xAxis: { textStyle: { typeface: FONT, fontSize: 22, fill: INK }, majorGridlines: null },
    yAxis: { min: 0, max: 7, majorUnit: 1, tickLabelPosition: "none", majorGridlines: null },
    dataLabels: { showValue: true, position: "outEnd", textStyle: { typeface: FONT, fontSize: 21, fill: INK, bold: true } },
  });
  text(s, "难度：基础 4 题，中等 6 题，高难 5 题", 76, 565, 820, 40, 25, INK);
  text(s, "按冻结清单顺序选取；不含摄像头、视频或语音任务，也不是代表性抽样", 76, 610, 1100, 35, 19, MUTED);
  s.speakerNotes.textFrame.setText("来源：results/process-15-v1/final-summary.json 的 scope。题集来源与分层依据见 results/process-15-v1/FINAL.md。");
}
{
  const s = page(3);
  text(s, "评估对象：游戏生成过程", 68, 100, 1050, 60, 42, GREEN, true);
  const items = [
    ["01", "题目和标准", "公开玩法要求给混元；私有检查留到生成后"],
    ["02", "公开编号方案", "混元先写方案，保留规则判断和预期结果"],
    ["03", "实际代码写入", "逐次保存文件写入和修改、最终文件和哈希"],
    ["04", "试玩与审查", "真实浏览器输入找反例；混元再审查方案和代码"],
  ];
  items.forEach(([n, title, detail], i) => {
    const y = 195 + i * 103;
    text(s, n, 69, y, 100, 70, 45, GREEN, true);
    text(s, title, 200, y + 2, 900, 44, 30, INK, true);
    text(s, detail, 203, y + 47, 970, 40, 21, MUTED);
  });
  text(s, "这里的“过程”指留下来的生成方案和实现记录，不推测模型的内部思维", 203, 625, 1010, 35, 21, GREEN, true);
  s.speakerNotes.textFrame.setText("过程定义与证据追溯：docs/process-evaluation.md、reports/analysis-report.md。公开编号方案先于代码；工具日志需与最终文件一致。观察桥只收集证据，玩家操作来自真实浏览器。");
}
{
  const s = page(4);
  text(s, "一条方案主张怎样受检", 68, 100, 1100, 60, 42, GREEN, true);
  text(s, "以粒子乐队的终局计分为例", 71, 164, 900, 38, 24, MUTED);
  const nodes = [
    ["公开规则", "四次正确输入", "每次加 25 分", 70],
    ["方案第三步", "预计终分 200", "多算了 100 分", 370],
    ["代码写入", "终局又加 100", "可追溯到文件", 668],
    ["浏览器试玩", "三次终局 200", "真实键鼠输入", 962],
  ];
  nodes.forEach(([heading, line1, line2, x]) => {
    text(s, heading, x, 236, 245, 44, 28, GREEN, true);
    rule(s, x, 292, 245);
    text(s, line1, x, 313, 245, 42, 24, INK, true);
    text(s, line2, x, 361, 245, 42, 21, MUTED);
  });
  text(s, "独立判据", 70, 458, 235, 40, 28, GREEN, true);
  text(s, "公开规则可算出 100 分；该值不从方案或生成代码中取得", 70, 503, 1110, 45, 25, INK);
  text(s, "结论", 70, 575, 235, 40, 28, CORAL, true);
  text(s, "这条计分错误出现在方案第三步，实现继续沿用了错误计分", 70, 620, 1110, 38, 24, INK);
  s.speakerNotes.textFrame.setText("粒子乐队：results/process-15-v1/particle-orchestra/score-plan-claim.json；results/process-15-v1/PROCESS-VALIDITY.md。公开规则每次 +25；方案和实现 +100 额外终局分；三次 Chromium 终分 200。这里只核对选定计分主张，不把整份方案当已穷尽验证。");
}
{
  const s = page(5);
  text(s, "过程评估重点与首错位置", 68, 100, 1110, 60, 42, GREEN, true);
  const points = [
    ["题意是否读对", "胜负、计分、时序和存档规则不能自行改写"],
    ["方案是否成立", "每条可验证的预期结果，先与公开规则核对"],
    ["实现是否兑现", "检查代码对应的动作、状态变化和边界条件"],
    ["判据是否可靠", "私有断言若添加题面未写的限制，单列为标准风险"],
  ];
  points.forEach(([heading, detail], i) => {
    const y = 202 + i * 86;
    text(s, heading, 74, y, 275, 42, 27, GREEN, true);
    text(s, detail, 360, y + 1, 825, 42, 23, INK);
    rule(s, 74, y + 58, 1105, "#C8D3CA", 1);
  });
  text(s, "三种位置分别记录", 74, 572, 650, 40, 28, GREEN, true);
  text(s, "浏览器第几次操作首错    方案第几步先失真    相关代码在哪次写入", 74, 618, 1110, 40, 23, INK);
  s.speakerNotes.textFrame.setText("三种位置不一一对应：docs/process-evaluation.md。浏览器首错是首个可观察偏离，方案首错是公开主张首个有独立反例的步骤，代码写入只作来源追溯，不能证明内部推理首错。题面歧义或判据风险不记作确定游戏缺陷。");
}
{
  const s = page(6);
  const e = data.execution, h = data.hy3_opinion;
  text(s, "混元对十五题的判定", 68, 100, 1100, 60, 42, GREEN, true);
  chart(s, {
    position: { left: 78, top: 185, width: 1090, height: 340 },
    categories: ["最终游戏", "公开方案"],
    series: [
      { name: "判正确", values: [h.final_true, h.process_true], fill: GREEN },
      { name: "判错误", values: [h.final_known - h.final_true, h.process_known - h.process_true], fill: CORAL },
      { name: "未判定", values: [15 - h.final_known, 15 - h.process_known], fill: MUTED },
    ],
    barOptions: { direction: "column", grouping: "stacked", gapWidth: 100 },
    hasLegend: true, legend: { position: "bottom", overlay: false, textStyle: { typeface: FONT, fontSize: 19, fill: INK } },
    chartFill: PAPER, plotAreaFill: PAPER,
    xAxis: { textStyle: { typeface: FONT, fontSize: 22, fill: INK }, majorGridlines: null },
    yAxis: { min: 0, max: 15, majorUnit: 5, tickLabelPosition: "none", majorGridlines: null },
    dataLabels: { showValue: true, position: "center", textStyle: { typeface: FONT, fontSize: 20, fill: PAPER, bold: true } },
  });
  text(s, `声明文件合规 ${e.current_strict_manifest_conformant_games}/15；原始游玩路径终局通过 ${e.original_raw_final_paths_passed}/${e.original_raw_browser_paths}`, 78, 562, 1050, 42, 25, INK, true);
  text(s, "图中是混元意见；原始路径有已知标准问题，均不等于独立正确率", 78, 616, 1100, 35, 19, MUTED);
  s.speakerNotes.textFrame.setText("所有分母和口径：results/process-15-v1/final-summary.json。原固定路径含已核实的输入、私有断言和 observe 字段问题；声明文件合规也不保证完整运行接口合规。");
}
{
  const s = page(7);
  const rows = data.difficulty_rows;
  text(s, "按难度分层的混元判断", 68, 100, 1100, 60, 42, GREEN, true);
  chart(s, {
    position: { left: 78, top: 185, width: 1090, height: 340 },
    categories: ["基础", "中等", "高难"],
    series: [
      { name: "最终判正确", values: rows.map(row => row.hy3_final_true), fill: GREEN },
      { name: "最终判错误", values: rows.map(row => row.hy3_final_known - row.hy3_final_true), fill: CORAL },
      { name: "未判定", values: rows.map(row => row.games - row.hy3_final_known), fill: MUTED },
    ],
    barOptions: { direction: "column", grouping: "stacked", gapWidth: 70 },
    hasLegend: true, legend: { position: "bottom", overlay: false, textStyle: { typeface: FONT, fontSize: 18, fill: INK } },
    chartFill: PAPER, plotAreaFill: PAPER,
    xAxis: { textStyle: { typeface: FONT, fontSize: 22, fill: INK }, majorGridlines: null },
    yAxis: { min: 0, max: 6, majorUnit: 1, tickLabelPosition: "none", majorGridlines: null },
    dataLabels: { showValue: true, position: "center", textStyle: { typeface: FONT, fontSize: 19, fill: PAPER, bold: true } },
  });
  text(s, "公开方案判成立：基础 1/3，中等 2/4，高难 3/5", 77, 565, 1040, 40, 25, INK);
  text(s, "仅 4／6／5 题，玩法和检查强度不同；不能据此判断难度拐点", 77, 613, 1100, 35, 19, MUTED);
  s.speakerNotes.textFrame.setText("来源：results/process-15-v1/final-summary.json 的 difficulty_rows 与 difficulty_boundary。各难度分母和未知项未合并。");
}
{
  const s = page(8);
  const types = data.supported_model_finding_types;
  text(s, "混元标记的错误类型", 68, 100, 1100, 60, 42, GREEN, true);
  chart(s, {
    position: { left: 78, top: 190, width: 1090, height: 355 },
    categories: ["实现不符", "错误假设", "题意误读"],
    series: [{ name: "标记条数", values: [types.implementation_mismatch, types.invalid_assumption, types.requirement_misread], fill: CORAL }],
    barOptions: { direction: "column", grouping: "clustered", gapWidth: 75 },
    hasLegend: false, chartFill: PAPER, plotAreaFill: PAPER,
    xAxis: { textStyle: { typeface: FONT, fontSize: 23, fill: INK }, majorGridlines: null },
    yAxis: { min: 0, max: 13, majorUnit: 2, tickLabelPosition: "none", majorGridlines: null },
    dataLabels: { showValue: true, position: "outEnd", textStyle: { typeface: FONT, fontSize: 21, fill: INK, bold: true } },
  });
  text(s, "同题可有多条标记；这些是混元复核标签，不是逐条独立证实的游戏缺陷", 77, 590, 1100, 44, 20, MUTED);
  s.speakerNotes.textFrame.setText("来源：results/process-15-v1/final-summary.json 的 supported_model_finding_types；分类口径与限制见 results/process-15-v1/FINAL.md。");
}
{
  const s = page(9);
  const c = JSON.parse(await fs.readFile(path.join(workspaceDir, "results/process-15-v1/particle-orchestra/score-plan-claim.json"), "utf8"));
  text(s, "计分错误：方案第三步", 68, 100, 1100, 60, 42, GREEN, true);
  chart(s, {
    position: { left: 78, top: 185, width: 1090, height: 355 },
    categories: ["公开标准", "方案预计", "试玩一", "试玩二", "试玩三"],
    series: [{ name: "终局分数", values: [c.public_final_score, c.plan_predicted_final_score, ...c.browser_final_scores], fill: CORAL, points: [{ idx: 0, fill: GREEN }] }],
    barOptions: { direction: "column", grouping: "clustered", gapWidth: 80 },
    hasLegend: false, chartFill: PAPER, plotAreaFill: PAPER,
    xAxis: { textStyle: { typeface: FONT, fontSize: 20, fill: INK }, majorGridlines: null },
    yAxis: { min: 0, max: 220, majorUnit: 50, tickLabelPosition: "none", majorGridlines: null },
    dataLabels: { showValue: true, position: "outEnd", textStyle: { typeface: FONT, fontSize: 20, fill: INK, bold: true } },
  });
  text(s, "四次正确输入各加 25 分；方案与代码又多加 100 分", 78, 560, 1090, 40, 25, INK);
  text(s, "混元判过程有错并定位第三步；这里只验证选出的公开计分主张", 78, 611, 1100, 38, 19, MUTED);
  s.speakerNotes.textFrame.setText("来源：results/process-15-v1/particle-orchestra/score-plan-claim.json。三次浏览器终局均为 200；标准 100 仅针对选出的公开计分断言，不代表整份方案穷尽标准。");
}
{
  const s = page(10, true);
  const v = data.validity, correct = data.correct_core_wrong_plan;
  text(s, "过程定位的有效性", 68, 100, 1080, 60, 42, MINT, true);
  text(s, `${v.detect_and_locate}/3`, 74, 185, 350, 105, 76, PAPER, true);
  text(s, "原始复核同时检出并定位已核对的错误", 420, 226, 750, 42, 25, PAPER);
  text(s, "钥匙开门：给出第一步，却判方案正确；未命中", 77, 320, 1100, 42, 25, PAPER);
  text(s, "联机五子棋：判有错，却未给第四步；未命中", 77, 386, 1100, 42, 25, PAPER);
  text(s, "粒子乐队：判有错并给第三步；命中", 77, 452, 1100, 42, 25, MINT, true);
  text(s, `二〇四八单例：核心玩法可通关，方案第三步错；补充复核真问题 ${correct.real_issue_among_flagged}/1，误报 ${correct.false_alarm_among_flagged}/1`, 77, 533, 1100, 50, 23, PAPER);
  text(s, "标准只核对选定主张；补充复核提示不同，样本不足以估计总体误报率", 77, 615, 1100, 33, 19, MINT);
  s.speakerNotes.textFrame.setText("三份公开方案子断言标准与复核结果：results/process-15-v1/PROCESS-VALIDITY.md。2048 补充混元提示不同，不能与原始全题复核合并；这里只描述已核对的一个正确核心游戏、错误过程单例。");
}

const candidatePath = path.join(buildDir, "evaluation-slides-15-cn-v5.candidate.pptx");
await (await PresentationFile.exportPptx(ppt)).save(candidatePath);
const result = await finalizePresentation({
  explicitTotalSlideCount: 10, requiredNativeTableOwnerSlides: [], requiredNativeChartOwnerSlides: [2, 6, 7, 8, 9],
  materializeLiteralChartWorkbooks: true,
  workspaceDir, candidatePath, finalPath, pythonExecutable: RUNTIME_PYTHON,
  integrityValidatorPath: path.join(SKILL_DIR, "container_tools/inspect_presentation_package_integrity.py"),
  layoutValidatorPath: path.join(SKILL_DIR, "container_tools/inspect_presentation_layout_geometry.py"),
  layoutArgs: ["--expected-slide-size-emu", "12192000,6858000", "--validate-heading-fit"],
  fontPolicy: { basis: "design", families: [FONT] }, verifyArtifactToolImport: true,
  receiptPath: path.join(buildDir, "evaluation-slides-15-cn-v5.validation.json"),
});
for (let index = 0; index < 10; index++) {
  const slide = ppt.slides.getItem(index);
  const preview = await ppt.export({ slide, format: "png", scale: 1 });
  await fs.writeFile(path.join(buildDir, `slide-v5-${index + 1}.png`), new Uint8Array(await preview.arrayBuffer()));
}
console.log(JSON.stringify({ path: finalPath, slides: 10, validation: result?.status ?? "completed" }));
