const size = 4;
const startTiles = 2;
const storageKey = "seed-merge-best";

const levels = [
  { name: "種", image: "image/seed.png" },
  { name: "植木鉢", image: "image/pot.png" },
  { name: "芽", image: "image/sprout.png" },
  { name: "若草", image: "image/leaf.png" },
  { name: "つぼみ", image: "image/bud.png" },
  { name: "花", image: "image/flower.png" }
];

const finalLevel = levels.length;
const boardEl = document.querySelector("#board");
const hydrangeaBackdropEl = document.querySelector("#hydrangeaBackdrop");
const directionPadEl = document.querySelector(".direction-pad");
const movesEl = document.querySelector("#moves");
const scoreEl = document.querySelector("#score");
const bestLabelEl = document.querySelector("#bestLabel");
const bestEl = document.querySelector("#best");
const restartButton = document.querySelector("#restart");
const practiceModeEl = document.querySelector("#practiceMode");
const customSeedModeEl = document.querySelector("#customSeedMode");
const seedPlacementHintEl = document.querySelector("#seedPlacementHint");
const pendingSeedCountEl = document.querySelector("#pendingSeedCount");
const overlayEl = document.querySelector("#overlay");
const overlayRestart = document.querySelector("#overlayRestart");
const levelList = document.querySelector("#levelList");

let board = [];
let moves = 0;
let score = 0;
let bloomCount = 0;
let renderedBloomCount = -1;
let best = Number(localStorage.getItem(storageKey) || 0);
let bestEligible = true;
let mergedCells = new Set();
let pendingSeeds = 0;
let touchStart = null;
let isAnimating = false;

const directions = ["up", "left", "right", "down"];
const hintSearchDepth = 5;
const firstBloomSearchDepth = 8;
const slideDuration = 190;
const directionArrows = {
  up: "↑",
  left: "←",
  right: "→",
  down: "↓"
};

function emptyBoard() {
  return Array.from({ length: size }, () => Array(size).fill(0));
}

function setupLevelList() {
  levelList.innerHTML = levels
    .slice(0, 6)
    .map((level, index) => {
      const item = `<li class="level-${index + 1}"><img class="mini" src="${level.image}" alt="${level.name}"></li>`;
      const arrow = index !== 2 && index !== 5 ? '<li class="growth-arrow" aria-hidden="true">→</li>' : "";
      const rowBreak = index === 2 ? '<li class="growth-row-break" aria-hidden="true"></li>' : "";
      return `${item}${arrow}${rowBreak}`;
    })
    .join("");
}

function startGame() {
  if (isAnimating) {
    return;
  }

  board = emptyBoard();
  moves = 0;
  score = 0;
  bloomCount = 0;
  bestEligible = !practiceModeEl.checked && !customSeedModeEl.checked;
  mergedCells = new Set();
  pendingSeeds = customSeedModeEl.checked ? startTiles : 0;
  overlayEl.hidden = true;

  if (!customSeedModeEl.checked) {
    for (let i = 0; i < startTiles; i += 1) {
      addSeed();
    }
  }

  render();
}

function addSeed() {
  const empty = [];

  for (let row = 0; row < size; row += 1) {
    for (let col = 0; col < size; col += 1) {
      if (board[row][col] === 0) {
        empty.push({ row, col });
      }
    }
  }

  if (!empty.length) return;

  const spot = empty[Math.floor(Math.random() * empty.length)];
  board[spot.row][spot.col] = 1;
}

function render() {
  boardEl.innerHTML = "";

  for (let row = 0; row < size; row += 1) {
    for (let col = 0; col < size; col += 1) {
      const cell = document.createElement("div");
      cell.className = "cell";
      cell.setAttribute("role", "gridcell");
      cell.dataset.row = row;
      cell.dataset.col = col;

      const value = board[row][col];
      if (!value && isPlacingSeed()) {
        cell.classList.add("placeable");
      }
      if (value) {
        const level = levels[Math.min(value, levels.length) - 1];
        const tile = document.createElement("div");
        tile.className = `tile level-${Math.min(value, levels.length)}`;
        if (mergedCells.has(`${row},${col}`)) {
          tile.classList.add("merged");
        }
        tile.innerHTML = `<img class="tile-image" src="${level.image}" alt="${level.name}">`;
        cell.append(tile);
      }

      boardEl.append(cell);
    }
  }

  movesEl.textContent = moves;
  scoreEl.textContent = score;
  renderBestDisplay();
  renderHydrangeaBackdrop();
  renderSeedPlacementHint();
}

function move(direction) {
  if (isAnimating || isPlacingSeed()) {
    return;
  }

  const result = buildMoveWithAnimation(board, direction);

  if (!result.changed) {
    return;
  }

  isAnimating = true;
  animateMove(result, () => {
    commitMove(result);
  });
}

function commitMove(result) {
  board = result.board;
  mergedCells = result.mergedCells;
  moves += 1;
  score += result.score;
  bloomCount += result.blooms;
  if (customSeedModeEl.checked) {
    pendingSeeds = 1;
  } else {
    addSeed();
  }
  updateBest();
  render();
  isAnimating = false;

  if (!isPlacingSeed() && !canMove()) {
    showGameOver();
  }
}

function animateMove(result, onComplete) {
  const layer = document.createElement("div");
  layer.className = "animation-layer";
  boardEl.append(layer);
  boardEl.classList.add("animating");

  const boardRect = boardEl.getBoundingClientRect();
  const cellRects = [...boardEl.querySelectorAll(".cell")].map((cell) => {
    const rect = cell.getBoundingClientRect();
    return {
      left: rect.left - boardRect.left,
      top: rect.top - boardRect.top,
      width: rect.width,
      height: rect.height
    };
  });

  for (const movement of result.movements) {
    const fromRect = cellRects[movement.from.row * size + movement.from.col];
    const toRect = cellRects[movement.to.row * size + movement.to.col];
    const level = levels[Math.min(movement.value, levels.length) - 1];
    const tile = document.createElement("div");
    tile.className = `moving-tile level-${Math.min(movement.value, levels.length)}`;
    tile.style.left = `${fromRect.left}px`;
    tile.style.top = `${fromRect.top}px`;
    tile.style.width = `${fromRect.width}px`;
    tile.style.height = `${fromRect.height}px`;
    tile.innerHTML = `<img class="tile-image" src="${level.image}" alt="">`;
    layer.append(tile);

    requestAnimationFrame(() => {
      tile.style.transform = `translate(${toRect.left - fromRect.left}px, ${toRect.top - fromRect.top}px)`;
      if (movement.vanishes) {
        tile.style.opacity = "0";
      }
    });
  }

  window.setTimeout(() => {
    layer.remove();
    boardEl.classList.remove("animating");
    onComplete();
  }, slideDuration + 40);
}

function buildMove(source, direction) {
  return buildMoveResult(source, direction, false);
}

function buildMoveWithAnimation(source, direction) {
  return buildMoveResult(source, direction, true);
}

function buildMoveResult(source, direction, includeMovements) {
  const next = emptyBoard();
  const moveMergedCells = new Set();
  const movements = [];
  let gainedScore = 0;
  let gainedBlooms = 0;

  for (let index = 0; index < size; index += 1) {
    const values = includeMovements
      ? getLineItems(source, index, direction)
      : getLine(source, index, direction);
    const merged = includeMovements
      ? mergeLineItems(values)
      : mergeLine(values);
    placeLine(next, index, direction, merged.values, merged.mergedIndexes, moveMergedCells);
    gainedScore += merged.score;
    gainedBlooms += merged.blooms;
    if (includeMovements) {
      movements.push(...placeMovements(index, direction, merged.movements));
    }
  }

  return {
    board: next,
    changed: serialize(next) !== serialize(source),
    mergedCells: moveMergedCells,
    score: gainedScore,
    blooms: gainedBlooms,
    movements
  };
}

function getLine(source, index, direction) {
  const values = [];

  for (let offset = 0; offset < size; offset += 1) {
    if (direction === "left") values.push(source[index][offset]);
    if (direction === "right") values.push(source[index][size - 1 - offset]);
    if (direction === "up") values.push(source[offset][index]);
    if (direction === "down") values.push(source[size - 1 - offset][index]);
  }

  return values;
}

function getLineItems(source, index, direction) {
  const items = [];

  for (let offset = 0; offset < size; offset += 1) {
    const position = getPosition(index, direction, offset);
    const value = source[position.row][position.col];
    if (value) {
      items.push({ value, offset, row: position.row, col: position.col });
    }
  }

  return items;
}

function getPosition(index, direction, offset) {
  if (direction === "left") return { row: index, col: offset };
  if (direction === "right") return { row: index, col: size - 1 - offset };
  if (direction === "up") return { row: offset, col: index };
  return { row: size - 1 - offset, col: index };
}

function placeLine(target, index, direction, values, mergedIndexes, mergeTarget) {
  for (let offset = 0; offset < size; offset += 1) {
    let row = index;
    let col = offset;

    if (direction === "right") col = size - 1 - offset;
    if (direction === "up") {
      row = offset;
      col = index;
    }
    if (direction === "down") {
      row = size - 1 - offset;
      col = index;
    }

    target[row][col] = values[offset];
    if (mergedIndexes.has(offset)) {
      mergeTarget.add(`${row},${col}`);
    }
  }
}

function mergeLine(line) {
  const compact = line.filter(Boolean);
  const values = [];
  const mergedIndexes = new Set();
  let blooms = 0;
  let score = 0;

  for (let i = 0; i < compact.length; i += 1) {
    if (compact[i] === compact[i + 1]) {
      if (compact[i] >= finalLevel) {
        blooms += 1;
        score += finalLevel * 100;
      } else {
        const nextLevel = compact[i] + 1;
        values.push(nextLevel);
        mergedIndexes.add(values.length - 1);
        score += nextLevel * 10;
      }
      i += 1;
    } else {
      values.push(compact[i]);
    }
  }

  while (values.length < size) {
    values.push(0);
  }

  return { values, mergedIndexes, score, blooms };
}

function mergeLineItems(items) {
  const values = [];
  const mergedIndexes = new Set();
  const movements = [];
  let blooms = 0;
  let score = 0;

  for (let i = 0; i < items.length; i += 1) {
    const current = items[i];
    const next = items[i + 1];
    const targetOffset = values.length;

    if (next && current.value === next.value) {
      if (current.value >= finalLevel) {
        blooms += 1;
        score += finalLevel * 100;
        movements.push(
          { item: current, targetOffset, vanishes: true },
          { item: next, targetOffset, vanishes: true }
        );
      } else {
        const nextLevel = current.value + 1;
        values.push(nextLevel);
        mergedIndexes.add(values.length - 1);
        score += nextLevel * 10;
        movements.push(
          { item: current, targetOffset, vanishes: false },
          { item: next, targetOffset, vanishes: false }
        );
      }
      i += 1;
    } else {
      values.push(current.value);
      movements.push({ item: current, targetOffset, vanishes: false });
    }
  }

  while (values.length < size) {
    values.push(0);
  }

  return { values, mergedIndexes, score, blooms, movements };
}

function placeMovements(index, direction, movements) {
  return movements.map((movement) => {
    const target = getPosition(index, direction, movement.targetOffset);
    return {
      from: { row: movement.item.row, col: movement.item.col },
      to: target,
      value: movement.item.value,
      vanishes: movement.vanishes
    };
  });
}

function canMove() {
  for (let row = 0; row < size; row += 1) {
    for (let col = 0; col < size; col += 1) {
      const value = board[row][col];
      if (!value) return true;
      if (col < size - 1 && value === board[row][col + 1]) return true;
      if (row < size - 1 && value === board[row + 1][col]) return true;
    }
  }

  return false;
}

function showGameOver() {
  overlayEl.hidden = false;
  renderBestDisplay();
}

function updateBest() {
  if (!bestEligible || practiceModeEl.checked || customSeedModeEl.checked) return;
  if (score <= best) return;
  best = score;
  localStorage.setItem(storageKey, String(best));
}

function serialize(value) {
  return JSON.stringify(value);
}

function isPlacingSeed() {
  return customSeedModeEl.checked && pendingSeeds > 0;
}

function renderSeedPlacementHint() {
  if (!isPlacingSeed()) {
    seedPlacementHintEl.hidden = true;
    pendingSeedCountEl.textContent = "0";
    return;
  }

  seedPlacementHintEl.hidden = false;
  pendingSeedCountEl.textContent = pendingSeeds;
}

function renderHydrangeaBackdrop() {
  const visibleBlooms = Math.min(bloomCount, 24);
  if (visibleBlooms === renderedBloomCount) {
    return;
  }

  renderedBloomCount = visibleBlooms;
  hydrangeaBackdropEl.innerHTML = "";

  for (let index = 0; index < visibleBlooms; index += 1) {
    const bloom = document.createElement("img");
    bloom.src = levels[finalLevel - 1].image;
    bloom.alt = "";
    bloom.className = "background-hydrangea";
    bloom.style.setProperty("--x", `${getBloomX(index)}%`);
    bloom.style.setProperty("--y", `${getBloomY(index)}%`);
    bloom.style.setProperty("--size", `${getBloomSize(index)}px`);
    bloom.style.setProperty("--rotate", `${getBloomRotation(index)}deg`);
    bloom.style.setProperty("--delay", `${Math.min(index * 80, 900)}ms`);
    hydrangeaBackdropEl.append(bloom);
  }
}

function getBloomX(index) {
  const positions = [7, 87, 18, 76, 42, 94, 4, 61, 30, 82, 12, 52];
  return positions[index % positions.length];
}

function getBloomY(index) {
  const positions = [78, 12, 18, 84, 8, 54, 42, 92, 66, 34, 6, 72];
  return positions[index % positions.length];
}

function getBloomSize(index) {
  return 118 + (index % 5) * 22;
}

function getBloomRotation(index) {
  return [-14, 10, -6, 16, -20, 7][index % 6];
}

function renderBestDisplay() {
  if (practiceModeEl.checked) {
    bestLabelEl.textContent = "推奨手";
    if (isPlacingSeed() || !canMove()) {
      bestEl.textContent = "";
      return;
    }

    const bestMove = findBestMove();
    bestEl.textContent = bestMove ? directionArrows[bestMove] : "";
    return;
  }

  if (customSeedModeEl.checked) {
    bestLabelEl.textContent = "";
    bestEl.textContent = "";
    return;
  }

  bestLabelEl.textContent = "Best";
  bestEl.textContent = best;
}

function handleBoardClick(event) {
  if (isAnimating) return;

  const cell = event.target.closest(".cell");
  if (!cell || !isPlacingSeed()) return;

  const row = Number(cell.dataset.row);
  const col = Number(cell.dataset.col);
  if (board[row][col] !== 0) return;

  board[row][col] = 1;
  pendingSeeds -= 1;
  mergedCells = new Set();
  render();

  if (!isPlacingSeed() && !canMove()) {
    showGameOver();
  }
}

function findBestMove() {
  if (bloomCount === 0) {
    const firstBloomMove = findShortestFirstBloomMove();
    if (firstBloomMove) {
      return firstBloomMove;
    }
  }

  let bestMove = null;
  let bestValue = -Infinity;

  for (const direction of directions) {
    const result = buildMove(board, direction);
    if (!result.changed) continue;

    const value = evaluateMovePath(result.board, result.score, result.blooms, 1, hintSearchDepth - 1);
    if (value > bestValue) {
      bestValue = value;
      bestMove = direction;
    }
  }

  return bestMove;
}

function findShortestFirstBloomMove() {
  const queue = [{ board, firstDirection: null, depth: 0 }];
  const visited = new Map([[serialize(board), 0]]);

  while (queue.length) {
    const current = queue.shift();
    if (current.depth >= firstBloomSearchDepth) continue;

    for (const direction of directions) {
      const result = buildMove(current.board, direction);
      if (!result.changed) continue;

      const firstDirection = current.firstDirection || direction;
      if (result.blooms > 0) {
        return firstDirection;
      }

      const key = serialize(result.board);
      const nextDepth = current.depth + 1;
      if (visited.has(key) && visited.get(key) <= nextDepth) continue;

      visited.set(key, nextDepth);
      queue.push({
        board: result.board,
        firstDirection,
        depth: nextDepth
      });
    }
  }

  return null;
}

function evaluateMovePath(candidate, gainedScore, gainedBlooms, depthUsed, depthRemaining) {
  let best = evaluateBoard(candidate, gainedScore, gainedBlooms, depthUsed);

  if (depthRemaining <= 0) {
    return best;
  }

  for (const direction of directions) {
    const result = buildMove(candidate, direction);
    if (!result.changed) continue;

    const value = evaluateMovePath(
      result.board,
      gainedScore + result.score,
      gainedBlooms + result.blooms,
      depthUsed + 1,
      depthRemaining - 1
    );
    best = Math.max(best, value);
  }

  return best;
}

function evaluateBoard(candidate, gainedScore, gainedBlooms, depthUsed) {
  const emptyCount = candidate.flat().filter((value) => value === 0).length;
  const maxLevel = Math.max(...candidate.flat());
  const cornerBonus = getCornerValues(candidate).includes(maxLevel) ? 80 : 0;
  const smoothnessPenalty = getSmoothnessPenalty(candidate);

  return maxLevel * 100000
    + gainedBlooms * 220000
    - depthUsed * 12000
    + emptyCount * 120
    + cornerBonus
    - smoothnessPenalty * 8;
}

function getCornerValues(candidate) {
  return [
    candidate[0][0],
    candidate[0][size - 1],
    candidate[size - 1][0],
    candidate[size - 1][size - 1]
  ];
}

function getSmoothnessPenalty(candidate) {
  let penalty = 0;

  for (let row = 0; row < size; row += 1) {
    for (let col = 0; col < size; col += 1) {
      const value = candidate[row][col];
      if (!value) continue;
      if (col < size - 1 && candidate[row][col + 1]) {
        penalty += Math.abs(value - candidate[row][col + 1]);
      }
      if (row < size - 1 && candidate[row + 1][col]) {
        penalty += Math.abs(value - candidate[row + 1][col]);
      }
    }
  }

  return penalty;
}

function handleKey(event) {
  const keyMap = {
    ArrowLeft: "left",
    ArrowRight: "right",
    ArrowUp: "up",
    ArrowDown: "down",
    a: "left",
    d: "right",
    w: "up",
    s: "down"
  };
  const direction = keyMap[event.key];

  if (!direction) return;
  event.preventDefault();
  move(direction);
}

function handleDirectionButtonClick(event) {
  const button = event.target.closest("[data-direction]");
  if (!button) return;

  move(button.dataset.direction);
}

function handlePracticeModeChange() {
  if (practiceModeEl.checked) {
    bestEligible = false;
  }

  render();
}

function handleTouchStart(event) {
  const touch = event.changedTouches[0];
  touchStart = { x: touch.clientX, y: touch.clientY };
}

function handleTouchEnd(event) {
  if (!touchStart) return;

  const touch = event.changedTouches[0];
  const dx = touch.clientX - touchStart.x;
  const dy = touch.clientY - touchStart.y;
  const distance = Math.max(Math.abs(dx), Math.abs(dy));
  touchStart = null;

  if (distance < 28) return;

  if (Math.abs(dx) > Math.abs(dy)) {
    move(dx > 0 ? "right" : "left");
  } else {
    move(dy > 0 ? "down" : "up");
  }
}

restartButton.addEventListener("click", startGame);
overlayRestart.addEventListener("click", startGame);
practiceModeEl.addEventListener("change", handlePracticeModeChange);
customSeedModeEl.addEventListener("change", startGame);
window.addEventListener("keydown", handleKey);
directionPadEl.addEventListener("click", handleDirectionButtonClick);
boardEl.addEventListener("click", handleBoardClick);
boardEl.addEventListener("touchstart", handleTouchStart, { passive: true });
boardEl.addEventListener("touchend", handleTouchEnd, { passive: true });

setupLevelList();
startGame();
