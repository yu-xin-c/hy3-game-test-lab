/* Neon Lane Racer
 * Native WebGL, no remote resources. Single rAF loop driven by performance.now().
 * Public plan steps 1-6 implemented here.
 */
(function () {
  'use strict';

  // ---- Fixed schedule (plan step 1) ----
  var SCHEDULE = [
    { t: 1000, lane: 1 },
    { t: 2000, lane: 0 },
    { t: 3000, lane: 1 },
    { t: 4000, lane: 2 }
  ];
  var WIN_T = 5000;
  var LANE_COUNT = 3;
  var LANE_W = 800 / LANE_COUNT;
  var SEED_CONST = 1; // deterministic baseline; schedule is constant regardless of seed

  // ---- Game state (plan steps 1, 3, 4) ----
  var status = 'menu';   // menu | playing | won | lost
  var lane = 1;
  var elapsed_ms = 0;
  var passed = 0;
  var collisions = 0;
  var score = 0;

  var playing_start = 0;
  var next_obstacle = 0;

  // ---- Bridge state (plan steps 3, 5, 6) ----
  var events = [];
  var seq = 0;
  var tick = 0;
  var event_epoch = 0;
  var current_seed = 0;
  var inited = false;

  // ---- DOM ----
  var canvas, gl, scoreEl, statusEl, startBtn, restartBtn, menuEl, resultEl, resultCardEl;

  // ---- WebGL buffers ----
  var program, posBuf, colBuf, aPos, aCol;
  var verts = [];
  var cols = [];

  function now() {
    if (typeof performance !== 'undefined' && performance.now) return performance.now();
    return Date.now();
  }

  // ---- Event emission (plan step 5) ----
  function emit(type, payload) {
    seq++;
    events.push({ seq: seq, tick: tick, type: type, payload: payload || {} });
  }

  function freshState() {
    return {
      status: status,
      lane: lane,
      elapsed_ms: elapsed_ms,
      passed: passed,
      collisions: collisions,
      score: score
    };
  }

  // ---- Reset to deterministic menu (plan steps 3, 6) ----
  function doReset(seed) {
    current_seed = (typeof seed === 'number') ? seed : current_seed;
    event_epoch++;
    events = [];
    seq = 0;
    status = 'menu';
    lane = 1;
    elapsed_ms = 0;
    passed = 0;
    collisions = 0;
    score = 0;
    next_obstacle = 0;
    emit('game_reset', { seed: current_seed });
    updateHUD();
    updateButtons();
  }

  // ---- Start game (plan step 1) ----
  function startGame() {
    if (status !== 'menu') return;
    status = 'playing';
    elapsed_ms = 0;
    next_obstacle = 0;
    playing_start = now();
    emit('game_started', {});
    updateHUD();
    updateButtons();
  }

  // ---- Lane movement (plan step 1) ----
  function moveLane(dir) {
    if (status !== 'playing') return; // ignore input unless playing
    var nl = Math.max(0, Math.min(LANE_COUNT - 1, lane + dir));
    if (nl === lane) return; // edge clamp: no movement, no event
    lane = nl;
    emit('lane_changed', { lane: lane });
    updateHUD();
  }

  function handleKey(e) {
    if (e.code === 'ArrowLeft') { moveLane(-1); }
    else if (e.code === 'ArrowRight') { moveLane(1); }
  }

  // ---- Per-frame play logic (plan step 1) ----
  function updatePlaying() {
    if (status !== 'playing') return;
    elapsed_ms = Math.floor(now() - playing_start);

    while (next_obstacle < SCHEDULE.length && elapsed_ms >= SCHEDULE[next_obstacle].t) {
      var ob = SCHEDULE[next_obstacle];
      if (lane === ob.lane) {
        collisions++;
        status = 'lost';
        emit('car_crashed', { lane: lane });
        updateHUD();
        updateButtons();
        return;
      } else {
        passed++;
        score += 100;
        emit('obstacle_passed', { passed: passed });
        next_obstacle++;
      }
    }

    if (status === 'playing' && elapsed_ms >= WIN_T) {
      status = 'won';
      score = 500;
      emit('game_won', { score: score });
      updateHUD();
      updateButtons();
    }
  }

  // ---- HUD (plan step 4) ----
  function updateHUD() {
    if (!statusEl) return;
    var label = status.charAt(0).toUpperCase() + status.slice(1);
    statusEl.textContent = label;

    var txt;
    if (status === 'playing') {
      txt = 'Score: ' + score + '   Progress: ' + elapsed_ms + '/' + WIN_T + 'ms   Passed: ' + passed;
    } else if (status === 'won' || status === 'lost') {
      txt = 'Score: ' + score + '   Passed: ' + passed + '   Collisions: ' + collisions;
    } else {
      txt = 'Score: 0   Progress: 0/' + WIN_T + 'ms';
    }
    scoreEl.textContent = txt;
  }

  function updateButtons() {
    if (!startBtn || !restartBtn || !menuEl || !resultEl) return;
    if (status === 'menu') {
      startBtn.style.display = 'inline-block';
      menuEl.style.display = 'flex';
      restartBtn.style.display = 'none';
      resultEl.style.display = 'none';
    } else if (status === 'playing') {
      startBtn.style.display = 'none';
      menuEl.style.display = 'none';
      restartBtn.style.display = 'inline-block';
      resultEl.style.display = 'none';
    } else { // won / lost
      startBtn.style.display = 'none';
      menuEl.style.display = 'none';
      restartBtn.style.display = 'inline-block';
      resultEl.style.display = 'flex';
      resultCardEl.textContent = (status === 'won') ? 'WON!' : 'CRASHED!';
      resultCardEl.className = (status === 'won') ? 'card won' : 'card lost';
    }
  }

  // ---- WebGL (plan step 2) ----
  function toClipX(px) { return (px / 400) - 1; }
  function toClipY(py) { return 1 - (py / 300); }

  function addQuad(x0, y0, x1, y1, color) {
    var ax = toClipX(x0), ay = toClipY(y0);
    var bx = toClipX(x1), by = toClipY(y1);
    verts.push(ax, ay, bx, ay, ax, by, bx, ay, bx, by, ax, by);
    for (var i = 0; i < 6; i++) cols.push(color[0], color[1], color[2]);
  }

  var VERT_SRC = '' +
    'attribute vec2 a_pos;' +
    'attribute vec3 a_col;' +
    'varying vec3 v_col;' +
    'void main(){' +
    '  v_col = a_col;' +
    '  gl_Position = vec4(a_pos, 0.0, 1.0);' +
    '}';
  var FRAG_SRC = '' +
    'precision mediump float;' +
    'varying vec3 v_col;' +
    'void main(){' +
    '  gl_FragColor = vec4(v_col, 1.0);' +
    '}';

  function compile(type, src) {
    var s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      console.error('shader error', gl.getShaderInfoLog(s));
      return null;
    }
    return s;
  }

  function initGL() {
    canvas = document.getElementById('game-canvas');
    gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
    if (!gl) { console.warn('WebGL unavailable'); return false; }

    var vs = compile(gl.VERTEX_SHADER, VERT_SRC);
    var fs = compile(gl.FRAGMENT_SHADER, FRAG_SRC);
    if (!vs || !fs) return false;

    program = gl.createProgram();
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      console.error('link error', gl.getProgramInfoLog(program));
      return false;
    }
    gl.useProgram(program);

    posBuf = gl.createBuffer();
    colBuf = gl.createBuffer();
    aPos = gl.getAttribLocation(program, 'a_pos');
    aCol = gl.getAttribLocation(program, 'a_col');
    gl.enable(gl.SCISSOR_TEST);
    return true;
  }

  function render() {
    if (!gl) return;
    gl.viewport(0, 0, 800, 600);
    gl.scissor(0, 0, 800, 600);
    gl.clearColor(0.02, 0.02, 0.07, 1.0);
    gl.clear(gl.COLOR_BUFFER_BIT);

    verts = [];
    cols = [];

    // lanes (dim neon fills)
    var laneColors = [
      [1.0, 0.2, 0.85],
      [0.2, 0.9, 1.0],
      [0.35, 1.0, 0.45]
    ];
    for (var i = 0; i < 3; i++) {
      var x0 = i * LANE_W, x1 = (i + 1) * LANE_W;
      addQuad(x0, 0, x1, 600, [laneColors[i][0] * 0.22, laneColors[i][1] * 0.22, laneColors[i][2] * 0.22]);
    }
    // lane dividers
    for (var d = 1; d < 3; d++) {
      addQuad(d * LANE_W - 1.5, 0, d * LANE_W + 1.5, 600, [1, 1, 1]);
    }

    // obstacles (scrolling red blocks; decorative — collision is decided at appearance instant)
    for (var k = 0; k < SCHEDULE.length; k++) {
      var ob = SCHEDULE[k];
      var appeared = elapsed_ms >= ob.t;
      var passedIt = k < next_obstacle;
      var isCrash = (status === 'lost' && k === next_obstacle);
      if (appeared && (passedIt || isCrash)) {
        var top = (elapsed_ms - ob.t) * 0.35;
        if (top <= 600) {
          var cx = (ob.lane + 0.5) * LANE_W;
          var w = 110, h = 70;
          addQuad(cx - w / 2, top, cx + w / 2, top + h, [1.0, 0.15, 0.2]);
        }
      }
    }

    // car
    var carx = (lane + 0.5) * LANE_W;
    var cw = 74, ch = 112, ctop = 430, cbot = 542;
    addQuad(carx - cw / 2, ctop, carx + cw / 2, cbot, [1.0, 0.95, 0.25]);

    gl.bindBuffer(gl.ARRAY_BUFFER, posBuf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(verts), gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

    gl.bindBuffer(gl.ARRAY_BUFFER, colBuf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(cols), gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(aCol);
    gl.vertexAttribPointer(aCol, 3, gl.FLOAT, false, 0, 0);

    gl.drawArrays(gl.TRIANGLES, 0, verts.length / 2);
  }

  // ---- Main loop (plan step 1) ----
  function frame() {
    tick++;
    updatePlaying();
    render();
    updateHUD();
    requestAnimationFrame(frame);
  }

  // ---- Bridge interface (plan step 6) ----
  window.__GAMETESTLAB__ = {
    protocol: 'gametestlab/2',
    isReady: function () { return inited; },
    reset: function (opts) {
      var seed = (opts && typeof opts.seed === 'number') ? opts.seed : current_seed;
      doReset(seed);
      return { event_epoch: event_epoch };
    },
    observe: function () {
      return {
        tick: tick,
        status: status,
        state: freshState(),
        event_epoch: event_epoch,
        latest_event_seq: seq
      };
    },
    getEvents: function (opts) {
      var after = (opts && typeof opts.afterSeq === 'number') ? opts.afterSeq : 0;
      return events.filter(function (e) { return e.seq > after; });
    }
  };

  // ---- Init ----
  function init() {
    scoreEl = document.getElementById('score');
    statusEl = document.getElementById('status');
    startBtn = document.getElementById('start-btn');
    restartBtn = document.getElementById('restart-btn');
    menuEl = document.getElementById('menu');
    resultEl = document.getElementById('result');

    if (startBtn) startBtn.addEventListener('click', startGame);
    if (restartBtn) restartBtn.addEventListener('click', function () { doReset(current_seed); });
    window.addEventListener('keydown', handleKey);

    initGL();

    // Establish initial deterministic menu (epoch 1, first event = game_reset).
    doReset(SEED_CONST);

    inited = true;
    updateHUD();
    updateButtons();
    requestAnimationFrame(frame);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
