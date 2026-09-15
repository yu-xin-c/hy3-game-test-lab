(function () {
  'use strict';

  // ---- constants ----
  var CHANNEL = 'room-five-in-a-row';
  var SIZE = 5;
  var NEED = 5;
  var TOTAL_MOVES = 9; // display denominator (P1:5 + P2:4)

  // ---- runtime state ----
  var ready = false;
  var role = null;        // 'P1' (primary/host) | 'P2' (secondary/peer) | null
  var mySymbol = null;    // 'X' for P1, 'O' for P2
  var seed = 1;

  var state = {
    status: 'menu',       // menu | playing | won | lost
    connected: false,
    turn: 'P1',
    moves: 0,
    winner: null,         // null | 'P1' | 'P2'
    board: makeBoard()
  };

  var receivedHost = false; // got room_created
  var receivedPeer = false; // got player_joined

  var eventEpoch = 0;
  var events = [];         // { seq, tick, type, payload }
  var rafTick = 0;

  var bc = null;
  try {
    if (typeof BroadcastChannel !== 'undefined') {
      bc = new BroadcastChannel(CHANNEL);
      bc.onmessage = onMessage;
    }
  } catch (e) { bc = null; }

  // ---- helpers ----
  function makeBoard() {
    var b = [];
    for (var r = 0; r < SIZE; r++) {
      var row = [];
      for (var c = 0; c < SIZE; c++) row.push(null);
      b.push(row);
    }
    return b;
  }

  function deepBoard() {
    return state.board.map(function (row) { return row.slice(); });
  }

  function currentTick() { return rafTick; }

  function emit(type, payload) {
    events.push({
      seq: events.length + 1,
      tick: currentTick(),
      type: type,
      payload: payload || {}
    });
  }

  function broadcast(msg) {
    if (bc) { try { bc.postMessage(msg); } catch (e) {} }
  }

  // deterministic RNG (kept for fixed-seed reproducibility contract)
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // ---- DOM refs ----
  var scoreEl, statusEl, boardEl, startBtn, joinBtn, restartBtn, infoRole, infoTurn, infoConn;

  function buildBoard() {
    boardEl.innerHTML = '';
    for (var r = 0; r < SIZE; r++) {
      for (var c = 0; c < SIZE; c++) {
        var btn = document.createElement('button');
        btn.id = 'cell-r' + r + '-c' + c;
        btn.className = 'cell';
        btn.dataset.r = r;
        btn.dataset.c = c;
        btn.addEventListener('click', onCellClick);
        boardEl.appendChild(btn);
      }
    }
  }

  function onCellClick(e) {
    var t = e.currentTarget;
    var r = parseInt(t.dataset.r, 10);
    var c = parseInt(t.dataset.c, 10);
    attemptPlace(r, c);
  }

  function renderBoard() {
    var cells = boardEl.children;
    for (var i = 0; i < cells.length; i++) {
      var cell = cells[i];
      var r = parseInt(cell.dataset.r, 10);
      var c = parseInt(cell.dataset.c, 10);
      var v = state.board[r][c];
      cell.textContent = v ? v : '';
      cell.classList.toggle('filled', !!v);
      cell.classList.toggle('x', v === 'X');
      cell.classList.toggle('o', v === 'O');
    }
  }

  function updateHUD() {
    if (scoreEl) scoreEl.textContent = state.moves + ' / ' + TOTAL_MOVES;
    if (statusEl) {
      var s = state.status;
      statusEl.textContent = s.charAt(0).toUpperCase() + s.slice(1);
    }
    if (startBtn) startBtn.disabled = !(state.status === 'menu' && role === null);
    if (joinBtn) joinBtn.disabled = !(state.status === 'menu' && role === null);
    if (infoRole) infoRole.textContent = 'Role: ' + (role ? role : '-');
    if (infoTurn) infoTurn.textContent = 'Turn: ' + (state.status === 'playing' ? state.turn : '-');
    if (infoConn) infoConn.textContent = 'Connected: ' + (state.connected ? 'yes' : 'no');
  }

  // ---- game logic ----
  function attemptPlace(r, c) {
    if (state.status !== 'playing') return;   // input frozen unless playing
    if (role === null) return;
    if (state.turn !== role) return;          // strict alternation
    if (state.board[r][c] !== null) return;
    applyMove(r, c, role, mySymbol);
    broadcast({ type: 'piece_placed', row: r, col: c, player: role, symbol: mySymbol });
  }

  function applyMove(r, c, player, symbol) {
    if (state.board[r][c] !== null) return;
    state.board[r][c] = symbol;
    state.moves += 1;
    emit('piece_placed', { row: r, col: c, player: player, symbol: symbol });

    var win = checkWin(r, c, symbol);
    state.turn = (player === 'P1') ? 'P2' : 'P1';
    emit('turn_changed', { turn: state.turn });

    if (win) {
      state.winner = player;
      state.status = (player === role) ? 'won' : 'lost';
      emit('match_won', { winner: player, row: r, col: c });
    }
    renderBoard();
    updateHUD();
  }

  function checkWin(r, c, symbol) {
    var dirs = [[0, 1], [1, 0], [1, 1], [1, -1]];
    for (var d = 0; d < dirs.length; d++) {
      var dr = dirs[d][0], dc = dirs[d][1];
      var count = 1 + countDir(r, c, dr, dc, symbol) + countDir(r, c, -dr, -dc, symbol);
      if (count >= NEED) return true;
    }
    return false;
  }

  function countDir(r, c, dr, dc, symbol) {
    var n = 0;
    var rr = r + dr, cc = c + dc;
    while (rr >= 0 && rr < SIZE && cc >= 0 && cc < SIZE && state.board[rr][cc] === symbol) {
      n += 1;
      rr += dr; cc += dc;
    }
    return n;
  }

  function checkReady() {
    if (receivedHost && receivedPeer && state.status === 'menu') {
      enterPlaying();
    }
  }

  function enterPlaying() {
    state.status = 'playing';
    state.connected = true;
    state.turn = 'P1';
    state.moves = 0;
    state.winner = null;
    state.board = makeBoard();
    emit('game_started', {});
    renderBoard();
    updateHUD();
  }

  function onStartClick() {
    if (role !== null) return;
    if (state.status !== 'menu') return;
    role = 'P1';
    mySymbol = 'X';
    receivedHost = true;
    emit('room_created', { seed: seed });
    broadcast({ type: 'room_created', seed: seed });
    checkReady();
    updateHUD();
  }

  function onJoinClick() {
    if (role !== null) return;
    if (state.status !== 'menu') return;
    role = 'P2';
    mySymbol = 'O';
    receivedPeer = true;
    emit('player_joined', {});
    broadcast({ type: 'player_joined' });
    checkReady();
    updateHUD();
  }

  function doRestart() {
    if (state.status === 'menu') return; // nothing active to restart
    broadcast({ type: 'game_reset', toMenu: false });
    applyReset(false);
  }

  // toMenu: true -> restore MENU (bridge reset); false -> restart match (keep connected)
  function applyReset(toMenu) {
    eventEpoch += 1;
    events = [];
    state.board = makeBoard();
    state.turn = 'P1';
    state.moves = 0;
    state.winner = null;
    if (toMenu) {
      state.status = 'menu';
      state.connected = false;
      role = null;
      mySymbol = null;
      receivedHost = false;
      receivedPeer = false;
    } else {
      state.status = 'playing';
      state.connected = true; // room connection kept
    }
    emit('game_reset', { seed: seed });
    renderBoard();
    updateHUD();
  }

  // ---- messaging ----
  function onMessage(e) {
    var msg = e.data;
    if (!msg || !msg.type) return;
    switch (msg.type) {
      case 'room_created':
        seed = msg.seed;
        receivedHost = true;
        emit('room_created', { seed: seed });
        checkReady();
        updateHUD();
        break;
      case 'player_joined':
        receivedPeer = true;
        emit('player_joined', {});
        checkReady();
        updateHUD();
        break;
      case 'piece_placed':
        if (role && msg.player !== role) {
          applyMove(msg.row, msg.col, msg.player, msg.symbol);
        }
        break;
      case 'game_reset':
        applyReset(!!msg.toMenu);
        break;
    }
  }

  // ---- bridge (read-only observation) ----
  function observe() {
    return {
      tick: currentTick(),
      status: state.status,
      state: {
        status: state.status,
        connected: state.connected,
        turn: state.turn,
        moves: state.moves,
        winner: state.winner,
        board: deepBoard()
      },
      event_epoch: eventEpoch,
      latest_event_seq: events.length ? events[events.length - 1].seq : 0
    };
  }

  function getEvents(opts) {
    opts = opts || {};
    var after = (typeof opts.afterSeq === 'number') ? opts.afterSeq : 0;
    return events.filter(function (ev) { return ev.seq > after; });
  }

  function bridgeReset(opts) {
    var s = (opts && typeof opts.seed === 'number') ? opts.seed : 1;
    seed = s;
    mulberry32(s); // fixed-seed hook (board is deterministic)
    broadcast({ type: 'game_reset', toMenu: true });
    applyReset(true);
  }

  window.__GAMETESTLAB__ = {
    protocol: 'gametestlab/2',
    isReady: function () { return ready; },
    reset: function (opts) { bridgeReset(opts); },
    observe: observe,
    getEvents: getEvents
  };

  // ---- init ----
  function init() {
    scoreEl = document.querySelector('[data-testid="score"]');
    statusEl = document.querySelector('[data-testid="status"]');
    boardEl = document.getElementById('board');
    startBtn = document.getElementById('start-btn');
    joinBtn = document.getElementById('join-btn');
    restartBtn = document.getElementById('restart-btn');
    infoRole = document.getElementById('info-role');
    infoTurn = document.getElementById('info-turn');
    infoConn = document.getElementById('info-conn');

    buildBoard();
    renderBoard();
    updateHUD();

    startBtn.addEventListener('click', onStartClick);
    joinBtn.addEventListener('click', onJoinClick);
    restartBtn.addEventListener('click', doRestart);

    ready = true;

    function loop() {
      rafTick += 1;
      requestAnimationFrame(loop);
    }
    requestAnimationFrame(loop);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
