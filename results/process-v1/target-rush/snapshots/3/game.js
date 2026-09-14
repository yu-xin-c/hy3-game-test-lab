(function () {
  'use strict';

  var GAME_W = 800, GAME_H = 600, HUD_H = 48, R = 24;

  var state = {
    status: 'menu',
    score: 0,
    misses: 0,
    remaining_ms: 20000,
    target_index: 0,
    seed: 12345
  };

  var positions = [];
  var startTime = 0;
  var targetScored = false;
  var tick = 0;
  var eventEpoch = 0;
  var events = [];
  var eventSeq = 0;
  var ready = false;

  function $(id) { return document.getElementById(id); }

  var hudEl = $('hud');
  var scoreEl = $('score');
  var missesEl = $('misses');
  var timeEl = $('time');
  var statusEl = $('status');
  var targetEl = $('target');
  var playfieldEl = $('playfield');
  var menuEl = $('menu');
  var endEl = $('endscreen');
  var endTitleEl = $('end-title');
  var endMsgEl = $('end-msg');
  var startBtn = $('start-btn');
  var restartBtn = $('restart-btn');

  // Deterministic PRNG.
  function mulberry32(a) {
    return function () {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      var t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  function computePositions(seed) {
    var rnd = mulberry32(seed >>> 0);
    var arr = [];
    for (var i = 0; i < 5; i++) {
      var x = R + rnd() * (GAME_W - 2 * R);
      var y = (HUD_H + R) + rnd() * (GAME_H - HUD_H - 2 * R);
      arr.push({ x: x, y: y });
    }
    positions = arr;
  }

  function moveTarget(idx) {
    var p = positions[idx];
    if (!p) return;
    targetEl.style.left = (p.x - R) + 'px';
    targetEl.style.top = (p.y - R) + 'px';
  }

  function updateHud() {
    scoreEl.textContent = 'Score: ' + state.score + '/5';
    missesEl.textContent = 'Misses: ' + state.misses + '/3';
    timeEl.textContent = 'Time: ' + (state.remaining_ms / 1000).toFixed(1);
    var label = { menu: 'Menu', playing: 'Playing', won: 'Won', lost: 'Lost' }[state.status] || 'Menu';
    statusEl.textContent = label;
  }

  function emit(type, payload) {
    eventSeq++;
    var ev = { seq: eventSeq, tick: tick, type: type, payload: payload || {} };
    events.push(ev);
    return ev;
  }

  function showMenu() {
    menuEl.style.display = 'flex';
    endEl.style.display = 'none';
    targetEl.style.display = 'none';
  }

  function showEnd(won) {
    endTitleEl.textContent = won ? 'You Won!' : 'You Lost!';
    endMsgEl.textContent = won ? '你在时间内击中了 5 个目标。' : '再试一次吧。';
    endEl.style.display = 'flex';
    targetEl.style.display = 'none';
  }

  function startGame() {
    if (state.status !== 'menu') return;
    state.status = 'playing';
    state.score = 0;
    state.misses = 0;
    state.target_index = 0;
    state.remaining_ms = 20000;
    computePositions(state.seed);
    moveTarget(0);
    targetEl.style.display = 'block';
    targetScored = false;
    menuEl.style.display = 'none';
    endEl.style.display = 'none';
    updateHud();
    emit('game_started', {});
    startTime = performance.now();
  }

  function win() {
    if (state.status !== 'playing') return;
    state.status = 'won';
    updateHud();
    showEnd(true);
    emit('game_won', {});
  }

  function lose() {
    if (state.status !== 'playing') return;
    state.status = 'lost';
    state.remaining_ms = 0;
    updateHud();
    showEnd(false);
    emit('game_lost', {});
  }

  function onTargetClick(e) {
    if (state.status !== 'playing') return;
    if (e.target !== targetEl) return;
    if (targetScored) return;
    targetScored = true;
    var hitIndex = state.target_index;
    state.score++;
    emit('target_hit', { target_index: hitIndex });
    state.target_index++;
    updateHud();
    if (state.score >= 5) {
      win();
      return;
    }
    moveTarget(state.target_index);
    targetScored = false;
  }

  function onPlayfieldClick(e) {
    if (state.status !== 'playing') return;
    if (e.target === targetEl) return;
    if (e.target.closest('#hud')) return;
    if (e.target.closest('#start-btn')) return;
    if (e.target.closest('#restart-btn')) return;
    state.misses++;
    emit('target_missed', {});
    updateHud();
    if (state.misses >= 3) {
      lose();
    }
  }

  function reset(opts) {
    opts = opts || {};
    if (opts && typeof opts.seed === 'number') {
      state.seed = opts.seed >>> 0;
    }
    computePositions(state.seed);
    state.status = 'menu';
    state.score = 0;
    state.misses = 0;
    state.target_index = 0;
    state.remaining_ms = 20000;
    eventEpoch++;
    events = [];
    eventSeq = 0;
    targetScored = false;
    moveTarget(0);
    showMenu();
    updateHud();
    emit('game_reset', { seed: state.seed });
  }

  startBtn.addEventListener('click', startGame);
  restartBtn.addEventListener('click', function () { reset({}); });
  targetEl.addEventListener('click', onTargetClick);
  playfieldEl.addEventListener('click', onPlayfieldClick);
  window.addEventListener('keydown', function (e) {
    if (e.code === 'KeyR') {
      reset({});
    }
  });

  function loop(now) {
    tick++;
    if (state.status === 'playing') {
      var elapsed = now - startTime;
      state.remaining_ms = Math.max(0, 20000 - elapsed);
      updateHud();
      if (state.remaining_ms <= 0) {
        lose();
      }
    }
    requestAnimationFrame(loop);
  }

  computePositions(state.seed);
  moveTarget(0);
  showMenu();
  updateHud();
  ready = true;
  requestAnimationFrame(loop);

  window.__GAMETESTLAB__ = {
    protocol: 'gametestlab/2',
    isReady: function () { return ready; },
    reset: function (opts) { reset(opts); },
    observe: function () {
      return {
        tick: tick,
        status: state.status,
        state: {
          status: state.status,
          score: state.score,
          misses: state.misses,
          remaining_ms: state.remaining_ms,
          target_index: state.target_index
        },
        event_epoch: eventEpoch,
        latest_event_seq: events.length ? events[events.length - 1].seq : 0
      };
    },
    getEvents: function (opts) {
      opts = opts || {};
      var after = (typeof opts.afterSeq === 'number') ? opts.afterSeq : 0;
      return events.filter(function (e) { return e.seq > after; });
    }
  };
})();
