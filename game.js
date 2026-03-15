const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

const menuScreen = document.getElementById("menuScreen");
const instructionsScreen = document.getElementById("instructionsScreen");
const gameOverScreen = document.getElementById("gameOverScreen");
const pauseScreen = document.getElementById("pauseScreen");
const highScoreLabel = document.getElementById("highScoreLabel");
const scoreLabel = document.getElementById("scoreLabel");
const livesLabel = document.getElementById("livesLabel");
const finalScoreLabel = document.getElementById("finalScoreLabel");
const finalHighScoreLabel = document.getElementById("finalHighScoreLabel");
const pauseBtn = document.getElementById("pauseBtn");
const leftBtn = document.getElementById("leftBtn");
const rightBtn = document.getElementById("rightBtn");

const playBtn = document.getElementById("playBtn");
const instructionsBtn = document.getElementById("instructionsBtn");
const exitBtn = document.getElementById("exitBtn");
const instructionsPlayBtn = document.getElementById("instructionsPlayBtn");
const backToMenuBtn = document.getElementById("backToMenuBtn");
const retryBtn = document.getElementById("retryBtn");
const menuBtn = document.getElementById("menuBtn");
const resumeBtn = document.getElementById("resumeBtn");
const pauseMenuBtn = document.getElementById("pauseMenuBtn");

const ASSETS = {
  kangarooFront: "assets/kangaroo front side.png",
  kangarooLeft: "assets/kangaroo left side.png",
  kangarooRight: "assets/kangaroo right side.png",
  tree: "assets/tree.png",
  dingo: "assets/dingo.png",
  jeep: "assets/jeep.png",
  rock: "assets/rock.png",
  banana: "assets/banana.png",
  apple: "assets/apple.png",
  grapes: "assets/grapes.png",
};

const state = {
  running: false,
  paused: false,
  score: 0,
  highScore: 0,
  speed: 220,
  lane: 1,
  lanes: 3,
  obstacles: [],
  pickups: [],
  spawnTimer: 0,
  pickupTimer: 0,
  lastTime: 0,
  lastInputTime: 0,
  lastInputDir: 0,
  playerY: 0,
  lastFruitTime: 0,
  lives: 1,
  shieldActive: false,
  shieldPulse: 0,
  images: {},
  audio: null,
  audioReady: false,
  laneSeeded: [false, false, false],
};

const ASSET_WIDTH = 175;
const MIN_GAP = 1500;

function loadImages() {
  const entries = Object.entries(ASSETS);
  const promises = entries.map(([key, src]) => {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        state.images[key] = img;
        resolve();
      };
      img.onerror = () => {
        resolve();
      };
      img.src = src;
    });
  });
  return Promise.all(promises);
}

function resize() {
  const rect = canvas.getBoundingClientRect();
  const scale = window.devicePixelRatio || 1;
  canvas.width = Math.floor(rect.width * scale);
  canvas.height = Math.floor(rect.height * scale);
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  state.playerY = rect.height - Math.max(90, rect.height * 0.14);
}

function showScreen(screen) {
  menuScreen.classList.add("hidden");
  instructionsScreen.classList.add("hidden");
  gameOverScreen.classList.add("hidden");
  pauseScreen.classList.add("hidden");
  if (screen) screen.classList.remove("hidden");
}

function updateHighScore() {
  const stored = Number(localStorage.getItem("tk-high-score") || 0);
  if (state.score > stored) {
    localStorage.setItem("tk-high-score", String(state.score));
  }
  state.highScore = Number(localStorage.getItem("tk-high-score") || 0);
  highScoreLabel.textContent = `High Score: ${state.highScore}`;
}

function updateScore(extra) {
  state.score = Math.max(0, Math.floor(state.score + extra));
  scoreLabel.textContent = `Score: ${state.score}`;
}

function updateLivesDisplay() {
  const hearts = Array.from({ length: state.lives }, () => `<span class="heart">❤</span>`).join("");
  livesLabel.innerHTML = hearts || "<span class=\"heart\">❤</span>";
}

function resetGame() {
  state.running = true;
  state.paused = false;
  state.score = 0;
  state.speed = 220;
  state.lane = 1;
  state.lives = 1;
  state.shieldActive = false;
  state.shieldPulse = 0;
  state.obstacles = [];
  state.pickups = [];
  state.spawnTimer = 0;
  state.pickupTimer = 0;
  state.lastTime = 0;
  state.lastFruitTime = 0;
  state.laneSeeded = [false, false, false];
  updateScore(0);
  updateHighScore();
  updateLivesDisplay();
  initAudio();
}

function laneCenter(index) {
  const width = canvas.getBoundingClientRect().width;
  const laneWidth = width / state.lanes;
  return laneWidth * index + laneWidth / 2;
}

function spawnObstacle() {
  const types = ["tree", "dingo", "jeep", "rock"];
  const type = types[Math.floor(Math.random() * types.length)];
  let lane = Math.floor(Math.random() * state.lanes);
  if (!laneHasGap(lane, -80, MIN_GAP, state.obstacles) || !laneHasGap(lane, -80, MIN_GAP, state.pickups)) {
    lane = (lane + 1 + Math.floor(Math.random() * (state.lanes - 1))) % state.lanes;
    if (!laneHasGap(lane, -80, MIN_GAP, state.obstacles) || !laneHasGap(lane, -80, MIN_GAP, state.pickups)) {
      return;
    }
  }

  if (!canPlaceObstacleInLane(lane)) {
    lane = pickAnySafeLaneForObstacle();
    if (lane === null) return;
  }

  const initialOffset = state.laneSeeded[lane] ? 0 : lane * 1000;
  state.laneSeeded[lane] = true;
  state.obstacles.push({
    type,
    lane,
    y: -80 - initialOffset,
  });
}

function spawnPickup(force = false) {
  const types = ["banana", "apple", "grapes", "shield"];
  const type = types[Math.floor(Math.random() * types.length)];
  let lane = pickSafeLaneForPickup();
  if (lane === null) {
    if (!force) return;
    lane = Math.floor(Math.random() * state.lanes);
  }
  if (!laneHasGap(lane, -60, MIN_GAP, state.pickups) || !laneHasGap(lane, -60, MIN_GAP, state.obstacles)) {
    return;
  }
  const initialOffset = state.laneSeeded[lane] ? 0 : lane * 1000;
  state.laneSeeded[lane] = true;
  state.pickups.push({ type, lane, y: -60 - initialOffset });
  state.lastFruitTime = performance.now();
}

function drawBackground() {
  const { width, height } = canvas.getBoundingClientRect();
  const sky = ctx.createLinearGradient(0, 0, 0, height);
  sky.addColorStop(0, "#bfe9ff");
  sky.addColorStop(0.5, "#96d0a1");
  sky.addColorStop(1, "#5e7a4a");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, width, height);

  const sunX = width * 0.8;
  const sunY = height * 0.18;
  const sunGrad = ctx.createRadialGradient(sunX, sunY, 10, sunX, sunY, 140);
  sunGrad.addColorStop(0, "rgba(255, 237, 193, 0.9)");
  sunGrad.addColorStop(1, "rgba(255, 200, 120, 0)");
  ctx.fillStyle = sunGrad;
  ctx.beginPath();
  ctx.arc(sunX, sunY, 140, 0, Math.PI * 2);
  ctx.fill();

  const dune = (y, amp, color) => {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(0, y);
    for (let x = 0; x <= width; x += 60) {
      const wave = Math.sin((x / width) * Math.PI * 2) * amp;
      ctx.lineTo(x, y + wave);
    }
    ctx.lineTo(width, height);
    ctx.lineTo(0, height);
    ctx.closePath();
    ctx.fill();
  };
  dune(height * 0.6, 18, "#7aa567");
  dune(height * 0.7, 24, "#5f8a55");
  dune(height * 0.8, 30, "#4f6f45");

  ctx.strokeStyle = "rgba(255,255,255,0.35)";
  ctx.lineWidth = 2;
  for (let i = 1; i < state.lanes; i += 1) {
    const x = (width / state.lanes) * i;
    ctx.setLineDash([8, 12]);
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
    ctx.stroke();
  }
  ctx.setLineDash([]);
}

function drawImageCentered(img, x, y, desiredWidth) {
  if (!img) return;
  const scale = desiredWidth / img.width;
  const w = img.width * scale;
  const h = img.height * scale;
  ctx.drawImage(img, x - w / 2, y - h / 2, w, h);
}

function currentKangarooKey() {
  const now = performance.now();
  if (now - state.lastInputTime < 180) {
    if (state.lastInputDir < 0) return "kangarooLeft";
    if (state.lastInputDir > 0) return "kangarooRight";
  }
  return "kangarooFront";
}

function drawPlayer() {
  const key = currentKangarooKey();
  const img = state.images[key];
  const x = laneCenter(state.lane);
  const desiredWidth = ASSET_WIDTH * baseScale();
  drawImageCentered(img, x, state.playerY, desiredWidth);

  if (state.shieldActive && img) {
    const pulse = 0.5 + Math.sin(state.shieldPulse) * 0.2;
    const imgScale = desiredWidth / img.width;
    const imgHeight = img.height * imgScale;
    const radius = Math.max(desiredWidth, imgHeight) / 2 + 5 + pulse * 6;
    ctx.save();
    ctx.fillStyle = "rgba(86, 190, 255, 0.5)";
    ctx.beginPath();
    ctx.arc(x, state.playerY, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

function drawEntities() {
  state.obstacles.forEach((obs) => {
    const img = state.images[obs.type];
    const x = laneCenter(obs.lane);
    drawImageCentered(img, x, obs.y, ASSET_WIDTH * baseScale());
  });
  state.pickups.forEach((item) => {
    const x = laneCenter(item.lane);
    if (item.type === "shield") {
      drawShieldPickup(x, item.y, (ASSET_WIDTH / 2) * baseScale());
    } else {
      const img = state.images[item.type];
      drawImageCentered(img, x, item.y, ASSET_WIDTH * baseScale());
    }
  });
}

function drawShieldPickup(x, y, size) {
  ctx.save();
  const glow = ctx.createRadialGradient(x, y, size * 0.2, x, y, size * 1.2);
  glow.addColorStop(0, "rgba(140, 220, 255, 0.9)");
  glow.addColorStop(1, "rgba(140, 220, 255, 0)");
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(x, y, size * 1.15, 0, Math.PI * 2);
  ctx.fill();

  const grad = ctx.createLinearGradient(x, y - size, x, y + size);
  grad.addColorStop(0, "#e9f9ff");
  grad.addColorStop(0.5, "#6bd2ff");
  grad.addColorStop(1, "#2a7bd9");
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.moveTo(x, y - size * 0.95);
  ctx.bezierCurveTo(x + size * 0.7, y - size * 0.95, x + size * 0.95, y - size * 0.25, x + size * 0.65, y + size * 0.35);
  ctx.lineTo(x, y + size * 0.95);
  ctx.lineTo(x - size * 0.65, y + size * 0.35);
  ctx.bezierCurveTo(x - size * 0.95, y - size * 0.25, x - size * 0.7, y - size * 0.95, x, y - size * 0.95);
  ctx.closePath();
  ctx.fill();

  ctx.strokeStyle = "rgba(255,255,255,0.9)";
  ctx.lineWidth = Math.max(2, size * 0.08);
  ctx.stroke();

  ctx.globalAlpha = 0.8;
  ctx.strokeStyle = "rgba(255,255,255,0.6)";
  ctx.lineWidth = Math.max(1, size * 0.04);
  ctx.beginPath();
  ctx.moveTo(x, y - size * 0.6);
  ctx.lineTo(x, y + size * 0.55);
  ctx.stroke();

  ctx.restore();
}

function updateEntities(delta) {
  const speed = state.speed * delta;
  state.obstacles.forEach((obs) => {
    obs.y += speed;
  });
  state.pickups.forEach((item) => {
    item.y += speed * 0.9;
  });
  const { height } = canvas.getBoundingClientRect();
  state.obstacles = state.obstacles.filter((obs) => obs.y < height + 120);
  state.pickups = state.pickups.filter((item) => item.y < height + 120);
}

function checkCollisions() {
  const playerX = laneCenter(state.lane);
  const playerY = state.playerY;
  for (let i = state.pickups.length - 1; i >= 0; i -= 1) {
    const item = state.pickups[i];
    if (item.lane !== state.lane) continue;
    if (Math.abs(item.y - playerY) < 60) {
      if (item.type === "shield") {
        state.lives += 1;
        state.shieldActive = true;
        state.shieldPulse = 0;
        playSound("energy");
        updateLivesDisplay();
      } else {
        updateScore(1);
        playSound("eat");
      }
      state.pickups.splice(i, 1);
    }
  }
  for (let i = state.obstacles.length - 1; i >= 0; i -= 1) {
    const obs = state.obstacles[i];
    if (obs.lane !== state.lane) continue;
    if (Math.abs(obs.y - playerY) < 70) {
      state.obstacles.splice(i, 1);
      if (state.lives > 1) {
        state.lives -= 1;
        state.shieldActive = state.lives > 1;
        playSound("hit");
        updateLivesDisplay();
      } else {
        playSound("lose");
        endGame();
      }
    }
  }
}

function updateDifficulty(delta) {
  state.speed = Math.min(520, state.speed + delta * 6);
  if (state.shieldActive) state.shieldPulse += delta * 6;
}

function updateTimers(delta) {
  state.spawnTimer -= delta;
  state.pickupTimer -= delta;
  const spawnRate = Math.max(0.5, 1.2 - state.speed / 400);
  if (state.spawnTimer <= 0) {
    spawnObstacle();
    state.spawnTimer = spawnRate;
  }
  if (state.pickupTimer <= 0) {
    spawnPickup();
    state.pickupTimer = 1.4 + Math.random();
  }
  const now = performance.now();
  if (now - state.lastFruitTime > 3000) {
    spawnPickup(true);
  }
}

function endGame() {
  state.running = false;
  updateHighScore();
  finalScoreLabel.textContent = `Score: ${state.score}`;
  finalHighScoreLabel.textContent = `High Score: ${state.highScore}`;
  showScreen(gameOverScreen);
  setTimeout(() => {
    if (!state.running) stopAudio();
  }, 450);
}

function gameLoop(timestamp) {
  if (!state.lastTime) state.lastTime = timestamp;
  const delta = (timestamp - state.lastTime) / 1000;
  state.lastTime = timestamp;

  if (state.running && !state.paused) {
    updateDifficulty(delta);
    updateTimers(delta);
    updateEntities(delta);
    checkCollisions();
  }

  drawBackground();
  drawEntities();
  drawPlayer();

  if (state.paused && state.running) {
    const { width, height } = canvas.getBoundingClientRect();
    ctx.fillStyle = "rgba(0,0,0,0.4)";
    ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = "#fff";
    ctx.font = "24px 'Palatino Linotype'";
    ctx.textAlign = "center";
    ctx.fillText("Paused", width / 2, height / 2);
  }

  requestAnimationFrame(gameLoop);
}

function moveLane(direction) {
  if (!state.running || state.paused) return;
  state.lane = Math.min(state.lanes - 1, Math.max(0, state.lane + direction));
  state.lastInputTime = performance.now();
  state.lastInputDir = direction;
}

function laneHasGap(lane, y, gap, list) {
  return !list.some((item) => item.lane === lane && Math.abs(item.y - y) < gap);
}

function blockedLanesForPlayer() {
  const blocked = new Set();
  const buffer = 180;
  state.obstacles.forEach((obs) => {
    if (Math.abs(obs.y - state.playerY) < buffer) {
      blocked.add(obs.lane);
    }
  });
  return blocked;
}

function pickSafeLaneForPickup() {
  const lanes = Array.from({ length: state.lanes }, (_, i) => i);
  const safe = lanes.filter((lane) => {
    return !state.obstacles.some((obs) => obs.lane === lane && Math.abs(obs.y - -60) < MIN_GAP);
  });
  if (safe.length === 0) return null;
  return safe[Math.floor(Math.random() * safe.length)];
}

function laneHasGoodPickup(lane) {
  return state.pickups.some((item) => item.lane === lane && Math.abs(item.y - state.playerY) < 200);
}

function canPlaceObstacleInLane(lane) {
  const blocked = blockedLanesForPlayer();
  const lanes = Array.from({ length: state.lanes }, (_, i) => i);
  const safeLanes = lanes.filter((l) => !blocked.has(l) || laneHasGoodPickup(l));
  if (safeLanes.length <= 1 && safeLanes.includes(lane)) {
    return false;
  }
  return true;
}

function pickAnySafeLaneForObstacle() {
  const lanes = Array.from({ length: state.lanes }, (_, i) => i);
  const candidates = lanes.filter((lane) => canPlaceObstacleInLane(lane));
  if (candidates.length === 0) return null;
  return candidates[Math.floor(Math.random() * candidates.length)];
}

function baseScale() {
  const rect = canvas.getBoundingClientRect();
  return Math.min(rect.width / 1100, rect.height / 720);
}

function initAudio() {
  if (state.audioReady) return;
  const background = new Audio("assets/audio/background.mp3");
  background.loop = true;
  background.volume = 0.35;

  const eat = new Audio("assets/audio/eating.mp3");
  eat.volume = 0.6;

  const energy = new Audio("assets/audio/energy.mp3");
  energy.volume = 0.65;

  const lose = new Audio("assets/audio/losing.mp3");
  lose.volume = 0.7;

  const hit = new Audio("assets/audio/losing.mp3");
  hit.volume = 0.35;

  state.audio = {
    background,
    effects: {
      eat,
      energy,
      lose,
      hit,
    },
  };
  state.audioReady = true;
  background.play().catch(() => {
    // Autoplay can be blocked until a user gesture; ignore.
  });
}

function stopAudio() {
  if (!state.audioReady || !state.audio) return;
  const { background, effects } = state.audio;
  background.pause();
  background.currentTime = 0;
  Object.values(effects).forEach((effect) => {
    effect.pause();
    effect.currentTime = 0;
  });
  state.audioReady = false;
  state.audio = null;
}

function playSound(type) {
  if (!state.audioReady) return;
  const effect = state.audio.effects[type];
  if (!effect) return;
  try {
    effect.currentTime = 0;
    effect.play();
  } catch {
    // ignore play errors
  }
}

function togglePause() {
  if (!state.running) return;
  state.paused = !state.paused;
  if (state.paused) {
    showScreen(pauseScreen);
  } else {
    showScreen(null);
  }
}

window.addEventListener("resize", resize);

window.addEventListener("keydown", (event) => {
  if (event.key === "ArrowLeft") moveLane(-1);
  if (event.key === "ArrowRight") moveLane(1);
  if (event.key.toLowerCase() === "p" || event.key === "Escape") togglePause();
});

let touchStartX = null;
canvas.addEventListener("pointerdown", (event) => {
  touchStartX = event.clientX;
});
canvas.addEventListener("pointerup", (event) => {
  if (touchStartX === null) return;
  const deltaX = event.clientX - touchStartX;
  if (Math.abs(deltaX) > 30) {
    moveLane(deltaX > 0 ? 1 : -1);
  }
  touchStartX = null;
});

pauseBtn.addEventListener("click", togglePause);
leftBtn.addEventListener("pointerdown", () => moveLane(-1));
rightBtn.addEventListener("pointerdown", () => moveLane(1));

playBtn.addEventListener("click", () => {
  showScreen(null);
  resetGame();
});

instructionsBtn.addEventListener("click", () => {
  showScreen(instructionsScreen);
});

instructionsPlayBtn.addEventListener("click", () => {
  showScreen(null);
  resetGame();
});

backToMenuBtn.addEventListener("click", () => {
  showScreen(menuScreen);
});

retryBtn.addEventListener("click", () => {
  showScreen(null);
  resetGame();
});

menuBtn.addEventListener("click", () => {
  showScreen(menuScreen);
});

resumeBtn.addEventListener("click", () => {
  state.paused = false;
  showScreen(null);
});

pauseMenuBtn.addEventListener("click", () => {
  state.paused = false;
  showScreen(menuScreen);
  stopAudio();
});

exitBtn.addEventListener("click", () => {
  showScreen(menuScreen);
  alert("Thanks for playing Thunder Kangaroo!");
  stopAudio();
});

loadImages().then(() => {
  resize();
  updateHighScore();
  updateLivesDisplay();
  requestAnimationFrame(gameLoop);
});
