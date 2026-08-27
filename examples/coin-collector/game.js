const canvas = document.querySelector("#game");
const context = canvas.getContext("2d");
const scoreNode = document.querySelector("[data-testid='score']");
const statusNode = document.querySelector("[data-testid='status']");
const startButton = document.querySelector("[data-testid='start']");
const variant = new URLSearchParams(window.location.search).get("variant") ?? "clean";

let seed = 0;
let tick = 0;
let eventSeq = 0;
let events = [];
let state;

function initialState() {
  return {
    status: "menu",
    player: { x: 0 },
    score: 0,
    coins: [1, 2],
    collected: 0
  };
}

function emit(type, payload = undefined) {
  eventSeq += 1;
  events.push({ seq: eventSeq, tick, type, payload });
}

function displayedScore() {
  if (variant === "hud_stale") return 0;
  if (variant === "cross_layer_masked") return state.collected;
  return state.score;
}

function render() {
  scoreNode.textContent = String(displayedScore());
  statusNode.textContent = state.status;

  context.clearRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = "#101a2e";
  context.fillRect(0, 0, canvas.width, canvas.height);

  for (let index = 0; index < 4; index += 1) {
    const x = 30 + index * 150;
    context.strokeStyle = "#33466f";
    context.strokeRect(x, 30, 120, 100);
    if (state.coins.includes(index)) {
      context.beginPath();
      context.arc(x + 60, 80, 18, 0, Math.PI * 2);
      context.fillStyle = "#fbbf24";
      context.fill();
    }
  }

  const playerX = 30 + state.player.x * 150;
  context.fillStyle = "#7dd3fc";
  context.fillRect(playerX + 35, 55, 50, 50);
}

function collectCoin() {
  if (!state.coins.includes(state.player.x)) return;
  state.coins = state.coins.filter((position) => position !== state.player.x);
  state.collected += 1;

  if (variant === "score_plus_two") {
    state.score += 2;
  } else if (
    variant === "score_compensated" ||
    variant === "cross_layer_masked"
  ) {
    state.score += state.collected === 1 ? 2 : 0;
  } else {
    state.score += 1;
  }
  emit("coin_collected", { x: state.player.x, score: state.score });

  if (state.coins.length === 0) {
    state.status = "won";
    emit("game_won", { score: state.score });
  }
}

function move(delta) {
  if (state.status !== "playing") return;
  tick += 1;
  state.player.x = Math.max(0, Math.min(3, state.player.x + delta));
  emit("player_moved", { x: state.player.x });
  collectCoin();
  render();
}

function start() {
  if (state.status === "menu") {
    state.status = "playing";
    emit("game_started");
    render();
  }
}

startButton.addEventListener("click", start);
window.addEventListener("keydown", (event) => {
  if (event.code === "ArrowRight") move(1);
  if (event.code === "ArrowLeft") move(-1);
});

window.__PRD2PLAY__ = {
  protocol: "prd2play/1",
  isReady: () => true,
  reset: ({ seed: nextSeed }) => {
    seed = nextSeed;
    tick = 0;
    eventSeq = 0;
    events = [];
    state = initialState();
    render();
  },
  observe: () => ({
    tick,
    status: state.status,
    state: {
      status: state.status,
      player: { ...state.player },
      score: state.score,
      coins_count: state.coins.length,
      seed
    },
    latest_event_seq: eventSeq
  }),
  getEvents: ({ afterSeq }) =>
    events.filter((event) => event.seq > afterSeq).map((event) => ({ ...event }))
};

state = initialState();
render();
