(function (global) {
  'use strict';

  var DIRECTIONS = {
    up: { x: 0, y: -1 },
    down: { x: 0, y: 1 },
    left: { x: -1, y: 0 },
    right: { x: 1, y: 0 }
  };

  var OPPOSITE = {
    up: 'down',
    down: 'up',
    left: 'right',
    right: 'left'
  };

  function createGame(options) {
    var settings = options || {};
    var cols = settings.cols || 20;
    var rows = settings.rows || 20;
    var random = typeof settings.random === 'function' ? settings.random : Math.random;
    var scorePerFood = settings.scorePerFood || 10;

    var state = {
      status: 'idle',
      snake: [],
      direction: 'right',
      pending: [],
      food: { x: 0, y: 0 },
      score: 0,
      reason: null
    };

    function placeSnake(direction) {
      var head = { x: Math.floor(cols / 2), y: Math.floor(rows / 2) };
      var vector = DIRECTIONS[direction];
      state.snake = [];
      for (var i = 0; i < 3; i += 1) {
        state.snake.push({
          x: head.x - vector.x * i,
          y: head.y - vector.y * i
        });
      }
    }

    function emptyCells() {
      var occupied = {};
      var i;
      for (i = 0; i < state.snake.length; i += 1) {
        occupied[state.snake[i].x + ',' + state.snake[i].y] = true;
      }

      var cells = [];
      for (var y = 0; y < rows; y += 1) {
        for (var x = 0; x < cols; x += 1) {
          if (!occupied[x + ',' + y]) {
            cells.push({ x: x, y: y });
          }
        }
      }
      return cells;
    }

    function placeFood() {
      var cells = emptyCells();
      if (!cells.length) {
        return false;
      }
      state.food = cells[Math.floor(random() * cells.length)];
      return true;
    }

    function reset(direction) {
      var dir = DIRECTIONS[direction] ? direction : 'right';
      state.status = 'idle';
      state.direction = dir;
      state.pending = [];
      state.score = 0;
      state.reason = null;
      placeSnake(dir);
      placeFood();
    }

    function start(direction) {
      if (state.status === 'running') {
        return false;
      }
      var dir = DIRECTIONS[direction] ? direction : 'right';
      reset(dir);
      state.status = 'running';
      return true;
    }

    function turn(direction) {
      if (state.status !== 'running' || !DIRECTIONS[direction]) {
        return false;
      }

      var last = state.pending.length ? state.pending[state.pending.length - 1] : state.direction;
      if (direction === last || direction === OPPOSITE[last] || state.pending.length >= 2) {
        return false;
      }

      state.pending.push(direction);
      return true;
    }

    function tick() {
      if (state.status !== 'running') {
        return { type: 'idle' };
      }

      if (state.pending.length) {
        state.direction = state.pending.shift();
      }

      var vector = DIRECTIONS[state.direction];
      var head = state.snake[0];
      var next = { x: head.x + vector.x, y: head.y + vector.y };

      if (next.x < 0 || next.x >= cols || next.y < 0 || next.y >= rows) {
        state.status = 'over';
        state.reason = 'wall';
        return { type: 'over', reason: 'wall' };
      }

      var eating = next.x === state.food.x && next.y === state.food.y;
      var body = eating ? state.snake : state.snake.slice(0, -1);

      for (var i = 0; i < body.length; i += 1) {
        if (body[i].x === next.x && body[i].y === next.y) {
          state.status = 'over';
          state.reason = 'self';
          return { type: 'over', reason: 'self' };
        }
      }

      state.snake.unshift(next);

      if (!eating) {
        state.snake.pop();
        return { type: 'move' };
      }

      state.score += scorePerFood;

      if (!placeFood()) {
        state.status = 'over';
        state.reason = 'board-full';
        return { type: 'win' };
      }

      return { type: 'eat', score: state.score };
    }

    reset('right');

    return {
      cols: cols,
      rows: rows,
      scorePerFood: scorePerFood,
      state: state,
      start: start,
      turn: turn,
      tick: tick,
      reset: reset
    };
  }

  global.SnakeCore = {
    createGame: createGame,
    DIRECTIONS: DIRECTIONS
  };

  if (typeof document === 'undefined') {
    return;
  }

  var COLS = 20;
  var ROWS = 20;
  var TICK_MS = 130;
  var BEST_KEY = 'snake-best-score:v1';
  var KEY_DIRECTIONS = {
    ArrowUp: 'up',
    ArrowDown: 'down',
    ArrowLeft: 'left',
    ArrowRight: 'right'
  };

  var canvas = document.getElementById('gameCanvas');
  var ctx = canvas.getContext('2d');
  var scoreEl = document.getElementById('scoreValue');
  var bestEl = document.getElementById('bestValue');
  var lengthEl = document.getElementById('lengthValue');
  var startOverlay = document.getElementById('startOverlay');
  var startBtn = document.getElementById('startBtn');
  var modal = document.getElementById('gameOverModal');
  var overTitle = document.getElementById('overTitle');
  var overScore = document.getElementById('overScore');
  var overBest = document.getElementById('overBest');
  var newRecord = document.getElementById('newRecord');
  var restartBtn = document.getElementById('restartBtn');
  var statusEl = document.getElementById('gameStatus');
  var mainEl = document.getElementById('main');
  var dpadButtons = document.querySelectorAll('[data-dir]');

  var game = global.SnakeCore.createGame({ cols: COLS, rows: ROWS });
  var state = game.state;
  var timer = null;
  var best = readBest();
  var bestAtStart = best;

  function readBest() {
    try {
      var value = parseInt(global.localStorage.getItem(BEST_KEY), 10);
      return !isNaN(value) && value > 0 ? value : 0;
    } catch (error) {
      return 0;
    }
  }

  function saveBest() {
    try {
      global.localStorage.setItem(BEST_KEY, String(best));
    } catch (error) {
      // 隐私模式或禁用存储时，最高分只保留在本次页面中。
    }
  }

  function syncHud() {
    scoreEl.textContent = String(state.score);
    bestEl.textContent = String(best);
    lengthEl.textContent = String(state.snake.length);
  }

  function announce(message) {
    statusEl.textContent = message;
  }

  function stopTimer() {
    if (timer !== null) {
      global.clearInterval(timer);
      timer = null;
    }
  }

  function startTimer() {
    stopTimer();
    timer = global.setInterval(step, TICK_MS);
  }

  function startGame(direction) {
    if (state.status === 'running') {
      return;
    }

    bestAtStart = best;
    game.start(direction || 'right');
    startOverlay.hidden = true;
    modal.hidden = true;
    mainEl.inert = false;
    document.body.classList.add('is-playing');
    syncHud();
    render();
    startTimer();
    announce('游戏开始');

    if (typeof canvas.focus === 'function') {
      canvas.focus({ preventScroll: true });
    }
  }

  function step() {
    var result = game.tick();

    if (result.type === 'eat' && state.score > best) {
      best = state.score;
      saveBest();
    }

    syncHud();
    render();

    if (result.type === 'eat') {
      announce('得分 ' + state.score);
    }

    if (result.type === 'over' || result.type === 'win') {
      finishGame();
    }
  }

  function finishGame() {
    stopTimer();

    var isRecord = state.score > bestAtStart && state.score > 0;

    if (state.score > best) {
      best = state.score;
      saveBest();
    }

    syncHud();

    if (state.reason === 'self') {
      overTitle.textContent = '咬到自己了';
    } else if (state.reason === 'board-full') {
      overTitle.textContent = '棋盘被你填满了！';
    } else {
      overTitle.textContent = '撞到墙了';
    }

    overScore.textContent = String(state.score);
    overBest.textContent = String(best);
    newRecord.hidden = !isRecord;
    modal.hidden = false;
    mainEl.inert = true;
    announce('游戏结束，得分 ' + state.score + '，最高分 ' + best);

    global.setTimeout(function () {
      restartBtn.focus();
    }, 0);
  }

  function resizeCanvas() {
    var rect = canvas.getBoundingClientRect();
    var width = Math.floor(rect.width);

    if (width < COLS * 2) {
      return;
    }

    var dpr = Math.min(global.devicePixelRatio || 1, 3);
    var pixels = Math.max(1, Math.round(width * dpr));

    if (canvas.width !== pixels || canvas.height !== pixels) {
      canvas.width = pixels;
      canvas.height = pixels;
    }

    render();
  }

  function roundedRect(x, y, width, height, radius) {
    var r = Math.max(0, Math.min(radius, width / 2, height / 2));
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + width, y, x + width, y + height, r);
    ctx.arcTo(x + width, y + height, x, y + height, r);
    ctx.arcTo(x, y + height, x, y, r);
    ctx.arcTo(x, y, x + width, y, r);
    ctx.closePath();
  }

  function drawFood(cell) {
    var cx = (state.food.x + 0.5) * cell;
    var cy = (state.food.y + 0.5) * cell;
    var radius = Math.max(2, cell * 0.28);

    ctx.save();
    ctx.shadowColor = 'rgba(242, 167, 160, 0.65)';
    ctx.shadowBlur = cell * 0.6;
    ctx.fillStyle = '#f2a7a0';
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    ctx.fillStyle = '#d9b45b';
    ctx.beginPath();
    ctx.ellipse(
      cx + radius * 0.25,
      cy - radius * 0.8,
      radius * 0.38,
      radius * 0.18,
      -0.5,
      0,
      Math.PI * 2
    );
    ctx.fill();
  }

  function drawSnake(cell) {
    var snake = state.snake;
    var padding = Math.max(1, cell * 0.08);
    var radius = Math.max(2, cell * 0.24);

    for (var i = snake.length - 1; i >= 0; i -= 1) {
      var segment = snake[i];
      var alpha = i === 0 ? 1 : 0.45 + 0.35 * (1 - i / snake.length);

      ctx.fillStyle = i === 0
        ? '#f0d493'
        : 'rgba(217, 180, 91, ' + alpha.toFixed(3) + ')';

      roundedRect(
        segment.x * cell + padding,
        segment.y * cell + padding,
        cell - padding * 2,
        cell - padding * 2,
        radius
      );
      ctx.fill();
    }

    drawEyes(cell);
  }

  function drawEyes(cell) {
    var head = state.snake[0];
    var vector = global.SnakeCore.DIRECTIONS[state.direction] || DIRECTIONS.right;
    var perpendicular = { x: -vector.y, y: vector.x };
    var centerX = (head.x + 0.5) * cell;
    var centerY = (head.y + 0.5) * cell;
    var forward = cell * 0.12;
    var side = cell * 0.17;
    var eyeRadius = Math.max(1.5, cell * 0.075);

    ctx.fillStyle = '#061020';

    [1, -1].forEach(function (sign) {
      ctx.beginPath();
      ctx.arc(
        centerX + vector.x * forward + perpendicular.x * side * sign,
        centerY + vector.y * forward + perpendicular.y * side * sign,
        eyeRadius,
        0,
        Math.PI * 2
      );
      ctx.fill();
    });
  }

  function render() {
    if (!canvas.width || canvas.width < COLS * 4) {
      return;
    }

    var size = canvas.width;
    var cell = size / COLS;

    ctx.clearRect(0, 0, size, size);
    ctx.fillStyle = '#050e1d';
    ctx.fillRect(0, 0, size, size);

    ctx.strokeStyle = 'rgba(160, 190, 235, 0.055)';
    ctx.lineWidth = Math.max(1, size * 0.0012);
    ctx.beginPath();
    for (var i = 1; i < COLS; i += 1) {
      var position = i * cell;
      ctx.moveTo(position, 0);
      ctx.lineTo(position, size);
      ctx.moveTo(0, position);
      ctx.lineTo(size, position);
    }
    ctx.stroke();

    drawFood(cell);
    drawSnake(cell);
  }

  startBtn.addEventListener('click', function () {
    startGame('right');
  });

  restartBtn.addEventListener('click', function () {
    startGame('right');
  });

  for (var i = 0; i < dpadButtons.length; i += 1) {
    dpadButtons[i].addEventListener('click', function (event) {
      var direction = event.currentTarget.getAttribute('data-dir');
      if (state.status === 'idle') {
        startGame(direction);
      } else if (state.status === 'running') {
        game.turn(direction);
      }
    });
  }

  global.addEventListener('keydown', function (event) {
    var direction = KEY_DIRECTIONS[event.key];

    if (!direction || event.ctrlKey || event.metaKey || event.altKey) {
      return;
    }

    event.preventDefault();

    if (state.status === 'idle' || !modal.hidden) {
      startGame(direction);
      return;
    }

    if (state.status === 'running') {
      game.turn(direction);
    }
  });

  modal.addEventListener('keydown', function (event) {
    if (event.key === 'Tab') {
      event.preventDefault();
      restartBtn.focus();
    }
  });

  if (typeof ResizeObserver !== 'undefined') {
    var resizeObserver = new ResizeObserver(function () {
      resizeCanvas();
    });
    resizeObserver.observe(canvas);
  } else {
    global.addEventListener('resize', resizeCanvas);
  }

  syncHud();
  resizeCanvas();
})(typeof window !== 'undefined' ? window : globalThis);
