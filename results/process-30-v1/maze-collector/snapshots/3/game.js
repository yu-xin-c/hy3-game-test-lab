(function () {
  'use strict';

  // ---- Fixed 7x5 map ----
  // '#' wall, 'S' start (1,1), 'C' coin, 'E' exit (5,1)
  const MAP = [
    ['#', '#', '#', '#', '#', '#', '#'],
    ['#', 'S', '.', 'C', '.', 'E', '#'],
    ['#', '.', '#', '.', '#', '.', '#'],
    ['#', 'C', '.', '.', '.', 'C', '#'],
    ['#', '#', '#', '#', '#', '#', '#']
  ];
  const ROWS = MAP.length;        // 5
  const COLS = MAP[0].length;    // 7
  const START = { x: 1, y: 1 };
  const MAX_MOVES = 18;
  const TOTAL_COINS = 3;

  // ---- State ----
  let state = null;
  let collected = null;        // Set of "x,y"
  let currentTick = 0;
  let ready = false;
  let currentSeed = null;

  // ---- Event bridge ----
  let events = [];
  let seqCounter = 0;
  let event_epoch = 0;

  function emit(type, payload) {
    currentTick = performance.now();
    const ev = { seq: ++seqCounter, tick: currentTick, type: type };
    if (payload !== undefined && payload !== null) ev.payload = payload;
    events.push(ev);
    return ev;
  }

  function reset(opts) {
    opts = opts || {};
    event_epoch += 1;
    seqCounter = 0;
    events = [];
    collected = new Set();
    currentSeed = (opts && opts.seed !== undefined) ? opts.seed : null;
    state = {
      status: 'menu',
      player: { x: START.x, y: START.y },
      coins_collected: 0,
      moves_used: 0,
      moves_remaining: MAX_MOVES
    };
    currentTick = performance.now();
    emit('game_reset', {});
    renderBoard();
    updateHUD();
  }

  // ---- Helpers ----
  function key(x, y) { return x + ',' + y; }

  function isWall(x, y) {
    if (y < 0 || y >= ROWS || x < 0 || x >= COLS) return true;
    return MAP[y][x] === '#';
  }

  function cellAt(x, y) { return MAP[y][x]; }

  function doMove(nx, ny) {
    state.player.x = nx;
    state.player.y = ny;
    state.moves_used += 1;
    state.moves_remaining -= 1;
    emit('player_moved', { x: nx, y: ny });
  }

  function flashMessage(msg) {
    const m = document.getElementById('message');
    if (m) m.textContent = msg;
    if (flashMessage._t) clearTimeout(flashMessage._t);
    flashMessage._t = setTimeout(function () {
      const mm = document.getElementById('message');
      if (mm) mm.textContent = '';
    }, 900);
  }

  // ---- Movement ----
  function attemptMove(dx, dy) {
    if (!state || state.status !== 'playing') return;
    const nx = state.player.x + dx;
    const ny = state.player.y + dy;

    if (isWall(nx, ny)) {
      emit('wall_blocked', { x: nx, y: ny });
      flashMessage('Blocked by wall');
      updateHUD();
      return;
    }

    const c = cellAt(nx, ny);

    if (c === 'E') {
      if (state.coins_collected < TOTAL_COINS) {
        emit('exit_locked', {});
        flashMessage('Collect all coins first');
        updateHUD();
        return;
      }
      // Winning move: counts as a valid move into the exit.
      doMove(nx, ny);
      state.status = 'won';
      emit('game_won', {});
      renderBoard();
      updateHUD();
      return;
    }

    // Valid move onto floor or coin cell.
    doMove(nx, ny);
    if (c === 'C' && !collected.has(key(nx, ny))) {
      collected.add(key(nx, ny));
      state.coins_collected += 1;
      emit('coin_collected', { x: nx, y: ny });
    }
    if (state.moves_used >= MAX_MOVES && state.status === 'playing') {
      state.status = 'lost';
      emit('game_lost', {});
    }
    renderBoard();
    updateHUD();
  }

  function startGame() {
    if (!state) return;
    if (state.status === 'menu') {
      state.status = 'playing';
      emit('game_started', {});
      updateHUD();
    }
  }

  function restartGame() {
    reset({ seed: currentSeed });
  }

  // ---- Rendering ----
  let cellEls = [];

  function buildBoard() {
    const board = document.getElementById('board');
    board.innerHTML = '';
    cellEls = [];
    board.style.gridTemplateColumns = 'repeat(' + COLS + ', var(--cell))';
    board.style.gridTemplateRows = 'repeat(' + ROWS + ', var(--cell))';
    for (let y = 0; y < ROWS; y++) {
      const row = [];
      for (let x = 0; x < COLS; x++) {
        const d = document.createElement('div');
        d.className = 'cell';
        d.dataset.x = x;
        d.dataset.y = y;
        board.appendChild(d);
        row.push(d);
      }
      cellEls.push(row);
    }
  }

  function renderBoard() {
    if (!cellEls.length) buildBoard();
    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        const el = cellEls[y][x];
        const c = MAP[y][x];
        let cls = 'cell';
        if (c === '#') {
          cls += ' wall';
        } else if (c === 'E') {
          cls += ' exit';
        } else if (c === 'C') {
          if (collected && collected.has(key(x, y))) cls += ' collected';
          else cls += ' coin';
        } else {
          cls += ' floor';
          if (c === 'S') cls += ' start';
        }
        if (state.player.x === x && state.player.y === y) cls += ' player';
        el.className = cls;
      }
    }
  }

  function updateHUD() {
    const score = document.querySelector('[data-testid="score"]');
    const statusEl = document.querySelector('[data-testid="status"]');
    const movesEl = document.getElementById('moves');
    if (score) score.textContent = 'Coins: ' + state.coins_collected + '/' + TOTAL_COINS;
    if (statusEl) statusEl.textContent = state.status;
    if (movesEl) movesEl.textContent = 'Moves: ' + state.moves_used + '/' + MAX_MOVES;
  }

  // ---- Read-only observation bridge (gametestlab/2) ----
  window.__GAMETESTLAB__ = {
    protocol: 'gametestlab/2',
    isReady: function () { return ready; },
    reset: function (opts) { reset(opts); return observe(); },
    observe: function () {
      return {
        tick: currentTick,
        status: state.status,
        state: JSON.parse(JSON.stringify(state)),
        event_epoch: event_epoch,
        latest_event_seq: seqCounter
      };
    },
    getEvents: function (opts) {
      opts = opts || {};
      const after = (opts.afterSeq !== undefined) ? opts.afterSeq : 0;
      return events.filter(function (e) { return e.seq > after; });
    }
  };

  // ---- Init ----
  function init() {
    buildBoard();
    reset({});
    ready = true;

    // Time driven by requestAnimationFrame (virtual-time friendly).
    function loop() {
      currentTick = performance.now();
      requestAnimationFrame(loop);
    }
    requestAnimationFrame(loop);

    document.getElementById('start-btn').addEventListener('click', startGame);
    document.getElementById('restart-btn').addEventListener('click', restartGame);

    window.addEventListener('keydown', function (e) {
      switch (e.code) {
        case 'ArrowUp': e.preventDefault(); attemptMove(0, -1); break;
        case 'ArrowDown': e.preventDefault(); attemptMove(0, 1); break;
        case 'ArrowLeft': e.preventDefault(); attemptMove(-1, 0); break;
        case 'ArrowRight': e.preventDefault(); attemptMove(1, 0); break;
        case 'KeyR': e.preventDefault(); restartGame(); break;
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
