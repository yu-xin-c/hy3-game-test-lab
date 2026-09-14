(function () {
  'use strict';

  // ---- Fixed constants (deterministic physics) ----
  var WORLD_W = 800, WORLD_H = 600;
  var GRAVITY = 0.6, MOVE = 3, JUMP_VY = -11, MAX_FALL = 12;
  var FIXED_DT = 16;            // ms per tick
  var DEFAULT_SEED = 12345;
  var SPAWN = { x: 40, y: 520, w: 24, h: 32 };

  function makePlatforms() {
    return [
      { id: 'ground',     x: 0,   y: 560, width: 800, height: 40 },
      { id: 'platform-1', x: 70,  y: 470, width: 170, height: 20 },
      { id: 'platform-2', x: 160, y: 380, width: 170, height: 20 },
      { id: 'end',        x: 230, y: 290, width: 300, height: 20 }
    ];
  }
  function makeSpike() { return { x: 80,  y: 540, width: 40,  height: 20 }; }
  function makeKey()   { return { x: 185, y: 360, width: 20,  height: 20 }; }
  function makeDoor()  { return { x: 460, y: 230, width: 30,  height: 60 }; }

  // mulberry32 PRNG (seed-driven determinism for any random quantity)
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // ---- Mutable state ----
  var status = 'menu';          // menu | playing | won | lost
  var lives = 3;
  var has_key = false;
  var tick = 0;
  var sim_time_ms = 0;
  var currentSeed = DEFAULT_SEED;
  var rng = mulberry32(currentSeed);
  var eventEpoch = 0;
  var seqCounter = 1;
  var events = [];
  var doorBlockedFlag = false;

  var player = {
    x: SPAWN.x, y: SPAWN.y, w: SPAWN.w, h: SPAWN.h,
    vx: 0, vy: 0, grounded: false, support_id: null
  };
  var platforms = makePlatforms();
  var spike = makeSpike();
  var key = makeKey();
  var door = makeDoor();

  var keys = { left: false, right: false };
  var jumpQueued = false;

  // ---- DOM ----
  var canvas = document.getElementById('game-canvas');
  var ctx = canvas.getContext('2d');
  var scoreEl = document.querySelector('[data-testid="score"]');
  var statusEl = document.querySelector('[data-testid="status"]');
  var startBtn = document.getElementById('start-btn');
  var restartBtn = document.getElementById('restart-btn');

  function rectsOverlap(ax, ay, aw, ah, bx, by, bw, bh) {
    return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
  }

  function emit(type, payload) {
    var ev = { seq: seqCounter++, tick: tick, type: type, payload: payload || {} };
    events.push(ev);
    return ev;
  }

  function resetGame(seed) {
    eventEpoch++;
    seqCounter = 1;
    events = [];
    if (seed !== undefined && seed !== null) currentSeed = seed >>> 0;
    rng = mulberry32(currentSeed);
    tick = 0;
    sim_time_ms = 0;
    status = 'menu';
    lives = 3;
    has_key = false;
    doorBlockedFlag = false;
    player.x = SPAWN.x; player.y = SPAWN.y; player.w = SPAWN.w; player.h = SPAWN.h;
    player.vx = 0; player.vy = 0; player.grounded = false; player.support_id = null;
    platforms = makePlatforms();
    spike = makeSpike();
    key = makeKey();
    door = makeDoor();
    keys.left = false; keys.right = false; jumpQueued = false;
    emit('game_reset', { seed: currentSeed });
  }

  function startGame() {
    if (status === 'playing') return;
    if (status === 'won' || status === 'lost') resetGame(currentSeed);
    status = 'playing';
    emit('game_started', {});
  }

  function restartGame() { resetGame(currentSeed); }

  function respawn() {
    player.x = SPAWN.x; player.y = SPAWN.y;
    player.vx = 0; player.vy = 0;
    player.grounded = false; player.support_id = null;
    emit('player_respawned', { x: player.x, y: player.y });
  }

  function step() {
    if (status !== 'playing') return;

    // 1) input -> horizontal velocity (right has priority when both held)
    var vx = 0;
    if (keys.right && !keys.left) vx = MOVE;
    else if (keys.left && !keys.right) vx = -MOVE;
    player.vx = vx;

    // 2) jump only when grounded (no air jumps)
    if (jumpQueued) {
      if (player.grounded) {
        player.vy = JUMP_VY;
        player.grounded = false;
        player.support_id = null;
        emit('player_jumped', { x: player.x, y: player.y });
      }
      jumpQueued = false;
    }

    // 3) gravity + integrate
    player.vy = Math.min(player.vy + GRAVITY, MAX_FALL);
    var oldY = player.y;
    player.x += player.vx;
    player.y += player.vy;

    // keep inside world horizontally
    if (player.x < 0) player.x = 0;
    if (player.x + player.w > WORLD_W) player.x = WORLD_W - player.w;

    // 4) one-way top landing (only when descending and previously above the surface)
    var landed = false;
    for (var i = 0; i < platforms.length; i++) {
      var p = platforms[i];
      var oldBottom = oldY + player.h;
      var newBottom = player.y + player.h;
      if (player.vy >= 0 && oldBottom <= p.y + 1 && newBottom >= p.y &&
          player.x + player.w > p.x && player.x < p.x + p.width) {
        player.y = p.y - player.h;
        player.vy = 0;
        if (player.support_id !== p.id) {
          emit('player_landed', { support_id: p.id, x: player.x, y: player.y });
        }
        player.grounded = true;
        player.support_id = p.id;
        landed = true;
        break;
      }
    }
    if (!landed) { player.grounded = false; player.support_id = null; }

    // 5) key
    if (!has_key && rectsOverlap(player.x, player.y, player.w, player.h,
                                 key.x, key.y, key.width, key.height)) {
      has_key = true;
      emit('key_collected', { x: key.x, y: key.y });
    }

    // 6) door
    if (rectsOverlap(player.x, player.y, player.w, player.h,
                     door.x, door.y, door.width, door.height)) {
      if (has_key) {
        status = 'won';
        emit('game_won', {});
      } else if (!doorBlockedFlag) {
        doorBlockedFlag = true;
        emit('door_blocked', { x: door.x, y: door.y });
      }
    } else {
      doorBlockedFlag = false;
    }

    // 7) hazards: spike overlap or falling out of the world
    var hazard = false, cause = '';
    if (player.y > WORLD_H) { hazard = true; cause = 'fall'; }
    else if (rectsOverlap(player.x, player.y, player.w, player.h,
                          spike.x, spike.y, spike.width, spike.height)) {
      hazard = true; cause = 'spike';
    }
    if (hazard) {
      lives--;
      emit('hazard_hit', { cause: cause, x: player.x, y: player.y });
      if (lives <= 0) { lives = 0; status = 'lost'; emit('game_lost', {}); }
      else { respawn(); }
    }

    tick++;
    sim_time_ms = tick * FIXED_DT;
  }

  // ---- Render loop (fixed-timestep accumulator, rAF/performance driven) ----
  var lastTime = performance.now();
  var acc = 0;
  function frame(now) {
    var dt = now - lastTime; lastTime = now;
    if (dt > 200) dt = 200;
    acc += dt;
    while (acc >= FIXED_DT) { step(); acc -= FIXED_DT; }
    render();
    updateHUD();
    requestAnimationFrame(frame);
  }

  function render() {
    ctx.clearRect(0, 0, WORLD_W, WORLD_H);
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, WORLD_W, WORLD_H);

    for (var i = 0; i < platforms.length; i++) {
      var p = platforms[i];
      ctx.fillStyle = p.id === 'ground' ? '#475569' : '#94a3b8';
      ctx.fillRect(p.x, p.y, p.width, p.height);
    }

    // spike (red triangles)
    ctx.fillStyle = '#ef4444';
    var teeth = Math.max(1, Math.floor(spike.width / 8));
    for (var t = 0; t < teeth; t++) {
      var bx = spike.x + t * 8;
      ctx.beginPath();
      ctx.moveTo(bx, spike.y + spike.height);
      ctx.lineTo(bx + 4, spike.y);
      ctx.lineTo(bx + 8, spike.y + spike.height);
      ctx.closePath(); ctx.fill();
    }

    // key (yellow)
    if (!has_key) {
      ctx.fillStyle = '#facc15';
      ctx.beginPath();
      ctx.arc(key.x + key.width / 2, key.y + 6, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillRect(key.x + key.width / 2 - 2, key.y + 10, 4, key.height - 10);
    }

    // door (green; brighter when unlocked)
    ctx.fillStyle = has_key ? '#22c55e' : '#15803d';
    ctx.fillRect(door.x, door.y, door.width, door.height);
    ctx.fillStyle = '#064e3b';
    ctx.beginPath();
    ctx.arc(door.x + door.width / 2, door.y + door.height / 2,
            door.width / 2 - 2, Math.PI, 0);
    ctx.fill();

    // player (blue)
    ctx.fillStyle = '#3b82f6';
    ctx.fillRect(player.x, player.y, player.w, player.h);

    // overlay for non-playing states
    if (status !== 'playing') {
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fillRect(0, 0, WORLD_W, WORLD_H);
      ctx.fillStyle = '#ffffff';
      ctx.font = '34px sans-serif';
      ctx.textAlign = 'center';
      var msg = status === 'menu' ? 'PLATFORM RESCUE — Press Start'
              : status === 'won' ? 'RESCUE SUCCESS!' : 'GAME OVER';
      ctx.fillText(msg, WORLD_W / 2, WORLD_H / 2);
      ctx.textAlign = 'left';
    }
  }

  function updateHUD() {
    if (scoreEl) scoreEl.textContent = 'Lives: ' + lives + '/3  Key: ' + (has_key ? 'Yes' : 'No');
    if (statusEl) {
      var map = { menu: 'Menu', playing: 'Playing', won: 'Won', lost: 'Lost' };
      statusEl.textContent = map[status] || status;
    }
  }

  // ---- Real input only ----
  window.addEventListener('keydown', function (e) {
    if (e.code === 'ArrowLeft') { keys.left = true; e.preventDefault(); }
    else if (e.code === 'ArrowRight') { keys.right = true; e.preventDefault(); }
    else if (e.code === 'Space') { if (!e.repeat) jumpQueued = true; e.preventDefault(); }
    else if (e.code === 'KeyR') { restartGame(); e.preventDefault(); }
  });
  window.addEventListener('keyup', function (e) {
    if (e.code === 'ArrowLeft') keys.left = false;
    else if (e.code === 'ArrowRight') keys.right = false;
  });

  startBtn.addEventListener('click', startGame);
  restartBtn.addEventListener('click', restartGame);

  // ---- Read-only observation bridge ----
  window.__GAMETESTLAB__ = {
    protocol: 'gametestlab/2',
    isReady: function () { return true; },
    reset: function (opts) { resetGame(opts && opts.seed); },
    observe: function () {
      return {
        tick: tick,
        status: status,
        state: {
          status: status,
          lives: lives,
          has_key: has_key,
          player: {
            x: player.x, y: player.y, w: player.w, h: player.h,
            vx: player.vx, vy: player.vy,
            grounded: player.grounded, support_id: player.support_id
          },
          platforms: platforms.map(function (p) {
            return { id: p.id, x: p.x, y: p.y, width: p.width, height: p.height };
          }),
          world: { width: WORLD_W, height: WORLD_H },
          sim_time_ms: sim_time_ms
        },
        event_epoch: eventEpoch,
        latest_event_seq: seqCounter - 1
      };
    },
    getEvents: function (opts) {
      var after = (opts && typeof opts.afterSeq === 'number') ? opts.afterSeq : 0;
      return events.filter(function (e) { return e.seq > after; });
    }
  };

  // ---- Boot ----
  resetGame(DEFAULT_SEED);
  requestAnimationFrame(frame);
})();
