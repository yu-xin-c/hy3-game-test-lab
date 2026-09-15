(function () {
  'use strict';

  var STORAGE_KEY = 'petcare.save';
  var DECAY_INTERVAL = 2000; // ms
  var MAX = 3;
  var MIN = 0;

  // ---- deterministic RNG (mulberry32) ----
  // Seed establishes a deterministic PRNG state. Because the initial stats are
  // fixed at 2/2/2 and the decay schedule is a uniform 2000ms cadence, any seed
  // yields the identical initial state and timeline (per the public plan).
  function hashSeed(str) {
    str = String(str == null ? '' : str);
    var h = 1779033703 ^ str.length;
    for (var i = 0; i < str.length; i++) {
      h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
      h = (h << 13) | (h >>> 19);
    }
    return h >>> 0;
  }
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  var rng = mulberry32(1);
  var seedValue = 'default';

  // ---- core state ----
  var state = {
    status: 'menu',
    hunger: 2,
    happiness: 2,
    energy: 2,
    actions: { feed: 0, play: 0, sleep: 0 },
    saved: false
  };

  var tick = 0;
  var event_epoch = 0;
  var seq = 0;
  var latest_event_seq = 0;
  var eventLog = [];
  var decayTimer = null;
  var ready = false;

  // ---- events ----
  function pushEvent(type, payload) {
    seq += 1;
    var ev = { seq: seq, tick: tick, type: type };
    if (payload !== undefined) ev.payload = payload;
    eventLog.push(ev);
    latest_event_seq = seq;
    return ev;
  }

  // ---- persistence ----
  function save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        status: state.status,
        hunger: state.hunger,
        happiness: state.happiness,
        energy: state.energy,
        actions: state.actions,
        saved: true,
        tick: tick
      }));
      state.saved = true;
      pushEvent('state_saved', { stored: true });
    } catch (e) { /* storage may be unavailable */ }
  }

  function load() {
    var raw = null;
    try { raw = localStorage.getItem(STORAGE_KEY); } catch (e) { return false; }
    if (!raw) return false;
    try {
      var data = JSON.parse(raw);
      state.status = data.status || 'menu';
      state.hunger = (typeof data.hunger === 'number') ? data.hunger : 2;
      state.happiness = (typeof data.happiness === 'number') ? data.happiness : 2;
      state.energy = (typeof data.energy === 'number') ? data.energy : 2;
      state.actions = data.actions || { feed: 0, play: 0, sleep: 0 };
      state.saved = true;
      if (typeof data.tick === 'number') tick = data.tick;
      pushEvent('state_loaded', { status: state.status });
      return true;
    } catch (e) { return false; }
  }

  function clearSave() {
    try { localStorage.removeItem(STORAGE_KEY); } catch (e) { /* ignore */ }
  }

  // ---- rendering ----
  var els = {};
  function cacheEls() {
    els.score = document.querySelector('[data-testid="score"]');
    els.status = document.querySelector('[data-testid="status"]');
    els.info = document.getElementById('info-area');
    els.startBtn = document.getElementById('start-btn');
    els.feedBtn = document.getElementById('feed-btn');
    els.playBtn = document.getElementById('play-btn');
    els.sleepBtn = document.getElementById('sleep-btn');
    els.restartBtn = document.getElementById('restart-btn');
  }

  function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

  function infoHTML() {
    if (state.status === 'menu') {
      return '<h1>Pet Care Day</h1>' +
        '<p>在一天内把宠物的饱腹、快乐和精力都提升到 3。</p>' +
        '<p>点击 <b>Start</b> 开始新的一天。</p>';
    }
    if (state.status === 'playing') {
      return '<h2>照顾你的宠物</h2>' +
        '<p>Feed / Play / Sleep 各把对应项 +1（上限 3）。</p>' +
        '<p>每 2 秒三项各 -1；任一项降到 0 立即失败；三项均为 3 立即获胜。</p>';
    }
    if (state.status === 'won') {
      return '<h2>一天完成，你赢了！</h2>' +
        '<p>饱腹、快乐、精力都达到了 3。点击 <b>Restart</b> 重新开始。</p>';
    }
    if (state.status === 'lost') {
      return '<h2>宠物状态归零，你输了。</h2>' +
        '<p>有某项降到了 0。点击 <b>Restart</b> 重新开始。</p>';
    }
    return '';
  }

  function render() {
    if (els.score) els.score.textContent = 'H:' + state.hunger + '/P:' + state.happiness + '/E:' + state.energy;
    if (els.status) els.status.textContent = cap(state.status);
    if (els.info) els.info.innerHTML = infoHTML();
    document.body.setAttribute('data-status', state.status);
  }

  // ---- decay timer (driven by real timers for virtual-time advancement) ----
  function startDecay() {
    stopDecay();
    decayTimer = setInterval(onDecay, DECAY_INTERVAL);
  }
  function stopDecay() {
    if (decayTimer) { clearInterval(decayTimer); decayTimer = null; }
  }
  function onDecay() {
    if (state.status !== 'playing') return;
    tick += 1;
    state.hunger = Math.max(MIN, state.hunger - 1);
    state.happiness = Math.max(MIN, state.happiness - 1);
    state.energy = Math.max(MIN, state.energy - 1);
    pushEvent('need_decayed', {
      tick: tick,
      hunger: state.hunger,
      happiness: state.happiness,
      energy: state.energy
    });
    save();
    if (state.hunger === MIN || state.happiness === MIN || state.energy === MIN) {
      endGame('lost');
    }
    render();
  }

  function checkWin() {
    if (state.hunger === MAX && state.happiness === MAX && state.energy === MAX) {
      endGame('won');
    }
  }

  function endGame(result) {
    state.status = result;
    stopDecay();
    save();
    if (result === 'won') pushEvent('game_won', {});
    else pushEvent('game_lost', {});
    render();
  }

  // ---- player actions (real-input only) ----
  function start() {
    if (state.status !== 'menu') return;
    state.status = 'playing';
    tick = 0;
    pushEvent('game_started', {});
    render();
    startDecay();
  }

  function feed() {
    if (state.status !== 'playing') return;
    state.hunger = Math.min(MAX, state.hunger + 1);
    state.actions.feed += 1;
    pushEvent('pet_fed', { hunger: state.hunger });
    save();
    checkWin();
    render();
  }

  function play() {
    if (state.status !== 'playing') return;
    state.happiness = Math.min(MAX, state.happiness + 1);
    state.actions.play += 1;
    pushEvent('pet_played', { happiness: state.happiness });
    save();
    checkWin();
    render();
  }

  function sleep() {
    if (state.status !== 'playing') return;
    state.energy = Math.min(MAX, state.energy + 1);
    state.actions.sleep += 1;
    pushEvent('pet_slept', { energy: state.energy });
    save();
    checkWin();
    render();
  }

  // ---- restart (clears save, returns to menu) ----
  function restart() {
    stopDecay();
    clearSave();
    state.status = 'menu';
    state.hunger = 2;
    state.happiness = 2;
    state.energy = 2;
    state.actions = { feed: 0, play: 0, sleep: 0 };
    state.saved = false;
    tick = 0;
    event_epoch += 1;
    eventLog = [];
    seq = 0;
    latest_event_seq = 0;
    pushEvent('game_reset', {});
    render();
  }

  // ---- bridge reset({seed}) ----
  function reset(opts) {
    opts = opts || {};
    if (opts.seed !== undefined) {
      seedValue = opts.seed;
      rng = mulberry32(hashSeed(opts.seed));
    }
    stopDecay();
    clearSave();
    state.status = 'menu';
    state.hunger = 2;
    state.happiness = 2;
    state.energy = 2;
    state.actions = { feed: 0, play: 0, sleep: 0 };
    state.saved = false;
    tick = 0;
    event_epoch += 1;
    eventLog = [];
    seq = 0;
    latest_event_seq = 0;
    pushEvent('game_reset', { seed: seedValue });
    render();
  }

  // ---- read-only observation bridge ----
  window.__GAMETESTLAB__ = {
    protocol: 'gametestlab/2',
    isReady: function () { return ready; },
    reset: function (opts) { reset(opts); },
    observe: function () {
      return {
        protocol: 'gametestlab/2',
        tick: tick,
        status: state.status,
        state: JSON.parse(JSON.stringify(state)),
        event_epoch: event_epoch,
        latest_event_seq: latest_event_seq
      };
    },
    getEvents: function (opts) {
      opts = opts || {};
      var after = (typeof opts.afterSeq === 'number') ? opts.afterSeq : 0;
      var out = [];
      for (var i = 0; i < eventLog.length; i++) {
        if (eventLog[i].seq > after) out.push(eventLog[i]);
      }
      return out;
    }
  };

  // ---- init ----
  function init() {
    cacheEls();
    load();
    ready = true;
    if (state.status === 'playing') startDecay();
    render();

    els.startBtn.addEventListener('click', start);
    els.feedBtn.addEventListener('click', feed);
    els.playBtn.addEventListener('click', play);
    els.sleepBtn.addEventListener('click', sleep);
    els.restartBtn.addEventListener('click', restart);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
