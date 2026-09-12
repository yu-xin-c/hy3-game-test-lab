import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  GameTaskOracleSchema,
  GameTaskPlanSchema,
  GameTaskSetManifestSchema,
  type GameTaskOracle,
  type GameTaskPlan
} from "../src/contracts/game-tasks";

const repositoryRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const taskRoot = resolve(repositoryRoot, "datasets/game-tasks");
const clock = {
  mode: "virtual" as const,
  start_time_ms: 1788105600000,
  setup_ms: 0
};

type State = Record<string, unknown>;
type Layer = "L1" | "L2" | "L3";
type Difficulty = "D1" | "D2" | "D3";
type Category = "action" | "puzzle" | "creative" | "simulation" | "education";
type Feature = "3d" | "camera" | "multiplayer" | "persistence" | "leaderboard" | "touch";
type Surface = "dom" | "canvas2d" | "webgl";
type Actor = "primary" | "secondary";
type Step =
  | { kind: "input"; action_id: string; advance_ms?: number }
  | { kind: "advance_time"; advance_ms: number }
  | { kind: "advance_frames"; frames: number; frame_ms?: number; sample_every?: number }
  | { kind: "reload"; actor?: Actor };
type Control = {
  action_id: string;
  actor?: Actor;
  device: "keyboard" | "mouse" | "touch" | "camera";
  key_event?: "press" | "down" | "up";
  code?: string;
  selector?: string;
  x_ratio?: number;
  y_ratio?: number;
  fixture_frame?: string;
};

type TaskConfig = {
  id: string;
  title: string;
  prefix: string;
  difficulty: Difficulty;
  rationale: string;
  category: Category;
  features: Feature[];
  environment: { pages: 1 | 2; fake_camera: boolean; persistent_storage: boolean };
  surface: Surface;
  surfaceSelector: string;
  goal: string;
  gameplay: string;
  winRule: string;
  lossRule: string;
  resetRule: string;
  interfaceNotes?: string[];
  stateFields: string[];
  eventTypes: string[];
  controls: Control[];
  mainStatement: string;
  mainObservable: string[];
  lossStatement: string;
  startState: State;
  midState: State;
  winState: State;
  lossState: State;
  resetState: State;
  midEvents: string[];
  winEvents: string[];
  lossEvents: string[];
  winScoreText: string;
  winSteps: Step[];
  midIndex: number;
  lossSteps: Step[];
  restartSteps: Step[];
  seed: number;
};

const input = (action_id: string): Step => ({ kind: "input", action_id });
const cameraInput = (action_id: string): Step => ({
  kind: "input",
  action_id,
  advance_ms: 600
});
const time = (advance_ms: number): Step => ({ kind: "advance_time", advance_ms });
const reload = (actor: Actor = "primary"): Step => ({ kind: "reload", actor });

const mouse = (action_id: string, selector: string, actor?: Actor): Control => ({
  action_id,
  ...(actor ? { actor } : {}),
  device: "mouse",
  selector
});
const touch = (action_id: string, selector: string): Control => ({
  action_id,
  device: "touch",
  selector
});
const key = (
  action_id: string,
  code: string,
  actor?: Actor,
  key_event: "press" | "down" | "up" = "press"
): Control => ({
  action_id,
  ...(actor ? { actor } : {}),
  device: "keyboard",
  code,
  key_event
});
const camera = (action_id: string, fixture_frame: string): Control => ({
  action_id,
  device: "camera",
  fixture_frame
});

const coreTasks: TaskConfig[] = [
  {
    id: "fruit-slice-touch",
    title: "Fruit Slice Touch",
    prefix: "FS",
    difficulty: "D1",
    rationale: "触控目标、炸弹惩罚和明确终局可以直接复现。",
    category: "action",
    features: ["touch"],
    environment: { pages: 1, fake_camera: false, persistent_storage: false },
    surface: "dom",
    surfaceSelector: "#playfield",
    goal: "在不碰炸弹的情况下切中 5 个水果。",
    gameplay: "开始后一次只出现一个可触控水果；切中后得 10 分并出现下一个。炸弹是独立触控目标，碰到会扣 1 条生命。",
    winRule: "切中第 5 个水果时立即获胜，最终分数为 50。",
    lossRule: "初始 3 条生命，碰到第 3 个炸弹时立即失败。",
    resetRule: "Restart 返回菜单，恢复 0 分、3 条生命和 5 个剩余水果。",
    stateFields: ["status", "score", "lives", "sliced", "remaining"],
    eventTypes: ["game_started", "fruit_sliced", "bomb_hit", "game_won", "game_lost", "game_reset"],
    controls: [
      touch("START", "#start-btn"),
      touch("SLICE", "#fruit"),
      touch("BOMB", "#bomb"),
      touch("RESTART", "#restart-btn")
    ],
    mainStatement: "触控水果每次只计 10 分，切中五个水果获胜。",
    mainObservable: ["score", "sliced", "remaining", "fruit_sliced"],
    lossStatement: "三次触碰炸弹会扣光生命并失败。",
    startState: { status: "playing", score: 0, lives: 3, sliced: 0, remaining: 5 },
    midState: { status: "playing", score: 10, lives: 3, sliced: 1, remaining: 4 },
    winState: { status: "won", score: 50, lives: 3, sliced: 5, remaining: 0 },
    lossState: { status: "lost", score: 0, lives: 0, sliced: 0, remaining: 5 },
    resetState: { status: "menu", score: 0, lives: 3, sliced: 0, remaining: 5 },
    midEvents: ["fruit_sliced"],
    winEvents: ["fruit_sliced", "game_won"],
    lossEvents: ["bomb_hit", "game_lost"],
    winScoreText: "Score: 50",
    winSteps: [input("START"), input("SLICE"), input("SLICE"), input("SLICE"), input("SLICE"), input("SLICE")],
    midIndex: 1,
    lossSteps: [input("START"), input("BOMB"), input("BOMB"), input("BOMB")],
    restartSteps: [input("START"), input("SLICE"), input("RESTART")],
    seed: 601
  },
  {
    id: "neon-lane-racer",
    title: "Neon Lane Racer",
    prefix: "NR",
    difficulty: "D3",
    rationale: "WebGL 场景、离散车道和虚拟时间共同决定碰撞与终局。",
    category: "action",
    features: ["3d"],
    environment: { pages: 1, fake_camera: false, persistent_storage: false },
    surface: "webgl",
    surfaceSelector: "#game-canvas",
    goal: "在三车道霓虹赛道上避开四个障碍并坚持到 5 秒终点。",
    gameplay: "赛车从中间车道 1 出发。左右键每次移动一条车道。障碍依次在 1000ms 的车道1、2000ms 的车道0、3000ms 的车道1、4000ms 的车道2 出现。每躲过一个得 100 分。",
    winRule: "无碰撞到达 5000ms 时获胜，最终 500 分。",
    lossRule: "任意一次在障碍出现时位于同一车道立即失败。",
    resetRule: "Restart 回到车道1、0ms、0分和菜单。",
    stateFields: ["status", "lane", "elapsed_ms", "passed", "collisions", "score"],
    eventTypes: ["game_started", "lane_changed", "obstacle_passed", "car_crashed", "game_won", "game_reset"],
    controls: [mouse("START", "#start-btn"), key("LEFT", "ArrowLeft"), key("RIGHT", "ArrowRight"), mouse("RESTART", "#restart-btn")],
    mainStatement: "虚拟时间中的车道移动、障碍通过和得分必须按固定时刻一致更新。",
    mainObservable: ["lane", "elapsed_ms", "passed", "score", "events"],
    lossStatement: "障碍出现时同车道碰撞会立即失败。",
    startState: { status: "playing", lane: 1, elapsed_ms: 0, passed: 0, collisions: 0, score: 0 },
    midState: { status: "playing", lane: 1, elapsed_ms: 2000, passed: 2, collisions: 0, score: 200 },
    winState: { status: "won", lane: 1, elapsed_ms: 5000, passed: 4, collisions: 0, score: 500 },
    lossState: { status: "lost", lane: 1, elapsed_ms: 1000, passed: 0, collisions: 1, score: 0 },
    resetState: { status: "menu", lane: 1, elapsed_ms: 0, passed: 0, collisions: 0, score: 0 },
    midEvents: ["obstacle_passed"],
    winEvents: ["game_won"],
    lossEvents: ["car_crashed"],
    winScoreText: "Score: 500",
    winSteps: [input("START"), input("LEFT"), time(1000), input("RIGHT"), time(1000), input("RIGHT"), time(1000), input("LEFT"), time(2000)],
    midIndex: 4,
    lossSteps: [input("START"), time(1000)],
    restartSteps: [input("START"), input("LEFT"), input("RESTART")],
    seed: 602
  },
  {
    id: "dual-arena",
    title: "Dual Arena",
    prefix: "DA",
    difficulty: "D3",
    rationale: "两个页面必须同步房间、回合状态和同一个终局。",
    category: "action",
    features: ["multiplayer"],
    environment: { pages: 2, fake_camera: false, persistent_storage: false },
    surface: "canvas2d",
    surfaceSelector: "#arena",
    goal: "两个本地页面加入同一房间，先走到第 3 格的玩家获胜。",
    gameplay: "主页面创建固定房间，副页面加入。P1 用 D 前进，P2 用 L 前进；每次只前进一格，并通过 BroadcastChannel 同步到两个页面。",
    winRule: "任一玩家位置首次到 3 时比赛结束；主页面按 P1 的结果显示 won 或 lost。",
    lossRule: "P2 先到 3 时，主页面显示 lost，两个页面的 winner 都是 secondary。",
    resetRule: "主页面 Restart 会同步清空双方位置和连接状态并回到菜单。",
    stateFields: ["status", "connected", "p1_position", "p2_position", "winner"],
    eventTypes: ["room_created", "player_joined", "player_moved", "match_won", "game_reset"],
    controls: [
      mouse("START", "#start-btn", "primary"),
      mouse("JOIN", "#join-btn", "secondary"),
      key("P1_STEP", "KeyD", "primary"),
      key("P2_STEP", "KeyL", "secondary"),
      mouse("RESTART", "#restart-btn", "primary")
    ],
    mainStatement: "两个页面的连接、双方位置和胜者必须实时保持一致。",
    mainObservable: ["connected", "p1_position", "p2_position", "winner", "events"],
    lossStatement: "副玩家先到终点时主页面必须判负。",
    startState: { status: "playing", connected: 1, p1_position: 0, p2_position: 0, winner: null },
    midState: { status: "playing", connected: 2, p1_position: 1, p2_position: 0, winner: null },
    winState: { status: "won", connected: 2, p1_position: 3, p2_position: 0, winner: "primary" },
    lossState: { status: "lost", connected: 2, p1_position: 0, p2_position: 3, winner: "secondary" },
    resetState: { status: "menu", connected: 0, p1_position: 0, p2_position: 0, winner: null },
    midEvents: ["player_moved"],
    winEvents: ["player_moved", "match_won"],
    lossEvents: ["player_moved", "match_won"],
    winScoreText: "P1: 3 · P2: 0",
    winSteps: [input("START"), input("JOIN"), input("P1_STEP"), input("P1_STEP"), input("P1_STEP")],
    midIndex: 2,
    lossSteps: [input("START"), input("JOIN"), input("P2_STEP"), input("P2_STEP"), input("P2_STEP")],
    restartSteps: [input("START"), input("JOIN"), input("P1_STEP"), input("RESTART")],
    seed: 603
  },
  {
    id: "meteor-survivor",
    title: "Meteor Survivor",
    prefix: "MS",
    difficulty: "D2",
    rationale: "固定时间波次、躲避输入和局内榜单需要同步计算。",
    category: "action",
    features: ["leaderboard"],
    environment: { pages: 1, fake_camera: false, persistent_storage: false },
    surface: "canvas2d",
    surfaceSelector: "#game-canvas",
    goal: "在三条轨道中躲过 5 秒流星雨并刷新本局榜单。",
    gameplay: "玩家从轨道1开始。1000/2000/3000/4000ms 的流星依次落在轨道1/0/2/1。每躲过一波得 100 分，生存到 5000ms 再得 100 分。",
    winRule: "无碰撞坚持到 5000ms 获胜，得 500 分并把 best_score 更新为 500。",
    lossRule: "与任一流星同轨时立即失败。",
    resetRule: "Restart 清空当前局；新的评测场景从空榜单开始。",
    stateFields: ["status", "lane", "elapsed_ms", "wave", "score", "best_score"],
    eventTypes: ["game_started", "lane_changed", "wave_survived", "meteor_hit", "leaderboard_updated", "game_won", "game_reset"],
    controls: [mouse("START", "#start-btn"), key("LEFT", "ArrowLeft"), key("RIGHT", "ArrowRight"), mouse("RESTART", "#restart-btn")],
    mainStatement: "按固定波次躲避会推进 wave、score 和 best_score。",
    mainObservable: ["lane", "elapsed_ms", "wave", "score", "best_score"],
    lossStatement: "玩家和流星同轨会立即失败且不能获得该波分数。",
    startState: { status: "playing", lane: 1, elapsed_ms: 0, wave: 0, score: 0, best_score: 0 },
    midState: { status: "playing", lane: 0, elapsed_ms: 3000, wave: 3, score: 300, best_score: 300 },
    winState: { status: "won", lane: 0, elapsed_ms: 5000, wave: 4, score: 500, best_score: 500 },
    lossState: { status: "lost", lane: 1, elapsed_ms: 1000, wave: 1, score: 0, best_score: 0 },
    resetState: { status: "menu", lane: 1, elapsed_ms: 0, wave: 0, score: 0, best_score: 0 },
    midEvents: ["wave_survived", "leaderboard_updated"],
    winEvents: ["game_won", "leaderboard_updated"],
    lossEvents: ["meteor_hit"],
    winScoreText: "Score: 500 · Best: 500",
    winSteps: [input("START"), input("RIGHT"), time(1000), input("LEFT"), time(1000), input("LEFT"), time(1000), time(1000), time(1000)],
    midIndex: 6,
    lossSteps: [input("START"), time(1000)],
    restartSteps: [input("START"), input("RIGHT"), input("RESTART")],
    seed: 604
  },
  {
    id: "gesture-goalie",
    title: "Gesture Goalie",
    prefix: "GG",
    difficulty: "D3",
    rationale: "固定摄像头画面必须被识别成动作并正确驱动三轮守门。",
    category: "action",
    features: ["camera"],
    environment: { pages: 1, fake_camera: true, persistent_storage: false },
    surface: "canvas2d",
    surfaceSelector: "#game-canvas",
    goal: "用摄像头中的左右和居中手势连续扑出 3 个点球。",
    gameplay: "评测器提供三种固定摄像头画面：left-pose 的蓝色标记在左三分区，center-pose 的绿色标记在中间，right-pose 的红色标记在右三分区。每换一帧就识别一次守门位置。三次射门方向固定为左、右、中。",
    winRule: "三次方向都匹配时获胜，saves 为 3。",
    lossRule: "初始 2 条生命，方向不匹配扣 1 条；第二次失误时失败。",
    resetRule: "Restart 恢复第 0 球、0 次扑救、2 条生命和菜单。",
    interfaceNotes: ["必须真正调用 getUserMedia 读取评测器提供的假视频，不能用键盘代替手势。"],
    stateFields: ["status", "shot_index", "saves", "lives", "keeper_pose"],
    eventTypes: ["camera_ready", "pose_detected", "shot_saved", "shot_missed", "game_won", "game_lost", "game_reset"],
    controls: [mouse("START", "#start-btn"), camera("SHOW_LEFT", "left-pose"), camera("SHOW_CENTER", "center-pose"), camera("SHOW_RIGHT", "right-pose"), mouse("RESTART", "#restart-btn")],
    mainStatement: "固定摄像头帧必须识别为正确守门位置并推进射门。",
    mainObservable: ["shot_index", "saves", "keeper_pose", "pose_detected"],
    lossStatement: "两次错误守门会扣光生命并失败。",
    startState: { status: "playing", shot_index: 0, saves: 0, lives: 2, keeper_pose: "center" },
    midState: { status: "playing", shot_index: 1, saves: 1, lives: 2, keeper_pose: "left" },
    winState: { status: "won", shot_index: 3, saves: 3, lives: 2, keeper_pose: "center" },
    lossState: { status: "lost", shot_index: 2, saves: 0, lives: 0, keeper_pose: "left" },
    resetState: { status: "menu", shot_index: 0, saves: 0, lives: 2, keeper_pose: "center" },
    midEvents: ["pose_detected", "shot_saved"],
    winEvents: ["pose_detected", "shot_saved", "game_won"],
    lossEvents: ["pose_detected", "shot_missed", "game_lost"],
    winScoreText: "Saves: 3/3",
    winSteps: [input("START"), cameraInput("SHOW_LEFT"), cameraInput("SHOW_RIGHT"), cameraInput("SHOW_CENTER")],
    midIndex: 1,
    lossSteps: [input("START"), cameraInput("SHOW_CENTER"), cameraInput("SHOW_LEFT")],
    restartSteps: [input("START"), cameraInput("SHOW_LEFT"), input("RESTART")],
    seed: 605
  },
  {
    id: "room-five-in-row",
    title: "Room Five in a Row",
    prefix: "FR",
    difficulty: "D2",
    rationale: "两个页面交替落子并同步棋盘、回合和胜负。",
    category: "puzzle",
    features: ["multiplayer"],
    environment: { pages: 2, fake_camera: false, persistent_storage: false },
    surface: "dom",
    surfaceSelector: "#board",
    goal: "两个本地页面完成一局 5×5 五子棋。",
    gameplay: "主页面创建房间，副页面加入。P1 与 P2 严格轮流落子。P1 测试路径在第0行从左到右落五子；P2 在第4行从左到右落四子。",
    winRule: "任一方横、竖或斜线连续五子立即结束；主页面按 P1 结果显示 won 或 lost。",
    lossRule: "P2 先连成五子时主页面显示 lost。",
    resetRule: "主页面 Restart 同步清空棋盘、回合、步数和房间状态。",
    stateFields: ["status", "connected", "turn", "moves", "winner", "board"],
    eventTypes: ["room_created", "player_joined", "piece_placed", "turn_changed", "match_won", "game_reset"],
    controls: [
      mouse("START", "#start-btn", "primary"), mouse("JOIN", "#join-btn", "secondary"),
      ...[0, 1, 2, 3, 4].map((column) => mouse(`P1_C${column}`, `#cell-r0-c${column}`, "primary")),
      ...[0, 1, 2, 3, 4].map((column) => mouse(`P2_C${column}`, `#cell-r4-c${column}`, "secondary")),
      mouse("RESTART", "#restart-btn", "primary")
    ],
    mainStatement: "两页棋盘、当前回合和落子结果必须同步，五连时立即结束。",
    mainObservable: ["connected", "turn", "moves", "winner", "board"],
    lossStatement: "P2 先形成五连时主页面必须判负。",
    startState: { status: "playing", connected: 1, turn: "primary", moves: 0, winner: null },
    midState: { status: "playing", connected: 2, turn: "secondary", moves: 5, winner: null, "board.0.2": "primary" },
    winState: { status: "won", connected: 2, turn: "primary", moves: 9, winner: "primary", "board.0.4": "primary" },
    lossState: { status: "lost", connected: 2, turn: "secondary", moves: 10, winner: "secondary", "board.4.4": "secondary" },
    resetState: { status: "menu", connected: 0, turn: "primary", moves: 0, winner: null },
    midEvents: ["piece_placed", "turn_changed"],
    winEvents: ["piece_placed", "match_won"],
    lossEvents: ["piece_placed", "match_won"],
    winScoreText: "P1: 5 · P2: 4",
    winSteps: [input("START"), input("JOIN"), input("P1_C0"), input("P2_C0"), input("P1_C1"), input("P2_C1"), input("P1_C2"), input("P2_C2"), input("P1_C3"), input("P2_C3"), input("P1_C4")],
    midIndex: 6,
    lossSteps: [input("START"), input("JOIN"), input("P1_C0"), input("P2_C0"), input("P1_C1"), input("P2_C1"), input("P1_C2"), input("P2_C2"), input("P1_C3"), input("P2_C3"), input("P1_C4"), input("P2_C4")],
    restartSteps: [input("START"), input("JOIN"), input("P1_C0"), input("RESTART")],
    seed: 606
  },
  {
    id: "persistent-2048",
    title: "Persistent 2048",
    prefix: "P2",
    difficulty: "D2",
    rationale: "确定性合并规则与真实刷新后的存档一致性都需要验证。",
    category: "puzzle",
    features: ["persistence"],
    environment: { pages: 1, fake_camera: false, persistent_storage: true },
    surface: "dom",
    surfaceSelector: "#board",
    goal: "在两次滑动内把固定棋盘合成数字 8，并在中途刷新后继续。",
    gameplay: "初始第0行为 [2,2,0,0]，第1行为 [4,0,0,0]，其余为0；不生成随机新块。每次方向输入都计一次 moves 并立即保存。右滑后两个4位于第0、1行最右列；刷新后该状态必须恢复。",
    winRule: "第二步向下合出 8 时获胜。",
    lossRule: "两次输入后最大数字仍小于 8 则失败。",
    resetRule: "Restart 清除存档并恢复原始棋盘和菜单。",
    stateFields: ["status", "grid", "moves", "max_tile", "saved"],
    eventTypes: ["game_started", "swipe", "tile_merged", "state_saved", "state_loaded", "game_won", "game_lost", "game_reset"],
    controls: [mouse("START", "#start-btn"), key("UP", "ArrowUp"), key("RIGHT", "ArrowRight"), key("DOWN", "ArrowDown"), mouse("RESTART", "#restart-btn")],
    mainStatement: "滑动、合并和刷新恢复必须产生同一棋盘与步数。",
    mainObservable: ["grid", "moves", "max_tile", "saved", "events"],
    lossStatement: "两步后没有 8 必须失败。",
    startState: { status: "playing", moves: 0, max_tile: 4, saved: true, "grid.0.0": 2, "grid.0.1": 2, "grid.1.0": 4 },
    midState: { status: "playing", moves: 1, max_tile: 4, saved: true, "grid.0.3": 4, "grid.1.3": 4 },
    winState: { status: "won", moves: 2, max_tile: 8, saved: true, "grid.3.3": 8 },
    lossState: { status: "lost", moves: 2, max_tile: 4, saved: true, "grid.0.0": 2, "grid.0.1": 2, "grid.1.0": 4 },
    resetState: { status: "menu", moves: 0, max_tile: 4, saved: false, "grid.0.0": 2, "grid.0.1": 2, "grid.1.0": 4 },
    midEvents: ["state_loaded"],
    winEvents: ["tile_merged", "state_saved", "game_won"],
    lossEvents: ["swipe", "state_saved", "game_lost"],
    winScoreText: "Max: 8",
    winSteps: [input("START"), input("RIGHT"), reload(), input("DOWN")],
    midIndex: 2,
    lossSteps: [input("START"), input("UP"), input("UP")],
    restartSteps: [input("START"), input("RIGHT"), reload(), input("RESTART")],
    seed: 607
  },
  {
    id: "particle-orchestra",
    title: "Particle Orchestra",
    prefix: "PO",
    difficulty: "D3",
    rationale: "WebGL 粒子反馈、输入序列和错误恢复需要跨层一致。",
    category: "creative",
    features: ["3d"],
    environment: { pages: 1, fake_camera: false, persistent_storage: false },
    surface: "webgl",
    surfaceSelector: "#game-canvas",
    goal: "按 A、C、D、B 的顺序点亮四组粒子音轨。",
    gameplay: "数字键1/2/3/4分别触发 A/B/C/D 粒子簇。正确输入推进 progress 并增加25分；错误输入清空 progress、扣一次 attempts，但继续当前局。",
    winRule: "完整输入 A、C、D、B 时获胜并得到100分。",
    lossRule: "初始3次 attempts，第三次错误后失败。",
    resetRule: "Restart 清空进度和分数，恢复3次机会并回到菜单。",
    stateFields: ["status", "sequence", "progress", "score", "attempts", "active_cluster"],
    eventTypes: ["game_started", "cluster_triggered", "note_correct", "note_wrong", "progress_reset", "game_won", "game_lost", "game_reset"],
    controls: [mouse("START", "#start-btn"), key("A", "Digit1"), key("B", "Digit2"), key("C", "Digit3"), key("D", "Digit4"), mouse("RESTART", "#restart-btn")],
    mainStatement: "正确粒子音轨序列必须逐步推进进度和分数。",
    mainObservable: ["sequence", "progress", "score", "active_cluster", "events"],
    lossStatement: "三次错误输入会清空机会并失败。",
    startState: { status: "playing", progress: 0, score: 0, attempts: 3, active_cluster: null },
    midState: { status: "playing", progress: 1, score: 25, attempts: 3, active_cluster: "A" },
    winState: { status: "won", progress: 4, score: 100, attempts: 3, active_cluster: "B" },
    lossState: { status: "lost", progress: 0, score: 0, attempts: 0, active_cluster: "B" },
    resetState: { status: "menu", progress: 0, score: 0, attempts: 3, active_cluster: null },
    midEvents: ["cluster_triggered", "note_correct"],
    winEvents: ["cluster_triggered", "note_correct", "game_won"],
    lossEvents: ["cluster_triggered", "note_wrong", "progress_reset", "game_lost"],
    winScoreText: "Score: 100",
    winSteps: [input("START"), input("A"), input("C"), input("D"), input("B")],
    midIndex: 1,
    lossSteps: [input("START"), input("B"), input("B"), input("B")],
    restartSteps: [input("START"), input("A"), input("RESTART")],
    seed: 608
  },
  {
    id: "gesture-fireworks",
    title: "Gesture Fireworks",
    prefix: "GF",
    difficulty: "D3",
    rationale: "摄像头手势、Canvas 反馈和序列状态共同决定结果。",
    category: "creative",
    features: ["camera"],
    environment: { pages: 1, fake_camera: true, persistent_storage: false },
    surface: "canvas2d",
    surfaceSelector: "#game-canvas",
    goal: "用三种摄像头手势依次放出蓝、红、金三束烟花。",
    gameplay: "评测器提供 swipe-up-blue、circle-red、open-gold 和 fist-wrong 四段固定假视频。前三段分别包含蓝色上划轨迹、红色圆环和金色五指轮廓。游戏必须读取视频像素识别它们。正确顺序为蓝上划、红圆环、金开掌。",
    winRule: "依次识别三种正确手势时获胜，launches 为3。",
    lossRule: "错误手势会清空 progress 并扣1条生命；初始2条生命，第二次错误后失败。",
    resetRule: "Restart 恢复0进度、0次发射、2条生命和菜单。",
    interfaceNotes: ["必须调用 getUserMedia；每段假视频稳定显示至少500ms，识别去抖后每段只计一次。"],
    stateFields: ["status", "progress", "launches", "lives", "last_gesture"],
    eventTypes: ["camera_ready", "gesture_detected", "firework_launched", "gesture_wrong", "progress_reset", "game_won", "game_lost", "game_reset"],
    controls: [mouse("START", "#start-btn"), camera("BLUE", "swipe-up-blue"), camera("RED", "circle-red"), camera("GOLD", "open-gold"), camera("WRONG", "fist-wrong"), mouse("RESTART", "#restart-btn")],
    mainStatement: "三段固定假视频必须被识别为正确手势并按序发射烟花。",
    mainObservable: ["progress", "launches", "last_gesture", "events"],
    lossStatement: "两次错误手势会扣光生命并失败。",
    startState: { status: "playing", progress: 0, launches: 0, lives: 2, last_gesture: null },
    midState: { status: "playing", progress: 1, launches: 1, lives: 2, last_gesture: "blue" },
    winState: { status: "won", progress: 3, launches: 3, lives: 2, last_gesture: "gold" },
    lossState: { status: "lost", progress: 0, launches: 0, lives: 0, last_gesture: "wrong" },
    resetState: { status: "menu", progress: 0, launches: 0, lives: 2, last_gesture: null },
    midEvents: ["gesture_detected", "firework_launched"],
    winEvents: ["gesture_detected", "firework_launched", "game_won"],
    lossEvents: ["gesture_detected", "gesture_wrong", "progress_reset", "game_lost"],
    winScoreText: "Fireworks: 3/3",
    winSteps: [input("START"), cameraInput("BLUE"), cameraInput("RED"), cameraInput("GOLD")],
    midIndex: 1,
    lossSteps: [input("START"), cameraInput("WRONG"), cameraInput("WRONG")],
    restartSteps: [input("START"), cameraInput("BLUE"), input("RESTART")],
    seed: 609
  },
  {
    id: "photo-orbit-gallery",
    title: "Photo Orbit Gallery",
    prefix: "PG",
    difficulty: "D3",
    rationale: "WebGL 相册导航、循环索引和有序选择必须一致。",
    category: "creative",
    features: ["3d"],
    environment: { pages: 1, fake_camera: false, persistent_storage: false },
    surface: "webgl",
    surfaceSelector: "#gallery-canvas",
    goal: "在旋转照片球中依次找到 Mars、Ocean、Forest。",
    gameplay: "四张本地生成纹理按 Forest、City、Mars、Ocean 排列，初始选中 Forest。左右方向键循环移动焦点，Enter 确认。正确确认推进 progress；错误确认增加 mistakes。",
    winRule: "按 Mars、Ocean、Forest 的顺序确认三张照片时获胜。",
    lossRule: "第二次错误确认时失败。",
    resetRule: "Restart 恢复 Forest 焦点、空选择和0次错误。",
    stateFields: ["status", "focus_index", "focus_name", "selected", "progress", "mistakes"],
    eventTypes: ["game_started", "focus_changed", "photo_selected", "selection_wrong", "game_won", "game_lost", "game_reset"],
    controls: [mouse("START", "#start-btn"), key("NEXT", "ArrowRight"), key("PREV", "ArrowLeft"), key("SELECT", "Enter"), mouse("RESTART", "#restart-btn")],
    mainStatement: "循环导航和有序照片确认必须正确更新焦点与选择列表。",
    mainObservable: ["focus_index", "focus_name", "selected", "progress", "events"],
    lossStatement: "两次错误确认会失败。",
    startState: { status: "playing", focus_index: 0, focus_name: "Forest", selected: [], progress: 0, mistakes: 0 },
    midState: { status: "playing", focus_index: 2, focus_name: "Mars", selected: ["Mars"], progress: 1, mistakes: 0 },
    winState: { status: "won", focus_index: 0, focus_name: "Forest", selected: ["Mars", "Ocean", "Forest"], progress: 3, mistakes: 0 },
    lossState: { status: "lost", focus_index: 1, focus_name: "City", selected: [], progress: 0, mistakes: 2 },
    resetState: { status: "menu", focus_index: 0, focus_name: "Forest", selected: [], progress: 0, mistakes: 0 },
    midEvents: ["photo_selected"],
    winEvents: ["photo_selected", "game_won"],
    lossEvents: ["selection_wrong", "game_lost"],
    winScoreText: "Found: 3/3",
    winSteps: [input("START"), input("NEXT"), input("NEXT"), input("SELECT"), input("NEXT"), input("SELECT"), input("NEXT"), input("SELECT")],
    midIndex: 3,
    lossSteps: [input("START"), input("NEXT"), input("SELECT"), input("SELECT")],
    restartSteps: [input("START"), input("NEXT"), input("RESTART")],
    seed: 610
  },
  {
    id: "pet-care-day",
    title: "Pet Care Day",
    prefix: "PC",
    difficulty: "D1",
    rationale: "三项需求值和刷新后的存档结果都能用短路径验证。",
    category: "simulation",
    features: ["persistence"],
    environment: { pages: 1, fake_camera: false, persistent_storage: true },
    surface: "dom",
    surfaceSelector: "#pet-room",
    goal: "在一天内把宠物的饱腹、快乐和精力都提升到3。",
    gameplay: "初始 hunger、happiness、energy 都是2。Feed、Play、Sleep 分别把对应值加1，最大为3，并立即写入 localStorage。刷新后必须恢复当前进度。",
    winRule: "三个值都到3时立即完成一天并获胜。",
    lossRule: "游戏中每2000ms三项各减1；任一项降到0时失败。",
    resetRule: "Restart 清除当前存档，恢复三项为2并回到菜单。",
    stateFields: ["status", "hunger", "happiness", "energy", "actions", "saved"],
    eventTypes: ["game_started", "pet_fed", "pet_played", "pet_slept", "need_decayed", "state_saved", "state_loaded", "game_won", "game_lost", "game_reset"],
    controls: [mouse("START", "#start-btn"), mouse("FEED", "#feed-btn"), mouse("PLAY", "#play-btn"), mouse("SLEEP", "#sleep-btn"), mouse("RESTART", "#restart-btn")],
    mainStatement: "照料动作和刷新恢复必须保持三项需求值及进度一致。",
    mainObservable: ["hunger", "happiness", "energy", "actions", "saved"],
    lossStatement: "时间推进导致任一需求值降到0时必须失败。",
    startState: { status: "playing", hunger: 2, happiness: 2, energy: 2, actions: 0, saved: true },
    midState: { status: "playing", hunger: 3, happiness: 2, energy: 2, actions: 1, saved: true },
    winState: { status: "won", hunger: 3, happiness: 3, energy: 3, actions: 3, saved: true },
    lossState: { status: "lost", hunger: 0, happiness: 0, energy: 0, actions: 0, saved: true },
    resetState: { status: "menu", hunger: 2, happiness: 2, energy: 2, actions: 0, saved: false },
    midEvents: ["state_loaded"],
    winEvents: ["pet_slept", "state_saved", "game_won"],
    lossEvents: ["need_decayed", "game_lost"],
    winScoreText: "Needs: 3/3/3",
    winSteps: [input("START"), input("FEED"), reload(), input("PLAY"), input("SLEEP")],
    midIndex: 2,
    lossSteps: [input("START"), time(6000)],
    restartSteps: [input("START"), input("FEED"), reload(), input("RESTART")],
    seed: 611
  },
  {
    id: "mini-farm",
    title: "Mini Farm",
    prefix: "MF",
    difficulty: "D2",
    rationale: "三块田、成长计时、刷新存档和金币榜单形成完整经营链。",
    category: "simulation",
    features: ["persistence", "leaderboard"],
    environment: { pages: 1, fake_camera: false, persistent_storage: true },
    surface: "canvas2d",
    surfaceSelector: "#farm-canvas",
    goal: "在15秒内种植、浇水并收获三块田，获得30金币。",
    gameplay: "点击 PLOT1/2/3 选择田地；Plant 后变为 planted，Water 后变为 growing，虚拟时间累计3000ms后变为 ready，Harvest 得10金币。每次状态变化立即保存，刷新后继续。",
    winRule: "三块田各收获一次后获胜，coins 和 best_coins 都为30。",
    lossRule: "从 Start 起15000ms仍未收获三块田则失败。",
    resetRule: "Restart 清空当前田地、计时和金币；评测新场景从空榜单开始。",
    stateFields: ["status", "selected_plot", "plots", "elapsed_ms", "harvested", "coins", "best_coins", "saved"],
    eventTypes: ["game_started", "plot_selected", "crop_planted", "crop_watered", "crop_ready", "crop_harvested", "state_saved", "state_loaded", "leaderboard_updated", "game_won", "game_lost", "game_reset"],
    controls: [mouse("START", "#start-btn"), mouse("PLOT1", "#plot-1"), mouse("PLOT2", "#plot-2"), mouse("PLOT3", "#plot-3"), mouse("PLANT", "#plant-btn"), mouse("WATER", "#water-btn"), mouse("HARVEST", "#harvest-btn"), mouse("RESTART", "#restart-btn")],
    mainStatement: "选地、种植、浇水、成长、收获和刷新恢复必须形成同一经营状态。",
    mainObservable: ["plots", "elapsed_ms", "harvested", "coins", "best_coins", "saved"],
    lossStatement: "15秒内未完成三次收获必须失败。",
    startState: { status: "playing", selected_plot: 1, elapsed_ms: 0, harvested: 0, coins: 0, best_coins: 0, saved: true },
    midState: { status: "playing", selected_plot: 1, elapsed_ms: 0, harvested: 0, coins: 0, best_coins: 0, saved: true, "plots.0.state": "growing" },
    winState: { status: "won", selected_plot: 3, elapsed_ms: 9000, harvested: 3, coins: 30, best_coins: 30, saved: true },
    lossState: { status: "lost", elapsed_ms: 15000, harvested: 0, coins: 0, best_coins: 0, saved: true },
    resetState: { status: "menu", selected_plot: 1, elapsed_ms: 0, harvested: 0, coins: 0, best_coins: 0, saved: false },
    midEvents: ["state_loaded"],
    winEvents: ["crop_harvested", "leaderboard_updated", "game_won"],
    lossEvents: ["game_lost"],
    winScoreText: "Coins: 30 · Best: 30",
    winSteps: [input("START"), input("PLOT1"), input("PLANT"), input("WATER"), reload(), time(3000), input("HARVEST"), input("PLOT2"), input("PLANT"), input("WATER"), time(3000), input("HARVEST"), input("PLOT3"), input("PLANT"), input("WATER"), time(3000), input("HARVEST")],
    midIndex: 4,
    lossSteps: [input("START"), time(15000)],
    restartSteps: [input("START"), input("PLOT1"), input("PLANT"), input("RESTART")],
    seed: 612
  },
  {
    id: "cooperative-city",
    title: "Cooperative City",
    prefix: "CC",
    difficulty: "D3",
    rationale: "两页协作、资源建设、双方确认和共享倒计时必须同步。",
    category: "simulation",
    features: ["multiplayer"],
    environment: { pages: 2, fake_camera: false, persistent_storage: false },
    surface: "dom",
    surfaceSelector: "#city",
    goal: "两名玩家在10秒内共同建成2级供电和2级供水，并分别确认。",
    gameplay: "主页面创建城市，副页面加入。P1 只能建 Power，每次加1；P2 只能建 Water，每次加1。达到 power=2、water=2 后，两页各点一次 Approve。所有状态通过 BroadcastChannel 同步。",
    winRule: "两项资源都为2且 approvals 为2时获胜。",
    lossRule: "虚拟时间到10000ms仍未满足条件时，两页同时失败。",
    resetRule: "主页面 Restart 同步清空资源、确认、计时和连接并回到菜单。",
    stateFields: ["status", "connected", "power", "water", "approvals", "elapsed_ms"],
    eventTypes: ["city_created", "player_joined", "power_built", "water_built", "plan_approved", "city_completed", "game_lost", "game_reset"],
    controls: [mouse("START", "#start-btn", "primary"), mouse("JOIN", "#join-btn", "secondary"), mouse("BUILD_POWER", "#power-btn", "primary"), mouse("BUILD_WATER", "#water-btn", "secondary"), mouse("APPROVE_P1", "#approve-btn", "primary"), mouse("APPROVE_P2", "#approve-btn", "secondary"), mouse("RESTART", "#restart-btn", "primary")],
    mainStatement: "两个页面必须同步建设资源与确认状态，并在条件满足时同时结束。",
    mainObservable: ["connected", "power", "water", "approvals", "elapsed_ms"],
    lossStatement: "10秒内协作未完成时两个页面必须同时失败。",
    startState: { status: "playing", connected: 1, power: 0, water: 0, approvals: 0, elapsed_ms: 0 },
    midState: { status: "playing", connected: 2, power: 2, water: 0, approvals: 0, elapsed_ms: 0 },
    winState: { status: "won", connected: 2, power: 2, water: 2, approvals: 2, elapsed_ms: 0 },
    lossState: { status: "lost", connected: 2, power: 0, water: 0, approvals: 0, elapsed_ms: 10000 },
    resetState: { status: "menu", connected: 0, power: 0, water: 0, approvals: 0, elapsed_ms: 0 },
    midEvents: ["power_built"],
    winEvents: ["plan_approved", "city_completed"],
    lossEvents: ["game_lost"],
    winScoreText: "Power: 2 · Water: 2",
    winSteps: [input("START"), input("JOIN"), input("BUILD_POWER"), input("BUILD_POWER"), input("BUILD_WATER"), input("BUILD_WATER"), input("APPROVE_P1"), input("APPROVE_P2")],
    midIndex: 3,
    lossSteps: [input("START"), input("JOIN"), time(10000)],
    restartSteps: [input("START"), input("JOIN"), input("BUILD_POWER"), input("RESTART")],
    seed: 613
  },
  {
    id: "math-quest",
    title: "Math Quest",
    prefix: "MQ",
    difficulty: "D1",
    rationale: "固定题序、答案和错误次数构成短而明确的知识闯关。",
    category: "education",
    features: [],
    environment: { pages: 1, fake_camera: false, persistent_storage: false },
    surface: "dom",
    surfaceSelector: "#quiz",
    goal: "依次答对三道固定数学题。",
    gameplay: "题目固定为：7+5（A=11/B=12/C=13）；9×3（A=18/B=21/C=27）；18÷3（A=6/B=7/C=8）。答对加10分并进入下一题，答错增加 mistakes 但仍进入下一题。",
    winRule: "三题全部答对时获胜，score 为30。",
    lossRule: "第二次答错时立即失败。",
    resetRule: "Restart 恢复第一题、0分和0次错误。",
    stateFields: ["status", "question_index", "score", "mistakes", "last_answer"],
    eventTypes: ["game_started", "answer_correct", "answer_wrong", "question_changed", "game_won", "game_lost", "game_reset"],
    controls: [mouse("START", "#start-btn"), mouse("ANSWER_A", "#answer-a"), mouse("ANSWER_B", "#answer-b"), mouse("ANSWER_C", "#answer-c"), mouse("RESTART", "#restart-btn")],
    mainStatement: "固定题序中的正确答案必须推进题号并增加10分。",
    mainObservable: ["question_index", "score", "mistakes", "last_answer", "events"],
    lossStatement: "累计两次错误答案会立即失败。",
    startState: { status: "playing", question_index: 0, score: 0, mistakes: 0, last_answer: null },
    midState: { status: "playing", question_index: 1, score: 10, mistakes: 0, last_answer: "B" },
    winState: { status: "won", question_index: 3, score: 30, mistakes: 0, last_answer: "A" },
    lossState: { status: "lost", question_index: 2, score: 0, mistakes: 2, last_answer: "A" },
    resetState: { status: "menu", question_index: 0, score: 0, mistakes: 0, last_answer: null },
    midEvents: ["answer_correct", "question_changed"],
    winEvents: ["answer_correct", "game_won"],
    lossEvents: ["answer_wrong", "game_lost"],
    winScoreText: "Score: 30/30",
    winSteps: [input("START"), input("ANSWER_B"), input("ANSWER_C"), input("ANSWER_A")],
    midIndex: 1,
    lossSteps: [input("START"), input("ANSWER_A"), input("ANSWER_A")],
    restartSteps: [input("START"), input("ANSWER_B"), input("RESTART")],
    seed: 614
  },
  {
    id: "science-lab",
    title: "Science Lab",
    prefix: "SL",
    difficulty: "D2",
    rationale: "混合顺序、持续加热和时间探针共同决定实验是否成功。",
    category: "education",
    features: [],
    environment: { pages: 1, fake_camera: false, persistent_storage: false },
    surface: "canvas2d",
    surfaceSelector: "#lab-canvas",
    goal: "配出中性溶液，把温度从20°C升到60°C、再降到40°C并装瓶。",
    gameplay: "加入 Acid 后 pH=3；再加入 Base 后 pH=7。按住 H 时每秒升温20°C，松开停止；按住 C 时每秒降温20°C，松开停止。只有 pH=7 且温度=40°C 时 Pour 才成功。",
    winRule: "按规定混合并在40°C时装瓶获胜。",
    lossRule: "温度达到80°C，或未中和就 Pour，立即失败。",
    resetRule: "Restart 恢复空烧杯、pH=7、20°C、加热关闭和菜单。",
    stateFields: ["status", "acid_added", "base_added", "ph", "temperature", "heating", "cooling", "bottled"],
    eventTypes: ["game_started", "acid_added", "base_added", "heater_started", "heater_stopped", "cooler_started", "cooler_stopped", "temperature_changed", "solution_bottled", "experiment_failed", "game_won", "game_reset"],
    controls: [mouse("START", "#start-btn"), mouse("ADD_ACID", "#acid-btn"), mouse("ADD_BASE", "#base-btn"), key("HEAT_DOWN", "KeyH", undefined, "down"), key("HEAT_UP", "KeyH", undefined, "up"), key("COOL_DOWN", "KeyC", undefined, "down"), key("COOL_UP", "KeyC", undefined, "up"), mouse("POUR", "#pour-btn"), mouse("RESTART", "#restart-btn")],
    mainStatement: "混合顺序和持续加热、降温必须按虚拟时间更新实验状态。",
    mainObservable: ["acid_added", "base_added", "ph", "temperature", "heating", "cooling"],
    lossStatement: "过热到80°C或错误装瓶会立即失败。",
    startState: { status: "playing", acid_added: false, base_added: false, ph: 7, temperature: 20, heating: false, cooling: false, bottled: false },
    midState: { status: "playing", acid_added: true, base_added: true, ph: 7, temperature: 20, heating: false, cooling: false, bottled: false },
    winState: { status: "won", acid_added: true, base_added: true, ph: 7, temperature: 40, heating: false, cooling: false, bottled: true },
    lossState: { status: "lost", acid_added: true, base_added: false, ph: 3, temperature: 80, heating: false, cooling: false, bottled: false },
    resetState: { status: "menu", acid_added: false, base_added: false, ph: 7, temperature: 20, heating: false, cooling: false, bottled: false },
    midEvents: ["base_added"],
    winEvents: ["solution_bottled", "game_won"],
    lossEvents: ["temperature_changed", "experiment_failed"],
    winScoreText: "pH: 7 · Temp: 40°C",
    winSteps: [input("START"), input("ADD_ACID"), input("ADD_BASE"), input("HEAT_DOWN"), time(2000), input("HEAT_UP"), input("COOL_DOWN"), time(1000), input("COOL_UP"), input("POUR")],
    midIndex: 2,
    lossSteps: [input("START"), input("ADD_ACID"), input("HEAT_DOWN"), time(3000), input("HEAT_UP")],
    restartSteps: [input("START"), input("ADD_ACID"), input("RESTART")],
    seed: 615
  }
];

type CatalogEntry = {
  id: string;
  title: string;
  category: Category;
  features: Feature[];
  theme: string;
  stages: [string, string, string];
};

const catalog: CatalogEntry[] = [
  { id: "ocean-hunter", title: "Ocean Hunter", category: "action", features: ["leaderboard"], theme: "海底捕食", stages: ["吃掉小鱼", "躲开鲨鱼", "抵达珊瑚礁"] },
  { id: "sky-jump", title: "Sky Jump", category: "action", features: ["touch"], theme: "云端跳跃", stages: ["起跳", "踩中移动云台", "落上终点平台"] },
  { id: "rooftop-runner", title: "Rooftop Runner", category: "action", features: ["3d"], theme: "楼顶跑酷", stages: ["跨过矮墙", "滑过横杆", "跃上屋顶终点"] },
  { id: "asteroid-shooter", title: "Asteroid Shooter", category: "action", features: ["3d", "leaderboard"], theme: "太空射击", stages: ["锁定小行星", "击碎护盾", "摧毁核心"] },
  { id: "boxing-duel", title: "Boxing Duel", category: "action", features: ["multiplayer"], theme: "双人拳击", stages: ["P1直拳", "P2格挡", "P1重拳"] },
  { id: "circuit-race", title: "Circuit Race", category: "action", features: ["multiplayer", "leaderboard"], theme: "双人竞速", stages: ["P1通过一号门", "P2通过一号门", "P1冲线"] },
  { id: "whack-mole", title: "Whack a Mole", category: "action", features: ["touch"], theme: "触控打地鼠", stages: ["击中左洞", "击中中洞", "击中右洞"] },
  { id: "fruit-combo", title: "Fruit Combo", category: "action", features: ["touch", "leaderboard"], theme: "水果连击", stages: ["切开苹果", "切开西瓜", "切开菠萝"] },
  { id: "drone-dodge", title: "Drone Dodge", category: "action", features: ["camera"], theme: "手势控无人机", stages: ["左倾避障", "右倾穿门", "举手降落"] },
  { id: "pose-fighter", title: "Pose Fighter", category: "action", features: ["camera"], theme: "姿势格斗", stages: ["左拳姿势", "防御姿势", "右拳姿势"] },
  { id: "volcano-survival", title: "Volcano Survival", category: "action", features: [], theme: "火山生存", stages: ["越过熔岩", "拾取护盾", "进入避难洞"] },
  { id: "snowball-arena", title: "Snowball Arena", category: "action", features: ["multiplayer"], theme: "双人雪球竞技", stages: ["P1装填", "P2闪避", "P1命中"] },
  { id: "rhythm-dash", title: "Rhythm Dash", category: "action", features: [], theme: "节奏冲刺", stages: ["踩中低音节拍", "踩中军鼓节拍", "踩中终止重拍"] },
  { id: "helicopter-rescue", title: "Helicopter Rescue", category: "action", features: [], theme: "直升机救援", stages: ["起飞", "吊起求救者", "返回停机坪"] },
  { id: "space-defense", title: "Space Defense", category: "action", features: [], theme: "空间站防御", stages: ["拦截左路敌机", "修复护盾", "击退旗舰"] },
  { id: "samurai-reflex", title: "Samurai Reflex", category: "action", features: [], theme: "武士反应", stages: ["格挡上段", "闪避下段", "反击"] },
  { id: "cave-runner", title: "Cave Runner", category: "action", features: [], theme: "洞穴奔跑", stages: ["点亮火把", "跳过裂缝", "推开出口石门"] },
  { id: "crab-race", title: "Crab Race", category: "action", features: [], theme: "螃蟹横行赛", stages: ["向左绕过水坑", "向右抢到贝壳", "横移冲线"] },
  { id: "submarine-dodge", title: "Submarine Dodge", category: "action", features: [], theme: "潜艇躲避", stages: ["下潜避开水雷", "上浮穿过峡谷", "停靠基地"] },
  { id: "tower-climber", title: "Tower Climber", category: "action", features: ["3d"], theme: "三维攀塔", stages: ["抓住第一层", "绕过旋转梁", "登上塔顶"] },
  { id: "kart-time-trial", title: "Kart Time Trial", category: "action", features: ["3d", "leaderboard"], theme: "卡丁车计时", stages: ["通过弯道门", "拾取加速", "冲过终点"] },
  { id: "archery-range", title: "Archery Range", category: "action", features: ["camera"], theme: "手势射箭", stages: ["举弓", "拉弦", "松手命中"] },
  { id: "robot-brawl", title: "Robot Brawl", category: "action", features: ["multiplayer"], theme: "双人机器人格斗", stages: ["P1充能", "P2防御", "P1释放技能"] },
  { id: "laser-maze-run", title: "Laser Maze Run", category: "action", features: [], theme: "激光阵奔跑", stages: ["关闭红激光", "滑过蓝激光", "到达控制台"] },
  { id: "bee-swarm", title: "Bee Swarm", category: "action", features: [], theme: "蜂群护巢", stages: ["采集花粉", "躲开黄蜂", "把花粉送回蜂巢"] },
  { id: "football-penalty", title: "Football Penalty", category: "action", features: [], theme: "足球点球", stages: ["选择左角", "蓄力", "射门"] },
  { id: "basketball-shot", title: "Basketball Shot", category: "action", features: ["camera", "leaderboard"], theme: "手势投篮", stages: ["屈膝", "举球", "伸臂投出"] },
  { id: "ninja-slice", title: "Ninja Slice", category: "action", features: ["touch"], theme: "忍者触控斩击", stages: ["斩断左绳", "斩断右绳", "击中目标"] },
  { id: "island-survival", title: "Island Survival", category: "action", features: [], theme: "荒岛生存", stages: ["收集木材", "躲过风暴", "点燃求救火堆"] },

  { id: "sokoban-warehouse", title: "Sokoban Warehouse", category: "puzzle", features: [], theme: "推箱子", stages: ["把左箱推到角落", "绕到右箱后方", "把右箱推上目标"] },
  { id: "tetromino-stack", title: "Tetromino Stack", category: "puzzle", features: ["leaderboard"], theme: "俄罗斯方块", stages: ["放下I块", "旋转L块", "消除底行"] },
  { id: "minesweeper-safe", title: "Minesweeper Safe", category: "puzzle", features: ["persistence"], theme: "扫雷续局", stages: ["标记左上雷", "展开中央空区", "打开最后安全格"] },
  { id: "sliding-puzzle", title: "Sliding Puzzle", category: "puzzle", features: ["persistence"], theme: "数字华容道", stages: ["右移空格", "上移数字8", "还原最后一行"] },
  { id: "match-three-gems", title: "Match Three Gems", category: "puzzle", features: [], theme: "宝石消除", stages: ["交换蓝宝石", "形成红色三连", "触发连锁消除"] },
  { id: "mahjong-pairs", title: "Mahjong Pairs", category: "puzzle", features: [], theme: "麻将配对", stages: ["配对白板", "配对一筒", "配对红中"] },
  { id: "hex-connect", title: "Hex Connect", category: "puzzle", features: ["multiplayer"], theme: "双人六边连线", stages: ["P1占领左格", "P2占领中格", "P1连到右格"] },
  { id: "chess-endgame", title: "Chess Endgame", category: "puzzle", features: ["multiplayer"], theme: "双人残局", stages: ["白王逼近", "黑王应对", "白车将死"] },
  { id: "escape-room", title: "Escape Room", category: "puzzle", features: [], theme: "密室解谜", stages: ["找到抽屉密码", "取得铜钥匙", "打开出口"] },
  { id: "cube-rotation", title: "Cube Rotation", category: "puzzle", features: ["3d", "camera"], theme: "手势转魔方", stages: ["左转顶层", "上转右层", "对齐白色面"] },
  { id: "logic-circuit", title: "Logic Circuit", category: "puzzle", features: [], theme: "逻辑电路", stages: ["接通与门", "反转非门", "点亮输出灯"] },
  { id: "pipe-connect", title: "Pipe Connect", category: "puzzle", features: [], theme: "水管连接", stages: ["旋转入口弯管", "接通中段", "打开出水阀"] },
  { id: "tower-of-hanoi", title: "Tower of Hanoi", category: "puzzle", features: [], theme: "汉诺塔", stages: ["移走小盘", "移动中盘", "完成最后叠放"] },
  { id: "word-grid", title: "Word Grid", category: "puzzle", features: [], theme: "字母寻词", stages: ["找到CAT", "找到TREE", "找到MOON"] },
  { id: "color-sort", title: "Color Sort", category: "puzzle", features: [], theme: "试管颜色排序", stages: ["合并蓝色", "合并红色", "完成绿色试管"] },
  { id: "nonogram", title: "Nonogram", category: "puzzle", features: ["persistence"], theme: "数织续局", stages: ["填满第一行", "标记空列", "完成中心图案"] },
  { id: "laser-mirror", title: "Laser Mirror", category: "puzzle", features: [], theme: "镜面激光", stages: ["旋转第一面镜", "分光到右路", "照亮终点晶体"] },
  { id: "balance-scale", title: "Balance Scale", category: "puzzle", features: [], theme: "天平称重", stages: ["放上3克砝码", "移走1克砝码", "平衡未知物"] },
  { id: "memory-cards", title: "Memory Cards", category: "puzzle", features: [], theme: "记忆翻牌", stages: ["配对星星", "配对月亮", "配对太阳"] },
  { id: "number-link", title: "Number Link", category: "puzzle", features: [], theme: "数字连线", stages: ["连接数字1", "连接数字2", "完成数字3路径"] },
  { id: "tangram-3d", title: "Tangram 3D", category: "puzzle", features: ["3d"], theme: "三维七巧板", stages: ["放置三角块", "旋转平行块", "拼出立体小屋"] },
  { id: "touch-jigsaw", title: "Touch Jigsaw", category: "puzzle", features: ["touch"], theme: "触控拼图", stages: ["拖入左上角", "拼合中央块", "放下最后一块"] },

  { id: "galaxy-painter", title: "Galaxy Painter", category: "creative", features: ["3d"], theme: "银河绘画", stages: ["绘制蓝色星轨", "放置紫色星云", "点亮中心恒星"] },
  { id: "hand-particle-sculpture", title: "Hand Particle Sculpture", category: "creative", features: ["3d", "camera"], theme: "手势粒子雕塑", stages: ["张手聚拢粒子", "握拳压缩球体", "上划拉成长柱"] },
  { id: "collaborative-mural", title: "Collaborative Mural", category: "creative", features: ["multiplayer"], theme: "双人壁画", stages: ["P1画蓝色背景", "P2画黄色太阳", "P1补上白色云朵"] },
  { id: "music-visualizer", title: "Music Visualizer", category: "creative", features: [], theme: "音乐可视化", stages: ["触发低频波纹", "加入中频光柱", "完成高频粒子雨"] },
  { id: "virtual-fireworks", title: "Virtual Fireworks", category: "creative", features: [], theme: "虚拟烟花", stages: ["发射蓝色烟花", "发射环形烟花", "完成金色终幕"] },
  { id: "kaleidoscope", title: "Kaleidoscope", category: "creative", features: [], theme: "万花筒", stages: ["加入三角形", "旋转六十度", "切换镜像配色"] },
  { id: "interactive-clock", title: "Interactive Clock", category: "creative", features: [], theme: "互动时钟", stages: ["拨到三点", "启动秒针", "触发整点动画"] },
  { id: "photo-sphere", title: "Photo Sphere", category: "creative", features: ["3d", "persistence"], theme: "三维照片球", stages: ["选中山景照片", "旋转到海景照片", "收藏夜景照片"] },
  { id: "face-mask-studio", title: "Face Mask Studio", category: "creative", features: ["camera", "persistence"], theme: "摄像头面具工作室", stages: ["识别正脸", "叠加星星面具", "保存当前造型"] },
  { id: "zen-garden", title: "Zen Garden", category: "creative", features: ["3d", "persistence"], theme: "三维禅意庭院", stages: ["摆放岩石", "画出沙纹", "保存庭院"] },
  { id: "sound-board", title: "Sound Board", category: "creative", features: [], theme: "互动声音板", stages: ["触发鼓点", "叠加贝斯", "完成旋律循环"] },
  { id: "constellation-maker", title: "Constellation Maker", category: "creative", features: ["3d"], theme: "星座创作", stages: ["连接第一颗星", "画出三角星链", "命名新星座"] },
  { id: "voxel-showcase", title: "Voxel Showcase", category: "creative", features: ["3d", "multiplayer"], theme: "双人体素展示", stages: ["P1放置底座", "P2搭建立柱", "P1加上顶冠"] },
  { id: "shadow-puppet", title: "Shadow Puppet", category: "creative", features: ["camera"], theme: "手影剧场", stages: ["做出小鸟手势", "切换兔子手势", "完成谢幕手势"] },

  { id: "cafe-manager", title: "Cafe Manager", category: "simulation", features: ["persistence", "leaderboard"], theme: "咖啡店经营", stages: ["接下咖啡订单", "制作拿铁", "结账并更新营业额"] },
  { id: "pet-shelter", title: "Pet Shelter", category: "simulation", features: ["persistence"], theme: "宠物收容所", stages: ["喂食小狗", "清理房间", "保存领养记录"] },
  { id: "orchard-season", title: "Orchard Season", category: "simulation", features: ["persistence"], theme: "果园经营", stages: ["种下树苗", "浇水成长", "保存本季收成"] },
  { id: "city-budget", title: "City Budget", category: "simulation", features: ["multiplayer"], theme: "双人城市预算", stages: ["P1分配交通预算", "P2分配教育预算", "P1批准总预算"] },
  { id: "factory-line", title: "Factory Line", category: "simulation", features: ["multiplayer"], theme: "双人工厂流水线", stages: ["P1投入原料", "P2完成装配", "P1验收成品"] },
  { id: "hospital-shift", title: "Hospital Shift", category: "simulation", features: [], theme: "医院值班", stages: ["登记病人", "安排检查", "完成治疗"] },
  { id: "train-dispatch", title: "Train Dispatch", category: "simulation", features: [], theme: "列车调度", stages: ["开放一号站台", "切换道岔", "放行列车"] },
  { id: "aquarium-builder", title: "Aquarium Builder", category: "simulation", features: [], theme: "水族馆建造", stages: ["布置珊瑚", "放入鱼群", "开启过滤系统"] },
  { id: "fashion-studio", title: "Fashion Studio", category: "simulation", features: [], theme: "换装工作室", stages: ["选择上衣", "搭配裤装", "保存整套造型"] },
  { id: "dungeon-growth", title: "Dungeon Growth", category: "simulation", features: ["leaderboard"], theme: "地下城养成", stages: ["训练英雄", "强化武器", "击败首领并记分"] },
  { id: "life-simulator", title: "Life Simulator", category: "simulation", features: ["persistence"], theme: "人生模拟", stages: ["完成学习", "选择工作", "保存人生节点"] },
  { id: "market-trader", title: "Market Trader", category: "simulation", features: ["multiplayer"], theme: "双人市场交易", stages: ["P1发布商品", "P2出价", "P1确认成交"] },
  { id: "campsite-manager", title: "Campsite Manager", category: "simulation", features: ["persistence"], theme: "营地经营", stages: ["搭好帐篷", "点燃篝火", "保存今日营地"] },

  { id: "vocabulary-relay", title: "Vocabulary Relay", category: "education", features: ["multiplayer"], theme: "双人词汇接力", stages: ["P1选择apple", "P2选择banana", "P1选择orange"] },
  { id: "history-timeline", title: "History Timeline", category: "education", features: [], theme: "历史时间线", stages: ["放置古代事件", "放置近代事件", "放置现代事件"] },
  { id: "science-circuit", title: "Science Circuit", category: "education", features: [], theme: "科学电路课", stages: ["连接电池", "接入开关", "点亮灯泡"] },
  { id: "geography-map", title: "Geography Map", category: "education", features: [], theme: "地理地图", stages: ["找到长江", "找到青藏高原", "找到南海"] },
  { id: "typing-class", title: "Typing Class", category: "education", features: [], theme: "键盘打字课", stages: ["输入CAT", "输入GAME", "输入MODEL"] },
  { id: "coding-maze", title: "Coding Maze", category: "education", features: [], theme: "编程迷宫", stages: ["执行前进一步", "执行右转", "执行循环到终点"] },
  { id: "music-theory", title: "Music Theory", category: "education", features: [], theme: "乐理练习", stages: ["识别C大调", "选择属和弦", "完成终止式"] },
  { id: "culture-detective", title: "Culture Detective", category: "education", features: [], theme: "传统文化侦探", stages: ["识别青花瓷", "匹配唐诗", "找到节气线索"] }
];

function catalogTask(entry: CatalogEntry, index: number): TaskConfig {
  const multiplayer = entry.features.includes("multiplayer");
  const persistent = entry.features.includes("persistence");
  const cameraDriven = entry.features.includes("camera");
  const touchDriven = entry.features.includes("touch");
  const ranked = entry.features.includes("leaderboard");
  const is3d = entry.features.includes("3d");
  const stageIds = ["STAGE_1", "STAGE_2", "STAGE_3"] as const;
  const controls: Control[] = [mouse("START", "#start-btn", multiplayer ? "primary" : undefined)];
  if (multiplayer) controls.push(mouse("JOIN", "#join-btn", "secondary"));
  if (cameraDriven) {
    controls.push(camera(stageIds[0], "blue-left-marker"), camera(stageIds[1], "green-center-marker"), camera(stageIds[2], "yellow-right-marker"), camera("WRONG", "red-cross-marker"));
  } else if (touchDriven) {
    controls.push(touch(stageIds[0], "#stage-1"), touch(stageIds[1], "#stage-2"), touch(stageIds[2], "#stage-3"), touch("WRONG", "#wrong-action"));
  } else if (entry.category === "action") {
    controls.push(
      key(stageIds[0], "KeyA", multiplayer ? "primary" : undefined),
      key(stageIds[1], "KeyS", multiplayer ? "secondary" : undefined),
      key(stageIds[2], "KeyD", multiplayer ? "primary" : undefined),
      key("WRONG", "KeyX", multiplayer ? "secondary" : undefined)
    );
  } else {
    controls.push(
      mouse(stageIds[0], "#stage-1", multiplayer ? "primary" : undefined),
      mouse(stageIds[1], "#stage-2", multiplayer ? "secondary" : undefined),
      mouse(stageIds[2], "#stage-3", multiplayer ? "primary" : undefined),
      mouse("WRONG", "#wrong-action", multiplayer ? "secondary" : undefined)
    );
  }
  controls.push(mouse("RESTART", "#restart-btn", multiplayer ? "primary" : undefined));

  const extras = (phase: "start" | "mid" | "win" | "loss" | "reset"): State => ({
    ...(multiplayer ? { connected: phase === "reset" ? 0 : phase === "start" ? 1 : 2 } : {}),
    ...(persistent ? { saved: phase !== "reset" } : {}),
    ...(ranked ? { best_score: phase === "win" ? 30 : phase === "mid" ? 10 : 0 } : {})
  });
  const start = [input("START"), ...(multiplayer ? [input("JOIN")] : [])];
  const stageStep = (actionId: string): Step => cameraDriven
    ? cameraInput(actionId)
    : input(actionId);
  const winSteps: Step[] = [...start, stageStep(stageIds[0]), ...(persistent ? [reload()] : []), stageStep(stageIds[1]), stageStep(stageIds[2])];
  const stageOneIndex = start.length;
  const midIndex = persistent ? stageOneIndex + 1 : stageOneIndex;
  const lossSteps: Step[] = [...start, stageStep("WRONG"), stageStep("WRONG")];
  const restartSteps: Step[] = [...start, stageStep(stageIds[0]), ...(persistent ? [reload()] : []), input("RESTART")];
  const featureRules = [
    is3d ? "主要场景必须用原生 WebGL 绘制可辨认的三维对象。" : "",
    cameraDriven ? "三段正确假视频依次为蓝色左侧方块、绿色中央圆形、黄色右侧三角；错误帧是红色叉号。" : "",
    multiplayer ? "第一、三阶段由主页面完成，第二阶段由副页面完成，两个页面通过 BroadcastChannel 同步。" : "",
    persistent ? "第一阶段后评测器会刷新页面，progress、score、lives 和 last_action 必须从本地存档恢复。" : "",
    ranked ? "best_score 随当前最高分更新，获胜时为30。" : "",
    touchDriven ? "所有阶段只能通过真实触控完成。" : ""
  ].filter(Boolean).join(" ");

  return {
    id: entry.id,
    title: entry.title,
    prefix: `X${String(index + 1).padStart(3, "0")}`,
    difficulty: cameraDriven || multiplayer || is3d ? "D3" : entry.features.length > 0 || entry.category !== "education" ? "D2" : "D1",
    rationale: `围绕${entry.theme}设置三段确定性路径，并覆盖错误输入和重开。`,
    category: entry.category,
    features: entry.features,
    environment: { pages: multiplayer ? 2 : 1, fake_camera: cameraDriven, persistent_storage: persistent },
    surface: is3d ? "webgl" : entry.category === "puzzle" || entry.category === "education" ? "dom" : "canvas2d",
    surfaceSelector: is3d ? "#game-canvas" : entry.category === "puzzle" || entry.category === "education" ? "#game-board" : "#game-canvas",
    goal: `完成${entry.theme}的三段目标：${entry.stages.join("、")}。`,
    gameplay: `Start 后从第一阶段开始。正确顺序固定为“${entry.stages[0]} → ${entry.stages[1]} → ${entry.stages[2]}”。每完成一段增加10分并推进 progress；顺序错误会清空 progress 并扣1条生命。${featureRules}`,
    winRule: "依次完成三个阶段时立即获胜，progress=3、score=30。",
    lossRule: "初始2条生命，第二次错误操作时立即失败。",
    resetRule: `Restart 恢复0进度、0分、2条生命、空 last_action 和菜单${persistent ? "，并清除当前存档" : ""}。`,
    interfaceNotes: [`界面要直接写出三段目标：${entry.stages.join("、")}。`],
    stateFields: ["status", "progress", "score", "lives", "last_action", ...(multiplayer ? ["connected"] : []), ...(persistent ? ["saved"] : []), ...(ranked ? ["best_score"] : [])],
    eventTypes: ["game_started", ...(multiplayer ? ["player_joined"] : []), ...(cameraDriven ? ["camera_frame_detected"] : []), "stage_completed", "action_rejected", "progress_reset", ...(persistent ? ["state_saved", "state_loaded"] : []), ...(ranked ? ["leaderboard_updated"] : []), "game_won", "game_lost", "game_reset"],
    controls,
    mainStatement: `${entry.theme}的三个阶段必须按固定顺序推进进度和分数。`,
    mainObservable: ["progress", "score", "lives", "last_action", "events"],
    lossStatement: "两次错误操作会清空生命并失败。",
    startState: { status: "playing", progress: 0, score: 0, lives: 2, last_action: null, ...extras("start") },
    midState: { status: "playing", progress: 1, score: 10, lives: 2, last_action: entry.stages[0], ...extras("mid") },
    winState: { status: "won", progress: 3, score: 30, lives: 2, last_action: entry.stages[2], ...extras("win") },
    lossState: { status: "lost", progress: 0, score: 0, lives: 0, last_action: "wrong", ...extras("loss") },
    resetState: { status: "menu", progress: 0, score: 0, lives: 2, last_action: null, ...extras("reset") },
    midEvents: persistent ? ["state_loaded"] : ["stage_completed"],
    winEvents: ["stage_completed", "game_won"],
    lossEvents: ["action_rejected", "progress_reset", "game_lost"],
    winScoreText: "Score: 30",
    winSteps,
    midIndex,
    lossSteps,
    restartSteps,
    seed: 700 + index
  };
}

// Camera tasks are retained only as historical definitions, not active tasks.
const tasks: TaskConfig[] = [...coreTasks, ...catalog.map(catalogTask)]
  .filter((task) => !task.features.includes("camera"));

const existingTaskEntries = [
  { id: "target-rush", directory: "target-rush", difficulty: "D1" as const, category: "action" as const, features: [] as Feature[] },
  { id: "maze-collector", directory: "maze-collector", difficulty: "D1" as const, category: "puzzle" as const, features: [] as Feature[] },
  { id: "key-door-escape", directory: "key-door-escape", difficulty: "D2" as const, category: "puzzle" as const, features: [] as Feature[] },
  { id: "platform-rescue", directory: "platform-rescue", difficulty: "D2" as const, category: "action" as const, features: [] as Feature[] },
  { id: "signal-memory", directory: "signal-memory", difficulty: "D3" as const, category: "puzzle" as const, features: [] as Feature[] }
];

function addCheckpoints(steps: Step[], checkpointMap: Map<number, string[]>): Array<Step & { checkpoints: string[] }> {
  return steps.map((step, index) => ({
    ...step,
    checkpoints: checkpointMap.get(index) ?? []
  }));
}

function checkpoint(
  id: string,
  actionIndex: number,
  layer: Layer,
  requirementId: string,
  terminal: boolean,
  state: State,
  eventTypes: string[],
  ui: State = {}
) {
  return {
    id,
    action_index: actionIndex,
    layer,
    requirement_ids: [requirementId],
    terminal,
    expected: { state, ui, event_types: eventTypes, physics: [] }
  };
}

function buildPlan(config: TaskConfig): GameTaskPlan {
  const p = config.prefix;
  const winLast = config.winSteps.length - 1;
  const lossLast = config.lossSteps.length - 1;
  const restartLast = config.restartSteps.length - 1;
  return GameTaskPlanSchema.parse({
    schema_version: "gametestlab.game-task-plan.v1",
    task_id: config.id,
    title: config.title,
    difficulty: { level: config.difficulty, rationale: config.rationale },
    category: config.category,
    features: config.features,
    environment: config.environment,
    surface: config.surface,
    viewport: { width: 800, height: 600 },
    selectors: {
      score: "[data-testid='score']",
      status: "[data-testid='status']",
      surface: config.surfaceSelector
    },
    controls: config.controls,
    requirements: [
      { id: `${p}-RUN`, layer: "L1", severity: "must", statement: "游戏可以开始且无运行、资源或网络错误。", depends_on: [], observable: ["status", "runtime"] },
      { id: `${p}-MAIN`, layer: "L2", severity: "must", statement: config.mainStatement, depends_on: [`${p}-RUN`], observable: config.mainObservable },
      { id: `${p}-LOSS`, layer: "L2", severity: "must", statement: config.lossStatement, depends_on: [`${p}-RUN`], observable: ["status", "game_lost", "state"] },
      { id: `${p}-RESET`, layer: "L2", severity: "must", statement: config.resetRule, depends_on: [`${p}-RUN`], observable: ["state", "game_reset"] },
      { id: `${p}-HUD`, layer: "L3", severity: "must", statement: "HUD 的分数和状态必须与内部状态一致，关键画面在800×600视口内完整可见。", depends_on: [`${p}-MAIN`], observable: ["scoreText", "statusText", "screenshot"] }
    ],
    scenarios: [
      {
        id: "win-path",
        description: "按固定正确路径完成一局并验证中间状态与终局。",
        seed: config.seed,
        clock,
        steps: addCheckpoints(config.winSteps, new Map([
          [0, [`${p}-CP-START`]],
          [config.midIndex, [`${p}-CP-MID`]],
          [winLast, [`${p}-CP-WON`, `${p}-CP-WON-UI`]]
        ]))
      },
      {
        id: "loss-path",
        description: "按固定失败路径触发明确的失败条件。",
        seed: config.seed,
        clock,
        steps: addCheckpoints(config.lossSteps, new Map([[lossLast, [`${p}-CP-LOST`]]]))
      },
      {
        id: "restart-path",
        description: "改变局内状态后执行 Restart，检查完整重置。",
        seed: config.seed,
        clock,
        steps: addCheckpoints(config.restartSteps, new Map([[restartLast, [`${p}-CP-RESET`]]]))
      }
    ]
  });
}

function buildOracle(config: TaskConfig): GameTaskOracle {
  const p = config.prefix;
  return GameTaskOracleSchema.parse({
    schema_version: "gametestlab.game-task-oracle.v1",
    task_id: config.id,
    scenarios: [
      {
        scenario_id: "win-path",
        checkpoints: [
          checkpoint(`${p}-CP-START`, 0, "L1", `${p}-RUN`, false, config.startState, ["game_started"]),
          checkpoint(`${p}-CP-MID`, config.midIndex, "L2", `${p}-MAIN`, false, config.midState, config.midEvents),
          checkpoint(`${p}-CP-WON`, config.winSteps.length - 1, "L2", `${p}-MAIN`, true, config.winState, config.winEvents),
          checkpoint(`${p}-CP-WON-UI`, config.winSteps.length - 1, "L3", `${p}-HUD`, false, {}, [], {
            scoreText: config.winScoreText,
            statusText: "Won"
          })
        ]
      },
      {
        scenario_id: "loss-path",
        checkpoints: [checkpoint(`${p}-CP-LOST`, config.lossSteps.length - 1, "L2", `${p}-LOSS`, true, config.lossState, config.lossEvents)]
      },
      {
        scenario_id: "restart-path",
        checkpoints: [checkpoint(`${p}-CP-RESET`, config.restartSteps.length - 1, "L2", `${p}-RESET`, true, config.resetState, ["game_reset"])]
      }
    ]
  });
}

function renderControl(control: Control): string {
  const actor = control.actor === "secondary" ? "（副页面）" : control.actor === "primary" ? "（主页面）" : "";
  if (control.device === "keyboard") return `  - \`${control.action_id}\`${actor}：键盘 ${control.code} ${control.key_event ?? "press"}`;
  if (control.device === "camera") return `  - \`${control.action_id}\`：摄像头画面 ${control.fixture_frame}`;
  return `  - \`${control.action_id}\`${actor}：${control.device} 操作 ${control.selector ?? `${control.x_ratio},${control.y_ratio}`}`;
}

function renderBrief(config: TaskConfig): string {
  const environmentNotes = [
    config.features.includes("multiplayer") ? "评测会同时打开两个页面；只能用 BroadcastChannel 做本机同步，不得访问服务器。" : "",
    config.features.includes("camera") ? "评测会授予摄像头权限并提供固定假视频；摄像头不可用时要显示明确错误，不能静默改用按钮。" : "",
    config.features.includes("persistence") ? "存档使用 localStorage 或 IndexedDB；页面刷新后必须恢复，Restart 按题目要求清理。" : "",
    config.features.includes("3d") ? "三维画面使用原生 WebGL，不加载 Three.js 或任何远程资源。" : ""
  ].filter(Boolean);
  const environmentSection = environmentNotes.length > 0
    ? `\n\n${environmentNotes.join("\n\n")}`
    : "";
  return `# ${config.title}\n\n## 游戏目标\n\n${config.goal}\n\n## 完整玩法\n\n${config.gameplay}${environmentSection}\n\n## 胜负与重开\n\n- ${config.winRule}\n- ${config.lossRule}\n- ${config.resetRule}\n\n## 界面与反馈\n\n固定 800×600 视口。HUD 始终显示分数或进度，以及状态 \`Menu\`、\`Playing\`、\`Won\`、\`Lost\`。菜单、主要游戏区域、终局和 Restart 都要完整可见。${config.interfaceNotes?.length ? `\n\n${config.interfaceNotes.join("\n\n")}` : ""}\n\n## 固定规则\n\n相同 seed 必须得到相同初始状态和同一时间表。游戏结束后输入不能再改变分数、进度或胜负。所有时间规则使用毫秒，并能由虚拟时间推进。\n\n## 自动测试接口\n\n- 界面类型：${config.surface}；主要区域：\`${config.surfaceSelector}\`。\n- HUD：\`[data-testid="score"]\` 和 \`[data-testid="status"]\`。\n- state 至少包含：${config.stateFields.map((field) => `\`${field}\``).join("、")}。\n- 事件：${config.eventTypes.map((event) => `\`${event}\``).join("、")}。\n- 控件：\n${config.controls.map(renderControl).join("\n")}\n`;
}

async function sha256(path: string): Promise<string> {
  return createHash("sha256").update(await readFile(path)).digest("hex");
}

async function writeTask(config: TaskConfig, contractPath: string): Promise<void> {
  const directory = resolve(taskRoot, config.id);
  await mkdir(directory, { recursive: true });
  const briefPath = resolve(directory, "brief.md");
  const planPath = resolve(directory, "test-plan.json");
  const oraclePath = resolve(directory, "oracle.private.json");
  await writeFile(briefPath, renderBrief(config), "utf8");
  await writeFile(planPath, `${JSON.stringify(buildPlan(config), null, 2)}\n`, "utf8");
  await writeFile(oraclePath, `${JSON.stringify(buildOracle(config), null, 2)}\n`, "utf8");
  const hashes = [
    `${await sha256(briefPath)}  brief.md`,
    `${await sha256(planPath)}  test-plan.json`,
    `${await sha256(oraclePath)}  oracle.private.json`,
    `${await sha256(contractPath)}  ../GAME_CONTRACT.md`
  ];
  await writeFile(resolve(directory, "input-sha256.txt"), `${hashes.join("\n")}\n`, "utf8");
}

const contractPath = resolve(taskRoot, "GAME_CONTRACT.md");
const manifest = GameTaskSetManifestSchema.parse({
  schema_version: "gametestlab.game-task-set.v1",
  name: "GameTestLab Complete Game Tasks",
  version: "2026-09-12.2",
  description: "96 browser-game generation tasks; 10 camera tasks excluded from the original 106-task distribution.",
  contract_file: "GAME_CONTRACT.md",
  tasks: [
    ...existingTaskEntries,
    ...tasks.map((task) => ({
      id: task.id,
      directory: task.id,
      difficulty: task.difficulty,
      category: task.category,
      features: task.features
    }))
  ]
});
await writeFile(resolve(taskRoot, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
for (const task of tasks) await writeTask(task, contractPath);
for (const task of existingTaskEntries) {
  const directory = resolve(taskRoot, task.directory);
  const hashes = [
    `${await sha256(resolve(directory, "brief.md"))}  brief.md`,
    `${await sha256(resolve(directory, "test-plan.json"))}  test-plan.json`,
    `${await sha256(resolve(directory, "oracle.private.json"))}  oracle.private.json`,
    `${await sha256(contractPath)}  ../GAME_CONTRACT.md`
  ];
  await writeFile(resolve(directory, "input-sha256.txt"), `${hashes.join("\n")}\n`, "utf8");
}
console.log(`Built ${manifest.tasks.length} distribution-matched game tasks.`);
