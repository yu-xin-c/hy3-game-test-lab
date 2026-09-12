import { expect, test } from "@playwright/test";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { PublicCaseSchema } from "../../src/contracts/schemas";
import { runPlaythrough } from "../../src/runtime/playthrough";

const baseURL = "http://127.0.0.1:4173";
const virtualStartTime = 1_700_000_000_000;

const persistenceGame = `<!doctype html>
<button id="start">Start</button><button id="stage">Stage</button>
<button id="restart">Restart</button><div id="game"></div>
<span data-testid="score"></span><span data-testid="status"></span>
<script>
const key = 'complex-probe-save';
const initial = () => ({status:'menu',progress:0,score:0,lives:2,last_action:null,saved:false});
let state = JSON.parse(localStorage.getItem(key) || 'null') || initial();
let events = [], epoch = 0, tick = 0;
const emit = type => events.push({seq:events.length+1,tick,type});
const render = () => {
  document.querySelector('[data-testid=score]').textContent = 'Score: ' + state.score;
  document.querySelector('[data-testid=status]').textContent = state.status[0].toUpperCase()+state.status.slice(1);
};
if (state.saved) emit('state_loaded');
document.querySelector('#start').onclick = () => { state={...initial(),status:'playing',saved:true}; localStorage.setItem(key,JSON.stringify(state)); emit('game_started'); render(); };
document.querySelector('#stage').onclick = () => { state={...state,progress:1,score:10,last_action:'stage one',saved:true}; localStorage.setItem(key,JSON.stringify(state)); emit('stage_completed'); emit('state_saved'); render(); };
document.querySelector('#restart').onclick = () => { localStorage.removeItem(key); state=initial(); epoch++; events=[]; emit('game_reset'); render(); };
window.__GAMETESTLAB__={protocol:'gametestlab/2',isReady:()=>true,reset:()=>{localStorage.removeItem(key);state=initial();epoch++;events=[];emit('game_reset');render();},observe:()=>({tick,status:state.status,state:{...state},event_epoch:epoch,latest_event_seq:events.length}),getEvents:({afterSeq})=>events.filter(e=>e.seq>afterSeq)};
render();
</script>`;

const multiplayerGame = `<!doctype html>
<button id="start">Start</button><button id="join">Join</button>
<button id="stage">Stage</button><button id="restart">Restart</button>
<div id="game"></div><span data-testid="score"></span><span data-testid="status"></span>
<script>
let state={status:'menu',progress:0,score:0,lives:2,last_action:null,connected:0};
let events=[],epoch=0,tick=0;
const channel=new BroadcastChannel('gametestlab-complex-probe');
const emit=type=>events.push({seq:events.length+1,tick,type});
const render=()=>{document.querySelector('[data-testid=score]').textContent='Score: '+state.score;document.querySelector('[data-testid=status]').textContent=state.status[0].toUpperCase()+state.status.slice(1);};
const publish=type=>channel.postMessage({state,type});
channel.onmessage=event=>{state={...event.data.state};emit(event.data.type);render();};
document.querySelector('#start').onclick=()=>{state={...state,status:'playing',connected:1};emit('game_started');publish('game_started');render();};
document.querySelector('#join').onclick=()=>{state={...state,status:'playing',connected:2};emit('player_joined');publish('player_joined');render();};
document.querySelector('#stage').onclick=()=>{state={...state,progress:1,score:10,last_action:'stage two',connected:2};emit('stage_completed');publish('stage_completed');render();};
document.querySelector('#restart').onclick=()=>{state={status:'menu',progress:0,score:0,lives:2,last_action:null,connected:0};epoch++;events=[];emit('game_reset');publish('game_reset');render();};
window.__GAMETESTLAB__={protocol:'gametestlab/2',isReady:()=>true,reset:()=>{state={status:'menu',progress:0,score:0,lives:2,last_action:null,connected:0};epoch++;events=[];emit('game_reset');render();},observe:()=>({tick,status:state.status,state:{...state},event_epoch:epoch,latest_event_seq:events.length}),getEvents:({afterSeq})=>events.filter(e=>e.seq>afterSeq)};
render();
</script>`;

const cameraGame = `<!doctype html>
<button id="start">Start</button><button id="restart">Restart</button>
<canvas id="game" width="320" height="240"></canvas><video id="camera" autoplay muted playsinline></video>
<span data-testid="score"></span><span data-testid="status"></span>
<script>
let state={status:'menu',progress:0,score:0,lives:2,last_action:null};
let events=[],epoch=0,tick=0,ready=false,detected=false;
const emit=type=>events.push({seq:events.length+1,tick,type});
const render=()=>{document.querySelector('[data-testid=score]').textContent='Score: '+state.score;document.querySelector('[data-testid=status]').textContent=state.status[0].toUpperCase()+state.status.slice(1);};
const video=document.querySelector('#camera'),canvas=document.querySelector('#game'),ctx=canvas.getContext('2d');
navigator.mediaDevices.getUserMedia({video:true}).then(stream=>{video.srcObject=stream;return video.play();}).then(()=>{ready=true;});
setInterval(()=>{tick++;if(state.status!=='playing'||detected||video.readyState<2)return;ctx.drawImage(video,0,0,320,240);const pixel=ctx.getImageData(50,110,1,1).data;if(pixel[2]>180&&pixel[0]<100){detected=true;state={...state,progress:1,score:10,last_action:'blue'};emit('camera_frame_detected');emit('stage_completed');render();}},100);
document.querySelector('#start').onclick=()=>{state={status:'playing',progress:0,score:0,lives:2,last_action:null};detected=false;emit('game_started');render();};
document.querySelector('#restart').onclick=()=>{state={status:'menu',progress:0,score:0,lives:2,last_action:null};epoch++;events=[];emit('game_reset');render();};
window.__GAMETESTLAB__={protocol:'gametestlab/2',isReady:()=>ready,reset:()=>{state={status:'menu',progress:0,score:0,lives:2,last_action:null};detected=false;epoch++;events=[];emit('game_reset');render();},observe:()=>({tick,status:state.status,state:{...state},event_epoch:epoch,latest_event_seq:events.length}),getEvents:({afterSeq})=>events.filter(e=>e.seq>afterSeq)};
render();
</script>`;

function baseCase(id: string, entryPath: string) {
  return {
    schema_version: "gametestlab.case.v3" as const,
    id,
    title: id,
    difficulty: { level: "D3" as const, rationale: "Complex browser environment probe." },
    source: { type: "project_authored" as const, description: "test", license: "MIT" },
    game: {
      entry_path: entryPath,
      surface: "dom" as const,
      viewport: { width: 800, height: 600 },
      selectors: { score: "[data-testid='score']", status: "[data-testid='status']", surface: "#game" }
    },
    requirements: [{ id: "REQ", layer: "L2" as const, severity: "must" as const, statement: "state changes", depends_on: [], observable: ["state"] }]
  };
}

test("reload steps preserve browser storage and collect the loaded state", async ({ context, page }) => {
  await context.route("**/examples/complex-persistence/index.html**", (route) =>
    route.fulfill({ status: 200, contentType: "text/html", body: persistenceGame })
  );
  const publicCase = PublicCaseSchema.parse({
    ...baseCase("complex-persistence", "/examples/complex-persistence/index.html"),
    controls: [
      { action_id: "START", device: "mouse", selector: "#start" },
      { action_id: "STAGE", device: "mouse", selector: "#stage" }
    ],
    scenarios: [{
      id: "reload",
      description: "save then reload",
      seed: 1,
      clock: { mode: "virtual", start_time_ms: virtualStartTime },
      steps: [
        { kind: "input", action_id: "START" },
        { kind: "input", action_id: "STAGE" },
        { kind: "reload", actor: "primary", checkpoints: ["CP-LOAD"] }
      ]
    }]
  });
  const result = await runPlaythrough({ page, baseURL, publicCase, scenarioId: "reload", fixtureVariant: "formal" });
  expect(result.diagnostics).toEqual([]);
  expect(result.observations[0]).toMatchObject({
    state: { status: "playing", progress: 1, score: 10, saved: true },
    event_types: ["state_loaded"]
  });
  expect(result.trace.at(-1)?.step_kind).toBe("reload");
});

test("secondary-page input is observed from the primary page", async ({ context, page }) => {
  await context.route("**/examples/complex-multiplayer/index.html**", (route) =>
    route.fulfill({ status: 200, contentType: "text/html", body: multiplayerGame })
  );
  const secondaryPage = await context.newPage();
  const publicCase = PublicCaseSchema.parse({
    ...baseCase("complex-multiplayer", "/examples/complex-multiplayer/index.html"),
    controls: [
      { action_id: "START", actor: "primary", device: "mouse", selector: "#start" },
      { action_id: "JOIN", actor: "secondary", device: "mouse", selector: "#join" },
      { action_id: "STAGE", actor: "secondary", device: "mouse", selector: "#stage" }
    ],
    scenarios: [{
      id: "two-pages",
      description: "join and act from page two",
      seed: 2,
      clock: { mode: "virtual", start_time_ms: virtualStartTime },
      steps: [
        { kind: "input", action_id: "START" },
        { kind: "input", action_id: "JOIN" },
        { kind: "input", action_id: "STAGE", checkpoints: ["CP-SYNC"] }
      ]
    }]
  });
  const result = await runPlaythrough({ page, secondaryPage, baseURL, publicCase, scenarioId: "two-pages", fixtureVariant: "formal" });
  expect(result.diagnostics).toEqual([]);
  expect(result.observations[0]).toMatchObject({
    state: { status: "playing", connected: 2, progress: 1, score: 10 },
    event_types: ["stage_completed"]
  });
});

test("checkpoint event intervals include unchecked actions without leaking across checkpoints or reset", async ({ context, page }) => {
  await context.route("**/examples/complex-interval/index.html**", route =>
    route.fulfill({ status: 200, contentType: "text/html", body: persistenceGame }));
  const publicCase = PublicCaseSchema.parse({
    ...baseCase("complex-interval", "/examples/complex-interval/index.html"),
    controls: [
      { action_id: "START", device: "mouse", selector: "#start" },
      { action_id: "STAGE", device: "mouse", selector: "#stage" },
      { action_id: "RESTART", device: "mouse", selector: "#restart" }
    ],
    scenarios: [{ id: "interval", description: "event windows", seed: 3,
      clock: { mode: "virtual", start_time_ms: virtualStartTime, setup_ms: 0 },
      steps: [
        { kind: "input", action_id: "START", checkpoints: ["START"] },
        { kind: "input", action_id: "STAGE" },
        { kind: "advance_time", advance_ms: 32, checkpoints: ["STAGE", "SAME-STEP"] },
        { kind: "advance_time", advance_ms: 32, checkpoints: ["EMPTY"] },
        { kind: "input", action_id: "STAGE" },
        { kind: "input", action_id: "RESTART", checkpoints: ["RESET"] }
      ]
    }]
  });
  const result = await runPlaythrough({ page, baseURL, publicCase, scenarioId: "interval", fixtureVariant: "formal" });
  expect(result.diagnostics).toEqual([]);
  expect(result.observations[1]?.event_types).toEqual([]);
  expect(result.observations[1]?.event_types_since_checkpoint).toEqual(["stage_completed", "state_saved"]);
  expect(result.observations[2]?.event_types_since_checkpoint).toEqual(["stage_completed", "state_saved"]);
  expect(result.observations[3]?.event_types_since_checkpoint).toEqual([]);
  expect(result.observations[4]?.event_types_since_checkpoint).toEqual(["game_reset"]);
});

test("camera actions switch the fake stream and advance virtual time", async ({ context, page }) => {
  await context.route("**/examples/complex-camera/index.html**", (route) =>
    route.fulfill({ status: 200, contentType: "text/html", body: cameraGame })
  );
  const publicCase = PublicCaseSchema.parse({
    ...baseCase("complex-camera", "/examples/complex-camera/index.html"),
    controls: [
      { action_id: "START", device: "mouse", selector: "#start" },
      { action_id: "BLUE", device: "camera", fixture_frame: "blue-left-marker" }
    ],
    scenarios: [{
      id: "camera",
      description: "show a deterministic blue marker",
      seed: 3,
      clock: { mode: "virtual", start_time_ms: virtualStartTime, setup_ms: 100 },
      steps: [
        { kind: "input", action_id: "START" },
        { kind: "input", action_id: "BLUE", advance_ms: 600, checkpoints: ["CP-CAMERA"] }
      ]
    }]
  });
  const result = await runPlaythrough({ page, baseURL, publicCase, scenarioId: "camera", fixtureVariant: "formal" });
  expect(result.diagnostics).toEqual([]);
  expect(result.observations[0]).toMatchObject({
    state: { status: "playing", progress: 1, score: 10, last_action: "blue" },
    event_types: expect.arrayContaining(["camera_frame_detected", "stage_completed"])
  });

  // Formal batches use tsx, whose function-name transform differs from the
  // Playwright test runner. Exercise that execution path too.
  const script = `
    import { chromium } from '@playwright/test';
    import { runPlaythrough } from './src/runtime/playthrough.ts';
    const executablePath = process.env.GAMETESTLAB_CHROMIUM_EXECUTABLE;
    const browser = await chromium.launch({ headless: true, ...(executablePath ? { executablePath } : {}) });
    try {
      const context = await browser.newContext();
      await context.route('**/examples/complex-camera/index.html**', route =>
        route.fulfill({ status: 200, contentType: 'text/html', body: ${JSON.stringify(cameraGame)} }));
      const page = await context.newPage();
      const result = await runPlaythrough({ page, baseURL: ${JSON.stringify(baseURL)},
        publicCase: ${JSON.stringify(publicCase)}, scenarioId: 'camera', fixtureVariant: 'formal' });
      console.log(JSON.stringify({ diagnostics: result.diagnostics, state: result.observations[0]?.state }));
    } finally { await browser.close(); }
  `;
  const cli = await promisify(execFile)(process.execPath, ["--import", "tsx", "--input-type=module", "-e", script], {
    timeout: 20_000
  });
  expect(JSON.parse(cli.stdout)).toMatchObject({ diagnostics: [], state: { progress: 1, score: 10 } });
});
