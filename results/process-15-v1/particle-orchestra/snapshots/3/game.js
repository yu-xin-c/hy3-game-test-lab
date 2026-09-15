(function () {
  "use strict";

  // ---------------------------------------------------------------------------
  // Step 4: deterministic PRNG (mulberry32). Same seed -> same positions/timeline.
  // ---------------------------------------------------------------------------
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

  // ---------------------------------------------------------------------------
  // Step 3: game state. status: menu | playing | won | lost
  // ---------------------------------------------------------------------------
  const SEQUENCE = ["A", "C", "D", "B"];
  let currentSeed = 12345;

  function initialMenuState() {
    return {
      status: "menu",
      sequence: SEQUENCE.slice(),
      progress: 0,
      score: 0,
      attempts: 3,
      active_cluster: null,
    };
  }

  let state = initialMenuState();

  // ---------------------------------------------------------------------------
  // Step 5: event buffer (continuous seq, per epoch)
  // ---------------------------------------------------------------------------
  let eventEpoch = 0;
  let events = [];
  let eventSeq = 0;
  let tick = 0;

  function emit(type, payload) {
    eventSeq += 1;
    const ev = { seq: eventSeq, tick: tick, type: type };
    if (payload !== undefined) ev.payload = payload;
    events.push(ev);
    return ev;
  }

  // ---------------------------------------------------------------------------
  // Step 2: WebGL setup (native, no three.js / no remote assets)
  // ---------------------------------------------------------------------------
  const canvas = document.getElementById("game-canvas");
  const gl =
    canvas.getContext("webgl") || canvas.getContext("experimental-webgl");

  let glReady = false;
  let ready = false;
  let program = null;
  let posBuf = null,
    colBuf = null,
    sizeBuf = null,
    cidBuf = null,
    particleTex = null;
  let aPos, aColor, aSize, aClusterId, uMvp, uActiveId, uTex;

  // Cluster layout: name / center / color
  const CLUSTERS = [
    { name: "A", center: [-3.2, 2.0, 0], color: [1.0, 0.35, 0.35, 1.0] },
    { name: "B", center: [3.2, 2.0, 0], color: [0.35, 1.0, 0.45, 1.0] },
    { name: "C", center: [-3.2, -2.0, 0], color: [0.45, 0.65, 1.0, 1.0] },
    { name: "D", center: [3.2, -2.0, 0], color: [1.0, 0.9, 0.35, 1.0] },
  ];
  const POINTS_PER_CLUSTER = 160;

  let positions = null;
  let colors = null;
  let sizes = null;
  let clusterIds = null;

  function createParticleTexture(ctx) {
    const size = 64;
    const data = new Uint8Array(size * size * 4);
    const c = size / 2;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const dx = (x - c) / c;
        const dy = (y - c) / c;
        const d = Math.sqrt(dx * dx + dy * dy);
        let a = 1.0 - d;
        if (a < 0) a = 0;
        a = Math.pow(a, 1.5);
        const i = (y * size + x) * 4;
        data[i] = 255;
        data[i + 1] = 255;
        data[i + 2] = 255;
        data[i + 3] = Math.floor(a * 255);
      }
    }
    const tex = ctx.createTexture();
    ctx.bindTexture(ctx.TEXTURE_2D, tex);
    ctx.texImage2D(
      ctx.TEXTURE_2D,
      0,
      ctx.RGBA,
      size,
      size,
      0,
      ctx.RGBA,
      ctx.UNSIGNED_BYTE,
      data
    );
    ctx.texParameteri(ctx.TEXTURE_2D, ctx.TEXTURE_MIN_FILTER, ctx.LINEAR);
    ctx.texParameteri(ctx.TEXTURE_2D, ctx.TEXTURE_MAG_FILTER, ctx.LINEAR);
    ctx.texParameteri(ctx.TEXTURE_2D, ctx.TEXTURE_WRAP_S, ctx.CLAMP_TO_EDGE);
    ctx.texParameteri(ctx.TEXTURE_2D, ctx.TEXTURE_WRAP_T, ctx.CLAMP_TO_EDGE);
    return tex;
  }

  function compileShader(ctx, type, src) {
    const sh = ctx.createShader(type);
    ctx.shaderSource(sh, src);
    ctx.compileShader(sh);
    if (!ctx.getShaderParameter(sh, ctx.COMPILE_STATUS)) {
      console.error("Shader compile error:", ctx.getShaderInfoLog(sh));
      return null;
    }
    return sh;
  }

  const VERT_SRC = [
    "attribute vec3 a_pos;",
    "attribute vec4 a_color;",
    "attribute float a_size;",
    "attribute float a_clusterId;",
    "uniform mat4 u_mvp;",
    "uniform float u_activeId;",
    "varying vec4 v_color;",
    "void main() {",
    "  gl_Position = u_mvp * vec4(a_pos, 1.0);",
    "  float isActive = (abs(a_clusterId - u_activeId) < 0.5) ? 1.0 : 0.0;",
    "  gl_PointSize = a_size * (1.0 + isActive * 1.3);",
    "  v_color = a_color * (0.55 + isActive * 0.9);",
    "}",
  ].join("\n");

  const FRAG_SRC = [
    "precision mediump float;",
    "uniform sampler2D u_tex;",
    "varying vec4 v_color;",
    "void main() {",
    "  vec4 t = texture2D(u_tex, gl_PointCoord);",
    "  gl_FragColor = vec4(v_color.rgb, v_color.a * t.a);",
    "}",
  ].join("\n");

  function initGL() {
    if (!gl) return false;
    const vs = compileShader(gl, gl.VERTEX_SHADER, VERT_SRC);
    const fs = compileShader(gl, gl.FRAGMENT_SHADER, FRAG_SRC);
    if (!vs || !fs) return false;
    program = gl.createProgram();
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      console.error("Program link error:", gl.getProgramInfoLog(program));
      return false;
    }
    aPos = gl.getAttribLocation(program, "a_pos");
    aColor = gl.getAttribLocation(program, "a_color");
    aSize = gl.getAttribLocation(program, "a_size");
    aClusterId = gl.getAttribLocation(program, "a_clusterId");
    uMvp = gl.getUniformLocation(program, "u_mvp");
    uActiveId = gl.getUniformLocation(program, "u_activeId");
    uTex = gl.getUniformLocation(program, "u_tex");

    posBuf = gl.createBuffer();
    colBuf = gl.createBuffer();
    sizeBuf = gl.createBuffer();
    cidBuf = gl.createBuffer();
    particleTex = createParticleTexture(gl);

    gl.disable(gl.DEPTH_TEST);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE);

    glReady = true;
    return true;
  }

  function uploadBuffers() {
    if (!glReady || !gl) return;
    gl.bindBuffer(gl.ARRAY_BUFFER, posBuf);
    gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, colBuf);
    gl.bufferData(gl.ARRAY_BUFFER, colors, gl.STATIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, sizeBuf);
    gl.bufferData(gl.ARRAY_BUFFER, sizes, gl.STATIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, cidBuf);
    gl.bufferData(gl.ARRAY_BUFFER, clusterIds, gl.STATIC_DRAW);
  }

  // Step 4: rebuild particles from seed -> deterministic initial layout
  function rebuildParticles(seed) {
    const rng = mulberry32(seed);
    const total = POINTS_PER_CLUSTER * CLUSTERS.length;
    positions = new Float32Array(total * 3);
    colors = new Float32Array(total * 4);
    sizes = new Float32Array(total);
    clusterIds = new Float32Array(total);
    let i = 0;
    for (let c = 0; c < CLUSTERS.length; c++) {
      const cl = CLUSTERS[c];
      for (let p = 0; p < POINTS_PER_CLUSTER; p++) {
        const r = 0.25 + rng() * 0.85;
        const theta = rng() * Math.PI * 2;
        const phi = Math.acos(2 * rng() - 1);
        const ox = r * Math.sin(phi) * Math.cos(theta);
        const oy = r * Math.sin(phi) * Math.sin(theta);
        const oz = r * Math.cos(phi) * 0.6;
        positions[i * 3] = cl.center[0] + ox;
        positions[i * 3 + 1] = cl.center[1] + oy;
        positions[i * 3 + 2] = cl.center[2] + oz;
        const col = cl.color;
        colors[i * 4] = col[0];
        colors[i * 4 + 1] = col[1];
        colors[i * 4 + 2] = col[2];
        colors[i * 4 + 3] = col[3];
        sizes[i] = 6 + rng() * 7;
        clusterIds[i] = c;
        i++;
      }
    }
    uploadBuffers();
  }

  // ----- minimal mat4 helpers (column-major) -----
  function mat4Perspective(fovy, aspect, near, far) {
    const f = 1.0 / Math.tan(fovy / 2);
    const nf = 1 / (near - far);
    return new Float32Array([
      f / aspect, 0, 0, 0,
      0, f, 0, 0,
      0, 0, (far + near) * nf, -1,
      0, 0, 2 * far * near * nf, 0,
    ]);
  }
  function mat4Identity() {
    return new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
  }
  function mat4Multiply(a, b) {
    const out = new Float32Array(16);
    for (let c = 0; c < 4; c++) {
      for (let r = 0; r < 4; r++) {
        out[c * 4 + r] =
          a[0 * 4 + r] * b[c * 4 + 0] +
          a[1 * 4 + r] * b[c * 4 + 1] +
          a[2 * 4 + r] * b[c * 4 + 2] +
          a[3 * 4 + r] * b[c * 4 + 3];
      }
    }
    return out;
  }
  function mat4Translate(x, y, z) {
    const m = mat4Identity();
    m[12] = x;
    m[13] = y;
    m[14] = z;
    return m;
  }
  function mat4RotateY(a) {
    const c = Math.cos(a),
      s = Math.sin(a);
    return new Float32Array([
      c, 0, -s, 0,
      0, 1, 0, 0,
      s, 0, c, 0,
      0, 0, 0, 1,
    ]);
  }

  function draw(angle) {
    if (!glReady || !gl) return;
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clearColor(0.02, 0.02, 0.05, 1.0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    const persp = mat4Perspective(Math.PI / 4, 800 / 600, 0.1, 100);
    const view = mat4Translate(0, 0, -9);
    const model = mat4RotateY(angle);
    const mvp = mat4Multiply(persp, mat4Multiply(view, model));

    gl.useProgram(program);
    gl.uniformMatrix4fv(uMvp, false, mvp);

    let actIndex = -1;
    if (state.active_cluster) {
      actIndex = CLUSTERS.findIndex((c) => c.name === state.active_cluster);
    }
    gl.uniform1f(uActiveId, actIndex);
    gl.uniform1i(uTex, 0);

    gl.bindBuffer(gl.ARRAY_BUFFER, posBuf);
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 3, gl.FLOAT, false, 0, 0);

    gl.bindBuffer(gl.ARRAY_BUFFER, colBuf);
    gl.enableVertexAttribArray(aColor);
    gl.vertexAttribPointer(aColor, 4, gl.FLOAT, false, 0, 0);

    gl.bindBuffer(gl.ARRAY_BUFFER, sizeBuf);
    gl.enableVertexAttribArray(aSize);
    gl.vertexAttribPointer(aSize, 1, gl.FLOAT, false, 0, 0);

    gl.bindBuffer(gl.ARRAY_BUFFER, cidBuf);
    gl.enableVertexAttribArray(aClusterId);
    gl.vertexAttribPointer(aClusterId, 1, gl.FLOAT, false, 0, 0);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, particleTex);

    gl.drawArrays(gl.POINTS, 0, positions.length / 3);
  }

  function frame(now) {
    tick += 1;
    const t = (now || 0) * 0.001;
    const angle = t * 0.3;
    draw(angle);
    window.requestAnimationFrame(frame);
  }

  // ---------------------------------------------------------------------------
  // Step 1 & 6: HUD + screen visibility driven by state
  // ---------------------------------------------------------------------------
  const scoreEl = document.getElementById("score");
  const statusEl = document.getElementById("status");
  const menuEl = document.getElementById("menu");
  const endgameEl = document.getElementById("endgame");
  const endTitle = document.getElementById("endgame-title");
  const endDetail = document.getElementById("endgame-detail");

  function updateHud() {
    scoreEl.textContent =
      "Score: " + state.score + " | Progress: " + state.progress + "/" + state.sequence.length;
    const map = { menu: "Menu", playing: "Playing", won: "Won", lost: "Lost" };
    statusEl.textContent = map[state.status] || state.status;
  }

  function updateScreens() {
    menuEl.classList.toggle("hidden", state.status !== "menu");
    const ended = state.status === "won" || state.status === "lost";
    endgameEl.classList.toggle("hidden", !ended);
    if (state.status === "won") {
      endTitle.textContent = "You Won!";
      endDetail.textContent = "Final Score: " + state.score;
    } else if (state.status === "lost") {
      endTitle.textContent = "Game Over";
      endDetail.textContent = "Final Score: " + state.score;
    }
  }

  // ---------------------------------------------------------------------------
  // Step 3: gameplay actions
  // ---------------------------------------------------------------------------
  const KEY_TO_CLUSTER = { Digit1: "A", Digit2: "B", Digit3: "C", Digit4: "D" };

  function startGame() {
    if (state.status !== "menu") return;
    state.status = "playing";
    state.progress = 0;
    state.score = 0;
    state.attempts = 3;
    state.active_cluster = null;
    emit("game_started", {});
    updateHud();
    updateScreens();
  }

  function restartGame() {
    // Clears progress/score, restores 3 attempts, returns to menu.
    state.status = "menu";
    state.progress = 0;
    state.score = 0;
    state.attempts = 3;
    state.active_cluster = null;
    emit("game_reset", {});
    updateHud();
    updateScreens();
  }

  function triggerCluster(cluster) {
    // After game ends, input cannot change score/progress/result.
    if (state.status !== "playing") return;

    state.active_cluster = cluster;
    emit("cluster_triggered", { cluster: cluster });

    const expected = state.sequence[state.progress];
    if (cluster === expected) {
      state.progress += 1;
      state.score += 25;
      emit("note_correct", {});
      if (state.progress >= state.sequence.length) {
        state.score += 100;
        state.status = "won";
        state.active_cluster = null;
        emit("game_won", {});
      }
    } else {
      state.progress = 0;
      state.attempts -= 1;
      emit("note_wrong", {});
      emit("progress_reset", {});
      if (state.attempts <= 0) {
        state.attempts = 0;
        state.status = "lost";
        state.active_cluster = null;
        emit("game_lost", {});
      }
    }
    updateHud();
    updateScreens();
  }

  // ---------------------------------------------------------------------------
  // Controls wiring (real input only)
  // ---------------------------------------------------------------------------
  document.getElementById("start-btn").addEventListener("click", startGame);
  document.getElementById("restart-btn").addEventListener("click", restartGame);

  window.addEventListener("keydown", function (e) {
    if (e.repeat) return; // ignore auto-repeat, match "press"
    const cluster = KEY_TO_CLUSTER[e.code];
    if (cluster) triggerCluster(cluster);
  });

  // ---------------------------------------------------------------------------
  // Step 5: read-only observation bridge (gametestlab/2)
  // ---------------------------------------------------------------------------
  function serializeState() {
    return {
      status: state.status,
      sequence: state.sequence.slice(),
      progress: state.progress,
      score: state.score,
      attempts: state.attempts,
      active_cluster: state.active_cluster,
    };
  }

  function cloneEvent(e) {
    const o = { seq: e.seq, tick: e.tick, type: e.type };
    if (e.payload !== undefined) o.payload = JSON.parse(JSON.stringify(e.payload));
    return o;
  }

  window.__GAMETESTLAB__ = {
    protocol: "gametestlab/2",
    isReady: function () {
      return ready;
    },
    reset: function (opts) {
      const seed =
        opts && typeof opts.seed === "number" ? opts.seed : currentSeed;
      currentSeed = seed >>> 0;
      rebuildParticles(currentSeed);
      state = initialMenuState();
      eventEpoch += 1;
      events = [];
      eventSeq = 0;
      emit("game_reset", { seed: currentSeed });
      updateHud();
      updateScreens();
      return true;
    },
    observe: function () {
      return {
        tick: tick,
        status: state.status,
        state: serializeState(),
        event_epoch: eventEpoch,
        latest_event_seq: eventSeq,
      };
    },
    getEvents: function (opts) {
      const after =
        opts && typeof opts.afterSeq === "number" ? opts.afterSeq : 0;
      return events
        .filter(function (e) {
          return e.seq > after;
        })
        .map(cloneEvent);
    },
  };

  // ---------------------------------------------------------------------------
  // Boot
  // ---------------------------------------------------------------------------
  function init() {
    initGL();
    rebuildParticles(currentSeed);
    updateHud();
    updateScreens();
    ready = true;
    window.requestAnimationFrame(frame);
  }

  init();
})();
