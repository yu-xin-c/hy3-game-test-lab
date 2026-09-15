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
const finalPath = path.join(workspaceDir, "docs/evaluation-slides-15-v3.pptx");
const data = JSON.parse(await fs.readFile(path.join(workspaceDir, "results/process-15-v1/final-summary.json"), "utf8"));
if (data.execution.completed_games !== 15 || data.scope.selected_ids.length !== 15) throw new Error("Deck requires finalized 15-game results");
await fs.mkdir(buildDir, { recursive: true });
const { finalizePresentation } = await import(pathToFileURL(path.join(SKILL_DIR, "container_tools/artifact_tool_utils.mjs")).href);
const FONT = "Georgia";
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
  text(slide, "GAME TEST LAB", 68, 36, 290, 32, 16, dark ? MINT : GREEN, true);
  text(slide, String(n).padStart(2, "0"), 1160, 655, 50, 32, 14, dark ? MINT : MUTED);
  return slide;
};

{
  const s = page(1, true);
  text(s, "GameTestLab", 70, 175, 700, 90, 62, PAPER, true);
  text(s, "Game generation and process evaluation", 72, 280, 850, 72, 34, MINT);
  text(s, "Hy3 plans, codes and reviews. Chromium plays.", 73, 380, 850, 48, 25, PAPER);
  text(s, "15", 970, 212, 230, 180, 132, MINT, true);
  text(s, "frozen game tasks", 965, 412, 260, 40, 22, PAPER);
  s.speakerNotes.textFrame.setText("正式范围：results/process-15-v1/scope.json；15 题全部完成见 results/process-15-v1/FINAL.md。历史 96 题不并入本报告。");
}
{
  const s = page(2);
  text(s, "One game's evaluation path", 68, 100, 900, 60, 42, GREEN, true);
  const items = [
    ["01", "Game brief", "Rules, win/loss goals and executable checks"],
    ["02", "Hy3's numbered plan", "Written before code, with a check for each step"],
    ["03", "Code written with Write/Edit", "Reconstructed from tool calls and file hashes"],
    ["04", "Chromium play and Hy3 review", "Real input, virtual time and counterexamples"],
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
  text(s, "Three result types across 15 tasks", 68, 100, 1100, 60, 42, GREEN, true);
  text(s, "15/15", 70, 190, 420, 100, 72, GREEN, true);
  text(s, "plan, game, browser play and review", 72, 292, 750, 46, 27, INK);
  text(s, `${h.final_true}/${h.final_known}`, 71, 373, 300, 72, 52, INK, true);
  text(s, "Hy3: final game correct / decided", 74, 448, 495, 40, 22, MUTED);
  text(s, `${h.process_true}/${h.process_known}`, 658, 373, 340, 72, 52, INK, true);
  text(s, "Hy3: plan process valid / decided", 661, 448, 510, 40, 22, MUTED);
  text(s, `Manifest files valid: ${e.current_strict_manifest_conformant_games}/15`, 74, 548, 490, 38, 24, GREEN, true);
  text(s, `Original path passes: ${e.original_raw_final_paths_passed}/${e.original_raw_browser_paths}`, 660, 548, 530, 38, 24, CORAL, true);
  text(s, "Hy3 opinions and raw path scores need independent checking", 72, 610, 1050, 32, 20, MUTED);
  s.speakerNotes.textFrame.setText("所有分母和口径：results/process-15-v1/final-summary.json。原固定路径含已核实的输入、私有断言和 observe 字段问题；声明文件合规也不保证完整运行接口合规。");
}
{
  const s = page(4);
  text(s, "Step 3 adds 100 points too many", 68, 96, 990, 60, 42, GREEN, true);
  const img = await fs.readFile(path.join(workspaceDir, "results/process-15-v1/particle-orchestra/browser/screenshots/replay-1/win-path/particle-orchestra-action-04.png"));
  s.images.add({ blob: new Uint8Array(img), contentType: "image/png", alt: "Real Chromium screenshot of Particle Orchestra showing final score 200", fit: "contain", position: { left: 68, top: 190, width: 520, height: 390 } });
  text(s, "4 × 25 = 100", 660, 205, 490, 76, 52, INK, true);
  text(s, "Score required by the brief", 663, 280, 480, 38, 22, MUTED);
  text(s, "Code adds another 100", 660, 360, 490, 56, 32, CORAL, true);
  text(s, "Three wins all scored 200", 663, 425, 510, 48, 27, INK);
  text(s, "Hy3 detects and locates plan step 3", 663, 510, 520, 62, 25, GREEN, true);
  s.speakerNotes.textFrame.setText("公开计分标准、原方案与三次重放：results/process-15-v1/particle-orchestra/score-plan-claim.json；截图是保存的原始 Chromium 执行证据，不是生成示意图。");
}
{
  const s = page(5, true);
  const v = data.validity, correct = data.correct_core_wrong_plan;
  text(s, "How reliable is step localization?", 68, 100, 1080, 60, 42, MINT, true);
  text(s, `${v.detect_and_locate}/3`, 72, 222, 370, 100, 72, PAPER, true);
  text(s, "Original full review: detect and locate", 77, 321, 850, 42, 25, PAPER);
  text(s, "2048 plays correctly", 76, 430, 730, 54, 31, MINT, true);
  text(s, "Its plan calls a winning move a loss. A second Hy3 review finds step 3.", 78, 488, 1080, 44, 22, PAPER);
  text(s, `One checked correct-core case: real issue ${correct.real_issue_among_flagged}/1, false alarm ${correct.false_alarm_among_flagged}/1`, 78, 557, 1080, 38, 21, PAPER);
  text(s, "Small samples cannot establish a general error rate or difficulty threshold", 78, 610, 1100, 32, 20, MINT);
  text(s, "github.com/yu-xin-c/hy3-game-test-lab", 76, 655, 820, 28, 16, MINT);
  s.speakerNotes.textFrame.setText("三份公开方案子断言标准与复核结果：results/process-15-v1/PROCESS-VALIDITY.md。2048 补充混元提示不同，不能与原始全题复核合并；这里只描述已核对的一个正确核心游戏、错误过程单例。");
}

const candidatePath = path.join(buildDir, "evaluation-slides-15-v3.candidate.pptx");
await (await PresentationFile.exportPptx(ppt)).save(candidatePath);
const result = await finalizePresentation({
  explicitTotalSlideCount: 5, requiredNativeTableOwnerSlides: [], requiredNativeChartOwnerSlides: [],
  workspaceDir, candidatePath, finalPath, pythonExecutable: RUNTIME_PYTHON,
  integrityValidatorPath: path.join(SKILL_DIR, "container_tools/inspect_presentation_package_integrity.py"),
  layoutValidatorPath: path.join(SKILL_DIR, "container_tools/inspect_presentation_layout_geometry.py"),
  layoutArgs: ["--expected-slide-size-emu", "12192000,6858000", "--validate-heading-fit"],
  fontPolicy: { basis: "design", families: [FONT] }, verifyArtifactToolImport: true,
  receiptPath: path.join(buildDir, "evaluation-slides-15-v3.validation.json"),
});
for (let index = 0; index < 5; index++) {
  const slide = ppt.slides.getItem(index);
  const preview = await ppt.export({ slide, format: "png", scale: 1 });
  await fs.writeFile(path.join(buildDir, `slide-${index + 1}.png`), new Uint8Array(await preview.arrayBuffer()));
}
console.log(JSON.stringify({ path: finalPath, slides: 5, validation: result?.status ?? "completed" }));
