(function () {
  'use strict';

  // ---- Deterministic PRNG (mulberry32) ----
  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0;
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // ---- State ----
  const state = {
    status: 'menu', // menu | playing | won | lost
    score: 0,
    lives: 3,
    sliced: 0,
    remaining: 5,
    bombCount: 0,
  };

  let seed = 1;
  let fruitPositions = [];
  let bombPositions = [];
  let timers = [];
  let events = [];
  let seq = 0;
  let eventEpoch = 0;

  // ---- DOM ----
  const el = {
    score: document.getElementById('score'),
    status: document.getElementById('status'),
    playfield: document.getElementById('playfield'),
    startBtn: document.getElementById('start-btn'),
    fruit: document.getElementById('fruit'),
    bomb: document.getElementById('bomb'),
    restartBtn: document.getElementById('restart-btn'),
    endOverlay: document.getElementById('end-overlay'),
    endMessage: document.getElementById('end-message'),
  };

  function now() {
    return (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
  }

  function clearTimers() {
    for (let i = 0; i < timers.length; i++) clearTimeout(timers[i]);
    timers = [];
  }
  function later(fn, ms) {
    const id = setTimeout(fn, ms);
    timers.push(id);
    return id;
  }

  function emit(type, payload) {
    seq += 1;
    const ev = { seq: seq, tick: now(), type: type, payload: payload || {} };
    events.push(ev);
    return ev;
  }

  function place(node, pos) {
    node.style.left = pos.x + 'px';
    node.style.top = pos.y + 'px';
  }

  // Build a fixed layout from the current seed.
  function buildSchedule() {
    const rng = mulberry32(seed);
    fruitPositions = [];
    bombPositions = [];
    // Five fruit slots (center band) — deterministic per seed.
    for (let i = 0; i < 5; i++) {
      fruitPositions.push({
        x: 250 + Math.floor(rng() * 300),
        y: 180 + Math.floor(rng() * 240),
      });
    }
    // Bomb slots (top-left corner band) — deterministic per seed.
    for (let i = 0; i < 8; i++) {
      bombPositions.push({
        x: 40 + Math.floor(rng() * 110),
        y: 40 + Math.floor(rng() * 110),
      });
    }
  }

  function render() {
    el.score.textContent =
      'Score ' + state.score + ' / 50 (sliced ' + state.sliced + ', left ' + state.remaining + ')';
    const map = { menu: 'Menu', playing: 'Playing', won: 'Won', lost: 'Lost' };
    el.status.textContent = map[state.status] || state.status;
    el.startBtn.hidden = state.status !== 'menu';

    if (state.status === 'won' || state.status === 'lost') {
      el.endOverlay.hidden = false;
      el.endMessage.textContent =
        state.status === 'won' ? 'You Win! Final Score ' + state.score : 'Game Over';
    } else {
      el.endOverlay.hidden = true;
    }
  }

  function showFruit() {
    if (state.status !== 'playing') return;
    if (state.sliced >= 5) return;
    const pos = fruitPositions[state.sliced] || { x: 355, y: 255 };
    place(el.fruit, pos);
    el.fruit.hidden = false;
  }

  function showBomb() {
    if (state.status !== 'playing') return;
    const idx = state.bombCount % bombPositions.length;
    place(el.bomb, bombPositions[idx]);
    el.bomb.hidden = false;
  }

  // ---- Core transitions ----

  // Returns to the menu state. Shared by RESTART control and window.reset().
  function doReset(newSeed) {
    if (typeof newSeed === 'number') seed = newSeed >>> 0;
    clearTimers();
    el.fruit.hidden = true;
    el.bomb.hidden = true;
    state.status = 'menu';
    state.score = 0;
    state.lives = 3;
    state.sliced = 0;
    state.remaining = 5;
    state.bombCount = 0;
    buildSchedule();
    eventEpoch += 1;
    seq = 0;
    events = [];
    emit('game_reset', {});
    render();
  }

  function startGame() {
    if (state.status !== 'menu') return;
    state.status = 'playing';
    el.fruit.hidden = true;
    el.bomb.hidden = true;
    emit('game_started', {});
    showFruit();
    showBomb();
    render();
  }

  function sliceFruit() {
    if (state.status !== 'playing') return;
    if (el.fruit.hidden) return;
    state.score += 10;
    state.sliced += 1;
    state.remaining = Math.max(0, state.remaining - 1);
    emit('fruit_sliced', {
      score: state.score,
      sliced: state.sliced,
      remaining: state.remaining,
    });
    el.fruit.hidden = true;
    if (state.sliced >= 5) {
      state.status = 'won';
      emit('game_won', { score: state.score });
      el.bomb.hidden = true;
      render();
      return;
    }
    showFruit();
    render();
  }

  function hitBomb() {
    if (state.status !== 'playing') return;
    if (el.bomb.hidden) return;
    state.lives = Math.max(0, state.lives - 1);
    emit('bomb_hit', { lives: state.lives });
    el.bomb.hidden = true;
    state.bombCount += 1;
    if (state.lives <= 0) {
      state.status = 'lost';
      emit('game_lost', { lives: state.lives });
      el.fruit.hidden = true;
      render();
      return;
    }
    showBomb();
    render();
  }

  // ---- Real input only ----
  el.startBtn.addEventListener('click', startGame);
  el.restartBtn.addEventListener('click', function () { doReset(seed); });
  el.fruit.addEventListener('click', sliceFruit);
  el.bomb.addEventListener('click', hitBomb);

  // Touch support: preventDefault stops the synthetic click to avoid double firing.
  el.fruit.addEventListener('touchstart', function (e) { e.preventDefault(); sliceFruit(); }, { passive: false });
  el.bomb.addEventListener('touchstart', function (e) { e.preventDefault(); hitBomb(); }, { passive: false });

  // ---- Read-only observation bridge ----
  window.__GAMETESTLAB__ = {
    protocol: 'gametestlab/2',
    isReady: function () { return true; },
    reset: function (opts) {
      const s = opts && typeof opts.seed === 'number' ? opts.seed : seed;
      doReset(s);
    },
    observe: function () {
      return {
        tick: now(),
        status: state.status,
        state: {
          status: state.status,
          score: state.score,
          lives: state.lives,
          sliced: state.sliced,
          remaining: state.remaining,
        },
        event_epoch: eventEpoch,
        latest_event_seq: seq,
      };
    },
    getEvents: function (opts) {
      const after = opts && typeof opts.afterSeq === 'number' ? opts.afterSeq : 0;
      return events.filter(function (e) { return e.seq > after; });
    },
  };

  // ---- Init (no events emitted on first load) ----
  buildSchedule();
  render();
})();
