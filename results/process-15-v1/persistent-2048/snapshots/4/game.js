'use strict';

/* ============================================================
 * Persistent 2048
 * 固定初始棋盘、两次滑动内合成 8、刷新后恢复存档。
 * ============================================================ */

const SIZE = 4;
const WIN_TILE = 8;          // 合成 8 即胜
const MAX_MOVES = 2;         // 两次输入内决定胜负
const STORAGE_KEY = 'persistent2048';

/* ---------- 固定初始棋盘（不生成随机块）---------- */
function initialGrid() {
  return [
    [2, 2, 0, 0],
    [4, 0, 0, 0],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
  ];
}

/* ---------- 全局状态 ---------- */
let state = {
  status: 'menu',          // menu | playing | won | lost
  grid: initialGrid(),
  moves: 0,
  max_tile: 4,
  saved: false,
};

let ready = false;
let eventEpoch = 1;
let seqCounter = 0;
let events = [];            // 当前事件周期内的事件

/* ---------- 时间：由 performance 驱动，便于虚拟时间推进 ---------- */
function nowTick() {
  return Math.floor(performance.now());
}

/* ---------- 事件 ---------- */
function logEvent(type, payload) {
  seqCounter += 1;
  events.push({
    seq: seqCounter,
    tick: nowTick(),
    type: type,
    payload: payload !== undefined ? payload : {},
  });
  return seqCounter;
}

/* ---------- 存档 ---------- */
function clearSave() {
  try { localStorage.removeItem(STORAGE_KEY); } catch (e) { /* ignore */ }
}

function saveState() {
  state.saved = true;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      status: state.status,
      grid: state.grid,
      moves: state.moves,
      max_tile: state.max_tile,
      saved: true,
    }));
  } catch (e) { /* ignore */ }
  logEvent('state_saved', {});
}

function loadState() {
  let raw = null;
  try { raw = localStorage.getItem(STORAGE_KEY); } catch (e) { raw = null; }
  if (!raw) return false;
  try {
    const data = JSON.parse(raw);
    state.status = data.status || 'menu';
    state.grid = Array.isArray(data.grid) ? data.grid : initialGrid();
    state.moves = typeof data.moves === 'number' ? data.moves : 0;
    state.max_tile = typeof data.max_tile === 'number' ? data.max_tile : 4;
    state.saved = true;
    logEvent('state_loaded', {});
    return true;
  } catch (e) {
    return false;
  }
}

/* ---------- 棋盘合并逻辑 ---------- */
function slideLine(line) {
  const arr = line.filter(function (v) { return v !== 0; });
  const result = [];
  let merged = false;
  for (let i = 0; i < arr.length; i++) {
    if (i + 1 < arr.length && arr[i] === arr[i + 1]) {
      result.push(arr[i] * 2);   // 同值合并为 2 倍
      i++;                       // 跳过已合并的方块（一次移动内只合并一次）
      merged = true;
    } else {
      result.push(arr[i]);
    }
  }
  while (result.length < line.length) result.push(0);
  return { result: result, merged: merged };
}

// 返回 { grid, merged }
function move(grid, dir) {
  const ng = grid.map(function (row) { return row.slice(); });
  let anyMerged = false;

  if (dir === 'left') {
    for (let r = 0; r < SIZE; r++) {
      const s = slideLine(ng[r]);
      ng[r] = s.result;
      if (s.merged) anyMerged = true;
    }
  } else if (dir === 'right') {
    for (let r = 0; r < SIZE; r++) {
      const s = slideLine(ng[r].slice().reverse());
      ng[r] = s.result.reverse();
      if (s.merged) anyMerged = true;
    }
  } else if (dir === 'up') {
    for (let c = 0; c < SIZE; c++) {
      const col = [ng[0][c], ng[1][c], ng[2][c], ng[3][c]];
      const s = slideLine(col);
      for (let r = 0; r < SIZE; r++) ng[r][c] = s.result[r];
      if (s.merged) anyMerged = true;
    }
  } else if (dir === 'down') {
    for (let c = 0; c < SIZE; c++) {
      const col = [ng[0][c], ng[1][c], ng[2][c], ng[3][c]];
      const s = slideLine(col.slice().reverse());
      const back = s.result.reverse();
      for (let r = 0; r < SIZE; r++) ng[r][c] = back[r];
      if (s.merged) anyMerged = true;
    }
  }
  return { grid: ng, merged: anyMerged };
}

function computeMaxTile(grid) {
  let m = 0;
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      if (grid[r][c] > m) m = grid[r][c];
    }
  }
  return m;
}

/* ---------- 处理一次滑动 ---------- */
function handleMove(dir) {
  if (state.status !== 'playing') return;   // 非 playing（menu/won/lost）忽略输入

  const res = move(state.grid, dir);
  state.grid = res.grid;
  state.moves += 1;
  state.max_tile = computeMaxTile(state.grid);

  logEvent('swipe', { direction: dir });
  if (res.merged) {
    logEvent('tile_merged', { direction: dir, value: state.max_tile });
  }

  // 胜负判定
  if (state.max_tile >= WIN_TILE) {
    state.status = 'won';
    logEvent('game_won', { max_tile: state.max_tile });
  } else if (state.moves >= MAX_MOVES) {
    state.status = 'lost';
    logEvent('game_lost', { max_tile: state.max_tile });
  }

  saveState();
  renderAll();
}

/* ---------- 开始 / 重置 ---------- */
function startGame() {
  if (state.status !== 'menu') return;
  state.status = 'playing';
  logEvent('game_started', {});
  renderAll();
}

function resetGame() {
  // 清除存档并恢复菜单与原始棋盘；每次调用增加 event_epoch，seq 从 1 重记
  eventEpoch += 1;
  events = [];
  seqCounter = 0;
  state = {
    status: 'menu',
    grid: initialGrid(),
    moves: 0,
    max_tile: 4,
    saved: false,
  };
  clearSave();
  renderAll();
  logEvent('game_reset', {});
}

/* ---------- 渲染 ---------- */
function renderBoard() {
  const board = document.getElementById('board');
  board.innerHTML = '';
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      const cell = document.createElement('div');
      cell.className = 'cell';
      const v = state.grid[r][c];
      if (v !== 0) {
        cell.textContent = String(v);
        cell.dataset.value = String(v);
      }
      board.appendChild(cell);
    }
  }
}

const STATUS_TEXT = { menu: 'Menu', playing: 'Playing', won: 'Won', lost: 'Lost' };

function renderAll() {
  const scoreEl = document.querySelector('[data-testid="score"]');
  const statusEl = document.querySelector('[data-testid="status"]');
  scoreEl.textContent = 'Max: ' + state.max_tile + ' | Moves: ' + state.moves + ' / ' + MAX_MOVES;
  statusEl.textContent = STATUS_TEXT[state.status];
  statusEl.dataset.status = state.status;

  renderBoard();

  const inEnd = (state.status === 'won' || state.status === 'lost');
  document.getElementById('menu-msg').classList.toggle('hidden', state.status !== 'menu');
  const endMsg = document.getElementById('endgame-msg');
  endMsg.classList.toggle('hidden', !inEnd);
  if (state.status === 'won') {
    endMsg.textContent = 'You Won! 合成了数字 8。';
  } else if (state.status === 'lost') {
    endMsg.textContent = 'You Lost. 两次滑动内未合成 8。';
  }
  document.getElementById('start-btn').classList.toggle('hidden', state.status !== 'menu');
  document.getElementById('restart-btn').classList.toggle('hidden', state.status === 'menu');
}

/* ---------- 输入绑定 ---------- */
function bindInput() {
  document.getElementById('start-btn').addEventListener('click', startGame);
  document.getElementById('restart-btn').addEventListener('click', resetGame);

  window.addEventListener('keydown', function (e) {
    let dir = null;
    if (e.key === 'ArrowRight') dir = 'right';
    else if (e.key === 'ArrowDown') dir = 'down';
    else if (e.key === 'ArrowUp') dir = 'up';
    else if (e.key === 'ArrowLeft') dir = 'left';
    if (dir) {
      e.preventDefault();
      handleMove(dir);
    }
  });
}

/* ---------- 只读观察接口 window.__GAMETESTLAB__ ---------- */
function observe() {
  return {
    protocol: 'gametestlab/2',
    tick: nowTick(),
    status: state.status,
    state: {
      status: state.status,
      grid: state.grid,
      moves: state.moves,
      max_tile: state.max_tile,
      saved: state.saved,
    },
    event_epoch: eventEpoch,
    latest_event_seq: seqCounter,
  };
}

function getEvents(opts) {
  const after = (opts && typeof opts.afterSeq === 'number') ? opts.afterSeq : 0;
  return events.filter(function (ev) { return ev.seq > after; });
}

function installBridge() {
  window.__GAMETESTLAB__ = {
    protocol: 'gametestlab/2',
    isReady: function () { return ready; },
    reset: function (opts) { resetGame(); return undefined; },
    observe: observe,
    getEvents: getEvents,
  };
}

/* ---------- 初始化 ---------- */
function init() {
  loadState();          // 若刷新后存在存档则恢复
  bindInput();
  renderAll();
  installBridge();
  ready = true;
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
