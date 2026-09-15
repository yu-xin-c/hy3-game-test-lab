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
const finalPath = path.join(workspaceDir, "docs/evaluation-slides-15-cn-v1.pptx");
const data = JSON.parse(await fs.readFile(path.join(workspaceDir, "results/process-15-v1/final-summary.json"), "utf8"));
if (data.execution.completed_games !== 15 || data.scope.selected_ids.length !== 15) throw new Error("Deck requires finalized 15-game results");
await fs.mkdir(buildDir, { recursive: true });
const { finalizePresentation } = await import(pathToFileURL(path.join(SKILL_DIR, "container_tools/artifact_tool_utils.mjs")).href);
const FONT = "Arial Unicode MS";
const DARK = "#17242A", PAPER = "#FAF8F1", GREEN = "#1B6D57", MINT = "#D4EABF", INK = "#26352F", MUTED = "#6F7A73", CORAL = "#C95E48";
const ppt = Presentation.create({ slideSize: { width: 1280, height: 720 } });
const text = (slide, value, x, y, w, h, size, color = INK, bold = false) => {
  const shape = slide.shapes.add({ geometry: "textbox", position: { left: x, top: y, width: w, height: h }, fill: "none", line: { fill: "none", width: 0 } });
  shape.text = value;
  shape.text.style = { typeface: FONT, fontSize: size, color, bold, autoFit: "none" };
  return shape;
};
const page = (n, dark = false) => {
  const slide = ppt.slides.add();
  slide.background.fill = dark ? DARK : PAPER;
  text(slide, "游戏评测实验室", 68, 36, 290, 32, 16, dark ? MINT : GREEN, true);
  text(slide, String(n).padStart(2, "0"), 1160, 655, 50, 32, 14, dark ? MINT : MUTED);
  return slide;
};

{
  const s = page(1, true);
  text(s, "游戏生成过程评估", 70, 175, 850, 90, 62, PAPER, true);
  text(s, "定位玩法错误出现的步骤", 72, 280, 850, 72, 34, MINT);
  text(s, "混元生成与复核，浏览器实际操作游戏", 73, 380, 850, 48, 25, PAPER);
  text(s, "15", 970, 212, 230, 180, 132, MINT, true);
  text(s, "道固定游戏题", 965, 412, 260, 40, 22, PAPER);
  s.speakerNotes.textFrame.setText("正式范围：results/process-15-v1/scope.json；15 题全部完成见 results/process-15-v1/FINAL.md。历史 96 题不并入本报告。");
}
{
  const s = page(2);
  text(s, "一道题的评测过程", 68, 100, 900, 60, 42, GREEN, true);
  const items = [
    ["01", "游戏要求", "玩法规则、胜负目标和可执行检查"],
    ["02", "混元分步方案", "先写方案，再给每一步配检查点"],
    ["03", "生成游戏代码", "根据文件操作和哈希还原实现过程"],
    ["04", "实际游玩与复核", "浏览器输入、时间推进、失败路径和混元复核"],
  ];
  items.forEach(([n, title, detail], i) => {
    const y = 205 + i * 108;
    text(s, n, 69, y, 100, 70, 45, GREEN, true);
    text(s, title, 200, y + 2, 900, 44, 30, INK, true);
    text(s, detail, 203, y + 47, 970, 40, 22, MUTED);
  });
  s.speakerNotes.textFrame.setText("过程定义、证据哈希与验证设计：reports/analysis-report.md；results/process-15-v1/PROGRESS.md。观察桥仅收集证据，玩家操作来自 Chromium。");
}
{
  const s = page(3);
  const e = data.execution, h = data.hy3_opinion;
  text(s, "十五题评测结果", 68, 100, 1100, 60, 42, GREEN, true);
  text(s, "15/15", 70, 190, 420, 100, 72, GREEN, true);
  text(s, "方案、游戏、浏览器游玩和复核均已完成", 72, 292, 950, 46, 27, INK);
  text(s, `${h.final_true}/${h.final_known}`, 71, 373, 300, 72, 52, INK, true);
  text(s, "混元判断游戏正确／已判定", 74, 448, 495, 40, 22, MUTED);
  text(s, `${h.process_true}/${h.process_known}`, 658, 373, 340, 72, 52, INK, true);
  text(s, "混元判断方案成立／已判定", 661, 448, 510, 40, 22, MUTED);
  text(s, `声明文件合规：${e.current_strict_manifest_conformant_games}/15`, 74, 548, 490, 38, 24, GREEN, true);
  text(s, `原始游玩路径通过：${e.original_raw_final_paths_passed}/${e.original_raw_browser_paths}`, 660, 548, 530, 38, 24, CORAL, true);
  text(s, "混元判断与原始路径得分仍需独立核对", 72, 610, 1050, 32, 20, MUTED);
  s.speakerNotes.textFrame.setText("所有分母和口径：results/process-15-v1/final-summary.json。原固定路径含已核实的输入、私有断言和 observe 字段问题；声明文件合规也不保证完整运行接口合规。");
}
{
  const s = page(4);
  text(s, "第三步多加了一百分", 68, 96, 990, 60, 42, GREEN, true);
  text(s, "公开标准", 74, 214, 470, 48, 28, MUTED);
  text(s, "4 × 25 = 100", 70, 270, 520, 90, 59, INK, true);
  text(s, "游戏实际", 666, 214, 470, 48, 28, MUTED);
  text(s, "200 分", 660, 270, 520, 90, 59, CORAL, true);
  text(s, "代码重复加了一百分", 71, 410, 540, 56, 32, INK, true);
  text(s, "三次通关均得二百分", 662, 410, 520, 56, 32, INK, true);
  text(s, "混元发现问题，定位到方案第三步", 74, 540, 1100, 62, 29, GREEN, true);
  s.speakerNotes.textFrame.setText("公开计分标准、原方案与三次重放：results/process-15-v1/particle-orchestra/score-plan-claim.json。页面数字来自真实浏览器执行证据。");
}
{
  const s = page(5, true);
  const v = data.validity, correct = data.correct_core_wrong_plan;
  text(s, "错误步骤定位效果", 68, 100, 1080, 60, 42, MINT, true);
  text(s, `${v.detect_and_locate}/3`, 72, 222, 370, 100, 72, PAPER, true);
  text(s, "原始复核同时发现并定位错误", 77, 321, 850, 42, 25, PAPER);
  text(s, "二〇四八游戏可正常通关", 76, 430, 730, 54, 31, MINT, true);
  text(s, "方案却把获胜动作写成失败。补充复核定位到第三步。", 78, 488, 1080, 44, 22, PAPER);
  text(s, `正确游戏的过程问题抽检：真问题 ${correct.real_issue_among_flagged}/1，误报 ${correct.false_alarm_among_flagged}/1`, 78, 557, 1080, 38, 21, PAPER);
  text(s, "样本较少，尚不能估计整体误报率或难度拐点", 78, 610, 1100, 32, 20, MINT);
  s.speakerNotes.textFrame.setText("三份公开方案子断言标准与复核结果：results/process-15-v1/PROCESS-VALIDITY.md。2048 补充混元提示不同，不能与原始全题复核合并；这里只描述已核对的一个正确核心游戏、错误过程单例。");
}

const candidatePath = path.join(buildDir, "evaluation-slides-15-cn-v1.candidate.pptx");
await (await PresentationFile.exportPptx(ppt)).save(candidatePath);
const result = await finalizePresentation({
  explicitTotalSlideCount: 5, requiredNativeTableOwnerSlides: [], requiredNativeChartOwnerSlides: [],
  workspaceDir, candidatePath, finalPath, pythonExecutable: RUNTIME_PYTHON,
  integrityValidatorPath: path.join(SKILL_DIR, "container_tools/inspect_presentation_package_integrity.py"),
  layoutValidatorPath: path.join(SKILL_DIR, "container_tools/inspect_presentation_layout_geometry.py"),
  layoutArgs: ["--expected-slide-size-emu", "12192000,6858000", "--validate-heading-fit"],
  fontPolicy: { basis: "design", families: [FONT] }, verifyArtifactToolImport: true,
  receiptPath: path.join(buildDir, "evaluation-slides-15-cn-v1.validation.json"),
});
for (let index = 0; index < 5; index++) {
  const slide = ppt.slides.getItem(index);
  const preview = await ppt.export({ slide, format: "png", scale: 1 });
  await fs.writeFile(path.join(buildDir, `slide-${index + 1}.png`), new Uint8Array(await preview.arrayBuffer()));
}
console.log(JSON.stringify({ path: finalPath, slides: 5, validation: result?.status ?? "completed" }));
