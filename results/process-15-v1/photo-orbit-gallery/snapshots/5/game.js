(function () {
  'use strict';

  // ---------------------------------------------------------------------------
  // Constants
  // ---------------------------------------------------------------------------
  var PHOTOS = ['Forest', 'City', 'Mars', 'Ocean'];        // index 0..3
  var WIN_SEQUENCE = ['Mars', 'Ocean', 'Forest'];          // required confirm order
  var MAX_MISTAKES = 2;
  var WIN_PROGRESS = 3;

  var PALETTES = {
    Forest: [[34, 139, 34], [18, 80, 22]],
    City:   [[120, 124, 145], [60, 64, 84]],
    Mars:   [[190, 74, 44], [120, 38, 20]],
    Ocean:  [[30, 96, 175], [14, 48, 108]]
  };

  // ---------------------------------------------------------------------------
  // Seedable RNG (mulberry32)
  // ---------------------------------------------------------------------------
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // ---------------------------------------------------------------------------
  // Game state
  // ---------------------------------------------------------------------------
  var seed = 1;
  var status = 'menu';           // menu | playing | won | lost
  var focusIndex = 0;
  var selected = '';
  var progress = 0;
  var mistakes = 0;
  var ready = false;

  // Event log (per epoch)
  var eventEpoch = 0;
  var eventSeq = 0;
  var events = [];
  var latestEventSeq = 0;

  // Timing (driven by performance.now so virtual time works)
  var startTime = 0;
  function tickMs() { return Math.floor(performance.now() - startTime); }

  function now() { return performance.now(); }

  function getState() {
    return {
      status: status,
      focus_index: focusIndex,
      focus_name: PHOTOS[focusIndex],
      selected: selected,
      progress: progress,
      mistakes: mistakes
    };
  }

  function emit(type, payload) {
    eventSeq++;
    var ev = { seq: eventSeq, tick: tickMs(), type: type };
    if (payload && Object.keys(payload).length) ev.payload = payload;
    events.push(ev);
    latestEventSeq = eventSeq;
  }

  // ---------------------------------------------------------------------------
  // DOM references
  // ---------------------------------------------------------------------------
  var canvas, gl, scoreEl, statusEl, focusEl, startBtn, restartBtn;

  // ---------------------------------------------------------------------------
  // WebGL: shaders
  // ---------------------------------------------------------------------------
  var VS = [
    'attribute vec2 aPos;',
    'attribute vec2 aUV;',
    'uniform mat4 uMVP;',
    'varying vec2 vUV;',
    'void main() {',
    '  vUV = aUV;',
    '  gl_Position = uMVP * vec4(aPos, 0.0, 1.0);',
    '}'
  ].join('\n');

  var FS = [
    'precision mediump float;',
    'varying vec2 vUV;',
    'uniform sampler2D uTex;',
    'uniform float uHighlight;',
    'void main() {',
    '  vec4 c = texture2D(uTex, vUV);',
    '  float edge = 0.06;',
    '  if (vUV.x < edge || vUV.x > 1.0 - edge || vUV.y < edge || vUV.y > 1.0 - edge) {',
    '    c.rgb = mix(c.rgb, vec3(1.0, 0.85, 0.25), uHighlight);',
    '    c.rgb = mix(c.rgb, vec3(1.0), uHighlight * 0.6);',
    '  } else {',
    '    c.rgb *= (0.55 + 0.45 * uHighlight);',
    '  }',
    '  gl_FragColor = c;',
    '}'
  ].join('\n');

  var program, posBuf, uvBuf, idxBuf;
  var uMVP, uTex, uHighlight;
  var textures = [];

  // ---------------------------------------------------------------------------
  // Matrix helpers (column-major, gl-matrix style)
  // ---------------------------------------------------------------------------
  function mat4Perspective(fovy, aspect, near, far) {
    var f = 1.0 / Math.tan(fovy / 2);
    var nf = 1.0 / (near - far);
    return [
      f / aspect, 0, 0, 0,
      0, f, 0, 0,
      0, 0, (far + near) * nf, -1,
      0, 0, (2 * far * near) * nf, 0
    ];
  }
  function mat4Translate(x, y, z) {
    return [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, y, z, 1];
  }
  function mat4Multiply(a, b) {
    var out = new Array(16);
    for (var c = 0; c < 4; c++) {
      for (var r = 0; r < 4; r++) {
        out[c * 4 + r] =
          a[0 * 4 + r] * b[c * 4 + 0] +
          a[1 * 4 + r] * b[c * 4 + 1] +
          a[2 * 4 + r] * b[c * 4 + 2] +
          a[3 * 4 + r] * b[c * 4 + 3];
      }
    }
    return out;
  }

  // ---------------------------------------------------------------------------
  // Texture generation (local canvas, no remote resources)
  // ---------------------------------------------------------------------------
  function makeTextureCanvas(name, idx, seedVal) {
    var cv = document.createElement('canvas');
    cv.width = 256; cv.height = 256;
    var ctx = cv.getContext('2d');
    var rng = mulberry32((seedVal >>> 0) ^ Math.imul(idx + 1, 0x9E3779B1));
    var pal = PALETTES[name];

    var g = ctx.createLinearGradient(0, 0, 256, 256);
    g.addColorStop(0, 'rgb(' + pal[0][0] + ',' + pal[0][1] + ',' + pal[0][2] + ')');
    g.addColorStop(1, 'rgb(' + pal[1][0] + ',' + pal[1][1] + ',' + pal[1][2] + ')');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 256, 256);

    var shapes = 12 + Math.floor(rng() * 9);
    for (var s = 0; s < shapes; s++) {
      var x = rng() * 256, y = rng() * 256, r = 8 + rng() * 42;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,255,255,' + (0.05 + rng() * 0.16).toFixed(3) + ')';
      ctx.fill();
    }

    ctx.strokeStyle = 'rgba(0,0,0,0.15)';
    ctx.lineWidth = 1;
    for (var i = 0; i <= 256; i += 32) {
      ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, 256); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(256, i); ctx.stroke();
    }

    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(0, 96, 256, 64);
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = 'bold 34px system-ui, sans-serif';
    ctx.fillText(name, 128, 128);
    ctx.font = 'bold 20px system-ui, sans-serif';
    ctx.fillText('#' + idx, 128, 200);

    return cv;
  }

  function createGLTexture(gl, canvasEl) {
    var tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, canvasEl);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    return tex;
  }

  function buildTextures() {
    if (textures.length) {
      for (var i = 0; i < textures.length; i++) gl.deleteTexture(textures[i]);
      textures = [];
    }
    for (var j = 0; j < 4; j++) {
      var cv = makeTextureCanvas(PHOTOS[j], j, seed);
      textures.push(createGLTexture(gl, cv));
    }
  }

  // ---------------------------------------------------------------------------
  // GL program setup
  // ---------------------------------------------------------------------------
  function compile(gl, type, src) {
    var sh = gl.createShader(type);
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
      var info = gl.getShaderInfoLog(sh);
      gl.deleteShader(sh);
      throw new Error('shader compile error: ' + info);
    }
    return sh;
  }

  function createProgram(gl, vsSrc, fsSrc) {
    var p = gl.createProgram();
    gl.attachShader(p, compile(gl, gl.VERTEX_SHADER, vsSrc));
    gl.attachShader(p, compile(gl, gl.FRAGMENT_SHADER, fsSrc));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
      throw new Error('program link error: ' + gl.getProgramInfoLog(p));
    }
    return p;
  }

  // ---------------------------------------------------------------------------
  // Render loop (rotation only advances while playing -> frozen end-frame)
  // ---------------------------------------------------------------------------
  var RADIUS = 1.5;
  var CAM_DIST = 4.0;
  var rotationBase = 0;

  function render() {
    var t = tickMs();
    if (status === 'playing') {
      rotationBase = (t / 1000) * 0.5;
    }
    var rotation = rotationBase;

    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clearColor(0.04, 0.04, 0.07, 1.0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.DEPTH_TEST);

    var aspect = canvas.width / canvas.height;
    var proj = mat4Perspective(50 * Math.PI / 180, aspect, 0.1, 100);
    var view = mat4Translate(0, 0, -CAM_DIST);

    for (var i = 0; i < 4; i++) {
      var angle = i * (Math.PI / 2) + rotation;
      var px = Math.sin(angle) * RADIUS;
      var pz = Math.cos(angle) * RADIUS;
      var model = mat4Translate(px, 0, pz);
      var mvp = mat4Multiply(proj, mat4Multiply(view, model));

      gl.uniformMatrix4fv(uMVP, false, new Float32Array(mvp));
      gl.uniform1f(uHighlight, i === focusIndex ? 1.0 : 0.0);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, textures[i]);
      gl.uniform1i(uTex, 0);
      gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0);
    }

    gl.disable(gl.DEPTH_TEST);
    requestAnimationFrame(render);
  }

  // ---------------------------------------------------------------------------
  // HUD
  // ---------------------------------------------------------------------------
  function updateHUD() {
    if (scoreEl) {
      scoreEl.textContent = 'Progress ' + progress + '/3 · Mistakes ' + mistakes + '/2';
    }
    if (statusEl) {
      var label = status.charAt(0).toUpperCase() + status.slice(1);
      statusEl.textContent = label;
    }
    if (focusEl) {
      focusEl.textContent = 'Focus: ' + PHOTOS[focusIndex];
    }
  }

  // ---------------------------------------------------------------------------
  // Actions
  // ---------------------------------------------------------------------------
  function startGame() {
    if (status !== 'menu') return;        // only start from menu
    status = 'playing';
    emit('game_started', {});
    updateHUD();
  }

  function moveFocus(dir) {
    if (status !== 'menu' && status !== 'playing') return;  // frozen after win/lost
    focusIndex = (focusIndex + dir + 4) % 4;
    emit('focus_changed', { focus_index: focusIndex, focus_name: PHOTOS[focusIndex] });
    updateHUD();
  }

  function selectPhoto() {
    if (status !== 'playing') return;     // confirm only while playing
    var name = PHOTOS[focusIndex];
    selected = name;
    if (name === WIN_SEQUENCE[progress]) {
      progress++;
      emit('photo_selected', { focus_name: name, progress: progress });
      if (progress >= WIN_PROGRESS) {
        status = 'won';
        emit('game_won', {});
      }
    } else {
      mistakes++;
      emit('selection_wrong', { focus_name: name, mistakes: mistakes });
      if (mistakes >= MAX_MISTAKES) {
        status = 'lost';
        emit('game_lost', {});
      }
    }
    updateHUD();
  }

  function reset(opts) {
    opts = opts || {};
    if (typeof opts.seed === 'number') seed = opts.seed >>> 0;
    eventEpoch++;
    eventSeq = 0;
    events = [];
    buildTextures();
    status = 'menu';
    focusIndex = 0;
    selected = '';
    progress = 0;
    mistakes = 0;
    rotationBase = 0;
    startTime = now();
    emit('game_reset', { seed: seed });
    updateHUD();
  }

  // ---------------------------------------------------------------------------
  // Bridge: window.__GAMETESTLAB__
  // ---------------------------------------------------------------------------
  window.__GAMETESTLAB__ = {
    protocol: 'gametestlab/2',
    isReady: function () { return ready; },
    reset: function (opts) { reset(opts); },
    observe: function () {
      return {
        tick: tickMs(),
        status: status,
        state: getState(),
        event_epoch: eventEpoch,
        latest_event_seq: latestEventSeq
      };
    },
    getEvents: function (opts) {
      opts = opts || {};
      var after = (typeof opts.afterSeq === 'number') ? opts.afterSeq : 0;
      var out = [];
      for (var i = 0; i < events.length; i++) {
        if (events[i].seq > after) out.push(events[i]);
      }
      return out;
    }
  };

  // ---------------------------------------------------------------------------
  // Input wiring
  // ---------------------------------------------------------------------------
  function onKeyDown(e) {
    if (e.code === 'ArrowRight') { e.preventDefault(); moveFocus(1); }
    else if (e.code === 'ArrowLeft') { e.preventDefault(); moveFocus(-1); }
    else if (e.code === 'Enter') { e.preventDefault(); selectPhoto(); }
  }

  // ---------------------------------------------------------------------------
  // Init
  // ---------------------------------------------------------------------------
  function init() {
    canvas = document.getElementById('gallery-canvas');
    scoreEl = document.querySelector('[data-testid="score"]');
    statusEl = document.querySelector('[data-testid="status"]');
    focusEl = document.getElementById('focus-label');
    startBtn = document.getElementById('start-btn');
    restartBtn = document.getElementById('restart-btn');

    gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
    if (!gl) { ready = false; return; }

    try {
      program = createProgram(gl, VS, FS);
    } catch (err) {
      ready = false;
      return;
    }
    gl.useProgram(program);

    var quadPos = new Float32Array([
      -0.6, -0.6, 0,  0.6, -0.6, 0,  0.6, 0.6, 0,  -0.6, 0.6, 0
    ]);
    var quadUV = new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]);
    var quadIdx = new Uint16Array([0, 1, 2, 0, 2, 3]);

    posBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, posBuf);
    gl.bufferData(gl.ARRAY_BUFFER, quadPos, gl.STATIC_DRAW);

    uvBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, uvBuf);
    gl.bufferData(gl.ARRAY_BUFFER, quadUV, gl.STATIC_DRAW);

    idxBuf = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, idxBuf);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, quadIdx, gl.STATIC_DRAW);

    var aPos = gl.getAttribLocation(program, 'aPos');
    var aUV = gl.getAttribLocation(program, 'aUV');
    gl.bindBuffer(gl.ARRAY_BUFFER, posBuf);
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, uvBuf);
    gl.enableVertexAttribArray(aUV);
    gl.vertexAttribPointer(aUV, 2, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, idxBuf);

    uMVP = gl.getUniformLocation(program, 'uMVP');
    uTex = gl.getUniformLocation(program, 'uTex');
    uHighlight = gl.getUniformLocation(program, 'uHighlight');

    buildTextures();
    startTime = now();
    ready = true;
    updateHUD();

    startBtn.addEventListener('click', function () { startGame(); startBtn.blur(); });
    restartBtn.addEventListener('click', function () { reset({}); restartBtn.blur(); });
    window.addEventListener('keydown', onKeyDown);

    requestAnimationFrame(render);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
