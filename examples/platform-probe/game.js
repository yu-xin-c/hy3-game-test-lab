(function () {
  "use strict";

  const canvas = document.querySelector("#game");
  const context = canvas.getContext("2d");
  const startButton = document.querySelector("#start-btn");
  const statusNode = document.querySelector("#status");
  const simTimeNode = document.querySelector("#sim-time");
  const supportNode = document.querySelector("#support");
  const variantNode = document.querySelector("#variant");

  const variant = new URLSearchParams(window.location.search).get("variant") === "tunnel"
    ? "tunnel"
    : "normal";

  const STEP_MS = 1000 / 60;
  const STEP_SECONDS = STEP_MS / 1000;
  const MAX_FRAME_DELTA_MS = 100;
  const MOVE_SPEED = 300;
  const JUMP_SPEED = 650;
  const GRAVITY = 1200;
  const GROUND_Y = 560;

  const world = Object.freeze({ x: 0, y: 0, width: 800, height: 600 });
  const platforms = Object.freeze([
    Object.freeze({ id: "platform-1", x: 340, y: 400, width: 200, height: 20 }),
    Object.freeze({ id: "platform-2", x: 620, y: 300, width: 120, height: 20 })
  ]);

  let ready = false;
  let seed = 1;
  let tick = 0;
  let simTimeMs = 0;
  let eventEpoch = 0;
  let eventSeq = 0;
  let events = [];
  let state = createInitialState();
  let accumulatorMs = 0;
  let lastFrameTime = performance.now();
  let initializationTimerFired = false;
  let initializationTimerFiredAtReset = null;

  setTimeout(() => {
    initializationTimerFired = true;
  }, 10);

  const input = {
    left: false,
    right: false
  };

  function createInitialState() {
    return {
      status: "menu",
      player: {
        x: 110,
        y: GROUND_Y - 40,
        width: 32,
        height: 40,
        vx: 0,
        vy: 0,
        grounded: true,
        support_id: "ground"
      }
    };
  }

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function emit(type, payload = {}) {
    eventSeq += 1;
    events.push({
      seq: eventSeq,
      tick,
      type,
      payload: clone(payload)
    });
  }

  function clearInput() {
    input.left = false;
    input.right = false;
  }

  function resetToMenu(nextSeed) {
    seed = Number.isFinite(nextSeed) ? Math.trunc(nextSeed) : 1;
    tick = 0;
    simTimeMs = 0;
    eventEpoch += 1;
    eventSeq = 0;
    events = [];
    state = createInitialState();
    accumulatorMs = 0;
    lastFrameTime = performance.now();
    clearInput();
    render();
  }

  function restartFromInput() {
    resetToMenu(seed);
    emit("game_reset", {
      status: state.status,
      sim_time_ms: simTimeMs
    });
    render();
  }

  function startGame() {
    if (state.status !== "menu") return;
    state.status = "playing";
    lastFrameTime = performance.now();
    accumulatorMs = 0;
    emit("game_started", { seed });
    render();
  }

  function jump() {
    const player = state.player;
    if (state.status !== "playing" || !player.grounded) return;
    player.vy = -JUMP_SPEED;
    player.grounded = false;
    player.support_id = null;
    emit("player_jumped", {
      x: player.x,
      y: player.y,
      sim_time_ms: simTimeMs
    });
  }

  function horizontalOverlap(player, platform) {
    return player.x + player.width > platform.x && player.x < platform.x + platform.width;
  }

  function findLandingSurface(previousBottom, nextBottom, player) {
    if (player.vy < 0) return null;

    let landing = null;
    for (const platform of platforms) {
      if (variant === "tunnel" && platform.id === "platform-1") continue;
      if (
        previousBottom <= platform.y &&
        nextBottom >= platform.y &&
        horizontalOverlap(player, platform) &&
        (!landing || platform.y < landing.y)
      ) {
        landing = platform;
      }
    }
    return landing;
  }

  function landOn(support) {
    const player = state.player;
    const wasGrounded = player.grounded;
    const previousSupport = player.support_id;
    const supportY = support.id === "ground" ? GROUND_Y : support.y;

    player.y = supportY - player.height;
    player.vy = 0;
    player.grounded = true;
    player.support_id = support.id;

    if (!wasGrounded || previousSupport !== support.id) {
      emit("player_landed", {
        support_id: support.id,
        x: player.x,
        y: player.y,
        sim_time_ms: simTimeMs
      });
    }

    if (support.id === "platform-1") {
      state.status = "won";
      player.vx = 0;
      clearInput();
      emit("game_won", {
        support_id: support.id,
        sim_time_ms: simTimeMs
      });
    }
  }

  function updateFixedStep() {
    if (state.status === "menu") return;

    tick += 1;
    simTimeMs = Number((tick * STEP_MS).toFixed(6));
    if (state.status !== "playing") return;

    const player = state.player;
    player.vx = (Number(input.right) - Number(input.left)) * MOVE_SPEED;
    player.x = Math.max(
      world.x,
      Math.min(world.width - player.width, player.x + player.vx * STEP_SECONDS)
    );

    const previousBottom = player.y + player.height;
    player.vy += GRAVITY * STEP_SECONDS;
    const nextY = player.y + player.vy * STEP_SECONDS;
    const nextBottom = nextY + player.height;

    const landingPlatform = findLandingSurface(previousBottom, nextBottom, player);
    if (landingPlatform) {
      landOn(landingPlatform);
      return;
    }

    if (player.vy >= 0 && previousBottom <= GROUND_Y && nextBottom >= GROUND_Y) {
      landOn({ id: "ground", y: GROUND_Y });
      return;
    }

    player.y = nextY;
    player.grounded = false;
    player.support_id = null;
  }

  function drawBackground() {
    const gradient = context.createLinearGradient(0, 0, 0, world.height);
    gradient.addColorStop(0, "#10233d");
    gradient.addColorStop(1, "#081321");
    context.fillStyle = gradient;
    context.fillRect(0, 0, world.width, world.height);

    context.strokeStyle = "rgb(125 211 252 / 8%)";
    context.lineWidth = 1;
    for (let x = 0; x <= world.width; x += 40) {
      context.beginPath();
      context.moveTo(x, 0);
      context.lineTo(x, world.height);
      context.stroke();
    }
    for (let y = 0; y <= world.height; y += 40) {
      context.beginPath();
      context.moveTo(0, y);
      context.lineTo(world.width, y);
      context.stroke();
    }
  }

  function drawPlatform(platform) {
    context.fillStyle = platform.id === "platform-1" ? "#34d399" : "#60a5fa";
    context.fillRect(platform.x, platform.y, platform.width, platform.height);
    context.fillStyle = "#dceaf8";
    context.font = "bold 13px system-ui";
    context.fillText(platform.id, platform.x + 10, platform.y - 8);
  }

  function drawPlayer() {
    const player = state.player;
    context.fillStyle = "#fbbf24";
    context.fillRect(player.x, player.y, player.width, player.height);
    context.fillStyle = "#172033";
    context.fillRect(player.x + 7, player.y + 10, 5, 5);
    context.fillRect(player.x + 20, player.y + 10, 5, 5);
  }

  function render() {
    drawBackground();

    context.fillStyle = "#26384b";
    context.fillRect(0, GROUND_Y, world.width, world.height - GROUND_Y);
    context.fillStyle = "#8aa2b8";
    context.fillRect(0, GROUND_Y, world.width, 3);

    for (const platform of platforms) drawPlatform(platform);
    drawPlayer();

    if (state.status === "menu") {
      context.fillStyle = "rgb(3 9 18 / 58%)";
      context.fillRect(0, 0, world.width, world.height);
      context.fillStyle = "#f4f7fb";
      context.font = "800 34px system-ui";
      context.textAlign = "center";
      context.fillText("Platform Probe", world.width / 2, 250);
      context.font = "18px system-ui";
      context.fillStyle = "#bed0e1";
      context.fillText("向右移动并跳到 platform-1", world.width / 2, 286);
      context.textAlign = "start";
    } else if (state.status === "won") {
      context.fillStyle = "rgb(4 24 18 / 72%)";
      context.fillRect(250, 220, 300, 100);
      context.fillStyle = "#6ee7b7";
      context.font = "800 32px system-ui";
      context.textAlign = "center";
      context.fillText("LANDED · WON", world.width / 2, 280);
      context.textAlign = "start";
    }

    statusNode.textContent = state.status;
    simTimeNode.textContent = simTimeMs.toFixed(3);
    supportNode.textContent = state.player.support_id ?? "none";
    variantNode.textContent = variant;
    startButton.disabled = state.status !== "menu";
    startButton.textContent = state.status === "menu" ? "Start" : state.status === "won" ? "Won" : "Running";
  }

  function frame(now) {
    const elapsed = Math.min(MAX_FRAME_DELTA_MS, Math.max(0, now - lastFrameTime));
    lastFrameTime = now;
    accumulatorMs += elapsed;

    while (accumulatorMs + 1e-9 >= STEP_MS) {
      updateFixedStep();
      accumulatorMs -= STEP_MS;
    }

    render();
    requestAnimationFrame(frame);
  }

  startButton.addEventListener("click", startGame);

  window.addEventListener("keydown", (event) => {
    if (["ArrowLeft", "ArrowRight", "Space", "KeyR"].includes(event.code)) {
      event.preventDefault();
    }
    if (event.code === "ArrowLeft") input.left = true;
    if (event.code === "ArrowRight") input.right = true;
    if (event.code === "Space" && !event.repeat) jump();
    if (event.code === "KeyR" && !event.repeat) restartFromInput();
  });

  window.addEventListener("keyup", (event) => {
    if (event.code === "ArrowLeft") input.left = false;
    if (event.code === "ArrowRight") input.right = false;
  });

  window.addEventListener("blur", clearInput);

  window.__GAMETESTLAB__ = Object.freeze({
    protocol: "gametestlab/2",
    isReady: () => ready,
    reset: ({ seed: nextSeed } = {}) => {
      initializationTimerFiredAtReset = initializationTimerFired;
      resetToMenu(nextSeed);
      emit("game_reset", { source: "bridge" });
    },
    observe: () => ({
      tick,
      status: state.status,
      state: {
        status: state.status,
        seed,
        variant,
        player: clone(state.player),
        platforms: clone(platforms),
        world: clone(world),
        sim_time_ms: simTimeMs,
        initialization_timer_fired_at_reset: initializationTimerFiredAtReset
      },
      event_epoch: eventEpoch,
      latest_event_seq: eventSeq
    }),
    getEvents: ({ afterSeq } = {}) => {
      const cursor = Number.isInteger(afterSeq) ? afterSeq : 0;
      return clone(events.filter((event) => event.seq > cursor));
    }
  });

  resetToMenu(seed);
  ready = true;
  requestAnimationFrame(frame);
})();
