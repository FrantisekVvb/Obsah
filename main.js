const SVG_NS = "http://www.w3.org/2000/svg";

const DM = 99;
const CANVAS = { x: 5.5, y: 135.5, w: DM * 5, h: DM * 2 };
const CANVAS_SCALE = 1.56;
const CANVAS_MIN_DM = 2;
const TOOLBAR_RESERVE = 48;
const MIN_INNER_WIDTH = 541;
const CANVAS_RIGHT_MARGIN = 40;
const CANVAS_BOTTOM_MARGIN = 35;
const MIN_INNER_HEIGHT = 135.5 + CANVAS_BOTTOM_MARGIN;
const VIEWPORT_SAFETY = 0.92;
const MIN_FIT_SCALE = 0.75;
const SNAP_THRESHOLD = 8;

const TILE_TYPES = {
  dm2: {
    w: DM,
    h: DM,
    fill: "#9FFFAD",
    stroke: "#0F880D",
    strokeWidth: 1,
    stackX: 83.5,
    stackY: 0.5,
  },
  cm2: {
    w: DM / 10,
    h: DM / 10,
    fill: "#9FA5FF",
    stroke: "#110D88",
    strokeWidth: 1,
    stackX: 257.5,
    stackY: 90.5,
  },
  mm2: {
    w: DM / 100,
    h: DM / 100,
    fill: "#FF9F9F",
    stroke: "#880D0D",
    strokeWidth: 0.5,
    stackX: 329.25,
    stackY: 99.25,
    hitSize: 24,
  },
};

const diagram = document.getElementById("diagram");
const diagramBg = document.getElementById("diagram-bg");
const diagramWrap = document.getElementById("diagram-wrap");
const stage = document.getElementById("stage");
const newCanvasBtn = document.getElementById("new-canvas-btn");
const areaValueInput = document.getElementById("area-value");
const areaUnitSelect = document.getElementById("area-unit");
const verifyBtn = document.getElementById("verify-btn");
const content = document.getElementById("content");
const placedTilesLayer = document.getElementById("placed-tiles");
const tileStack = document.getElementById("tile-stack");
const canvasElement = document.getElementById("canvas");
const canvasTicks = document.getElementById("canvas-ticks");
const canvasLabels = document.getElementById("canvas-labels");

let dragState = null;
let tileCounter = 0;

function getLocalPoint(clientX, clientY) {
  const point = diagram.createSVGPoint();
  point.x = clientX;
  point.y = clientY;
  return point.matrixTransform(content.getScreenCTM().inverse());
}

function parseTranslate(element) {
  const transform = element.getAttribute("transform") || "";
  const match = transform.match(/translate\(([-\d.]+)[,\s]+([-\d.]+)\)/);
  if (!match) {
    return { x: 0, y: 0 };
  }
  return { x: Number(match[1]), y: Number(match[2]) };
}

function setTranslate(element, x, y) {
  element.setAttribute("transform", `translate(${x}, ${y})`);
}

function isTileOnCanvas(x, y, w, h) {
  const cx = x + w / 2;
  const cy = y + h / 2;
  return (
    cx >= CANVAS.x &&
    cx <= CANVAS.x + CANVAS.w &&
    cy >= CANVAS.y &&
    cy <= CANVAS.y + CANVAS.h
  );
}

function getTileBounds(element) {
  const position = parseTranslate(element);
  const def = TILE_TYPES[element.dataset.type];
  return { x: position.x, y: position.y, w: def.w, h: def.h };
}

function collectSnapLines(excludeElement) {
  const xLines = [];
  const yLines = [];

  for (let i = 0; i <= CANVAS.w / DM; i += 1) {
    xLines.push(CANVAS.x + i * DM);
  }

  for (let i = 0; i <= CANVAS.h / DM; i += 1) {
    yLines.push(CANVAS.y + i * DM);
  }

  placedTilesLayer.querySelectorAll(".placed-tile").forEach((tile) => {
    if (tile === excludeElement) {
      return;
    }

    const bounds = getTileBounds(tile);
    xLines.push(bounds.x, bounds.x + bounds.w);
    yLines.push(bounds.y, bounds.y + bounds.h);
  });

  return { xLines, yLines };
}

function snapAxis(position, size, lines) {
  const candidates = [
    { edge: position, toPosition: (line) => line },
    { edge: position + size, toPosition: (line) => line - size },
  ];

  let bestDistance = SNAP_THRESHOLD + 1;
  let bestPosition = position;

  for (const candidate of candidates) {
    for (const line of lines) {
      const distance = Math.abs(candidate.edge - line);
      if (distance <= SNAP_THRESHOLD && distance < bestDistance) {
        bestDistance = distance;
        bestPosition = candidate.toPosition(line);
      }
    }
  }

  return bestPosition;
}

function snapPosition(x, y, w, h, excludeElement) {
  const { xLines, yLines } = collectSnapLines(excludeElement);
  return {
    x: snapAxis(x, w, xLines),
    y: snapAxis(y, h, yLines),
  };
}

function placeTile(element, x, y) {
  const def = TILE_TYPES[element.dataset.type];
  const snapped = snapPosition(x, y, def.w, def.h, element);
  setTranslate(element, snapped.x, snapped.y);
  return snapped;
}

function createPlacedTile(type, x, y) {
  const def = TILE_TYPES[type];
  const group = document.createElementNS(SVG_NS, "g");
  group.classList.add("placed-tile");
  group.dataset.type = type;
  group.dataset.id = String(++tileCounter);
  setTranslate(group, x, y);

  const rect = document.createElementNS(SVG_NS, "rect");
  rect.setAttribute("width", String(def.w));
  rect.setAttribute("height", String(def.h));
  rect.setAttribute("fill", def.fill);
  rect.setAttribute("stroke", def.stroke);
  rect.setAttribute("stroke-width", String(def.strokeWidth));
  group.appendChild(rect);

  if (def.hitSize) {
    const hit = document.createElementNS(SVG_NS, "rect");
    hit.classList.add("tile-hit");
    const inset = (def.hitSize - def.w) / 2;
    hit.setAttribute("x", String(-inset));
    hit.setAttribute("y", String(-inset));
    hit.setAttribute("width", String(def.hitSize));
    hit.setAttribute("height", String(def.hitSize));
    group.appendChild(hit);
  }

  placedTilesLayer.appendChild(group);
  return group;
}

function bringToFront(element) {
  placedTilesLayer.appendChild(element);
}

function startDragFromStack(type, localX, localY) {
  const def = TILE_TYPES[type];
  const tile = createPlacedTile(type, def.stackX, def.stackY);
  bringToFront(tile);
  tile.classList.add("is-dragging");

  dragState = {
    element: tile,
    offsetX: localX - def.stackX,
    offsetY: localY - def.stackY,
    pointerId: null,
  };
}

function startDragPlacedTile(element, localX, localY) {
  const position = parseTranslate(element);
  bringToFront(element);
  element.classList.add("is-dragging");

  dragState = {
    element,
    offsetX: localX - position.x,
    offsetY: localY - position.y,
    pointerId: null,
  };
}

function updateDrag(localX, localY) {
  if (!dragState) {
    return;
  }

  const x = localX - dragState.offsetX;
  const y = localY - dragState.offsetY;
  placeTile(dragState.element, x, y);
}

function endDrag() {
  if (!dragState) {
    return;
  }

  const { element } = dragState;
  const def = TILE_TYPES[element.dataset.type];
  const position = parseTranslate(element);
  const snapped = snapPosition(position.x, position.y, def.w, def.h, element);

  if (!isTileOnCanvas(snapped.x, snapped.y, def.w, def.h)) {
    element.remove();
  } else {
    setTranslate(element, snapped.x, snapped.y);
  }

  element.classList.remove("is-dragging");
  dragState = null;
}

tileStack.addEventListener("pointerdown", (event) => {
  const stackTile = event.target.closest(".stack-tile");
  if (!stackTile) {
    return;
  }

  event.preventDefault();
  const type = stackTile.dataset.type;
  const point = getLocalPoint(event.clientX, event.clientY);
  startDragFromStack(type, point.x, point.y);
  dragState.pointerId = event.pointerId;
  diagram.setPointerCapture(event.pointerId);
});

placedTilesLayer.addEventListener("pointerdown", (event) => {
  const placedTile = event.target.closest(".placed-tile");
  if (!placedTile) {
    return;
  }

  event.preventDefault();
  event.stopPropagation();
  const point = getLocalPoint(event.clientX, event.clientY);
  startDragPlacedTile(placedTile, point.x, point.y);
  dragState.pointerId = event.pointerId;
  diagram.setPointerCapture(event.pointerId);
});

diagram.addEventListener("pointermove", (event) => {
  if (!dragState || dragState.pointerId !== event.pointerId) {
    return;
  }

  event.preventDefault();
  const point = getLocalPoint(event.clientX, event.clientY);
  updateDrag(point.x, point.y);
});

function finishPointer(event) {
  if (!dragState || dragState.pointerId !== event.pointerId) {
    return;
  }

  if (diagram.hasPointerCapture(event.pointerId)) {
    diagram.releasePointerCapture(event.pointerId);
  }
  endDrag();
}

diagram.addEventListener("pointerup", finishPointer);
diagram.addEventListener("pointercancel", finishPointer);

function createLine(x1, y1, x2, y2) {
  const line = document.createElementNS(SVG_NS, "line");
  line.setAttribute("x1", String(x1));
  line.setAttribute("y1", String(y1));
  line.setAttribute("x2", String(x2));
  line.setAttribute("y2", String(y2));
  line.setAttribute("stroke", "black");
  return line;
}

function createLabel(text, x, y, anchor = "middle") {
  const label = document.createElementNS(SVG_NS, "text");
  label.textContent = text;
  label.setAttribute("x", String(x));
  label.setAttribute("y", String(y));
  label.setAttribute("text-anchor", anchor);
  label.setAttribute("fill", "black");
  label.setAttribute("font-size", "10");
  label.setAttribute("font-family", "system-ui, sans-serif");
  return label;
}

function getInnerWidth(widthDm) {
  return Math.max(MIN_INNER_WIDTH, CANVAS.x + widthDm * DM + CANVAS_RIGHT_MARGIN);
}

function getInnerHeight(heightDm) {
  return Math.max(MIN_INNER_HEIGHT, CANVAS.y + heightDm * DM + CANVAS_BOTTOM_MARGIN);
}

function getNaturalSize(widthDm, heightDm) {
  return {
    innerWidth: getInnerWidth(widthDm),
    innerHeight: getInnerHeight(heightDm),
    outerWidth: getInnerWidth(widthDm) * CANVAS_SCALE,
    outerHeight: getInnerHeight(heightDm) * CANVAS_SCALE,
  };
}

function getAvailableDiagramSize() {
  const toolbar = document.querySelector(".ui-overlay");
  const stageRect = stage.getBoundingClientRect();
  const toolbarHeight = toolbar ? toolbar.getBoundingClientRect().height : TOOLBAR_RESERVE;
  const stageGap = 12;

  return {
    width: Math.max(200, stageRect.width),
    height: Math.max(200, stageRect.height - toolbarHeight - stageGap),
  };
}

function getFitScale(widthDm, heightDm) {
  const available = getAvailableDiagramSize();
  const { outerWidth, outerHeight } = getNaturalSize(widthDm, heightDm);

  return Math.min(
    (available.width * VIEWPORT_SAFETY) / outerWidth,
    (available.height * VIEWPORT_SAFETY) / outerHeight,
  );
}

function getMaxCanvasDm() {
  let maxWidthDm = CANVAS_MIN_DM;
  let maxHeightDm = CANVAS_MIN_DM;

  for (let decimeters = CANVAS_MIN_DM; decimeters <= 20; decimeters += 1) {
    if (getFitScale(decimeters, CANVAS_MIN_DM) >= MIN_FIT_SCALE) {
      maxWidthDm = decimeters;
    } else {
      break;
    }
  }

  for (let decimeters = CANVAS_MIN_DM; decimeters <= 20; decimeters += 1) {
    if (getFitScale(maxWidthDm, decimeters) >= MIN_FIT_SCALE) {
      maxHeightDm = decimeters;
    } else {
      break;
    }
  }

  return { widthDm: maxWidthDm, heightDm: maxHeightDm };
}

function clampCanvasSize(widthDm, heightDm) {
  const max = getMaxCanvasDm();
  return {
    widthDm: Math.max(CANVAS_MIN_DM, Math.min(widthDm, max.widthDm)),
    heightDm: Math.max(CANVAS_MIN_DM, Math.min(heightDm, max.heightDm)),
  };
}

function getCanvasSizeInDm() {
  return {
    widthDm: CANVAS.w / DM,
    heightDm: CANVAS.h / DM,
  };
}

function randomInt(min, max) {
  return min + Math.floor(Math.random() * (max - min + 1));
}

function clearPlacedTiles() {
  placedTilesLayer.replaceChildren();
}

function updateViewBox() {
  const { widthDm, heightDm } = getCanvasSizeInDm();
  const { outerWidth, outerHeight } = getNaturalSize(widthDm, heightDm);
  const fitScale = getFitScale(widthDm, heightDm);
  const displayWidth = outerWidth * fitScale;
  const displayHeight = outerHeight * fitScale;

  diagram.setAttribute("viewBox", `0 0 ${outerWidth} ${outerHeight}`);
  diagram.setAttribute("preserveAspectRatio", "xMidYMid meet");
  diagram.style.width = `${displayWidth}px`;
  diagram.style.height = `${displayHeight}px`;
  diagramBg.setAttribute("width", String(outerWidth));
  diagramBg.setAttribute("height", String(outerHeight));
  diagramWrap.style.width = `${displayWidth}px`;
  diagramWrap.style.height = `${displayHeight}px`;
}

function renderCanvas() {
  canvasTicks.replaceChildren();
  canvasLabels.replaceChildren();

  canvasElement.setAttribute("x", String(CANVAS.x));
  canvasElement.setAttribute("y", String(CANVAS.y));
  canvasElement.setAttribute("width", String(CANVAS.w));
  canvasElement.setAttribute("height", String(CANVAS.h));

  const tickTop = CANVAS.y - 5.5;
  const tickBottom = CANVAS.y + 4.5;
  const tickLeft = CANVAS.x - 5.5;
  const tickRight = CANVAS.x + 4.5;

  for (let i = 1; i < CANVAS.w / DM; i += 1) {
    const x = CANVAS.x + i * DM;
    canvasTicks.appendChild(createLine(x, tickTop, x, tickBottom));
  }

  for (let i = 1; i < CANVAS.h / DM; i += 1) {
    const y = CANVAS.y + i * DM;
    canvasTicks.appendChild(createLine(tickLeft, y, tickRight, y));
  }

  const { widthDm, heightDm } = getCanvasSizeInDm();
  canvasLabels.appendChild(createLabel(`${widthDm} dm`, CANVAS.x + CANVAS.w / 2, CANVAS.y + CANVAS.h + 13));
  canvasLabels.appendChild(createLabel(`${heightDm} dm`, CANVAS.x + CANVAS.w + 13, CANVAS.y + CANVAS.h / 2, "start"));

  updateViewBox();
}

function setCanvasSize(widthDm, heightDm) {
  const clamped = clampCanvasSize(widthDm, heightDm);
  CANVAS.w = clamped.widthDm * DM;
  CANVAS.h = clamped.heightDm * DM;
  clearPlacedTiles();
  resetAreaQuiz();
  renderCanvas();
}

function getCanvasAreaDm2() {
  const { widthDm, heightDm } = getCanvasSizeInDm();
  return widthDm * heightDm;
}

function convertAreaFromDm2(areaDm2, unit) {
  if (unit === "cm2") {
    return areaDm2 * 100;
  }
  if (unit === "mm2") {
    return areaDm2 * 10000;
  }
  return areaDm2;
}

function resetAreaQuizFeedback() {
  areaValueInput.classList.remove("is-correct", "is-wrong");
  areaUnitSelect.classList.remove("is-correct", "is-wrong");
  verifyBtn.classList.remove("is-correct", "is-wrong");
}

function resetAreaQuiz() {
  areaValueInput.value = "";
  resetAreaQuizFeedback();
}

function verifyAreaAnswer() {
  const value = Number(areaValueInput.value);
  const unit = areaUnitSelect.value;

  resetAreaQuizFeedback();

  if (!Number.isFinite(value)) {
    areaValueInput.classList.add("is-wrong");
    verifyBtn.classList.add("is-wrong");
    return;
  }

  const expected = convertAreaFromDm2(getCanvasAreaDm2(), unit);
  const isCorrect = Math.abs(value - expected) < 0.001;

  areaValueInput.classList.add(isCorrect ? "is-correct" : "is-wrong");
  areaUnitSelect.classList.add(isCorrect ? "is-correct" : "is-wrong");
  verifyBtn.classList.add(isCorrect ? "is-correct" : "is-wrong");
}

function generateRandomCanvas() {
  const max = getMaxCanvasDm();
  setCanvasSize(
    randomInt(CANVAS_MIN_DM, max.widthDm),
    randomInt(CANVAS_MIN_DM, max.heightDm),
  );
}

function handleViewportChange() {
  const current = getCanvasSizeInDm();
  const clamped = clampCanvasSize(current.widthDm, current.heightDm);

  if (clamped.widthDm !== current.widthDm || clamped.heightDm !== current.heightDm) {
    setCanvasSize(clamped.widthDm, clamped.heightDm);
  } else {
    updateViewBox();
  }
}

function initCanvas() {
  generateRandomCanvas();
  requestAnimationFrame(updateViewBox);
}

initCanvas();
newCanvasBtn.addEventListener("click", generateRandomCanvas);
verifyBtn.addEventListener("click", verifyAreaAnswer);
areaValueInput.addEventListener("input", resetAreaQuizFeedback);
areaUnitSelect.addEventListener("change", resetAreaQuizFeedback);
areaValueInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    verifyAreaAnswer();
  }
});
window.addEventListener("resize", handleViewportChange);
