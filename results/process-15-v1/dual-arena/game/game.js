/* Dual Arena — local two-page sync via BroadcastChannel only.
 * No network access, no server. Surface: canvas2d (#arena). */
(function () {
  'use strict';

  var CHANNEL = 'dual-arena-room';
  var TARGET = 3;

  var canvas = document.getElementById('arena');
  var ctx = canvas.getContext('2d');
  var scoreEl = document.getElementById('score');
  var statusEl = document.getElementById('status');
  var menuEl = document.getElementById('menu');
  var startBtn = document.getElementById('start-btn');
  var joinBtn = document.getElementById('join-btn');
  var restartBtn = document.getElementById('restart-btn');

  var channel = ('BroadcastChannel' in window)
    ? new BroadcastChannel(CHANNEL)
    : null;

  /* ---- state ---- */
  var state = {
    status: 'menu', // menu | playing | won | lost
    connected: false,
    p1_position: 0,
    p2_position: 0,
    winner: null // null | 'primary' | 'secondary'
  };
  var role = null; // 'primary' | 'secondary' | null
  var currentSeed = 0;

  /* ---- time / events ---- */
  var tick = 0;
  var eventEpoch = 0;
  var seqCounter = 0;
  var events = [];
  var ready = false;

  function emit(type, payload) {
    seqCounter += 1;
    var ev = { seq: seqCounter, tick: tick, type: type };
    if (payload !== undefined) ev.payload = payload;
    events.push(ev);
    return ev;
  }

  function postMessage(msg) {
    if (!channel) return;
    try { channel.postMessage(msg); } catch (e) { /* ignore */ }
  }

  function snapshot() {
    return {
      p1_position: state.p1_position,
      p2_position: state.p2_position,
      winner: state.winner
    };
  }

  function statusFromWinner() {
    if (state.winner === null) return state.status;
    if (role === 'primary') return state.winner === 'primary' ? 'won' : 'lost';
    if (role === 'secondary') return state.winner === 'secondary' ? 'won' : 'lost';
    return state.status;
  }

  /* ---- core moves / win ---- */
  function canMove() {
    return state.status === 'playing' && state.winner === null;
  }

  function setWin(winner) {
    if (state.winner !== null) return;
    state.winner = winner;
    state.status = statusFromWinner();
    emit('match_won', { winner: winner });
    postMessage({ kind: 'match_won', winner: winner });
  }

  function movePrimary(broadcast) {
    state.p1_position = Math.min(state.p1_position + 1, TARGET);
    emit('player_moved', { actor: 'primary', position: state.p1_position });
    if (broadcast) postMessage({ kind: 'player_moved', actor: 'primary', position: state.p1_position });
    if (state.p1_position >= TARGET) setWin('primary');
  }

  function moveSecondary(broadcast) {
    state.p2_position = Math.min(state.p2_position + 1, TARGET);
    emit('player_moved', { actor: 'secondary', position: state.p2_position });
    if (broadcast) postMessage({ kind: 'player_moved', actor: 'secondary', position: state.p2_position });
    if (state.p2_position >= TARGET) setWin('secondary');
  }

  function tryMovePrimary() {
    if (role !== 'primary' || !canMove()) return;
    movePrimary(true);
  }

  function tryMoveSecondary() {
    if (role !== 'secondary' || !canMove()) return;
    if (!state.connected) return; // wait until joined handshake completes
    moveSecondary(true);
  }

  /* ---- room lifecycle ---- */
  function startGame() {
    if (state.status !== 'menu') return;
    role = 'primary';
    state.status = 'playing';
    state.connected = false;
    state.p1_position = 0;
    state.p2_position = 0;
    state.winner = null;
    emit('room_created', {});
    emit('game_started', {});
    postMessage({ kind: 'room_created' });
  }

  function joinGame() {
    if (state.status !== 'menu') return;
    role = 'secondary';
    state.status = 'playing';
    state.connected = false;
    state.p1_position = 0;
    state.p2_position = 0;
    state.winner = null;
    emit('player_joined', {});
    postMessage({ kind: 'player_joined' });
  }

  function coreReset(seed, broadcast) {
    if (typeof seed === 'number') currentSeed = seed;
    state.status = 'menu';
    state.connected = false;
    state.p1_position = 0;
    state.p2_position = 0;
    state.winner = null;
    role = null;
    eventEpoch += 1;
    events = [];
    seqCounter = 0;
    emit('game_reset', { seed: currentSeed });
    if (broadcast) postMessage({ kind: 'game_reset', state: snapshot(), epoch: eventEpoch });
  }

  function applyRemoteReset(msg) {
    state.status = 'menu';
    state.connected = false;
    state.p1_position = 0;
    state.p2_position = 0;
    state.winner = null;
    role = null;
    eventEpoch = (msg && typeof msg.epoch === 'number') ? msg.epoch : eventEpoch + 1;
    events = [];
    seqCounter = 0;
    emit('game_reset', { seed: currentSeed });
  }

  /* ---- BroadcastChannel handling ---- */
  function onMessage(e) {
    var msg = e.data;
    if (!msg || !msg.kind) return;
    switch (msg.kind) {
      case 'room_created':
        // primary already created; ignore on secondary
        break;
      case 'player_joined':
        if (role === 'primary') {
          state.connected = true;
          postMessage({ kind: 'join_ack', state: snapshot() });
          emit('player_joined', {});
        }
        break;
      case 'join_ack':
        if (role === 'secondary') {
          state.connected = true;
          if (msg.state) {
            state.p1_position = msg.state.p1_position;
            state.p2_position = msg.state.p2_position;
            if (msg.state.winner !== null && msg.state.winner !== undefined) {
              state.winner = msg.state.winner;
              state.status = statusFromWinner();
            }
          }
        }
        break;
      case 'player_moved':
        if (msg.actor === 'primary') {
          state.p1_position = msg.position;
          if (state.p1_position >= TARGET && state.winner === null) setWin('primary');
        } else if (msg.actor === 'secondary') {
          state.p2_position = msg.position;
          if (state.p2_position >= TARGET && state.winner === null) setWin('secondary');
        }
        break;
      case 'match_won':
        if (state.winner === null) {
          state.winner = msg.winner;
          state.status = statusFromWinner();
          emit('match_won', { winner: msg.winner });
        }
        break;
      case 'game_reset':
        applyRemoteReset(msg);
        break;
    }
  }

  if (channel) channel.onmessage = onMessage;

  /* ---- input ---- */
  startBtn.addEventListener('click', startGame);
  joinBtn.addEventListener('click', joinGame);
  restartBtn.addEventListener('click', function () { coreReset(currentSeed, true); });

  window.addEventListener('keydown', function (ev) {
    if (ev.code === 'KeyD') {
      tryMovePrimary();
    } else if (ev.code === 'KeyL') {
      tryMoveSecondary();
    }
  });

  /* ---- UI / rendering ---- */
  function updateHud() {
    scoreEl.textContent = 'P1: ' + state.p1_position + '/3  P2: ' + state.p2_position + '/3';
    var s = state.status;
    statusEl.textContent = s.charAt(0).toUpperCase() + s.slice(1);
    menuEl.style.display = (state.status === 'menu') ? 'flex' : 'none';
  }

  function drawLane(y, label, pos, color) {
    var startX = 100, cellW = 120, gap = 20;
    ctx.fillStyle = '#e6edf3';
    ctx.font = '16px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(label, startX, y - 18);

    for (var i = 0; i <= TARGET; i++) {
      var x = startX + i * (cellW + gap);
      ctx.strokeStyle = '#30363d';
      ctx.lineWidth = 2;
      ctx.strokeRect(x, y, cellW, cellW);
      ctx.fillStyle = '#8b949e';
      ctx.font = '14px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(String(i), x + cellW / 2, y + cellW / 2 + 5);
    }

    var px = startX + pos * (cellW + gap) + cellW / 2;
    var py = y + cellW / 2;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(px, py, 26, 0, Math.PI * 2);
    ctx.fill();
  }

  function draw() {
    var W = canvas.width, H = canvas.height;
    ctx.fillStyle = '#0d1117';
    ctx.fillRect(0, 0, W, H);

    ctx.fillStyle = '#e6edf3';
    ctx.font = '20px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Dual Arena', W / 2, 34);

    drawLane(150, 'P1 (D)', state.p1_position, '#58a6ff');
    drawLane(380, 'P2 (L)', state.p2_position, '#f78166');

    if (state.status === 'won' || state.status === 'lost') {
      ctx.fillStyle = '#ffd33d';
      ctx.font = '30px sans-serif';
      ctx.textAlign = 'center';
      var txt = state.winner === 'primary' ? 'Primary Wins!' : 'Secondary Wins!';
      ctx.fillText(txt, W / 2, 310);
    }
  }

  function loop() {
    tick += 1;
    draw();
    updateHud();
    requestAnimationFrame(loop);
  }

  /* ---- read-only observation bridge ---- */
  window.__GAMETESTLAB__ = {
    protocol: 'gametestlab/2',
    isReady: function () { return ready; },
    reset: function (opts) {
      var seed = (opts && typeof opts.seed === 'number') ? opts.seed : currentSeed;
      coreReset(seed, false);
      return { ok: true };
    },
    observe: function () {
      return {
        tick: tick,
        status: state.status,
        state: {
          status: state.status,
          connected: state.connected,
          p1_position: state.p1_position,
          p2_position: state.p2_position,
          winner: state.winner
        },
        event_epoch: eventEpoch,
        latest_event_seq: seqCounter
      };
    },
    getEvents: function (opts) {
      var after = (opts && typeof opts.afterSeq === 'number') ? opts.afterSeq : 0;
      var res = [];
      for (var i = 0; i < events.length; i++) {
        if (events[i].seq > after) res.push(events[i]);
      }
      return res;
    }
  };

  ready = true;
  updateHud();
  requestAnimationFrame(loop);
})();
