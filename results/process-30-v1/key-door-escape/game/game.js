(function () {
  'use strict';

  // Fixed 8x5 map. x = column, y = row.
  // S(1,1) start, K(1,3) key, D(4,1) door, T(4,3) trap, E(6,1) exit.
  var MAP = [
    ['#', '#', '#', '#', '#', '#', '#', '#'],
    ['#', 'S', '.', '.', 'D', '.', 'E', '#'],
    ['#', '.', '#', '.', '#', '.', '.', '#'],
    ['#', 'K', '.', '.', 'T', '.', '.', '#'],
    ['#', '#', '#', '#', '#', '#', '#', '#']
  ];
  var COLS = 8;
  var ROWS = 5;
  var START = { x: 1, y: 1 };
  var TOTAL_LIVES = 2;

  var status = 'menu';
  var player = { x: START.x, y: START.y };
  var lives = TOTAL_LIVES;
  var has_key = false;
  var door_open = false;
  var lifeSnapshot = { has_key: false, door_open: false };
  var message = '';

  var tick = 0;
  var seq = 0;
  var event_epoch = 0;
  var events = [];
  var ready = false;

  var board = document.getElementById('board');
  var scoreEl = document.querySelector('[data-testid="score"]');
  var statusEl = document.querySelector('[data-testid="status"]');
  var startBtn = document.getElementById('start-btn');
  var restartBtn = document.getElementById('restart-btn');

  function emit(type, payload) {
    tick++;
    seq++;
    var ev = { seq: seq, tick: tick, type: type };
    if (payload !== undefined) ev.payload = payload;
    events.push(ev);
    return ev;
  }

  function beginLife() {
    lifeSnapshot = { has_key: has_key, door_open: door_open };
  }

  function render() {
    board.innerHTML = '';
    for (var y = 0; y < ROWS; y++) {
      for (var x = 0; x < COLS; x++) {
        var ch = MAP[y][x];
        var cell = document.createElement('div');
        var type = 'floor';
        var label = '';
        if (ch === '#') { type = 'wall'; }
        else if (ch === 'S') { type = 'start'; label = 'S'; }
        else if (ch === 'K') { type = 'key'; label = 'K'; }
        else if (ch === 'D') { type = 'door'; label = 'D'; }
        else if (ch === 'T') { type = 'trap'; label = 'T'; }
        else if (ch === 'E') { type = 'exit'; label = 'E'; }
        cell.className = 'cell ' + type;
        cell.dataset.type = type;
        if (player.x === x && player.y === y) {
          cell.classList.add('player');
          cell.dataset.player = 'true';
          label = 'P';
        }
        cell.textContent = label;
        board.appendChild(cell);
      }
    }
  }

  function updateHud() {
    scoreEl.textContent =
      'Lives: ' + lives + '/' + TOTAL_LIVES +
      ' | Key: ' + (has_key ? 'Yes' : 'No') +
      ' | Door: ' + (door_open ? 'Open' : 'Locked');
    var msg = message ? ' - ' + message : '';
    statusEl.textContent = 'Status: ' + status.toUpperCase() + msg;
  }

  function getState() {
    return {
      status: status,
      player: { x: player.x, y: player.y },
      lives: lives,
      has_key: has_key,
      door_open: door_open
    };
  }

  function tryMove(dx, dy) {
    if (status !== 'playing') return;
    message = '';
    var nx = player.x + dx;
    var ny = player.y + dy;
    if (nx < 0 || nx >= COLS || ny < 0 || ny >= ROWS) {
      emit('wall_blocked');
      message = 'Blocked by wall';
      updateHud();
      return;
    }
    var ch = MAP[ny][nx];
    if (ch === '#') {
      emit('wall_blocked');
      message = 'Blocked by wall';
      updateHud();
      return;
    }
    if (ch === 'D' && !door_open) {
      if (!has_key) {
        emit('door_blocked');
        message = 'Door is locked';
        updateHud();
        return;
      }
      door_open = true;
      emit('door_opened');
      message = 'Door opened';
    }
    var from = { x: player.x, y: player.y };
    player = { x: nx, y: ny };
    emit('player_moved', { from: from, to: { x: nx, y: ny } });
    if (ch === 'K' && !has_key) {
      has_key = true;
      emit('key_collected');
      message = 'Key collected';
    }
    if (ch === 'T') {
      emit('trap_hit', { at: { x: nx, y: ny } });
      lives--;
      if (lives <= 0) {
        status = 'lost';
        emit('game_lost');
        message = 'Game over';
      } else {
        has_key = lifeSnapshot.has_key;
        door_open = lifeSnapshot.door_open;
        player = { x: START.x, y: START.y };
        beginLife();
        emit('player_respawned');
        message = 'Lost a life, back to start';
      }
      render();
      updateHud();
      return;
    }
    if (ch === 'E' && door_open) {
      status = 'won';
      emit('game_won');
      message = 'You escaped!';
    }
    render();
    updateHud();
  }

  function startGame() {
    if (status !== 'menu') return;
    status = 'playing';
    emit('game_started');
    message = '';
    render();
    updateHud();
  }

  function resetGame(seed) {
    status = 'menu';
    lives = TOTAL_LIVES;
    has_key = false;
    door_open = false;
    player = { x: START.x, y: START.y };
    lifeSnapshot = { has_key: false, door_open: false };
    message = '';
    tick = 0;
    seq = 0;
    event_epoch++;
    events = [];
    emit('game_reset', { seed: (seed === undefined ? null : seed) });
    render();
    updateHud();
  }

  function init() {
    resetGame(undefined);
    ready = true;
    render();
    updateHud();
  }

  startBtn.addEventListener('click', startGame);
  restartBtn.addEventListener('click', function () { resetGame(undefined); });

  window.addEventListener('keydown', function (e) {
    var handled = true;
    switch (e.code) {
      case 'ArrowUp': tryMove(0, -1); break;
      case 'ArrowDown': tryMove(0, 1); break;
      case 'ArrowLeft': tryMove(-1, 0); break;
      case 'ArrowRight': tryMove(1, 0); break;
      case 'KeyR': resetGame(undefined); break;
      default: handled = false;
    }
    if (handled) e.preventDefault();
  });

  window.__GAMETESTLAB__ = {
    protocol: 'gametestlab/2',
    isReady: function () { return ready; },
    reset: function (opts) {
      var seed = opts && opts.seed;
      resetGame(seed);
    },
    observe: function () {
      return {
        tick: tick,
        status: status,
        state: getState(),
        event_epoch: event_epoch,
        latest_event_seq: seq
      };
    },
    getEvents: function (opts) {
      var after = (opts && opts.afterSeq) ? opts.afterSeq : 0;
      return events.filter(function (ev) { return ev.seq > after; });
    }
  };

  init();
})();
