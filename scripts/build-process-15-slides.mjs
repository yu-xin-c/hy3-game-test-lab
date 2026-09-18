import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const workspaceDir = path.resolve(process.env.HY3_DECK_WORKSPACE ?? ".");
const SKILL_DIR = process.env.HY3_PRESENTATIONS_SKILL_DIR;
const RUNTIME_PYTHON = process.env.HY3_PRESENTATIONS_PYTHON;
const NODE_MODULES = process.env.HY3_PRESENTATIONS_NODE_MODULES;
if (!path.isAbsolute(SKILL_DIR ?? "") || !path.isAbsolute(RUNTIME_PYTHON ?? "") || !path.isAbsolute(NODE_MODULES ?? "")) {
  throw new Error("Provide absolute HY3_PRESENTATIONS_SKILL_DIR, HY3_PRESENTATIONS_PYTHON and HY3_PRESENTATIONS_NODE_MODULES");
}
const { Presentation, PresentationFile } = await import(
  pathToFileURL(path.join(NODE_MODULES, "@oai/artifact-tool/dist/artifact_tool.mjs")).href
);

const buildDir = path.join(workspaceDir, "artifacts/process15-deck/build");
const finalPath = path.join(workspaceDir, "docs/evaluation-slides-15-cn-v11.pptx");
const data = JSON.parse(await fs.readFile(path.join(workspaceDir, "results/process-15-v1/final-summary.json"), "utf8"));
if (data.execution.completed_games !== 15 || data.scope.selected_ids.length !== 15) {
  throw new Error("Deck requires finalized 15-game results");
}
await fs.mkdir(buildDir, { recursive: true });
const { finalizePresentation, applyPresentationChartFont } = await import(
  pathToFileURL(path.join(SKILL_DIR, "container_tools/artifact_tool_utils.mjs")).href
);

const FONT = "Arial Unicode MS";
const PAPER = "#F7F8FA";
const WHITE = "#FFFFFF";
const INK = "#18212B";
const DARK = "#102A43";
const GREEN = "#63B3ED";
const GREEN_DARK = "#2B6CB0";
const RED = "#C05640";
const MUTED = "#5F6B76";
const LIGHT_RULE = "#D8DEE6";

const imageFiles = {
  orbit: "results/process-15-v1/photo-orbit-gallery/browser/screenshots/replay-1/win-path/photo-orbit-gallery-action-08.png",
  particle: "results/process-15-v1/particle-orchestra/browser/screenshots/replay-1/win-path/particle-orchestra-action-04.png",
  platform: "results/process-v1/platform-rescue/browser/screenshots/replay-1/win-path/platform-rescue-action-08.png",
  game2048: "results/process-15-v1/persistent-2048/browser/screenshots/replay-1/win-path/persistent-2048-action-04.png",
  game2048Alt: "results/process-15-v1/persistent-2048/browser/screenshots/replay-2/win-path/persistent-2048-action-04.png",
  miniFarm: "results/process-15-v1/mini-farm/browser/screenshots/replay-1/win-path/mini-farm-action-17.png",
  meteor: "results/process-15-v1/meteor-survivor/browser/screenshots/replay-1/win-path/meteor-survivor-action-09.png",
  keydoor: "results/process-30-v1/key-door-escape/browser/screenshots/replay-1/win-path/key-door-escape-action-15.png",
};
const images = {};
for (const [key, rel] of Object.entries(imageFiles)) {
  images[key] = new Uint8Array(await fs.readFile(path.join(workspaceDir, rel)));
}

const ppt = Presentation.create({ slideSize: { width: 1280, height: 720 } });

function text(slide, value, x, y, w, h, size, color = INK, bold = false) {
  const shape = slide.shapes.add({
    geometry: "textbox",
    position: { left: x, top: y, width: w, height: h },
    fill: "none",
    line: { fill: "none", width: 0 },
  });
  shape.text = value;
  shape.text.style = { typeface: FONT, fontSize: size, color, bold, autoFit: "none" };
  return shape;
}

const rule = (slide, x, y, w, color = INK, weight = 1) => slide.shapes.add({
  geometry: "line",
  position: { left: x, top: y, width: w, height: 0 },
  fill: "none",
  line: { style: "solid", fill: color, width: weight },
});

const rect = (slide, x, y, w, h, fill, line = fill, width = 0) => slide.shapes.add({
  geometry: "rect",
  position: { left: x, top: y, width: w, height: h },
  fill,
  line: { style: "solid", fill: line, width },
});

const addImage = (slide, blob, x, y, w, h, alt, crop) => slide.images.add({
  blob,
  contentType: "image/png",
  alt,
  fit: "cover",
  position: { left: x, top: y, width: w, height: h },
  ...(crop ? { crop } : {}),
});

const page = (dark = false) => {
  const slide = ppt.slides.add();
  slide.background.fill = dark ? DARK : PAPER;
  return slide;
};

const section = (slide, label, dark = false) => {
  text(slide, label, 62, 38, 330, 26, 14, dark ? GREEN : MUTED, true);
  rule(slide, 62, 72, 1156, dark ? "#54718A" : LIGHT_RULE, 1);
};

const title = (slide, value, y = 98, dark = false) => text(slide, value, 62, y, 1130, 70, 42, dark ? WHITE : INK, true);

const chart = (slide, config, dark = false) => {
  const item = slide.charts.add("bar", config);
  applyPresentationChartFont(item, { fontFamily: FONT });
  if (dark) applyPresentationChartFont(item, { fontFamily: FONT, color: WHITE });
  return item;
};

// 1. Cover
{
  const s = page(true);
  addImage(s, images.orbit, 760, 0, 520, 720, "照片轨道游戏完成画面", { left: 0.18, top: 0, right: 0.12, bottom: 0 });
  rect(s, 760, 0, 520, 86, DARK);
  rect(s, 760, 582, 520, 138, DARK);
  rect(s, 0, 0, 16, 720, GREEN);
  text(s, "犀牛鸟开源实战任务", 64, 48, 520, 30, 15, GREEN, true);
  text(s, "基于 Hy3 的游戏生成\n过程评估与错误定位", 62, 137, 660, 150, 48, WHITE, true);
  text(s, "15 个浏览器游戏任务的实证研究", 65, 318, 620, 52, 27, GREEN, true);
  rule(s, 64, 408, 610, "#54718A", 1);
  text(s, "研究对象：混元生成的游戏方案、代码与试玩记录", 64, 442, 630, 42, 22, WHITE, true);
  text(s, "方法：规则校验、浏览器真实交互和混元复核", 64, 494, 630, 42, 20, "#D5E0E8");
  text(s, "2026 年 9 月", 64, 645, 630, 28, 14, "#A9BBC8");
  s.speakerNotes.textFrame.setText("正式范围：results/process-15-v1/scope.json；15 题全部完成见 results/process-15-v1/FINAL.md。历史 96 题不并入本报告。");
}

// 2. Dataset
{
  const s = page();
  section(s, "研究设计");
  title(s, "评测题集与难度分层");
  const counts = data.scope.category;
  text(s, "15", 62, 194, 290, 150, 112, INK, true);
  text(s, "个固定任务", 72, 340, 250, 38, 24, MUTED, true);
  text(s, "基础 4 题\n中等 6 题\n高难 5 题", 70, 408, 250, 125, 24, INK, true);
  chart(s, {
    position: { left: 350, top: 185, width: 820, height: 310 },
    categories: ["动作", "益智", "创意", "模拟"],
    series: [{ name: "题数", values: [counts.action, counts.puzzle, counts.creative, counts.simulation], fill: INK }],
    barOptions: { direction: "column", grouping: "clustered", gapWidth: 58 },
    hasLegend: false, chartFill: PAPER, plotAreaFill: PAPER,
    xAxis: { textStyle: { typeface: FONT, fontSize: 19, fill: INK }, majorGridlines: null },
    yAxis: { min: 0, max: 7, majorUnit: 1, tickLabelPosition: "none", majorGridlines: null },
    dataLabels: { showValue: true, position: "outEnd", textStyle: { typeface: FONT, fontSize: 20, fill: INK, bold: true } },
  });
  addImage(s, images.orbit, 350, 530, 252, 126, "照片轨道核心玩法区域", { left: 0.12, top: 0.12, right: 0.12, bottom: 0.22 });
  addImage(s, images.keydoor, 618, 530, 252, 126, "钥匙开门地图区域", { left: 0.18, top: 0.16, right: 0.18, bottom: 0.34 });
  rect(s, 618, 625, 252, 31, "#20202E");
  text(s, "钥匙、门与出口地图", 636, 630, 220, 22, 13, WHITE, true);
  addImage(s, images.game2048, 886, 530, 252, 126, "二〇四八数字棋盘区域", { left: 0.23, top: 0.12, right: 0.28, bottom: 0.27 });
  text(s, "不含摄像头、视频和语音任务；按冻结清单顺序选取，不做代表性抽样。", 62, 665, 1135, 24, 16, MUTED);
  s.speakerNotes.textFrame.setText("来源：results/process-15-v1/final-summary.json 的 scope。题集来源与分层依据见 results/process-15-v1/FINAL.md。");
}

// 3. What is evaluated
{
  const s = page();
  section(s, "研究方法");
  title(s, "过程评估对象与证据链");
  text(s, "评估对象限于可观测证据，包括生成方案、文件写入记录和浏览器试玩结果。", 64, 160, 1080, 42, 22, MUTED);
  const rows = [
    ["01", "任务规范", "公开玩法要求提供给混元，私有检查在生成后执行"],
    ["02", "生成方案", "每一步记录实现目标、操作条件和预期结果"],
    ["03", "实现记录", "保存文件写入、修改顺序和最终文件哈希"],
    ["04", "执行证据", "浏览器真实输入寻找反例，混元复核方案和代码"],
  ];
  rows.forEach(([n, heading, detail], i) => {
    const y = 238 + i * 101;
    text(s, n, 64, y, 88, 54, 34, i === 3 ? GREEN_DARK : INK, true);
    text(s, heading, 175, y, 300, 40, 27, INK, true);
    text(s, detail, 500, y + 1, 670, 44, 21, MUTED);
    rule(s, 175, y + 58, 993, LIGHT_RULE, 1);
  });
  s.speakerNotes.textFrame.setText("过程定义与证据追溯：docs/process-evaluation.md、reports/analysis-report.md。公开编号方案先于代码；工具日志需与最终文件一致。观察桥只收集证据，玩家操作来自真实浏览器。");
}

// 4. Claim chain
{
  const s = page(true);
  section(s, "验证方法", true);
  title(s, "单条方案主张的验证过程", 100, true);
  text(s, "示例：粒子乐队终局计分。四次正确输入，每次增加 25 分，公开规则对应终分 100。", 64, 165, 790, 52, 21, "#D5E0E8");
  rect(s, 875, 118, 330, 248, "#080B0C", "#41494A", 1);
  text(s, "浏览器终局", 908, 167, 260, 36, 18, "#A9B1AE", true);
  text(s, "200 分", 906, 216, 260, 78, 55, GREEN, true);
  text(s, "三次结果一致", 908, 307, 260, 32, 18, WHITE, true);
  const cols = [
    ["公开规则", "4 × 25", "标准 100"],
    ["方案第 3 步", "预计 200", "第一次写错"],
    ["代码实现", "又加 100", "沿用错误"],
    ["浏览器试玩", "200 / 200 / 200", "三次复现"],
  ];
  cols.forEach(([heading, main, note], i) => {
    const x = 64 + i * 294;
    text(s, heading, x, 423, 246, 30, 16, i === 1 ? RED : GREEN, true);
    rule(s, x, 463, 238, i === 1 ? RED : "#566061", 2);
    text(s, main, x, 486, 250, 52, 32, WHITE, true);
    text(s, note, x, 548, 250, 30, 18, i === 1 ? RED : "#A9B1AE", true);
  });
  text(s, "验证结果：方案第 3 步首次偏离公开规则，后续代码继续采用该错误计分。", 64, 640, 1130, 34, 22, GREEN, true);
  s.speakerNotes.textFrame.setText("粒子乐队：results/process-15-v1/particle-orchestra/score-plan-claim.json；results/process-15-v1/PROCESS-VALIDITY.md。公开规则每次 +25；方案和实现 +100 额外终局分；三次 Chromium 终分 200。这里只核对选定计分主张，不把整份方案当已穷尽验证。");
}

// 5. Focus points
{
  const s = page();
  section(s, "错误定位方法");
  title(s, "错误定位层次与检查内容");
  addImage(s, images.platform, 735, 164, 470, 390, "平台跳跃游戏在试玩路径中失败", { left: 0.03, top: 0.10, right: 0.02, bottom: 0.16 });
  rect(s, 735, 164, 470, 20, "#03080E");
  rect(s, 735, 524, 470, 30, "#03080E");
  rect(s, 846, 316, 250, 52, "#03080E");
  text(s, "三次跳跃失败", 875, 328, 220, 30, 22, WHITE, true);
  const points = [
    ["题意", "胜负、计分、时序、存档有没有读错"],
    ["方案", "预期结果能不能由公开规则推出"],
    ["实现", "代码有没有兑现动作、状态变化和边界条件"],
    ["判据", "检查本身有没有添加题面没有写的限制"],
  ];
  points.forEach(([heading, detail], i) => {
    const y = 208 + i * 93;
    text(s, heading, 64, y, 115, 38, 25, i === 3 ? RED : INK, true);
    text(s, detail, 178, y, 500, 54, 20, MUTED);
    rule(s, 64, y + 61, 620, LIGHT_RULE, 1);
  });
  rect(s, 64, 596, 1141, 54, INK);
  text(s, "定位单位：浏览器操作序号、方案步骤编号和代码写入记录", 84, 610, 1095, 28, 20, WHITE, true);
  s.speakerNotes.textFrame.setText("三种位置不一一对应：docs/process-evaluation.md。浏览器首错是首个可观察偏离，方案首错是公开主张首个有独立反例的步骤，代码写入只作来源追溯，不能证明内部推理首错。题面歧义或判据风险不记作确定游戏缺陷。");
}

// 6. Hy3 judgments
{
  const s = page();
  section(s, "实验结果");
  title(s, "最终结果与过程结果");
  const e = data.execution;
  const h = data.hy3_opinion;
  chart(s, {
    position: { left: 60, top: 190, width: 760, height: 350 },
    categories: ["最终游戏", "公开方案"],
    series: [
      { name: "判正确", values: [h.final_true, h.process_true], fill: GREEN_DARK },
      { name: "判错误", values: [h.final_known - h.final_true, h.process_known - h.process_true], fill: RED },
      { name: "未判定", values: [15 - h.final_known, 15 - h.process_known], fill: "#9DA39D" },
    ],
    barOptions: { direction: "column", grouping: "stacked", gapWidth: 95 },
    hasLegend: true,
    legend: { position: "bottom", overlay: false, textStyle: { typeface: FONT, fontSize: 17, fill: INK } },
    chartFill: PAPER, plotAreaFill: PAPER,
    xAxis: { textStyle: { typeface: FONT, fontSize: 21, fill: INK }, majorGridlines: null },
    yAxis: { min: 0, max: 15, majorUnit: 5, tickLabelPosition: "none", majorGridlines: null },
    dataLabels: { showValue: true, position: "center", textStyle: { typeface: FONT, fontSize: 20, fill: WHITE, bold: true } },
  });
  text(s, `${h.final_true}/${h.final_known}`, 876, 220, 310, 75, 54, INK, true);
  text(s, "最终游戏判正确", 880, 292, 300, 32, 19, MUTED, true);
  text(s, `${h.process_true}/${h.process_known}`, 876, 360, 310, 75, 54, INK, true);
  text(s, "公开方案判成立", 880, 432, 300, 32, 19, MUTED, true);
  rule(s, 876, 495, 305, LIGHT_RULE, 1);
  text(s, `声明文件合规 ${e.current_strict_manifest_conformant_games}/15`, 878, 515, 310, 36, 22, INK, true);
  text(s, `原始游玩路径终局通过 ${e.original_raw_final_paths_passed}/${e.original_raw_browser_paths}`, 878, 561, 310, 50, 20, MUTED);
  text(s, "口径说明：图中为混元复核意见与执行记录，尚未完成全量独立标注。", 64, 651, 1100, 26, 17, RED, true);
  s.speakerNotes.textFrame.setText("所有分母和口径：results/process-15-v1/final-summary.json。原固定路径含已核实的输入、私有断言和 observe 字段问题；声明文件合规也不保证完整运行接口合规。");
}

// 7. Difficulty
{
  const s = page(true);
  section(s, "分层结果", true);
  title(s, "按难度分层的评测结果", 100, true);
  const rows = data.difficulty_rows;
  chart(s, {
    position: { left: 65, top: 195, width: 805, height: 350 },
    categories: ["基础 4 题", "中等 6 题", "高难 5 题"],
    series: [
      { name: "最终判正确", values: rows.map((row) => row.hy3_final_true), fill: GREEN },
      { name: "最终判错误", values: rows.map((row) => row.hy3_final_known - row.hy3_final_true), fill: RED },
      { name: "未判定", values: rows.map((row) => row.games - row.hy3_final_known), fill: "#6B7474" },
    ],
    barOptions: { direction: "column", grouping: "stacked", gapWidth: 65 },
    hasLegend: true,
    legend: { position: "bottom", overlay: false, textStyle: { typeface: FONT, fontSize: 17, fill: WHITE } },
    chartFill: DARK, plotAreaFill: DARK,
    xAxis: { textStyle: { typeface: FONT, fontSize: 19, fill: WHITE }, majorGridlines: null },
    yAxis: { min: 0, max: 6, majorUnit: 1, tickLabelPosition: "none", majorGridlines: null },
    dataLabels: { showValue: true, position: "center", textStyle: { typeface: FONT, fontSize: 19, fill: WHITE, bold: true } },
  }, true);
  text(s, "1/3", 930, 214, 240, 65, 47, GREEN, true);
  text(s, "基础方案判成立", 934, 280, 260, 30, 18, "#B8C0BD");
  text(s, "2/4", 930, 342, 240, 65, 47, GREEN, true);
  text(s, "中等方案判成立", 934, 408, 260, 30, 18, "#B8C0BD");
  text(s, "3/5", 930, 470, 240, 65, 47, GREEN, true);
  text(s, "高难方案判成立", 934, 536, 260, 30, 18, "#B8C0BD");
  text(s, "题量少，而且每档玩法和检查强度不同；这里只报告分层结果。", 65, 647, 1120, 28, 18, "#C4CBC8");
  s.speakerNotes.textFrame.setText("来源：results/process-15-v1/final-summary.json 的 difficulty_rows 与 difficulty_boundary。各难度分母和未知项未合并。");
}

// 8. Error types
{
  const s = page();
  section(s, "错误分析");
  title(s, "过程错误类型分布");
  const types = data.supported_model_finding_types;
  text(s, "12", 64, 200, 300, 125, 98, RED, true);
  text(s, "条实现不符", 72, 329, 290, 34, 23, INK, true);
  text(s, "1", 70, 422, 105, 75, 58, INK, true);
  text(s, "错误假设", 150, 437, 180, 32, 20, MUTED);
  text(s, "1", 70, 507, 105, 75, 58, INK, true);
  text(s, "题意误读", 150, 522, 180, 32, 20, MUTED);
  chart(s, {
    position: { left: 395, top: 190, width: 780, height: 380 },
    categories: ["实现不符", "错误假设", "题意误读"],
    series: [{ name: "标记条数", values: [types.implementation_mismatch, types.invalid_assumption, types.requirement_misread], fill: RED }],
    barOptions: { direction: "column", grouping: "clustered", gapWidth: 54 },
    hasLegend: false, chartFill: PAPER, plotAreaFill: PAPER,
    xAxis: { textStyle: { typeface: FONT, fontSize: 20, fill: INK }, majorGridlines: null },
    yAxis: { min: 0, max: 13, majorUnit: 2, tickLabelPosition: "none", majorGridlines: null },
    dataLabels: { showValue: true, position: "outEnd", textStyle: { typeface: FONT, fontSize: 20, fill: INK, bold: true } },
  });
  rect(s, 64, 615, 1112, 1, LIGHT_RULE);
  text(s, "同一题可以有多条标记。图中统计混元复核标签，尚未逐条独立核验。", 64, 640, 1110, 28, 17, MUTED);
  s.speakerNotes.textFrame.setText("来源：results/process-15-v1/final-summary.json 的 supported_model_finding_types；分类口径与限制见 results/process-15-v1/FINAL.md。");
}

// 9. Concrete score error
{
  const s = page(true);
  section(s, "案例分析", true);
  title(s, "计分错误的可复现实验", 100, true);
  const c = JSON.parse(await fs.readFile(path.join(workspaceDir, "results/process-15-v1/particle-orchestra/score-plan-claim.json"), "utf8"));
  chart(s, {
    position: { left: 60, top: 205, width: 770, height: 330 },
    categories: ["公开标准", "方案预计", "试玩一", "试玩二", "试玩三"],
    series: [{
      name: "终局分数",
      values: [c.public_final_score, c.plan_predicted_final_score, ...c.browser_final_scores],
      fill: RED,
      points: [{ idx: 0, fill: GREEN }],
    }],
    barOptions: { direction: "column", grouping: "clustered", gapWidth: 58 },
    hasLegend: false, chartFill: DARK, plotAreaFill: DARK,
    xAxis: { textStyle: { typeface: FONT, fontSize: 17, fill: WHITE }, majorGridlines: null },
    yAxis: { min: 0, max: 220, majorUnit: 50, tickLabelPosition: "none", majorGridlines: null },
    dataLabels: { showValue: true, position: "outEnd", textStyle: { typeface: FONT, fontSize: 19, fill: WHITE, bold: true } },
  }, true);
  text(s, "第 3 步", 895, 214, 300, 68, 50, RED, true);
  text(s, "方案第一次失真", 898, 282, 280, 30, 19, WHITE, true);
  rule(s, 895, 337, 285, "#586263", 1);
  text(s, "四次输入 × 25", 895, 365, 280, 34, 24, GREEN, true);
  text(s, "公开标准可直接算出 100。\n生成代码又额外加 100，三次浏览器试玩都复现为 200。", 895, 413, 290, 105, 19, "#C7CFCC");
  text(s, "混元判断“过程有错”并定位到第 3 步。", 895, 548, 290, 60, 20, WHITE, true);
  text(s, "验证范围限于该公开计分主张，未覆盖整份方案。", 64, 649, 1110, 27, 17, "#AAB3B0");
  s.speakerNotes.textFrame.setText("来源：results/process-15-v1/particle-orchestra/score-plan-claim.json。三次浏览器终局均为 200；标准 100 仅针对选出的公开计分断言，不代表整份方案穷尽标准。");
}

// 10. Validity
{
  const s = page();
  section(s, "有效性验证");
  title(s, "错误定位准确性与补充样本");
  const v = data.validity;
  const correct = data.correct_core_wrong_plan;
  text(s, `${v.detect_and_locate}/3`, 64, 192, 330, 110, 82, RED, true);
  text(s, "定位准确率", 69, 302, 350, 30, 21, INK, true);
  text(s, "同时检出并定位 / 已知错步样本", 69, 338, 370, 28, 17, MUTED);
  const cases = [
    ["钥匙开门", "标准第 1 步", "给对步骤，却判方案正确", false],
    ["联机五子棋", "标准第 4 步", "判有错，却没给出步骤", false],
    ["粒子乐队", "标准第 3 步", "判有错，也给对步骤", true],
  ];
  cases.forEach(([name, gold, detail, hit], i) => {
    const y = 187 + i * 113;
    text(s, name, 470, y, 195, 34, 23, INK, true);
    text(s, gold, 680, y + 2, 180, 30, 18, MUTED, true);
    text(s, detail, 870, y + 2, 300, 42, 19, hit ? GREEN_DARK : RED, hit);
    rule(s, 470, y + 63, 700, LIGHT_RULE, 1);
  });
  addImage(s, images.game2048Alt, 64, 409, 330, 215, "二〇四八核心玩法可通关但方案第三步有错", { left: 0.23, top: 0.12, right: 0.28, bottom: 0.27 });
  rect(s, 64, 592, 330, 32, "#20202E");
  text(s, "另一个重要样本", 470, 535, 260, 28, 17, MUTED, true);
  text(s, "二〇四八核心玩法可通关，但方案第三步仍然有错。", 470, 570, 700, 40, 23, INK, true);
  text(s, `补充复核：真问题 ${correct.real_issue_among_flagged}/1，误报 ${correct.false_alarm_among_flagged}/1。样本太少，不能估计总体误报率。`, 64, 658, 1120, 25, 17, MUTED);
  s.speakerNotes.textFrame.setText("三份公开方案子断言标准与复核结果：results/process-15-v1/PROCESS-VALIDITY.md。2048 补充混元提示不同，不能与原始全题复核合并；这里只描述已核对的一个正确核心游戏、错误过程单例。");
}

const candidatePath = path.join(buildDir, "evaluation-slides-15-cn-v11.candidate.pptx");
await (await PresentationFile.exportPptx(ppt)).save(candidatePath);
const result = await finalizePresentation({
  explicitTotalSlideCount: 10,
  requiredNativeTableOwnerSlides: [],
  requiredNativeChartOwnerSlides: [2, 6, 7, 8, 9],
  materializeLiteralChartWorkbooks: true,
  workspaceDir,
  candidatePath,
  finalPath,
  pythonExecutable: RUNTIME_PYTHON,
  integrityValidatorPath: path.join(SKILL_DIR, "container_tools/inspect_presentation_package_integrity.py"),
  layoutValidatorPath: path.join(SKILL_DIR, "container_tools/inspect_presentation_layout_geometry.py"),
  layoutArgs: ["--expected-slide-size-emu", "12192000,6858000", "--validate-heading-fit"],
  fontPolicy: { basis: "design", families: [FONT] },
  verifyArtifactToolImport: true,
  receiptPath: path.join(buildDir, "evaluation-slides-15-cn-v11.validation.json"),
});

for (let index = 0; index < 10; index++) {
  const slide = ppt.slides.getItem(index);
  const preview = await ppt.export({ slide, format: "png", scale: 1 });
  await fs.writeFile(path.join(buildDir, `slide-v11-${index + 1}.png`), new Uint8Array(await preview.arrayBuffer()));
}
console.log(JSON.stringify({ path: finalPath, slides: 10, validation: result?.status ?? "completed" }));
