(function () {
  'use strict';

  var STORAGE_KEY = 'mini_farm_state';

  function defaultState() {
    return {
      status: 'menu',
      selected_plot: -1,
      plots: [
        { status: 'empty', watered_at: null },
        { status: 'empty', watered_at: null },
        { status: 'empty', watered_at: null }
      ],
      elapsed_ms: 0,
      harvested: 0,
      coins: 0,
      best_coins: 0,
      saved: false
    };
  }

  // ---- module state ----
  var state = defaultState();
  var start_time = 0;
  var seed = 0;
  var event_epoch = 1;
  var seq = 0;
  var events = [];
  var ready = false;

  var canvas, ctx;
  var scoreEl, statusEl, startBtn, plantBtn, waterBtn, harvestBtn, restartBtn;
  var plotBtns = [];

  function emit(type, payload) {
    seq++;
    var ev = { seq: seq, tick: state.elapsed_ms, type: type, payload: payload || {} };
    events.push(ev);
    return ev;
  }

  function save() {
    state.saved = true;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      emit('state_saved', {});
    } catch (e) {
      state.saved = false;
    }
  }

  function load() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      var saved = JSON.parse(raw);
      var d = defaultState();
      // shallow-merge known fields, then sanitize
      for (var k in d) {
        if (Object.prototype.hasOwnProperty.call(saved, k)) d[k] = saved[k];
      }
      if (!Array.isArray(d.plots) || d.plots.length !== 3) {
        d.plots = defaultState().plots;
      } else {
        for (var j = 0; j < 3; j++) {
          if (!d.plots[j] || typeof d.plots[j].status !== 'string') {
            d.plots[j] = { status: 'empty', watered_at: null };
          }
          if (typeof d.plots[j].watered_at !== 'number') d.plots[j].watered_at = null;
        }
      }
      if (typeof d.elapsed_ms !== 'number') d.elapsed_ms = 0;
      if (typeof d.coins !== 'number') d.coins = 0;
      if (typeof d.harvested !== 'number') d.harvested = 0;
      if (typeof d.best_coins !== 'number') d.best_coins = 0;
      if (typeof d.status !== 'string') d.status = 'menu';
      if (typeof d.selected_plot !== 'number') d.selected_plot = -1;
      state = d;
      start_time = performance.now() - state.elapsed_ms;
      emit('state_loaded', {});
    } catch (e) {
      // ignore corrupt save
    }
  }

  function syncElapsed() {
    if (state.status === 'playing') {
      state.elapsed_ms = performance.now() - start_time;
    }
  }

  // ---- gameplay actions ----
  function selectPlot(i) {
    if (state.status !== 'playing') return;
    state.selected_plot = i;
    emit('plot_selected', { plot: i });
    save();
  }

  function plant() {
    if (state.status !== 'playing') return;
    syncElapsed();
    var i = state.selected_plot;
    if (i < 0) return;
    if (state.plots[i].status !== 'empty') return;
    state.plots[i].status = 'planted';
    emit('crop_planted', { plot: i });
    save();
  }

  function water() {
    if (state.status !== 'playing') return;
    syncElapsed();
    var i = state.selected_plot;
    if (i < 0) return;
    if (state.plots[i].status !== 'planted') return;
    state.plots[i].status = 'growing';
    state.plots[i].watered_at = state.elapsed_ms;
    emit('crop_watered', { plot: i });
    save();
  }

  function harvest() {
    if (state.status !== 'playing') return;
    syncElapsed();
    var i = state.selected_plot;
    if (i < 0) return;
    if (state.plots[i].status !== 'ready') return;
    state.plots[i].status = 'harvested';
    state.coins += 10;
    state.harvested += 1;
    emit('crop_harvested', { plot: i });
    save();
    checkWin();
  }

  function checkWin() {
    if (state.status === 'playing' && state.harvested >= 3) {
      state.best_coins = Math.max(state.best_coins, state.coins);
      emit('leaderboard_updated', { best_coins: state.best_coins });
      state.status = 'won';
      emit('game_won', {});
      save();
    }
  }

  function start() {
    if (state.status !== 'menu') return;
    state.status = 'playing';
    start_time = performance.now() - state.elapsed_ms;
    emit('game_started', {});
    save();
  }

  function reset(opts) {
    event_epoch += 1;
    seq = 0;
    events = [];
    seed = (opts && typeof opts.seed === 'number') ? opts.seed : 0;
    state = defaultState();
    start_time = performance.now();
    emit('game_reset', { seed: seed });
    save();
    updateUI();
  }

  // ---- main loop (virtual-time driven) ----
  function loop() {
    if (state.status === 'playing') {
      state.elapsed_ms = performance.now() - start_time;
      var changed = false;
      for (var i = 0; i < 3; i++) {
        var p = state.plots[i];
        if (p.status === 'growing' && (state.elapsed_ms - p.watered_at) >= 3000) {
          p.status = 'ready';
          emit('crop_ready', { plot: i });
          changed = true;
        }
      }
      if (changed) save();
      if (state.status === 'playing' && state.elapsed_ms >= 15000) {
        state.status = 'lost';
        emit('game_lost', {});
        save();
      }
    }
    draw();
    updateUI();
    requestAnimationFrame(loop);
  }

  // ---- rendering ----
  function plotColor(s) {
    if (s === 'empty') return '#7a5230';
    if (s === 'planted') return '#3e6b2e';
    if (s === 'growing') return '#4caf50';
    if (s === 'ready') return '#ffd54f';
    if (s === 'harvested') return '#9e9e9e';
    return '#7a5230';
  }

  function plotLabel(s) {
    if (s === 'empty') return 'Empty';
    if (s === 'planted') return 'Planted';
    if (s === 'growing') return 'Growing';
    if (s === 'ready') return 'Ready!';
    if (s === 'harvested') return 'Harvested';
    return s;
  }

  function draw() {
    ctx.clearRect(0, 0, 800, 600);
    // sky
    ctx.fillStyle = '#87ceeb';
    ctx.fillRect(0, 0, 800, 600);
    // ground
    ctx.fillStyle = '#5b3a1a';
    ctx.fillRect(0, 360, 800, 240);

    for (var i = 0; i < 3; i++) {
      var x = 80 + i * 230;
      var y = 120;
      var w = 180, h = 200;
      var p = state.plots[i];
      ctx.fillStyle = plotColor(p.status);
      ctx.fillRect(x, y, w, h);
      ctx.lineWidth = (state.selected_plot === i) ? 6 : 2;
      ctx.strokeStyle = (state.selected_plot === i) ? '#ffffff' : 'rgba(0,0,0,0.4)';
      ctx.strokeRect(x, y, w, h);
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 20px sans-serif';
      ctx.fillText('PLOT ' + (i + 1), x + 14, y + 34);
      ctx.font = 'bold 22px sans-serif';
      ctx.fillText(plotLabel(p.status), x + 14, y + 70);
      if (state.selected_plot === i) {
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 16px sans-serif';
        ctx.fillText('SELECTED', x + 14, y + 100);
      }
    }

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 18px sans-serif';
    var remain = Math.max(0, 15000 - state.elapsed_ms);
    ctx.fillText('Time left: ' + Math.ceil(remain) + ' ms', 20, 400);
    ctx.fillText('Goal: plant, water & harvest all 3 plots (30 coins)', 20, 430);

    if (state.status === 'won') {
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.fillRect(0, 240, 800, 120);
      ctx.fillStyle = '#ffd54f';
      ctx.font = 'bold 48px sans-serif';
      ctx.fillText('YOU WIN!', 270, 312);
    } else if (state.status === 'lost') {
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.fillRect(0, 240, 800, 120);
      ctx.fillStyle = '#ff5252';
      ctx.font = 'bold 48px sans-serif';
      ctx.fillText('TIME UP!', 270, 312);
    }
  }

  function updateUI() {
    if (scoreEl) {
      scoreEl.textContent = 'Coins: ' + state.coins + ' / 30   Harvested: ' +
        state.harvested + '/3   Time: ' + Math.floor(state.elapsed_ms) + 'ms';
    }
    if (statusEl) {
      var s = state.status;
      statusEl.textContent = s.charAt(0).toUpperCase() + s.slice(1);
    }
    if (startBtn) startBtn.disabled = (state.status !== 'menu');
    if (plantBtn) plantBtn.disabled = (state.status !== 'playing');
    if (waterBtn) waterBtn.disabled = (state.status !== 'playing');
    if (harvestBtn) harvestBtn.disabled = (state.status !== 'playing');
    for (var i = 0; i < plotBtns.length; i++) {
      if (plotBtns[i]) plotBtns[i].disabled = (state.status !== 'playing');
    }
    // restart is always available (in-game and terminal)
  }

  // ---- observe bridge ----
  function isReady() { return ready; }

  function observe() {
    return {
      tick: state.elapsed_ms,
      status: state.status,
      state: JSON.parse(JSON.stringify(state)),
      event_epoch: event_epoch,
      latest_event_seq: seq
    };
  }

  function getEvents(opts) {
    var afterSeq = (opts && typeof opts.afterSeq === 'number') ? opts.afterSeq : 0;
    var out = [];
    for (var i = 0; i < events.length; i++) {
      if (events[i].seq > afterSeq) out.push(JSON.parse(JSON.stringify(events[i])));
    }
    return out;
  }

  window.__GAMETESTLAB__ = {
    protocol: 'gametestlab/2',
    isReady: isReady,
    reset: reset,
    observe: observe,
    getEvents: getEvents
  };

  // ---- init ----
  function init() {
    canvas = document.getElementById('farm-canvas');
    ctx = canvas.getContext('2d');
    scoreEl = document.querySelector('[data-testid="score"]');
    statusEl = document.querySelector('[data-testid="status"]');
    startBtn = document.getElementById('start-btn');
    plantBtn = document.getElementById('plant-btn');
    waterBtn = document.getElementById('water-btn');
    harvestBtn = document.getElementById('harvest-btn');
    restartBtn = document.getElementById('restart-btn');
    plotBtns = [
      document.getElementById('plot-1'),
      document.getElementById('plot-2'),
      document.getElementById('plot-3')
    ];

    load();

    startBtn.addEventListener('click', start);
    plantBtn.addEventListener('click', plant);
    waterBtn.addEventListener('click', water);
    harvestBtn.addEventListener('click', harvest);
    restartBtn.addEventListener('click', function () { reset({}); });
    for (var i = 0; i < plotBtns.length; i++) {
      (function (idx) {
        plotBtns[idx].addEventListener('click', function () { selectPlot(idx); });
      })(i);
    }

    ready = true;
    updateUI();
    requestAnimationFrame(loop);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
