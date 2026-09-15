/* Meteor Survivor
 * - 800x600 canvas2d main area
 * - deterministic meteor schedule (seed produces same initial state + timetable)
 * - time driven by performance.now() + requestAnimationFrame (virtual-time friendly)
 *
 * Meteor impact model (design note):
 * The fixed schedule hits lanes 1,0,2,1 at 1000/2000/3000/4000ms. By 4000ms all
 * three lanes would have a meteor, so a "persistent" meteor on a lane would make
 * surviving to 5000ms impossible. Therefore each meteor is resolved at its
 * scheduled impact instant: if the player shares that lane at the crossing the
 * player is hit (lost); otherwise the wave is survived (+100) and the lane clears
 * again. This keeps the game winnable and matches the "avoid the wave's lane"
 * verification while preserving the exact timetable.
 */
(function () {
  "use strict";

  var METEOR_SCHEDULE = [
    { time: 1000, lane: 1 },
    { time: 2000, lane: 0 },
    { time: 3000, lane: 2 },
    { time: 4000, lane: 1 }
  ];
  var WIN_TIME = 5000;
  var LANE_COUNT = 3;

  var canvas = document.getElementById("game-canvas");
  var ctx = canvas.getContext("2d");
  var scoreEl = document.querySelector('[data-testid="score"]');
  var statusEl = document.querySelector('[data-testid="status"]');
  var startBtn = document.getElementById("start-btn");
  var restartBtn = document.getElementById("restart-btn");

  // --- core state ---
  var state = {
    status: "menu", // menu | playing | won | lost
    lane: 1,
    elapsed_ms: 0,
    wave: 0,
    score: 0,
    best_score: 0
  };
  var seed = 1;
  var t0 = 0;
  var processedWaves = 0;
  var tick = 0;
  var eventEpoch = 1;
  var seqCounter = 0;
  var events = [];
  var ready = false;

  function emit(type, payload) {
    seqCounter++;
    var ev = { seq: seqCounter, tick: tick, type: type };
    if (payload !== undefined) ev.payload = payload;
    events.push(ev);
  }

  // resetGame is used by both the RESTART control and the bridge reset({seed}).
  // It always starts a fresh epoch (event_epoch + 1) and re-records game_reset
  // from seq = 1.
  function resetGame(opts) {
    eventEpoch++;
    seqCounter = 0;
    events = [];
    if (opts && typeof opts.seed === "number") {
      seed = opts.seed;
    }
    state.status = "menu";
    state.lane = 1;
    state.elapsed_ms = 0;
    state.wave = 0;
    state.score = 0;
    state.best_score = 0;
    t0 = 0;
    processedWaves = 0;
    emit("game_reset", { seed: seed });
  }

  function startGame() {
    if (state.status !== "menu") return;
    state.status = "playing";
    state.lane = 1;
    state.elapsed_ms = 0;
    state.wave = 0;
    state.score = 0;
    state.best_score = 0;
    t0 = performance.now();
    processedWaves = 0;
    emit("game_started", {});
  }

  function moveLeft() {
    if (state.status !== "playing") return;
    if (state.lane > 0) {
      var prev = state.lane;
      state.lane--;
      emit("lane_changed", { lane: state.lane, prev_lane: prev, direction: "left" });
    }
  }

  function moveRight() {
    if (state.status !== "playing") return;
    if (state.lane < LANE_COUNT - 1) {
      var prev = state.lane;
      state.lane++;
      emit("lane_changed", { lane: state.lane, prev_lane: prev, direction: "right" });
    }
  }

  function winGame() {
    state.elapsed_ms = WIN_TIME;
    state.score += 100; // survival bonus
    state.status = "won";
    if (state.score > state.best_score) state.best_score = state.score;
    emit("game_won", { score: state.score });
    emit("leaderboard_updated", { best_score: state.best_score, score: state.score });
  }

  function processTime() {
    var elapsed = state.elapsed_ms;
    while (
      processedWaves < METEOR_SCHEDULE.length &&
      elapsed >= METEOR_SCHEDULE[processedWaves].time
    ) {
      var w = METEOR_SCHEDULE[processedWaves];
      if (state.lane === w.lane) {
        state.elapsed_ms = w.time;
        state.status = "lost";
        emit("meteor_hit", { lane: w.lane, wave: processedWaves + 1 });
        return;
      }
      state.wave++;
      state.score += 100;
      emit("wave_survived", { wave: state.wave, score: state.score, lane: w.lane });
      processedWaves++;
    }
    if (state.status === "playing" && elapsed >= WIN_TIME) {
      winGame();
    }
  }

  // --- rendering ---
  function laneCenterY(lane) {
    var laneH = 600 / 3;
    return lane * laneH + laneH / 2;
  }

  function drawMeteor(w) {
    var elapsed = state.elapsed_ms;
    var spawnStart = w.time - 600;
    if (elapsed < spawnStart) return;
    var p = (elapsed - spawnStart) / 600; // 0..1 reaches impact
    if (p > 1.25) return;
    var targetY = laneCenterY(w.lane);
    var y, alpha = 1;
    if (p <= 1) {
      y = -30 + p * (targetY + 30);
    } else {
      y = targetY;
      alpha = 1 - (p - 1) / 0.25;
    }
    ctx.globalAlpha = Math.max(0, alpha);
    ctx.fillStyle = "#ff8c42";
    ctx.beginPath();
    ctx.arc(400, y, 18, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#ffd28a";
    ctx.beginPath();
    ctx.arc(400, y, 9, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  function drawCenter(title, sub, color) {
    ctx.fillStyle = "rgba(0,0,0,0.55)";
    ctx.fillRect(0, 200, 800, 200);
    ctx.textAlign = "center";
    ctx.fillStyle = color;
    ctx.font = "40px sans-serif";
    ctx.fillText(title, 400, 300);
    ctx.font = "20px sans-serif";
    ctx.fillStyle = "#dfe7ff";
    ctx.fillText(sub, 400, 345);
    ctx.textAlign = "left";
  }

  function render() {
    ctx.textAlign = "left";
    ctx.fillStyle = "#0b1020";
    ctx.fillRect(0, 0, 800, 600);

    var laneH = 600 / 3;
    for (var i = 0; i < 3; i++) {
      ctx.fillStyle = i % 2 === 0 ? "#121a33" : "#0f1626";
      ctx.fillRect(0, i * laneH, 800, laneH);
      ctx.strokeStyle = "#2a3b66";
      ctx.strokeRect(0, i * laneH, 800, laneH);
      ctx.fillStyle = "#5a6b9a";
      ctx.font = "16px sans-serif";
      ctx.fillText("Lane " + i, 10, i * laneH + 24);
    }

    for (var m = 0; m < METEOR_SCHEDULE.length; m++) {
      drawMeteor(METEOR_SCHEDULE[m]);
    }

    var py = laneCenterY(state.lane);
    ctx.fillStyle = state.status === "lost" ? "#888888" : "#37e0a0";
    ctx.beginPath();
    ctx.arc(80, py, 20, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#0b1020";
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.lineWidth = 1;

    if (state.status === "menu") {
      drawCenter("METEOR SURVIVOR", "Press START to begin", "#ffffff");
    } else if (state.status === "won") {
      drawCenter(
        "YOU SURVIVED!",
        "Score: " + state.score + "   Best: " + state.best_score + "   - Press RESTART",
        "#37e0a0"
      );
    } else if (state.status === "lost") {
      drawCenter(
        "METEOR HIT!",
        "Lane " + state.lane + "   Score: " + state.score + "   - Press RESTART",
        "#ff6b6b"
      );
    } else {
      ctx.fillStyle = "#cfe7ff";
      ctx.font = "16px sans-serif";
      ctx.fillText(
        "Wave: " + state.wave + "/4   Time: " + Math.floor(state.elapsed_ms) + "/5000 ms",
        300,
        24
      );
    }

    // HUD DOM
    scoreEl.textContent = "Score: " + state.score;
    statusEl.textContent = {
      menu: "Menu",
      playing: "Playing",
      won: "Won",
      lost: "Lost"
    }[state.status];
  }

  function loop() {
    tick++;
    if (state.status === "playing") {
      state.elapsed_ms = performance.now() - t0;
      processTime();
    }
    render();
    requestAnimationFrame(loop);
  }

  // --- input (real keyboard / mouse only) ---
  startBtn.addEventListener("click", startGame);
  restartBtn.addEventListener("click", function () {
    resetGame();
  });
  window.addEventListener("keydown", function (e) {
    if (e.code === "ArrowLeft") {
      e.preventDefault();
      moveLeft();
    } else if (e.code === "ArrowRight") {
      e.preventDefault();
      moveRight();
    }
  });

  // --- read-only observation bridge (gametestlab/2) ---
  window.__GAMETESTLAB__ = {
    protocol: "gametestlab/2",
    isReady: function () {
      return ready;
    },
    reset: function (opts) {
      resetGame(opts || {});
      return { ok: true, event_epoch: eventEpoch };
    },
    observe: function () {
      return {
        tick: tick,
        status: state.status,
        state: JSON.parse(JSON.stringify(state)),
        event_epoch: eventEpoch,
        latest_event_seq: seqCounter
      };
    },
    getEvents: function (opts) {
      var after =
        opts && typeof opts.afterSeq === "number" ? opts.afterSeq : 0;
      return events
        .filter(function (e) {
          return e.seq > after;
        })
        .map(function (e) {
          return JSON.parse(JSON.stringify(e));
        });
    }
  };

  ready = true;
  requestAnimationFrame(loop);
})();
