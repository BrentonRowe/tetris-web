(() => {
  "use strict";

  // Match the Python version:
  // - 10x20 grid
  // - drop interval 500ms
  // - score: lines_cleared * 100
  // - rotation: (x,y)->(y,-x) normalized, no wall kicks
  // - colors: random per piece

  const GRID_W = 10;
  const GRID_H = 20;
  const CELL = 30; // canvas pixels per cell (canvas is 300x600)
  const DROP_MS = 500;

  const COLORS = [
    "#00ffff", // cyan
    "#0000ff", // blue
    "#ffa500", // orange
    "#ffff00", // yellow
    "#00ff00", // green
    "#ff00ff", // magenta
    "#ff0000", // red
  ];

  // Same shapes as in Tetris.py (relative coordinates)
  const PIECES = [
    // I
    [
      [0, 0],
      [1, 0],
      [2, 0],
      [3, 0],
    ],
    // O
    [
      [0, 0],
      [1, 0],
      [0, 1],
      [1, 1],
    ],
    // T
    [
      [0, 0],
      [1, 0],
      [2, 0],
      [1, 1],
    ],
    // S
    [
      [1, 0],
      [2, 0],
      [0, 1],
      [1, 1],
    ],
    // Z
    [
      [0, 0],
      [1, 0],
      [1, 1],
      [2, 1],
    ],
    // J
    [
      [0, 0],
      [0, 1],
      [1, 1],
      [2, 1],
    ],
    // L
    [
      [2, 0],
      [0, 1],
      [1, 1],
      [2, 1],
    ],
  ];

  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d", { alpha: false });
  const scoreEl = document.getElementById("score");

  const overlay = document.getElementById("overlay");
  const overlayTitle = document.getElementById("overlayTitle");
  const overlaySub = document.getElementById("overlaySub");
  const pauseBtn = document.getElementById("pauseBtn");
  const resumeBtn = document.getElementById("resumeBtn");
  const restartBtn = document.getElementById("restartBtn");

  const leftBtn = document.getElementById("leftBtn");
  const rightBtn = document.getElementById("rightBtn");
  const downBtn = document.getElementById("downBtn");
  const rotateBtn = document.getElementById("rotateBtn");

  /** @type {number[][]} */
  let grid;

  /** @type {Array<[number, number]>} */
  let currentPiece;
  /** @type {Array<[number, number]>} */
  let nextPiece;
  let pieceX;
  let pieceY;
  let pieceColorIndex;

  let score = 0;
  let gameOver = false;
  let paused = false;

  let dropAccumulator = 0;
  let lastTs = 0;

  function clonePiece(piece) {
    return piece.map(([x, y]) => [x, y]);
  }

  function randomPiece() {
    const idx = Math.floor(Math.random() * PIECES.length);
    return clonePiece(PIECES[idx]);
  }

  function reset() {
    grid = Array.from({ length: GRID_H }, () => Array(GRID_W).fill(0));
    score = 0;
    gameOver = false;
    paused = false;
    dropAccumulator = 0;
    lastTs = 0;

    currentPiece = null;
    nextPiece = null;

    spawnPiece(true);
    updateHud();
    hideOverlay();
  }

  function canPlace(piece, x, y) {
    for (const [bx, by] of piece) {
      const gx = x + bx;
      const gy = y + by;

      if (gx < 0 || gx >= GRID_W || gy >= GRID_H) return false;
      if (gy >= 0 && grid[gy][gx] !== 0) return false;
    }
    return true;
  }

  function placePiece() {
    for (const [bx, by] of currentPiece) {
      const gx = pieceX + bx;
      const gy = pieceY + by;
      if (gy >= 0 && gy < GRID_H && gx >= 0 && gx < GRID_W) {
        grid[gy][gx] = pieceColorIndex + 1;
      }
    }
  }

  function clearLines() {
    let cleared = 0;

    let y = GRID_H - 1;
    while (y >= 0) {
      const full = grid[y].every((v) => v !== 0);
      if (full) {
        grid.splice(y, 1);
        grid.unshift(Array(GRID_W).fill(0));
        cleared += 1;
      } else {
        y -= 1;
      }
    }

    if (cleared > 0) {
      score += cleared * 100;
      updateHud();
    }
  }

  function spawnPiece(isFirst = false) {
    if (!isFirst && currentPiece !== null) {
      currentPiece = nextPiece;
      pieceColorIndex = Math.floor(Math.random() * COLORS.length);
    } else {
      currentPiece = randomPiece();
      pieceColorIndex = Math.floor(Math.random() * COLORS.length);
    }

    nextPiece = randomPiece();

    pieceX = Math.floor(GRID_W / 2) - 1;
    pieceY = 0;

    if (!canPlace(currentPiece, pieceX, pieceY)) {
      gameOver = true;
      showOverlay("GAME OVER", `Final score: ${score}`);
    }
  }

  function rotateCurrent() {
    if (!currentPiece) return;

    const rotated = currentPiece.map(([x, y]) => [y, -x]);

    let minX = Infinity;
    let minY = Infinity;
    for (const [x, y] of rotated) {
      if (x < minX) minX = x;
      if (y < minY) minY = y;
    }

    const normalized = rotated.map(([x, y]) => [x - minX, y - minY]);

    if (canPlace(normalized, pieceX, pieceY)) {
      currentPiece = normalized;
    }
  }

  function move(dx, dy) {
    if (!currentPiece || gameOver || paused) return;
    if (canPlace(currentPiece, pieceX + dx, pieceY + dy)) {
      pieceX += dx;
      pieceY += dy;
      return true;
    }
    return false;
  }

  function softDropStep() {
    if (!currentPiece || gameOver || paused) return;

    if (!move(0, 1)) {
      placePiece();
      clearLines();
      spawnPiece(false);
    }
  }

  function togglePause() {
    if (gameOver) return;
    paused = !paused;
    if (paused) {
      showOverlay("Paused", "Tap Resume to continue");
    } else {
      hideOverlay();
    }
  }

  function updateHud() {
    scoreEl.textContent = String(score);
    pauseBtn.textContent = paused ? "Resume" : "Pause";
  }

  function showOverlay(title, sub) {
    overlayTitle.textContent = title;
    overlaySub.textContent = sub;
    overlay.hidden = false;
    overlay.removeAttribute("hidden");
    overlay.style.display = "grid";
  }

  function hideOverlay() {
    overlay.hidden = true;
    overlay.setAttribute("hidden", "");
    overlay.style.display = "none";
  }

  function draw() {
    // background
    ctx.fillStyle = "#000000";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // grid lines (gray)
    ctx.strokeStyle = "#808080";
    ctx.lineWidth = 1;

    for (let x = 0; x <= canvas.width; x += CELL) {
      ctx.beginPath();
      ctx.moveTo(x + 0.5, 0);
      ctx.lineTo(x + 0.5, canvas.height);
      ctx.stroke();
    }
    for (let y = 0; y <= canvas.height; y += CELL) {
      ctx.beginPath();
      ctx.moveTo(0, y + 0.5);
      ctx.lineTo(canvas.width, y + 0.5);
      ctx.stroke();
    }

    // placed blocks
    for (let y = 0; y < GRID_H; y++) {
      for (let x = 0; x < GRID_W; x++) {
        const v = grid[y][x];
        if (v !== 0) {
          ctx.fillStyle = COLORS[v - 1] || "#ffffff";
          ctx.fillRect(x * CELL, y * CELL, CELL, CELL);
        }
      }
    }

    // current piece
    if (currentPiece) {
      ctx.fillStyle = COLORS[pieceColorIndex] || "#ffffff";
      for (const [bx, by] of currentPiece) {
        const gx = pieceX + bx;
        const gy = pieceY + by;
        if (gy >= 0) {
          ctx.fillRect(gx * CELL, gy * CELL, CELL, CELL);
        }
      }
    }
  }

  function frame(ts) {
    if (!lastTs) lastTs = ts;
    const dt = ts - lastTs;
    lastTs = ts;

    if (!paused && !gameOver) {
      dropAccumulator += dt;
      while (dropAccumulator >= DROP_MS) {
        dropAccumulator -= DROP_MS;
        softDropStep();
      }
    }

    draw();
    requestAnimationFrame(frame);
  }

  // Keyboard input
  window.addEventListener(
    "keydown",
    (e) => {
      if (e.repeat && (e.key === "ArrowUp" || e.key === "p" || e.key === "P"))
        return;

      if (e.key === "ArrowLeft") {
        e.preventDefault();
        move(-1, 0);
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        move(1, 0);
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        move(0, 1);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        if (!paused && !gameOver) rotateCurrent();
      } else if (e.key === "p" || e.key === "P" || e.key === "Escape") {
        e.preventDefault();
        togglePause();
        updateHud();
      }
    },
    { passive: false }
  );

  // Overlay controls
  pauseBtn.addEventListener("click", () => {
    togglePause();
    updateHud();
  });
  resumeBtn.addEventListener("click", () => {
    if (gameOver) return;
    paused = false;
    hideOverlay();
    updateHud();
  });
  restartBtn.addEventListener("click", () => {
    reset();
    updateHud();
  });

  // Touch buttons with optional repeat
  function attachRepeat(btn, action, { repeat = true } = {}) {
    let repeatTimer = null;
    let startTimer = null;

    const clearTimers = () => {
      if (startTimer) window.clearTimeout(startTimer);
      if (repeatTimer) window.clearInterval(repeatTimer);
      startTimer = null;
      repeatTimer = null;
    };

    const doAction = () => {
      if (gameOver) return;
      if (paused) return;
      action();
    };

    btn.addEventListener(
      "pointerdown",
      (e) => {
        e.preventDefault();
        btn.setPointerCapture(e.pointerId);
        doAction();

        if (!repeat) return;
        startTimer = window.setTimeout(() => {
          repeatTimer = window.setInterval(doAction, 80);
        }, 200);
      },
      { passive: false }
    );

    btn.addEventListener("pointerup", () => clearTimers());
    btn.addEventListener("pointercancel", () => clearTimers());
    btn.addEventListener("pointerleave", () => clearTimers());
  }

  attachRepeat(leftBtn, () => move(-1, 0));
  attachRepeat(rightBtn, () => move(1, 0));
  attachRepeat(downBtn, () => move(0, 1));
  attachRepeat(rotateBtn, () => rotateCurrent(), { repeat: false });

  // Swipe + tap on canvas
  let pointerActive = false;
  let startX = 0;
  let startY = 0;
  let startTime = 0;

  canvas.addEventListener(
    "pointerdown",
    (e) => {
      e.preventDefault();
      canvas.setPointerCapture(e.pointerId);
      pointerActive = true;
      startX = e.clientX;
      startY = e.clientY;
      startTime = performance.now();
    },
    { passive: false }
  );

  canvas.addEventListener(
    "pointerup",
    (e) => {
      e.preventDefault();
      if (!pointerActive) return;
      pointerActive = false;

      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      const adx = Math.abs(dx);
      const ady = Math.abs(dy);
      const elapsed = performance.now() - startTime;

      // Tap = rotate (simple)
      if (adx < 12 && ady < 12 && elapsed < 300) {
        if (!paused && !gameOver) rotateCurrent();
        return;
      }

      // Swipe thresholds
      const SWIPE = 24;
      if (adx > ady) {
        if (dx > SWIPE) move(1, 0);
        else if (dx < -SWIPE) move(-1, 0);
      } else {
        if (dy > SWIPE) move(0, 1);
      }
    },
    { passive: false }
  );

  // Start
  reset();
  updateHud();
  requestAnimationFrame(frame);
})();
