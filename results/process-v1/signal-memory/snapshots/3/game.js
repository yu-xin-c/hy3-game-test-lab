/* Signal Memory — Canvas2D color-sequence memory game.
 * No network/CDN resources. All timing driven by setTimeout/requestAnimationFrame
 * and performance.now() so a virtual clock can replay deterministically. */

(function () {
  "use strict";

  // ---- Fixed three-round sequences (seed-independent, deterministic) ----
  var SEQ_BY_ROUND = {
    1: ["RED", "BLUE"],
    2: ["GREEN", "YELLOW", "RED"],
    3: ["BLUE", "RED", "YELLOW", "GREEN"]
  };

  var REGIONS = {
    RED:    { x: 0,   y: 0,   w: 400, h: 300, base: "#8b0000", hi: "#ff5555", label: "RED" },
    GREEN:  { x: 400, y: 0,   w: 400, h: 300, base: "#006400", hi: "#55ff55", label: "GREEN" },
    BLUE:   { x: 0,   y: 300, w: 400, h: 300, base: "#00008b", hi: "#5555ff", label: "BLUE" },
    YELLOW: { x: 400, y: 300, w: 400, h: 300, base: "#8b8b00", hi: "#ffff55", label: "YELLOW" }
  };

  var HIGHLIGHT_MS = 400;
  var GAP_MS = 200;

  // ---- State ----
  var state = {
    status: "menu",        // menu | playing | won | lost
    phase: "menu",         // menu | playback | input
    round: 1,
    lives: 3,
    score: 0,
    progress: 0,
    sequence: [],
    last_feedback: ""
  };

  var currentHighlight = null; // color key currently lit during playback
  var currentSeed = 1;

  // ---- Event log ----
  var eventSeq = 0;
  var eventEpoch = 0;
  var events = [];
  var ready = false;

  function nowTick() {
    return Math.floor(performance.now());
  }

  function emit(type, payload) {
    eventSeq += 1;
    var ev = {
      seq: eventSeq,
      tick: nowTick(),
      type: type,
      payload: payload || {}
    };
    events.push(ev);
    return ev;
  }

  // ---- DOM refs ----
  var canvas = document.getElementById("signal-canvas");
  var ctx = canvas.getContext("2d");
  var roundLabel = document.getElementById("round-label");
  var livesLabel = document.getElementById("lives-label");
  var scoreLabel = document.getElementById("score-label");
  var phaseLabel = document.getElementById("phase-label");
  var statusLabel = document.getElementById("status-label");
  var feedbackLabel = document.getElementById("feedback-label");

  // ---- Core logic ----
  function loadRound(round) {
    var seq = SEQ_BY_ROUND[round];
    state.sequence = seq ? seq.slice() : [];
    state.progress = 0;
  }

  function startPlayback() {
    state.phase = "playback";
    state.last_feedback = "";
    emit("playback_started", {});
    var seq = state.sequence;
    var i = 0;
    function step() {
      if (i >= seq.length) {
        currentHighlight = null;
        state.phase = "input";
        emit("input_phase_started", {});
        return;
      }
      currentHighlight = seq[i];
      setTimeout(function () {
        currentHighlight = null;
        setTimeout(function () {
          i += 1;
          step();
        }, GAP_MS);
      }, HIGHLIGHT_MS);
    }
    step();
  }

  function startGame() {
    if (state.status !== "menu") return;
    state.status = "playing";
    state.phase = "playback";
    state.round = 1;
    state.lives = 3;
    state.score = 0;
    state.progress = 0;
    state.last_feedback = "";
    currentHighlight = null;
    loadRound(1);
    emit("game_started", {});
    startPlayback();
  }

  function doReset(seed) {
    if (typeof seed === "number") currentSeed = seed;
    eventEpoch += 1;
    eventSeq = 0;
    events = [];
    currentHighlight = null;
    state = {
      status: "menu",
      phase: "menu",
      round: 1,
      lives: 3,
      score: 0,
      progress: 0,
      sequence: [],
      last_feedback: ""
    };
    emit("game_reset", {});
  }

  function quadrantColor(x, y) {
    if (x < 400 && y < 300) return "RED";
    if (x >= 400 && y < 300) return "GREEN";
    if (x < 400 && y >= 300) return "BLUE";
    return "YELLOW";
  }

  function handleClick(x, y) {
    if (state.status !== "playing") return; // won/lost/menu do not change state
    if (state.phase !== "input") {
      emit("input_ignored", {});
      return;
    }
    var color = quadrantColor(x, y);
    var expected = state.sequence[state.progress];
    if (color === expected) {
      state.score += 10;
      state.progress += 1;
      state.last_feedback = "Correct";
      emit("signal_correct", { color: color });
      if (state.progress >= state.sequence.length) {
        emit("round_completed", { round: state.round });
        state.round += 1;
        if (state.round > 3) {
          state.status = "won";
          state.phase = "menu";
          state.last_feedback = "";
          emit("game_won", { score: state.score });
        } else {
          loadRound(state.round);
          startPlayback();
        }
      }
    } else {
      state.lives -= 1;
      state.progress = 0;
      state.last_feedback = "Wrong — try this round again";
      emit("signal_wrong", { color: color, expected: expected });
      if (state.lives <= 0) {
        state.status = "lost";
        state.phase = "menu";
        state.last_feedback = "";
        emit("game_lost", {});
      } else {
        loadRound(state.round); // replay same round
        startPlayback();
      }
    }
  }

  // ---- Input wiring ----
  canvas.addEventListener("click", function (e) {
    var rect = canvas.getBoundingClientRect();
    var x = (e.clientX - rect.left) * (800 / rect.width);
    var y = (e.clientY - rect.top) * (600 / rect.height);
    handleClick(x, y);
  });

  document.getElementById("start-btn").addEventListener("click", function () {
    startGame();
  });

  document.getElementById("restart-btn").addEventListener("click", function () {
    doReset(currentSeed);
  });

  window.addEventListener("keydown", function (e) {
    if (e.code === "KeyR") {
      doReset(currentSeed);
    }
  });

  // ---- Rendering ----
  function drawCanvas() {
    ctx.clearRect(0, 0, 800, 600);
    for (var key in REGIONS) {
      if (!REGIONS.hasOwnProperty(key)) continue;
      var r = REGIONS[key];
      ctx.fillStyle = currentHighlight === key ? r.hi : r.base;
      ctx.fillRect(r.x, r.y, r.w, r.h);
      ctx.strokeStyle = "#1a1a1a";
      ctx.lineWidth = 4;
      ctx.strokeRect(r.x + 2, r.y + 2, r.w - 4, r.h - 4);
      if (currentHighlight === key) {
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = 6;
        ctx.strokeRect(r.x + 4, r.y + 4, r.w - 8, r.h - 8);
      }
      ctx.fillStyle = "rgba(255,255,255,0.85)";
      ctx.font = "bold 28px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(r.label, r.x + r.w / 2, r.y + r.h / 2);
    }
    if (state.status === "menu") {
      ctx.fillStyle = "rgba(255,255,255,0.9)";
      ctx.font = "bold 22px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("Press START to play", 400, 560);
    }
  }

  function updateHUD() {
    roundLabel.textContent = "Round: " + state.round + "/3";
    livesLabel.textContent = "Lives: " + state.lives + "/3";
    scoreLabel.textContent = String(state.score);
    var phaseText = state.phase === "playback" ? "Watch"
      : state.phase === "input" ? "Repeat" : "";
    phaseLabel.textContent = phaseText;
    var statusText = { menu: "Menu", playing: "Playing", won: "Won", lost: "Lost" }[state.status];
    statusLabel.textContent = statusText;
    feedbackLabel.textContent = state.last_feedback;
  }

  function render() {
    drawCanvas();
    updateHUD();
    requestAnimationFrame(render);
  }

  // ---- Observation bridge ----
  window.__GAMETESTLAB__ = {
    protocol: "gametestlab/2",
    isReady: function () { return ready; },
    reset: function (opts) {
      var seed = opts && typeof opts.seed === "number" ? opts.seed : currentSeed;
      doReset(seed);
    },
    observe: function () {
      return {
        tick: nowTick(),
        status: state.status,
        state: JSON.parse(JSON.stringify(state)),
        event_epoch: eventEpoch,
        latest_event_seq: eventSeq
      };
    },
    getEvents: function (opts) {
      var afterSeq = (opts && typeof opts.afterSeq === "number") ? opts.afterSeq : 0;
      var out = [];
      for (var i = 0; i < events.length; i++) {
        if (events[i].seq > afterSeq) out.push(events[i]);
      }
      return out;
    }
  };

  // ---- Init ----
  ready = true;
  requestAnimationFrame(render);
})();
