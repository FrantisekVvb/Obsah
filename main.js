const SVG_NS = "http://www.w3.org/2000/svg";

const DM = 99;
const CANVAS = { w: DM * 5, h: DM * 2 };
const DEFAULT_CANVAS_POSITION = { x: 5.5, y: 8 };
const CANVAS_POSITION_MARGIN = 8;
const CANVAS_SCALE = 1.56;
const CANVAS_MIN_DM = 1;
const CANVAS_MAX_DM_W = 6;
const CANVAS_MAX_DM_H = 3;
const TOOLBAR_RESERVE = 48;
const STACK_RESERVE = 172;
const MIN_INNER_WIDTH = 541;
const CANVAS_RIGHT_MARGIN = 40;
const CANVAS_BOTTOM_MARGIN = 35;
const MIN_INNER_HEIGHT = CANVAS_POSITION_MARGIN + CANVAS_BOTTOM_MARGIN;
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
  },
  cm2: {
    w: DM / 10,
    h: DM / 10,
    fill: "#9FA5FF",
    stroke: "#110D88",
    strokeWidth: 1,
  },
  mm2: {
    w: DM / 100,
    h: DM / 100,
    fill: "#FF9F9F",
    stroke: "#880D0D",
    strokeWidth: 0.5,
    hitSize: 24,
  },
};

const diagram = document.getElementById("diagram");
const diagramBg = document.getElementById("diagram-bg");
const diagramWrap = document.getElementById("diagram-wrap");
const stage = document.getElementById("stage");
const newCanvasBtn = document.getElementById("new-canvas-btn");
const freeSurfaceBtn = document.getElementById("free-surface-btn");
const areaQuiz = document.querySelector(".area-quiz");
const areaValueInput = document.getElementById("area-value");
const areaUnitSelect = document.getElementById("area-unit");
const verifyBtn = document.getElementById("verify-btn");
const content = document.getElementById("content");
const placedTilesLayer = document.getElementById("placed-tiles");
const tileStack = document.getElementById("tile-stack");
const canvasElement = document.getElementById("canvas");
const canvasGroup = document.getElementById("canvas-group");
const canvasTicks = document.getElementById("canvas-ticks");
const canvasLabels = document.getElementById("canvas-labels");
const staticLayer = document.getElementById("static-layer");

let dragState = null;
let tileCounter = 0;
let isFreeSurfaceMode = false;
let canvasPosition = { ...DEFAULT_CANVAS_POSITION };

function getCanvasBounds() {
  return {
    x: canvasPosition.x,
    y: canvasPosition.y,
    w: CANVAS.w,
    h: CANVAS.h,
  };
}

function applyCanvasPosition() {
  canvasGroup.setAttribute("transform", `translate(${canvasPosition.x}, ${canvasPosition.y})`);
}

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

function isPointerInStack(clientX, clientY) {
  const stackRect = tileStack.getBoundingClientRect();

  return (
    clientX >= stackRect.left &&
    clientX <= stackRect.right &&
    clientY >= stackRect.top &&
    clientY <= stackRect.bottom
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

  if (!isFreeSurfaceMode) {
    const bounds = getCanvasBounds();

    for (let i = 0; i <= bounds.w / DM; i += 1) {
      xLines.push(bounds.x + i * DM);
    }

    for (let i = 0; i <= bounds.h / DM; i += 1) {
      yLines.push(bounds.y + i * DM);
    }
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

function startDragFromStack(type, clientX, clientY, targetElement) {
  const def = TILE_TYPES[type];
  const point = getLocalPoint(clientX, clientY);
  const rect = targetElement.getBoundingClientRect();
  const clickOffsetX = ((clientX - rect.left) / rect.width) * def.w;
  const clickOffsetY = ((clientY - rect.top) / rect.height) * def.h;
  const tile = createPlacedTile(type, point.x - clickOffsetX, point.y - clickOffsetY);
  bringToFront(tile);
  tile.classList.add("is-dragging");

  dragState = {
    kind: "tile",
    element: tile,
    offsetX: clickOffsetX,
    offsetY: clickOffsetY,
    pointerId: null,
  };
}

function startDragPlacedTile(element, localX, localY) {
  const position = parseTranslate(element);
  bringToFront(element);
  element.classList.add("is-dragging");

  dragState = {
    kind: "tile",
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

function endDrag(clientX, clientY) {
  if (!dragState) {
    return;
  }

  const { element } = dragState;
  const def = TILE_TYPES[element.dataset.type];
  const position = parseTranslate(element);
  const snapped = snapPosition(position.x, position.y, def.w, def.h, element);

  if (isPointerInStack(clientX, clientY)) {
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
  startDragFromStack(type, event.clientX, event.clientY, stackTile);
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
  endDrag(event.clientX, event.clientY);
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

function getWorkSurfaceBounds() {
  const available = getAvailableDiagramSize();

  return {
    w: Math.max(MIN_INNER_WIDTH, available.width / CANVAS_SCALE),
    h: Math.max(MIN_INNER_HEIGHT, available.height / CANVAS_SCALE),
  };
}

function getContentExtents() {
  const surface = getWorkSurfaceBounds();
  let innerWidth = surface.w;
  let innerHeight = surface.h;

  if (!isFreeSurfaceMode) {
    const { widthDm, heightDm } = getCanvasSizeInDm();
    const rectW = widthDm * DM;
    const rectH = heightDm * DM;
    const x = getCenteredCanvasX(widthDm, surface.w);

    innerWidth = Math.max(innerWidth, x + rectW + CANVAS_RIGHT_MARGIN);
    innerHeight = Math.max(innerHeight, canvasPosition.y + rectH + CANVAS_BOTTOM_MARGIN);
  }

  return {
    innerWidth: Math.max(MIN_INNER_WIDTH, innerWidth),
    innerHeight: Math.max(MIN_INNER_HEIGHT, innerHeight),
  };
}

function getCenteredCanvasX(widthDm, surfaceWidth = getWorkSurfaceBounds().w) {
  const rectW = widthDm * DM;
  const centeredX = (surfaceWidth - rectW) / 2;
  const maxX = Math.max(CANVAS_POSITION_MARGIN, surfaceWidth - rectW - CANVAS_RIGHT_MARGIN);

  return Math.min(Math.max(CANVAS_POSITION_MARGIN, centeredX), maxX);
}

function getInnerWidth(widthDm) {
  const surface = getWorkSurfaceBounds();
  const rectW = widthDm * DM;
  const x = getCenteredCanvasX(widthDm, surface.w);

  return Math.max(surface.w, x + rectW + CANVAS_RIGHT_MARGIN);
}

function getInnerHeight(heightDm) {
  const surface = getWorkSurfaceBounds();
  const rectH = heightDm * DM;

  return Math.max(
    surface.h,
    canvasPosition.y + rectH + CANVAS_BOTTOM_MARGIN,
  );
}

function randomizeCanvasPosition(widthDm, heightDm) {
  const surface = getWorkSurfaceBounds();
  const rectH = heightDm * DM;
  const maxY = Math.max(CANVAS_POSITION_MARGIN, surface.h - rectH - CANVAS_BOTTOM_MARGIN);

  canvasPosition.x = getCenteredCanvasX(widthDm, surface.w);
  canvasPosition.y = randomInt(CANVAS_POSITION_MARGIN, maxY);
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
  const stackHeight = tileStack ? tileStack.getBoundingClientRect().height : STACK_RESERVE;
  const stageGap = 12;

  return {
    width: Math.max(200, stageRect.width),
    height: Math.max(200, stageRect.height - toolbarHeight - stackHeight - stageGap * 2),
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

  for (let decimeters = CANVAS_MIN_DM; decimeters <= CANVAS_MAX_DM_W; decimeters += 1) {
    if (getFitScale(decimeters, CANVAS_MIN_DM) >= MIN_FIT_SCALE) {
      maxWidthDm = decimeters;
    } else {
      break;
    }
  }

  for (let decimeters = CANVAS_MIN_DM; decimeters <= CANVAS_MAX_DM_H; decimeters += 1) {
    if (getFitScale(maxWidthDm, decimeters) >= MIN_FIT_SCALE) {
      maxHeightDm = decimeters;
    } else {
      break;
    }
  }

  return {
    widthDm: Math.min(maxWidthDm, CANVAS_MAX_DM_W),
    heightDm: Math.min(maxHeightDm, CANVAS_MAX_DM_H),
  };
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

function updateToolbarModeState() {
  newCanvasBtn.classList.toggle("is-active", !isFreeSurfaceMode);
  freeSurfaceBtn.classList.toggle("is-active", isFreeSurfaceMode);
}

function updateViewBox() {
  const { innerWidth, innerHeight } = getContentExtents();
  const outerWidth = innerWidth * CANVAS_SCALE;
  const outerHeight = innerHeight * CANVAS_SCALE;
  const available = getAvailableDiagramSize();

  diagram.setAttribute("viewBox", `0 0 ${outerWidth} ${outerHeight}`);
  diagram.setAttribute("preserveAspectRatio", "xMidYMid meet");
  diagram.style.width = `${available.width}px`;
  diagram.style.height = `${available.height}px`;
  diagramBg.setAttribute("width", String(outerWidth));
  diagramBg.setAttribute("height", String(outerHeight));
  diagramWrap.style.width = `${available.width}px`;
  diagramWrap.style.height = `${available.height}px`;
}

function setStaticLayerVisible(visible) {
  staticLayer.style.visibility = visible ? "visible" : "hidden";
}

function enterFreeSurfaceMode() {
  isFreeSurfaceMode = true;
  setStaticLayerVisible(false);
  areaQuiz.hidden = true;
  clearPlacedTiles();
  resetAreaQuiz();
  updateToolbarModeState();
  updateViewBox();
}

function exitFreeSurfaceMode() {
  isFreeSurfaceMode = false;
  setStaticLayerVisible(true);
  areaQuiz.hidden = false;
  updateToolbarModeState();
}

function renderCanvas() {
  canvasTicks.replaceChildren();
  canvasLabels.replaceChildren();

  canvasElement.setAttribute("width", String(CANVAS.w));
  canvasElement.setAttribute("height", String(CANVAS.h));

  const tickTop = -5.5;
  const tickBottom = 4.5;
  const tickLeft = -5.5;
  const tickRight = 4.5;

  for (let i = 1; i < CANVAS.w / DM; i += 1) {
    const x = i * DM;
    canvasTicks.appendChild(createLine(x, tickTop, x, tickBottom));
  }

  for (let i = 1; i < CANVAS.h / DM; i += 1) {
    const y = i * DM;
    canvasTicks.appendChild(createLine(tickLeft, y, tickRight, y));
  }

  const { widthDm, heightDm } = getCanvasSizeInDm();
  canvasLabels.appendChild(createLabel(`${widthDm} dm`, CANVAS.w / 2, CANVAS.h + 13));
  canvasLabels.appendChild(createLabel(`${heightDm} dm`, CANVAS.w + 13, CANVAS.h / 2, "start"));

  applyCanvasPosition();
  updateViewBox();
}

function setCanvasSize(widthDm, heightDm) {
  exitFreeSurfaceMode();
  const clamped = clampCanvasSize(widthDm, heightDm);
  CANVAS.w = clamped.widthDm * DM;
  CANVAS.h = clamped.heightDm * DM;
  randomizeCanvasPosition(clamped.widthDm, clamped.heightDm);
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

function clampCanvasPosition(widthDm, heightDm) {
  const surface = getWorkSurfaceBounds();
  const rectH = heightDm * DM;
  const maxY = Math.max(CANVAS_POSITION_MARGIN, surface.h - rectH - CANVAS_BOTTOM_MARGIN);

  canvasPosition.x = getCenteredCanvasX(widthDm, surface.w);
  canvasPosition.y = Math.min(Math.max(CANVAS_POSITION_MARGIN, canvasPosition.y), maxY);
  applyCanvasPosition();
}

function handleViewportChange() {
  if (isFreeSurfaceMode) {
    updateViewBox();
    return;
  }

  const current = getCanvasSizeInDm();
  const clamped = clampCanvasSize(current.widthDm, current.heightDm);

  if (clamped.widthDm !== current.widthDm || clamped.heightDm !== current.heightDm) {
    setCanvasSize(clamped.widthDm, clamped.heightDm);
  } else {
    clampCanvasPosition(current.widthDm, current.heightDm);
    updateViewBox();
  }
}

function initCanvas() {
  generateRandomCanvas();
  requestAnimationFrame(updateViewBox);
}

initCanvas();
updateToolbarModeState();
newCanvasBtn.addEventListener("click", generateRandomCanvas);
freeSurfaceBtn.addEventListener("click", enterFreeSurfaceMode);
verifyBtn.addEventListener("click", verifyAreaAnswer);
areaValueInput.addEventListener("input", resetAreaQuizFeedback);
areaUnitSelect.addEventListener("change", resetAreaQuizFeedback);
areaValueInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    verifyAreaAnswer();
  }
});
window.addEventListener("resize", handleViewportChange);
