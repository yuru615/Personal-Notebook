(() => {
  const STORAGE_KEY = "flowboard.whiteboard.v1";
  const NOTE_COLORS = ["#ffe681", "#c7f2d0", "#ffd2da", "#cfe8ff", "#ead8ff"];
  const MIN_ZOOM = 0.22;
  const MAX_ZOOM = 3.2;
  const NOTE_HEADER_HEIGHT = 28;
  const NOTE_MIN_WIDTH = 150;
  const NOTE_MIN_HEIGHT = 112;
  const NOTE_MAX_WIDTH = 1200;
  const NOTE_MAX_HEIGHT = 2400;
  const CONNECTION_HIT_PAD = 12;
  const CONNECTION_HANDLE_OFFSET = 18;
  const SHAPE_TYPES = ["rect", "ellipse", "diamond", "triangle"];
  const LINE_MARKERS = ["none", "arrow", "bar", "dot", "circle", "diamond"];
  const DEFAULT_LINE_START_MARKER = "none";
  const DEFAULT_LINE_END_MARKER = "none";
  const MIN_SHAPE_SIZE = 8;
  const TEXT_FONT_OPTIONS = [
    { label: "默认", value: "Inter, Segoe UI, sans-serif" },
    { label: "微软雅黑", value: "Microsoft YaHei, PingFang SC, sans-serif" },
    { label: "宋体", value: "SimSun, Songti SC, serif" },
    { label: "Arial", value: "Arial, sans-serif" },
    { label: "Georgia", value: "Georgia, serif" },
    { label: "Mono", value: "Consolas, monospace" },
  ];
  const TEXT_MIN_FONT_SIZE = 10;
  const TEXT_MAX_FONT_SIZE = 120;
  const TEXT_MIN_WIDTH = 60;
  const TEXT_MIN_HEIGHT = 30;
  const TEXT_MAX_WIDTH = 1600;
  const TEXT_MAX_HEIGHT = 1200;
  const TEXT_PLACEHOLDER = "输入文本";
  const TEXT_DOUBLE_CLICK_MS = 460;
  const TEXT_DOUBLE_CLICK_DISTANCE = 8;
  const TEXT_REGULAR_WEIGHT = "400";
  const TEXT_BOLD_WEIGHT = "700";
  const SHAPE_TEXT_FONT_SIZE = 16;
  const SHAPE_TEXT_PADDING = 12;
  const SHAPE_RESIZE_HANDLE_SIZE = 10;
  const IMAGE_MIN_SIZE = 40;
  const IMAGE_MAX_SIZE = 2400;
  const IMAGE_INITIAL_MAX_SIZE = 420;
  const EXPORT_PADDING = 80;
  const EXPORT_MAX_CANVAS_SIZE = 4096;
  const EXPORT_DEFAULT_SCALE = 2;

  const viewport = document.getElementById("viewport");
  const canvas = document.getElementById("board");
  const noteLayer = document.getElementById("note-layer");
  const zoomReadout = document.getElementById("zoom-readout");
  const strokeSizeInput = document.getElementById("stroke-size");
  const importFileInput = document.getElementById("import-file");
  const shapePicker = document.getElementById("shape-picker");
  const shapeStrip = document.getElementById("shape-strip");
  const colorToggle = document.getElementById("color-toggle");
  const colorPanel = document.getElementById("color-panel");
  const colorValueInput = document.getElementById("color-value");
  const currentColorSwatch = document.getElementById("current-color-swatch");
  const undoButton = document.getElementById("undo");
  const redoButton = document.getElementById("redo");
  const historyToggle = document.getElementById("history-toggle");
  const historyMenu = document.getElementById("history-menu");
  const historyCounts = document.getElementById("history-counts");
  const historyStatus = document.getElementById("history-status");
  const exportButton = document.getElementById("export-board");
  const exportMenu = document.getElementById("export-menu");
  const lineModeStrip = document.querySelector(".mode-strip");
  const lineMarkerControls = document.createElement("div");
  lineMarkerControls.className = "tool-strip line-marker-strip";
  lineMarkerControls.id = "line-marker-controls";
  lineMarkerControls.hidden = true;
  lineMarkerControls.innerHTML = buildLineMarkerControlsMarkup();
  if (lineModeStrip && lineModeStrip.parentNode) {
    lineModeStrip.parentNode.insertBefore(lineMarkerControls, lineModeStrip.nextSibling);
  }
  const lineStartMarkerToggle = document.getElementById("line-start-marker-toggle");
  const lineEndMarkerToggle = document.getElementById("line-end-marker-toggle");
  const lineStartMarkerMenu = document.getElementById("line-start-marker-menu");
  const lineEndMarkerMenu = document.getElementById("line-end-marker-menu");
  let ctx = canvas.getContext("2d");
  const connectionHandleLayer = document.createElement("div");
  connectionHandleLayer.id = "connection-handle-layer";
  noteLayer.appendChild(connectionHandleLayer);
  const selectionMarquee = document.createElement("div");
  selectionMarquee.className = "selection-marquee";
  selectionMarquee.hidden = true;
  noteLayer.appendChild(selectionMarquee);
  const textToolbar = document.createElement("div");
  textToolbar.className = "text-toolbar";
  textToolbar.hidden = true;
  textToolbar.innerHTML = `
    <button class="text-toolbar-grip" type="button" data-text-move aria-label="移动文本">⋮⋮</button>
    <select class="text-font-select" data-text-font aria-label="字体">
      ${TEXT_FONT_OPTIONS.map((font) => `<option value="${font.value}">${font.label}</option>`).join("")}
    </select>
    <input class="text-size-input" data-text-size type="number" min="${TEXT_MIN_FONT_SIZE}" max="${TEXT_MAX_FONT_SIZE}" step="1" aria-label="字号" />
    <input class="text-color-input" data-text-color type="color" aria-label="文字颜色" />
    <button class="text-style-button" type="button" data-text-bold aria-label="加粗">B</button>
    <button class="text-style-button" type="button" data-text-italic aria-label="斜体">I</button>
    <button class="text-delete-button" type="button" data-text-delete aria-label="删除文本">
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4 7h16" />
        <path d="M10 11v6" />
        <path d="M14 11v6" />
        <path d="M6 7l1 14h10l1-14" />
        <path d="M9 7V4h6v3" />
      </svg>
    </button>
  `;
  noteLayer.appendChild(textToolbar);

  const noteElements = new Map();
  const textElements = new Map();
  const imageElements = new Map();
  const undoStack = [];
  const redoStack = [];

  let dpr = 1;
  let viewWidth = 0;
  let viewHeight = 0;
  let pointerMode = null;
  let saveTimer = null;
  let spaceDown = false;
  let editingTextId = null;
  let editingShapeTextId = null;
  let shapeTextEditor = null;
  let shapeTextEditHasHistory = false;
  let lastPointerClient = null;
  let lastTextPointerClick = null;

  const state = {
    tool: "select",
    color: "#17202a",
    strokeSize: 6,
    camera: {
      x: -window.innerWidth / 2,
      y: -window.innerHeight / 2,
      scale: 1,
    },
    shapes: [],
    strokes: [],
    connections: [],
    notes: [],
    texts: [],
    images: [],
    selectedNoteId: null,
    selectedTextId: null,
    selectedShapeId: null,
    selectedImageId: null,
    selectedConnectionId: null,
    selectedNoteIds: [],
    selectedTextIds: [],
    selectedShapeIds: [],
    selectedImageIds: [],
    selectedStrokeIds: [],
    pendingConnectionNoteId: null,
    connectionDraft: null,
    lineMode: "curve",
    lineStartMarker: DEFAULT_LINE_START_MARKER,
    lineEndMarker: DEFAULT_LINE_END_MARKER,
    shapeType: "rect",
    textFontFamily: TEXT_FONT_OPTIONS[0].value,
    textFontSize: 24,
  };

  hydrate();
  resizeCanvas();
  bindControls();
  setTool(state.tool);
  render();

  function hydrate() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw);
      if (saved.camera) state.camera = normalizeCamera(saved.camera);
      state.color = normalizeColor(saved.color, state.color);
      state.strokeSize = clamp(finiteOr(saved.strokeSize, state.strokeSize), 2, 36);
      state.textFontFamily = normalizeFontFamily(saved.textFontFamily, state.textFontFamily);
      state.textFontSize = clamp(finiteOr(saved.textFontSize, state.textFontSize), TEXT_MIN_FONT_SIZE, TEXT_MAX_FONT_SIZE);
      if (saved.lineMode === "straight" || saved.lineMode === "curve") state.lineMode = saved.lineMode;
      state.lineStartMarker = normalizeMarker(saved.lineStartMarker, state.lineStartMarker);
      state.lineEndMarker = normalizeMarker(saved.lineEndMarker, state.lineEndMarker);
      if (SHAPE_TYPES.includes(saved.shapeType)) state.shapeType = saved.shapeType;
      if (Array.isArray(saved.shapes)) state.shapes = saved.shapes.map(normalizeShape).filter(Boolean);
      if (Array.isArray(saved.strokes)) state.strokes = saved.strokes.map(normalizeStroke).filter(Boolean);
      if (Array.isArray(saved.connections)) state.connections = saved.connections.map(normalizeConnection).filter(Boolean);
      if (Array.isArray(saved.notes)) state.notes = saved.notes.map(normalizeNote).filter(Boolean);
      if (Array.isArray(saved.texts)) state.texts = saved.texts.map(normalizeText).filter(Boolean);
      if (Array.isArray(saved.images)) state.images = saved.images.map(normalizeImage).filter(Boolean);
    } catch {
      localStorage.removeItem(STORAGE_KEY);
    }
  }

  function normalizeColor(value, fallback = "#17202a") {
    if (typeof value !== "string") return fallback;
    const raw = value.trim();
    const shortHex = raw.match(/^#?([0-9a-f]{3})$/i);
    if (shortHex) {
      return `#${shortHex[1]
        .split("")
        .map((char) => char + char)
        .join("")
        .toLowerCase()}`;
    }
    const fullHex = raw.match(/^#?([0-9a-f]{6})$/i);
    return fullHex ? `#${fullHex[1].toLowerCase()}` : fallback;
  }

  function normalizeCamera(camera) {
    return {
      x: finiteOr(camera.x, state.camera.x),
      y: finiteOr(camera.y, state.camera.y),
      scale: clamp(finiteOr(camera.scale, 1), MIN_ZOOM, MAX_ZOOM),
    };
  }

  function normalizeStroke(stroke) {
    if (!stroke || !Array.isArray(stroke.points) || stroke.points.length === 0) return null;
    const points = stroke.points
      .map((point) => ({
        x: finiteOr(point.x, 0),
        y: finiteOr(point.y, 0),
      }))
      .filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y));
    if (!points.length) return null;
    return {
      id: stroke.id || makeId("stroke"),
      color: normalizeColor(stroke.color, "#17202a"),
      size: clamp(finiteOr(stroke.size, 6), 1, 80),
      points,
    };
  }

  function normalizeShape(shape) {
    if (!shape || !SHAPE_TYPES.includes(shape.type)) return null;
    return {
      id: shape.id || makeId("shape"),
      type: shape.type,
      x: finiteOr(shape.x, 0),
      y: finiteOr(shape.y, 0),
      w: clamp(finiteOr(shape.w, 160), MIN_SHAPE_SIZE, 2400),
      h: clamp(finiteOr(shape.h, 110), MIN_SHAPE_SIZE, 2400),
      color: normalizeColor(shape.color, "#17202a"),
      size: clamp(finiteOr(shape.size, 3), 1, 40),
      text: typeof shape.text === "string" ? shape.text : "",
      z: finiteOr(shape.z, 0),
    };
  }

  function normalizeConnection(connection) {
    if (!connection || !connection.from || !connection.to || connection.from === connection.to) return null;
    return {
      id: connection.id || makeId("connection"),
      from: String(connection.from),
      to: String(connection.to),
      fromSide: normalizeSide(connection.fromSide),
      toSide: normalizeSide(connection.toSide),
      fromAnchor: normalizeAnchor(connection.fromAnchor),
      toAnchor: normalizeAnchor(connection.toAnchor),
      fromMarker: normalizeMarker(connection.fromMarker, state.lineStartMarker),
      toMarker: normalizeMarker(connection.toMarker, state.lineEndMarker),
      mode: connection.mode === "curve" ? "curve" : "straight",
      color: normalizeColor(connection.color, "#17202a"),
      size: clamp(finiteOr(connection.size, 3), 1, 24),
    };
  }

  function normalizeSide(side) {
    return ["n", "e", "s", "w"].includes(side) ? side : null;
  }

  function normalizeAnchor(anchor) {
    if (!anchor || typeof anchor !== "object") return null;
    const x = Number(anchor.x);
    const y = Number(anchor.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    return {
      x: clamp(x, 0, 1),
      y: clamp(y, 0, 1),
    };
  }

  function normalizeMarker(marker, fallback = DEFAULT_LINE_END_MARKER) {
    return LINE_MARKERS.includes(marker) ? marker : fallback;
  }

  function buildLineMarkerControlsMarkup() {
    return `
      <div class="line-marker-wrap">
        <button
          class="icon-button line-marker-toggle"
          id="line-start-marker-toggle"
          type="button"
          data-line-marker-toggle="from"
          data-tip="\u8d77\u59cb\u7aef\u70b9"
          aria-label="\u8d77\u59cb\u7aef\u70b9"
          aria-expanded="false"
          aria-controls="line-start-marker-menu"
        ></button>
        <div class="line-marker-menu" id="line-start-marker-menu" role="menu" aria-label="\u8d77\u59cb\u7aef\u70b9" hidden>
          ${buildLineMarkerMenuMarkup("from")}
        </div>
      </div>
      <div class="line-marker-wrap">
        <button
          class="icon-button line-marker-toggle"
          id="line-end-marker-toggle"
          type="button"
          data-line-marker-toggle="to"
          data-tip="\u7ed3\u675f\u7aef\u70b9"
          aria-label="\u7ed3\u675f\u7aef\u70b9"
          aria-expanded="false"
          aria-controls="line-end-marker-menu"
        ></button>
        <div class="line-marker-menu" id="line-end-marker-menu" role="menu" aria-label="\u7ed3\u675f\u7aef\u70b9" hidden>
          ${buildLineMarkerMenuMarkup("to")}
        </div>
      </div>
    `;
  }

  function buildLineMarkerMenuMarkup(target) {
    return LINE_MARKERS.map((marker) => {
      return `
        <button
          type="button"
          class="line-marker-option"
          role="menuitemradio"
          data-line-marker-target="${target}"
          data-line-marker="${marker}"
          aria-label="${lineMarkerLabel(marker)}"
          aria-checked="false"
        >
          <span class="line-marker-preview" aria-hidden="true">${lineMarkerPreviewSvg(marker, target)}</span>
        </button>
      `;
    }).join("");
  }

  function lineMarkerLabel(marker) {
    if (marker === "none") return "\u65e0";
    if (marker === "arrow") return "\u7bad\u5934";
    if (marker === "bar") return "\u77ed\u7ebf";
    if (marker === "dot") return "\u5b9e\u5fc3\u5706";
    if (marker === "circle") return "\u7a7a\u5fc3\u5706";
    return "\u83f1\u5f62";
  }

  function lineMarkerPreviewSvg(marker, target) {
    const isFrom = target === "from";
    const anchorX = isFrom ? 16 : 48;
    const direction = isFrom ? "from" : "to";
    return `
      <svg viewBox="0 0 64 16" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M12 8H52" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" />
        ${lineMarkerPreviewShape(marker, anchorX, 8, direction)}
      </svg>
    `;
  }

  function lineMarkerPreviewShape(marker, x, y, target) {
    if (marker === "none") return "";
    if (marker === "dot") {
      return `<circle cx="${x}" cy="${y}" r="2.8" fill="currentColor" />`;
    }
    if (marker === "circle") {
      return `<circle cx="${x}" cy="${y}" r="3.1" fill="#ffffff" stroke="currentColor" stroke-width="1.5" />`;
    }
    if (marker === "bar") {
      return `<path d="M${x} 4.4V11.6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />`;
    }
    if (marker === "diamond") {
      return `<path d="M${x} 3.8L${x + (target === "from" ? -4 : 4)} ${y}L${x} 12.2L${x + (target === "from" ? 4 : -4)} ${y}Z" fill="#ffffff" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round" />`;
    }
    if (target === "from") {
      return `<path d="M${x + 4.8} 4.4L${x} ${y}L${x + 4.8} 11.6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />`;
    }
    return `<path d="M${x - 4.8} 4.4L${x} ${y}L${x - 4.8} 11.6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />`;
  }

  function normalizeNote(note) {
    if (!note) return null;
    return {
      id: note.id || makeId("note"),
      x: finiteOr(note.x, 0),
      y: finiteOr(note.y, 0),
      w: clamp(finiteOr(note.w, 220), NOTE_MIN_WIDTH, NOTE_MAX_WIDTH),
      h: clamp(finiteOr(note.h, 158), NOTE_MIN_HEIGHT, NOTE_MAX_HEIGHT),
      text: typeof note.text === "string" ? note.text : "",
      color: typeof note.color === "string" ? note.color : NOTE_COLORS[0],
      z: finiteOr(note.z, nextZ()),
    };
  }

  function normalizeText(text) {
    if (!text) return null;
    return {
      id: text.id || makeId("text"),
      x: finiteOr(text.x, 0),
      y: finiteOr(text.y, 0),
      w: clamp(finiteOr(text.w, 220), TEXT_MIN_WIDTH, TEXT_MAX_WIDTH),
      h: clamp(finiteOr(text.h, 44), TEXT_MIN_HEIGHT, TEXT_MAX_HEIGHT),
      text: typeof text.text === "string" ? text.text : "",
      color: normalizeColor(text.color, "#17202a"),
      fontFamily: normalizeFontFamily(text.fontFamily, state.textFontFamily),
      fontSize: clamp(finiteOr(text.fontSize, state.textFontSize), TEXT_MIN_FONT_SIZE, TEXT_MAX_FONT_SIZE),
      fontWeight: text.fontWeight === TEXT_BOLD_WEIGHT ? TEXT_BOLD_WEIGHT : TEXT_REGULAR_WEIGHT,
      fontStyle: text.fontStyle === "italic" ? "italic" : "normal",
      autoSize: text.autoSize === false ? false : true,
      z: finiteOr(text.z, nextZ()),
    };
  }

  function normalizeImage(image) {
    if (!image || typeof image.src !== "string" || !image.src.startsWith("data:image/")) return null;
    return {
      id: image.id || makeId("image"),
      x: finiteOr(image.x, 0),
      y: finiteOr(image.y, 0),
      w: clamp(finiteOr(image.w, 240), IMAGE_MIN_SIZE, IMAGE_MAX_SIZE),
      h: clamp(finiteOr(image.h, 180), IMAGE_MIN_SIZE, IMAGE_MAX_SIZE),
      src: image.src,
      name: typeof image.name === "string" ? image.name : "图片",
      z: finiteOr(image.z, nextZ()),
    };
  }

  function normalizeFontFamily(value, fallback = TEXT_FONT_OPTIONS[0].value) {
    return TEXT_FONT_OPTIONS.some((font) => font.value === value) ? value : fallback;
  }

  function finiteOr(value, fallback) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  }

  function bindControls() {
    window.addEventListener("resize", resizeCanvas);

    document.querySelectorAll("[data-tool]").forEach((button) => {
      button.addEventListener("click", () => {
        const tool = button.dataset.tool;
        if (tool === "shape" && state.tool === "shape") {
          setTool("select");
          return;
        }
        setTool(tool);
      });
    });

    document.querySelectorAll("[data-color]").forEach((button) => {
      button.addEventListener("click", () => {
        setColor(button.dataset.color, { closePanel: true });
      });
    });

    if (colorToggle && colorPanel) {
      colorToggle.addEventListener("click", (event) => {
        event.stopPropagation();
        setColorPanelOpen(colorPanel.hidden);
      });

      colorPanel.addEventListener("click", (event) => event.stopPropagation());

      document.addEventListener("pointerdown", (event) => {
        if (!colorPanel.hidden && !event.target.closest("#color-picker")) {
          setColorPanelOpen(false);
        }
      });
    }

    if (colorValueInput) {
      colorValueInput.addEventListener("input", () => {
        const cleaned = colorValueInput.value.replace(/[^0-9a-f]/gi, "").slice(0, 6).toUpperCase();
        if (colorValueInput.value !== cleaned) colorValueInput.value = cleaned;
        if (cleaned.length === 6) setColor(`#${cleaned}`);
      });

      colorValueInput.addEventListener("keydown", (event) => {
        if (event.key !== "Enter") return;
        event.preventDefault();
        if (setColor(colorValueInput.value)) setColorPanelOpen(false);
      });

      colorValueInput.addEventListener("blur", () => {
        colorValueInput.value = state.color.slice(1).toUpperCase();
      });
    }

    document.querySelectorAll("[data-line-mode]").forEach((button) => {
      button.addEventListener("click", () => {
        setLineMode(button.dataset.lineMode === "curve" ? "curve" : "straight");
      });
    });

    if (lineMarkerControls) {
      lineMarkerControls.addEventListener("click", (event) => {
        const toggle = event.target.closest("[data-line-marker-toggle]");
        if (toggle) {
          event.stopPropagation();
          const target = toggle.dataset.lineMarkerToggle === "from" ? "from" : "to";
          const menu = target === "from" ? lineStartMarkerMenu : lineEndMarkerMenu;
          if (menu && !menu.hidden) {
            if (state.tool === "connector") setTool("select");
            else setLineMarkerMenuOpen(null);
            return;
          }
          setLineMarkerMenuOpen(target);
          return;
        }

        const option = event.target.closest("[data-line-marker]");
        if (!option) return;
        event.stopPropagation();
        const target = option.dataset.lineMarkerTarget === "from" ? "from" : "to";
        setLineMarker(target, option.dataset.lineMarker);
      });

      document.addEventListener("pointerdown", (event) => {
        if (
          (!lineStartMarkerMenu || lineStartMarkerMenu.hidden) &&
          (!lineEndMarkerMenu || lineEndMarkerMenu.hidden)
        ) {
          return;
        }
        if (!event.target.closest("#line-marker-controls")) {
          setLineMarkerMenuOpen(null);
        }
      });
    }

    document.querySelectorAll("[data-shape-type]").forEach((button) => {
      button.addEventListener("click", () => {
        state.shapeType = SHAPE_TYPES.includes(button.dataset.shapeType) ? button.dataset.shapeType : "rect";
        setTool("shape");
        queueSave();
      });
    });

    strokeSizeInput.addEventListener("input", () => {
      state.strokeSize = Number(strokeSizeInput.value);
      queueSave();
    });

    undoButton.addEventListener("click", undo);
    redoButton.addEventListener("click", redo);
    if (historyToggle && historyMenu) {
      historyToggle.addEventListener("click", (event) => {
        event.stopPropagation();
        setHistoryMenuOpen(historyMenu.hidden);
      });

      historyMenu.addEventListener("click", (event) => {
        event.stopPropagation();
        const button = event.target.closest("[data-history-action]");
        if (!button || button.disabled) return;
        applyHistoryAction(button.dataset.historyAction);
      });

      document.addEventListener("pointerdown", (event) => {
        if (!historyMenu.hidden && !event.target.closest("#history-menu") && !event.target.closest("#history-toggle")) {
          setHistoryMenuOpen(false);
        }
      });
    }
    if (exportButton && exportMenu) {
      exportButton.addEventListener("click", (event) => {
        event.stopPropagation();
        setExportMenuOpen(exportMenu.hidden);
      });

      exportMenu.addEventListener("click", (event) => {
        event.stopPropagation();
        const button = event.target.closest("[data-export-format]");
        if (!button) return;
        setExportMenuOpen(false);
        exportBoard(button.dataset.exportFormat);
      });

      document.addEventListener("pointerdown", (event) => {
        if (!exportMenu.hidden && !event.target.closest("#export-menu") && !event.target.closest("#export-board")) {
          setExportMenuOpen(false);
        }
      });
    }
    document.getElementById("import-board").addEventListener("click", () => importFileInput.click());
    document.getElementById("clear-board").addEventListener("click", clearBoard);
    importFileInput.addEventListener("change", importBoard);
    textToolbar.addEventListener("pointerdown", onTextToolbarPointerDown);
    textToolbar.addEventListener("input", onTextToolbarInput);
    textToolbar.addEventListener("change", onTextToolbarInput);
    textToolbar.addEventListener("click", onTextToolbarClick);

    noteLayer.addEventListener("pointerdown", onImagePointerDown);
    noteLayer.addEventListener("click", onImageClick);
    viewport.addEventListener("pointerdown", onViewportPointerDown);
    viewport.addEventListener("pointerup", endPointerMode);
    viewport.addEventListener("pointercancel", endPointerMode);
    viewport.addEventListener("dblclick", onViewportDoubleClick);
    viewport.addEventListener("wheel", onWheel, { passive: false });
    viewport.addEventListener("contextmenu", (event) => event.preventDefault());

    noteLayer.addEventListener("pointerdown", onTextPointerDown);
    noteLayer.addEventListener("dblclick", onTextDoubleClick);
    noteLayer.addEventListener("pointerdown", onNotePointerDown);
    noteLayer.addEventListener("pointerup", endPointerMode);
    noteLayer.addEventListener("pointercancel", endPointerMode);
    noteLayer.addEventListener("click", onNoteClick);
    noteLayer.addEventListener("input", onTextInput);
    noteLayer.addEventListener("input", onNoteInput);
    noteLayer.addEventListener("focusin", onTextFocus);
    noteLayer.addEventListener("focusin", onNoteFocus);

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", endPointerMode);
    window.addEventListener("pointercancel", endPointerMode);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("paste", onPaste);
  }

  function setColor(value, options = {}) {
    const nextColor = normalizeColor(value, null);
    if (!nextColor) return false;
    const didUpdateSelection = applyColorToSelection(nextColor);
    state.color = nextColor;
    queueSave();
    if (didUpdateSelection) render();
    else renderControls();
    if (options.closePanel) setColorPanelOpen(false);
    return true;
  }

  function setColorPanelOpen(isOpen) {
    if (!colorToggle || !colorPanel) return;
    if (isOpen) setLineMarkerMenuOpen(null);
    if (isOpen) renderControls();
    colorPanel.hidden = !isOpen;
    colorToggle.setAttribute("aria-expanded", String(isOpen));
    if (isOpen) requestAnimationFrame(positionColorPanel);
    else {
      colorPanel.style.left = "50%";
      colorPanel.style.transform = "translateX(-50%)";
    }
  }

  function positionColorPanel() {
    if (!colorToggle || !colorPanel || colorPanel.hidden) return;
    const picker = colorToggle.closest("#color-picker");
    if (!picker) return;
    colorPanel.style.left = "50%";
    colorPanel.style.transform = "translateX(-50%)";
    const pickerRect = picker.getBoundingClientRect();
    const panelRect = colorPanel.getBoundingClientRect();
    const padding = 8;
    const maxLeft = Math.max(padding, window.innerWidth - panelRect.width - padding);
    const desiredLeft = pickerRect.left + pickerRect.width / 2 - panelRect.width / 2;
    const clampedLeft = clamp(desiredLeft, padding, maxLeft);
    colorPanel.style.left = `${clampedLeft - pickerRect.left}px`;
    colorPanel.style.transform = "none";
  }

  function positionShapeStrip() {
    if (!shapePicker || !shapeStrip || !shapeStrip.classList.contains("is-expanded")) return;
    shapeStrip.style.left = "50%";
    shapeStrip.style.transform = "translateX(-50%)";
    const pickerRect = shapePicker.getBoundingClientRect();
    const stripRect = shapeStrip.getBoundingClientRect();
    const padding = 8;
    const maxLeft = Math.max(padding, window.innerWidth - stripRect.width - padding);
    const desiredLeft = pickerRect.left + pickerRect.width / 2 - stripRect.width / 2;
    const clampedLeft = clamp(desiredLeft, padding, maxLeft);
    shapeStrip.style.left = `${clampedLeft - pickerRect.left}px`;
    shapeStrip.style.transform = "none";
  }

  function getLineMarkerMenu(target) {
    return target === "from" ? lineStartMarkerMenu : lineEndMarkerMenu;
  }

  function getLineMarkerToggle(target) {
    return target === "from" ? lineStartMarkerToggle : lineEndMarkerToggle;
  }

  function setLineMarkerMenuOpen(target) {
    ["from", "to"].forEach((key) => {
      const menu = getLineMarkerMenu(key);
      const toggle = getLineMarkerToggle(key);
      if (!menu || !toggle) return;
      const isOpen = target === key;
      menu.hidden = !isOpen;
      toggle.setAttribute("aria-expanded", String(isOpen));
      if (isOpen) requestAnimationFrame(() => positionLineMarkerMenu(key));
      else {
        menu.style.left = "50%";
        menu.style.transform = "translateX(-50%)";
      }
    });
    if (target) {
      setColorPanelOpen(false);
      setExportMenuOpen(false);
      setHistoryMenuOpen(false);
    }
  }

  window.flowboardDismissLineMarkerMenus = () => {
    setLineMarkerMenuOpen(null);
  };

  function positionLineMarkerMenu(target) {
    const toggle = getLineMarkerToggle(target);
    const menu = getLineMarkerMenu(target);
    if (!toggle || !menu || menu.hidden) return;
    const wrap = toggle.closest(".line-marker-wrap");
    if (!wrap) return;
    menu.style.left = "50%";
    menu.style.transform = "translateX(-50%)";
    const wrapRect = wrap.getBoundingClientRect();
    const menuRect = menu.getBoundingClientRect();
    const padding = 8;
    const maxLeft = Math.max(padding, window.innerWidth - menuRect.width - padding);
    const desiredLeft = wrapRect.left + wrapRect.width / 2 - menuRect.width / 2;
    const clampedLeft = clamp(desiredLeft, padding, maxLeft);
    menu.style.left = `${clampedLeft - wrapRect.left}px`;
    menu.style.transform = "none";
  }

  function updateLineMarkerToggle(button, target) {
    if (!button) return;
    button.innerHTML = lineMarkerPreviewSvg("none", target);
    button.removeAttribute("data-line-marker");
  }

  function setExportMenuOpen(isOpen) {
    if (!exportButton || !exportMenu) return;
    if (isOpen) setLineMarkerMenuOpen(null);
    if (isOpen && historyMenu && !historyMenu.hidden) setHistoryMenuOpen(false);
    exportMenu.hidden = !isOpen;
    exportButton.setAttribute("aria-expanded", String(isOpen));
  }

  function setHistoryMenuOpen(isOpen) {
    if (!historyToggle || !historyMenu) return;
    if (isOpen) setLineMarkerMenuOpen(null);
    if (isOpen && exportMenu && !exportMenu.hidden) setExportMenuOpen(false);
    historyMenu.hidden = !isOpen;
    historyToggle.setAttribute("aria-expanded", String(isOpen));
  }

  function setTool(tool) {
    finishTextEditing();
    finishShapeTextEditing();
    state.tool = tool;
    if (tool !== "connector") cancelConnectionDraft();
    setColorPanelOpen(false);
    setLineMarkerMenuOpen(null);
    setExportMenuOpen(false);
    setHistoryMenuOpen(false);
    document.body.classList.remove("is-selection-hover");
    document.body.classList.remove("tool-select", "tool-hand", "tool-note", "tool-text", "tool-connector", "tool-shape", "tool-pen", "tool-eraser");
    document.body.classList.add(`tool-${tool}`);
    render();
  }

  function renderControls() {
    const activeColor = getActiveColor();
    document.querySelectorAll("[data-tool]").forEach((button) => {
      button.classList.toggle("is-active", button.dataset.tool === state.tool);
    });
    document.querySelectorAll("[data-color]").forEach((button) => {
      button.classList.toggle("is-active", normalizeColor(button.dataset.color, "") === activeColor);
    });
    if (currentColorSwatch) currentColorSwatch.style.setProperty("--swatch", activeColor);
    if (colorValueInput && document.activeElement !== colorValueInput) {
      colorValueInput.value = activeColor.slice(1).toUpperCase();
    }
    document.querySelectorAll("[data-line-mode]").forEach((button) => {
      button.classList.toggle("is-active", button.dataset.lineMode === getActiveLineMode());
    });
    const activeStartMarker = getActiveLineMarker("from");
    const activeEndMarker = getActiveLineMarker("to");
    updateLineMarkerToggle(lineStartMarkerToggle, "from");
    updateLineMarkerToggle(lineEndMarkerToggle, "to");
    document.querySelectorAll("[data-line-marker]").forEach((button) => {
      const target = button.dataset.lineMarkerTarget === "from" ? "from" : "to";
      const activeMarker = target === "from" ? activeStartMarker : activeEndMarker;
      button.classList.toggle("is-active", button.dataset.lineMarker === activeMarker);
      button.setAttribute("aria-checked", String(button.dataset.lineMarker === activeMarker));
    });
    if (lineMarkerControls) {
      const showLineMarkerControls = state.tool === "connector" || Boolean(getSelectedConnection());
      lineMarkerControls.hidden = !showLineMarkerControls;
      if (!showLineMarkerControls) setLineMarkerMenuOpen(null);
    }
    document.querySelectorAll("[data-shape-type]").forEach((button) => {
      button.classList.toggle("is-active", button.dataset.shapeType === state.shapeType);
    });
    if (shapeStrip) {
      const isExpanded = state.tool === "shape";
      shapeStrip.classList.toggle("is-expanded", isExpanded);
      if (isExpanded) requestAnimationFrame(positionShapeStrip);
      else {
        shapeStrip.style.left = "50%";
        shapeStrip.style.transform = "translateX(-50%)";
      }
    }
    strokeSizeInput.value = String(state.strokeSize);
    undoButton.disabled = !undoStack.length;
    redoButton.disabled = !redoStack.length;
    if (historyCounts) historyCounts.textContent = `${undoStack.length} / ${redoStack.length}`;
    if (historyStatus) {
      historyStatus.textContent = `可回退 ${undoStack.length} 步，可前进 ${redoStack.length} 步`;
    }
    if (historyToggle) {
      historyToggle.disabled = !undoStack.length && !redoStack.length;
      historyToggle.title = `可回退 ${undoStack.length} 步，可前进 ${redoStack.length} 步`;
    }
    if (historyMenu) {
      historyMenu.querySelectorAll("[data-history-action]").forEach((button) => {
        const action = button.dataset.historyAction || "";
        button.disabled = action.startsWith("undo") ? undoStack.length === 0 : redoStack.length === 0;
      });
      if (historyToggle && historyToggle.disabled && !historyMenu.hidden) setHistoryMenuOpen(false);
    }
    zoomReadout.textContent = `${Math.round(state.camera.scale * 100)}%`;
  }

  function setLineMode(mode) {
    const nextMode = mode === "curve" ? "curve" : "straight";
    const selectedConnection = getSelectedConnection();

    if (selectedConnection) {
      if (selectedConnection.mode !== nextMode) {
        pushHistory();
        selectedConnection.mode = nextMode;
        state.lineMode = nextMode;
        render();
        queueSave();
        return;
      }
      state.lineMode = nextMode;
      renderControls();
      return;
    }

    state.lineMode = nextMode;
    queueSave();
    renderControls();
  }

  function getActiveLineMode() {
    const selectedConnection = getSelectedConnection();
    return selectedConnection ? selectedConnection.mode : state.lineMode;
  }

  function setLineMarker(target, marker) {
    const normalizedTarget = target === "from" ? "from" : "to";
    const stateKey = normalizedTarget === "from" ? "lineStartMarker" : "lineEndMarker";
    const connectionKey = normalizedTarget === "from" ? "fromMarker" : "toMarker";
    const nextMarker = normalizeMarker(marker, state[stateKey]);
    const selectedConnection = getSelectedConnection();

    if (selectedConnection) {
      if (selectedConnection[connectionKey] !== nextMarker) {
        pushHistory();
        selectedConnection[connectionKey] = nextMarker;
        state[stateKey] = nextMarker;
        render();
        queueSave();
      } else {
        state[stateKey] = nextMarker;
        renderControls();
      }
      setLineMarkerMenuOpen(null);
      return;
    }

    state[stateKey] = nextMarker;
    queueSave();
    renderControls();
    setLineMarkerMenuOpen(null);
  }

  function getActiveLineMarker(target) {
    const selectedConnection = getSelectedConnection();
    if (selectedConnection) {
      return normalizeMarker(
        target === "from" ? selectedConnection.fromMarker : selectedConnection.toMarker,
        target === "from" ? state.lineStartMarker : state.lineEndMarker,
      );
    }
    return target === "from" ? state.lineStartMarker : state.lineEndMarker;
  }

  function getActiveColor() {
    return getSelectedColor() || state.color;
  }

  function getSelectedColor() {
    const selectedObjects = getSelectedColorObjects();
    if (!selectedObjects.length) return null;
    return normalizeColor(selectedObjects[0].color, state.color);
  }

  function getSelectedColorObjects() {
    const selected = selectedIdGroups();
    const objects = [];
    selected.noteIds.forEach((id) => {
      const note = findNote(id);
      if (note) objects.push(note);
    });
    selected.textIds.forEach((id) => {
      const text = findText(id);
      if (text) objects.push(text);
    });
    selected.shapeIds.forEach((id) => {
      const shape = findShape(id);
      if (shape) objects.push(shape);
    });
    selected.strokeIds.forEach((id) => {
      const stroke = findStroke(id);
      if (stroke) objects.push(stroke);
    });
    selected.connectionIds.forEach((id) => {
      const connection = findConnection(id);
      if (connection) objects.push(connection);
    });
    return objects;
  }

  function applyColorToSelection(color) {
    const selectedObjects = getSelectedColorObjects();
    const changedObjects = selectedObjects.filter((object) => normalizeColor(object.color, state.color) !== color);
    if (!changedObjects.length) return false;
    pushHistory();
    changedObjects.forEach((object) => {
      object.color = color;
    });
    return true;
  }

  function onViewportPointerDown(event) {
    rememberPointerPosition(event);
    if (event.target.closest(".note, .text-box, .image-box, .text-toolbar, .shape-text-editor")) return;
    if (event.button !== 0 && event.button !== 1) return;

    const world = toWorld(event.clientX, event.clientY);
    const hitShape = shapeAtWorld(world);
    const hitStroke = strokeAtWorld(world);
    const hitConnection = connectionAtWorld(world);
    if (editingTextId) {
      finishTextEditing();
      if (state.tool === "select" && !hitShape && !hitStroke && !hitConnection) {
        event.preventDefault();
        clearSelection();
        render();
        return;
      }
    }
    if (editingShapeTextId) {
      const clickedEditingShape = hitShape && hitShape.id === editingShapeTextId;
      if (!clickedEditingShape) {
        finishShapeTextEditing();
        if (state.tool === "select" && !hitShape) {
          event.preventDefault();
          clearSelection();
          render();
          return;
        }
      }
    }

    const shouldPan = state.tool === "hand" || spaceDown || event.button === 1;

    if (shouldPan) {
      startPanFromPointer(event);
      return;
    }

    event.preventDefault();
    viewport.setPointerCapture(event.pointerId);

    if (state.connectionDraft) {
      if (hitShape) confirmConnectionToTarget(hitShape);
      else cancelConnectionDraft();
      render();
      return;
    }

    if (state.tool === "connector") {
      if (hitShape) handleConnectorObjectClick(hitShape, world);
      else state.pendingConnectionNoteId = null;
      render();
      return;
    }

    if (state.tool === "note") {
      addNoteAt(world);
      return;
    }

    if (state.tool === "text") {
      addTextAt(world);
      return;
    }

    if (state.tool === "shape") {
      pushHistory();
      const shape = {
        id: makeId("shape"),
        type: state.shapeType,
        x: world.x,
        y: world.y,
        w: 1,
        h: 1,
        color: state.color,
        size: Math.max(2, Math.round(state.strokeSize * 0.55)),
        text: "",
        z: nextZ(),
      };
      state.shapes.push(shape);
      pointerMode = {
        type: "shape",
        pointerId: event.pointerId,
        shape,
        startX: world.x,
        startY: world.y,
      };
      document.body.classList.add("is-drawing");
      renderCanvas();
      queueSave();
      return;
    }

    if (state.tool === "pen") {
      pushHistory();
      const stroke = {
        id: makeId("stroke"),
        color: state.color,
        size: state.strokeSize,
        points: [world],
      };
      state.strokes.push(stroke);
      pointerMode = {
        type: "draw",
        pointerId: event.pointerId,
        stroke,
      };
      document.body.classList.add("is-drawing");
      render();
      queueSave();
      return;
    }

    if (state.tool === "eraser") {
      pushHistory();
      pointerMode = {
        type: "erase",
        pointerId: event.pointerId,
      };
      eraseAt(world);
      document.body.classList.add("is-drawing");
      return;
    }

    if (state.tool === "select") {
      const selectedShape = getSelectedShape();
      const shapeResizeDirection = selectedShape && shapeResizeHandleAtWorld(selectedShape, world);
      if (shapeResizeDirection) {
        pushHistory();
        pointerMode = {
          type: "resize-shape",
          pointerId: event.pointerId,
          shapeId: selectedShape.id,
          direction: shapeResizeDirection,
          startX: event.clientX,
          startY: event.clientY,
          startShapeX: selectedShape.x,
          startShapeY: selectedShape.y,
          startW: selectedShape.w,
          startH: selectedShape.h,
        };
        document.body.classList.add("is-dragging-note");
        render();
        queueSave();
        return;
      }

      if (hitShape) {
        if (event.detail >= 2) {
          selectObject(hitShape.id);
          bringShapeToFront(hitShape);
          startShapeTextEditing(hitShape.id);
          render();
          queueSave();
          return;
        }

        if (isObjectSelectedForGroupMove(hitShape.id) && startSelectionMove(event, viewport)) {
          return;
        }

        pushHistory();
        selectObject(hitShape.id);
        bringShapeToFront(hitShape);
        pointerMode = {
          type: "move-shape",
          pointerId: event.pointerId,
          shapeId: hitShape.id,
          offsetX: world.x - hitShape.x,
          offsetY: world.y - hitShape.y,
        };
        document.body.classList.add("is-dragging-note");
        render();
        queueSave();
        return;
      }

      if (hitConnection) {
        selectConnection(hitConnection.id);
        render();
        return;
      }

      if (hitStroke && isStrokeSelectedForGroupMove(hitStroke.id) && startSelectionMove(event, viewport)) {
        return;
      }

      pointerMode = {
        type: "select-box",
        pointerId: event.pointerId,
        startClientX: event.clientX,
        startClientY: event.clientY,
        currentClientX: event.clientX,
        currentClientY: event.clientY,
        startWorld: world,
        currentWorld: world,
      };
      clearSelection();
      updateSelectionMarquee(pointerMode);
      document.body.classList.add("is-selecting");
      render();
      return;
    }

    clearSelection();
    pointerMode = {
      type: "pan",
      pointerId: event.pointerId,
      lastX: event.clientX,
      lastY: event.clientY,
    };
    document.body.classList.add("is-panning");
    render();
  }

  function startPanFromPointer(event, captureTarget = viewport) {
    event.preventDefault();
    event.stopPropagation();
    captureTarget.setPointerCapture(event.pointerId);
    pointerMode = {
      type: "pan",
      pointerId: event.pointerId,
      lastX: event.clientX,
      lastY: event.clientY,
    };
    document.body.classList.add("is-panning");
  }

  function onViewportDoubleClick(event) {
    if (state.tool !== "select" || event.button !== 0) return;
    if (event.target.closest(".note, .text-box, .text-toolbar, .shape-text-editor")) return;
    const shape = shapeAtWorld(toWorld(event.clientX, event.clientY));
    if (!shape) return;
    event.preventDefault();
    event.stopPropagation();
    selectObject(shape.id);
    bringShapeToFront(shape);
    startShapeTextEditing(shape.id);
    render();
    queueSave();
  }

  function onNotePointerDown(event) {
    if (event.button === 1) {
      startPanFromPointer(event, noteLayer);
      return;
    }

    const connectHandle = event.target.closest(".note-connect-handle");
    if (connectHandle) {
      event.preventDefault();
      event.stopPropagation();
      startConnectionFromHandle(connectHandle.dataset.noteId, connectHandle.dataset.side, event);
      return;
    }

    const noteElement = event.target.closest(".note");
    if (!noteElement) return;
    const note = findNote(noteElement.dataset.id);
    if (!note) return;
    finishTextEditing();

    if (
      state.tool === "select" &&
      isObjectSelectedForGroupMove(note.id) &&
      !event.target.closest(".note-delete, .note-resize-handle, .note-connect-handle") &&
      startSelectionMove(event, noteLayer)
    ) {
      return;
    }

    state.selectedNoteId = note.id;
    state.selectedTextId = null;
    state.selectedShapeId = null;
    state.selectedImageId = null;
    state.selectedConnectionId = null;
    clearMultiSelection();
    bringNoteToFront(note);

    if (event.target.closest(".note-delete")) return;

    if (state.connectionDraft) {
      event.preventDefault();
      confirmConnectionToNote(note);
      return;
    }

    const resizeHandle = event.target.closest(".note-resize-handle");
    if (resizeHandle) {
      event.preventDefault();
      pushHistory();
      noteLayer.setPointerCapture(event.pointerId);
      pointerMode = {
        type: "resize-note",
        pointerId: event.pointerId,
        noteId: note.id,
        direction: resizeHandle.dataset.resize,
        startX: event.clientX,
        startY: event.clientY,
        startNoteX: note.x,
        startNoteY: note.y,
        startW: note.w,
        startH: note.h,
      };
      document.body.classList.add("is-dragging-note");
      render();
      return;
    }

    if (event.target.closest(".note-grip")) {
      event.preventDefault();
      pushHistory();
      const world = toWorld(event.clientX, event.clientY);
      noteLayer.setPointerCapture(event.pointerId);
      pointerMode = {
        type: "move-note",
        pointerId: event.pointerId,
        noteId: note.id,
        offsetX: world.x - note.x,
        offsetY: world.y - note.y,
      };
      document.body.classList.add("is-dragging-note");
      render();
      return;
    }

    if (state.tool === "connector") {
      event.preventDefault();
      handleConnectorNoteClick(note, toWorld(event.clientX, event.clientY));
      return;
    }

    if (event.target.closest(".note-body")) {
      focusNoteBody(note.id);
      queueSave();
      return;
    }

    render();
  }

  function onNoteClick(event) {
    const deleteButton = event.target.closest(".note-delete");
    if (!deleteButton) return;
    const noteElement = deleteButton.closest(".note");
    const note = noteElement && findNote(noteElement.dataset.id);
    if (!note) return;
    pushHistory();
    state.notes = state.notes.filter((item) => item.id !== note.id);
    state.connections = state.connections.filter((connection) => connection.from !== note.id && connection.to !== note.id);
    if (state.selectedNoteId === note.id) state.selectedNoteId = null;
    if (state.pendingConnectionNoteId === note.id || state.connectionDraft?.from === note.id || state.connectionDraft?.hoverNoteId === note.id) {
      cancelConnectionDraft();
    }
    render();
    queueSave();
  }

  function onNoteInput(event) {
    const body = event.target.closest(".note-body");
    if (!body) return;
    const noteElement = body.closest(".note");
    const note = noteElement && findNote(noteElement.dataset.id);
    if (!note) return;
    note.text = body.value || "";
    fitNoteToContent(note, body);
    renderNotes();
    renderCanvas();
    queueSave();
  }

  function onNoteFocus(event) {
    const noteElement = event.target.closest(".note");
    if (!noteElement) return;
    const note = findNote(noteElement.dataset.id);
    if (!note) return;
    state.selectedNoteId = note.id;
    state.selectedTextId = null;
    state.selectedShapeId = null;
    state.selectedImageId = null;
    state.selectedConnectionId = null;
    clearMultiSelection();
    bringNoteToFront(note);
    render();
    queueSave();
  }

  function onPointerMove(event) {
    rememberPointerPosition(event);
    if (state.connectionDraft) {
      updateConnectionDraft(event);
    }

    if (!pointerMode) {
      updateSelectionHover(event);
      return;
    }
    if (pointerMode.pointerId !== event.pointerId) return;
    if (event.pointerType === "mouse" && event.buttons === 0) {
      endPointerMode(event);
      return;
    }
    document.body.classList.remove("is-selection-hover");

    if (pointerMode.type === "pan") {
      const dx = event.clientX - pointerMode.lastX;
      const dy = event.clientY - pointerMode.lastY;
      state.camera.x -= dx / state.camera.scale;
      state.camera.y -= dy / state.camera.scale;
      pointerMode.lastX = event.clientX;
      pointerMode.lastY = event.clientY;
      render();
      queueSave();
      return;
    }

    if (pointerMode.type === "draw") {
      const point = toWorld(event.clientX, event.clientY);
      const points = pointerMode.stroke.points;
      const last = points[points.length - 1];
      if (distance(last, point) > 0.55) {
        points.push(point);
        renderCanvas();
        queueSave();
      }
      return;
    }

    if (pointerMode.type === "shape") {
      const point = toWorld(event.clientX, event.clientY);
      updateDraftShape(pointerMode.shape, pointerMode.startX, pointerMode.startY, point, event.shiftKey);
      renderCanvas();
      queueSave();
      return;
    }

    if (pointerMode.type === "erase") {
      eraseAt(toWorld(event.clientX, event.clientY));
      return;
    }

    if (pointerMode.type === "select-box") {
      pointerMode.currentClientX = event.clientX;
      pointerMode.currentClientY = event.clientY;
      pointerMode.currentWorld = toWorld(event.clientX, event.clientY);
      updateSelectionMarquee(pointerMode);
      applyBoxSelection(pointerMode);
      renderCanvas();
      renderNotes();
      return;
    }

    if (pointerMode.type === "move-note") {
      const note = findNote(pointerMode.noteId);
      if (!note) return;
      const world = toWorld(event.clientX, event.clientY);
      note.x = world.x - pointerMode.offsetX;
      note.y = world.y - pointerMode.offsetY;
      renderNotes();
      renderCanvas();
      queueSave();
      return;
    }

    if (pointerMode.type === "move-text") {
      const text = findText(pointerMode.textId);
      if (!text) return;
      text.x = pointerMode.startTextX + (event.clientX - pointerMode.startX) / state.camera.scale;
      text.y = pointerMode.startTextY + (event.clientY - pointerMode.startY) / state.camera.scale;
      renderTexts();
      renderConnectionHandles();
      renderTextToolbar();
      renderCanvas();
      queueSave();
      return;
    }

    if (pointerMode.type === "resize-text") {
      const text = findText(pointerMode.textId);
      if (!text) return;
      resizeText(text, pointerMode, event);
      renderTexts();
      renderConnectionHandles();
      renderTextToolbar();
      renderCanvas();
      queueSave();
      return;
    }

    if (pointerMode.type === "move-image") {
      const image = findImage(pointerMode.imageId);
      if (!image) return;
      const world = toWorld(event.clientX, event.clientY);
      image.x = world.x - pointerMode.offsetX;
      image.y = world.y - pointerMode.offsetY;
      renderImages();
      renderConnectionHandles();
      renderCanvas();
      queueSave();
      return;
    }

    if (pointerMode.type === "move-shape") {
      const shape = findShape(pointerMode.shapeId);
      if (!shape) return;
      const world = toWorld(event.clientX, event.clientY);
      shape.x = world.x - pointerMode.offsetX;
      shape.y = world.y - pointerMode.offsetY;
      renderCanvas();
      renderConnectionHandles();
      queueSave();
      return;
    }

    if (pointerMode.type === "resize-shape") {
      const shape = findShape(pointerMode.shapeId);
      if (!shape) return;
      resizeShape(shape, pointerMode, event);
      renderCanvas();
      renderConnectionHandles();
      queueSave();
      return;
    }

    if (pointerMode.type === "move-selection") {
      moveSelection(pointerMode, event);
      return;
    }

    if (pointerMode.type === "resize-note") {
      const note = findNote(pointerMode.noteId);
      if (!note) return;
      resizeNote(note, pointerMode, event);
      renderNotes();
      renderCanvas();
      queueSave();
      return;
    }

    if (pointerMode.type === "resize-image") {
      const image = findImage(pointerMode.imageId);
      if (!image) return;
      resizeImage(image, pointerMode, event);
      renderImages();
      renderConnectionHandles();
      renderCanvas();
      queueSave();
      return;
    }
  }

  function endPointerMode(event) {
    if (!pointerMode) return;
    if (event && event.pointerId !== pointerMode.pointerId) return;
    const endedType = pointerMode.type;
    const endedMode = pointerMode;
    if (pointerMode.type === "shape") {
      const shape = pointerMode.shape;
      if (shape.w < MIN_SHAPE_SIZE || shape.h < MIN_SHAPE_SIZE) {
        state.shapes = state.shapes.filter((item) => item.id !== shape.id);
        if (state.selectedShapeId === shape.id) state.selectedShapeId = null;
      } else {
        selectObject(shape.id);
      }
      render();
      queueSave();
    }
    if (pointerMode.type === "select-box") {
      const width = Math.abs(pointerMode.currentClientX - pointerMode.startClientX);
      const height = Math.abs(pointerMode.currentClientY - pointerMode.startClientY);
      if (width < 4 && height < 4) clearSelection();
      selectionMarquee.hidden = true;
    }
    pointerMode = null;
    releasePointerCaptureSafely(viewport, event && event.pointerId);
    releasePointerCaptureSafely(noteLayer, event && event.pointerId);
    document.body.classList.remove("is-panning", "is-drawing", "is-dragging-note", "is-selecting");
    if (["shape", "select-box", "move-note", "move-text", "resize-text", "move-image", "move-shape", "resize-shape", "move-selection", "resize-note", "resize-image"].includes(endedType)) render();
    if (event && !handleCompletedTextClick(endedMode, event)) updateSelectionHover(event);
  }

  function cancelPointerMode() {
    if (!pointerMode) return;
    const pointerId = pointerMode.pointerId;
    pointerMode = null;
    releasePointerCaptureSafely(viewport, pointerId);
    releasePointerCaptureSafely(noteLayer, pointerId);
    selectionMarquee.hidden = true;
    document.body.classList.remove("is-panning", "is-drawing", "is-dragging-note", "is-selecting", "is-selection-hover");
  }

  function releasePointerCaptureSafely(target, pointerId) {
    if (!target || pointerId == null || !target.hasPointerCapture || !target.releasePointerCapture) return;
    try {
      if (target.hasPointerCapture(pointerId)) target.releasePointerCapture(pointerId);
    } catch {
      // Pointer capture may already be released by the browser.
    }
  }

  function updateSelectionHover(event) {
    const selected = selectedIdGroups();
    let isHover = false;

    if (canMoveSelectionAsGroup(selected) && event.target && event.target.closest) {
      const noteElement = event.target.closest(".note");
      const textElement = event.target.closest(".text-box");
      const imageElement = event.target.closest(".image-box");
      isHover =
        Boolean(noteElement && selected.noteIds.has(noteElement.dataset.id)) ||
        Boolean(textElement && selected.textIds.has(textElement.dataset.id)) ||
        Boolean(imageElement && selected.imageIds.has(imageElement.dataset.id));

      if (!isHover) {
        const hitShape = shapeAtWorld(toWorld(event.clientX, event.clientY));
        isHover = Boolean(hitShape && selected.shapeIds.has(hitShape.id));
      }

      if (!isHover) {
        const hitStroke = strokeAtWorld(toWorld(event.clientX, event.clientY));
        isHover = Boolean(hitStroke && selected.strokeIds.has(hitStroke.id));
      }
    }

    document.body.classList.toggle("is-selection-hover", isHover);
  }

  function onWheel(event) {
    event.preventDefault();

    if (event.ctrlKey || event.metaKey || event.altKey) {
      const zoomFactor = Math.exp(-event.deltaY * 0.0015);
      zoomAt(event.clientX, event.clientY, state.camera.scale * zoomFactor);
      return;
    }

    if (Math.abs(event.deltaY) > Math.abs(event.deltaX) && !event.shiftKey) {
      const zoomFactor = Math.exp(-event.deltaY * 0.001);
      zoomAt(event.clientX, event.clientY, state.camera.scale * zoomFactor);
      return;
    }

    state.camera.x += event.deltaX / state.camera.scale;
    state.camera.y += event.deltaY / state.camera.scale;
    render();
    queueSave();
  }

  function zoomAt(clientX, clientY, nextScale) {
    const rect = viewport.getBoundingClientRect();
    const before = toWorld(clientX, clientY);
    state.camera.scale = clamp(nextScale, MIN_ZOOM, MAX_ZOOM);
    state.camera.x = before.x - (clientX - rect.left) / state.camera.scale;
    state.camera.y = before.y - (clientY - rect.top) / state.camera.scale;
    render();
    queueSave();
  }

  function onKeyDown(event) {
    if (event.key === "Escape" && colorPanel && !colorPanel.hidden) {
      setColorPanelOpen(false);
      event.preventDefault();
      return;
    }

    if (event.key === "Escape" && exportMenu && !exportMenu.hidden) {
      setExportMenuOpen(false);
      event.preventDefault();
      return;
    }

    if (event.key === " " && !isEditingNote()) {
      spaceDown = true;
      document.body.classList.add("tool-hand");
      event.preventDefault();
      return;
    }

    if (isEditingNote()) {
      if (event.key === "Escape") {
        document.activeElement.blur();
      }
      return;
    }

    const modifier = event.ctrlKey || event.metaKey;
    if (modifier && event.key.toLowerCase() === "z") {
      event.preventDefault();
      if (event.shiftKey) redo();
      else undo();
      return;
    }

    if (modifier && event.key.toLowerCase() === "y") {
      event.preventDefault();
      redo();
      return;
    }

    if (event.key === "Delete" || event.key === "Backspace") {
      const selected = selectedIdGroups();
      if (!selected.total) return;
      event.preventDefault();
      pushHistory();
      deleteSelectedObjects(selected);
      render();
      queueSave();
      return;
    }

    const shortcut = event.key.toLowerCase();
    if (shortcut === "v") setTool("select");
    if (shortcut === "h") setTool("hand");
    if (shortcut === "n") setTool("note");
    if (shortcut === "t") setTool("text");
    if (shortcut === "l") setTool("connector");
    if (shortcut === "p") setTool("pen");
    if (shortcut === "e") setTool("eraser");
  }

  function onKeyUp(event) {
    if (event.key === " ") {
      spaceDown = false;
      document.body.classList.toggle("tool-hand", state.tool === "hand");
    }
  }

  function addNoteAt(world) {
    pushHistory();
    const note = {
      id: makeId("note"),
      x: world.x - 110,
      y: world.y - 70,
      w: 220,
      h: 158,
      text: "",
      color: NOTE_COLORS[state.notes.length % NOTE_COLORS.length],
      z: nextZ(),
    };
    state.notes.push(note);
    state.selectedNoteId = note.id;
    state.selectedTextId = null;
    state.selectedShapeId = null;
    state.selectedImageId = null;
    state.selectedConnectionId = null;
    clearMultiSelection();
    render();
    queueSave();
    focusNoteBody(note.id);
  }

  function addTextAt(world) {
    pushHistory();
    const text = {
      id: makeId("text"),
      x: world.x,
      y: world.y,
      w: 220,
      h: Math.ceil(state.textFontSize * 1.45),
      text: "",
      color: state.color,
      fontFamily: state.textFontFamily,
      fontSize: state.textFontSize,
      fontWeight: TEXT_REGULAR_WEIGHT,
      fontStyle: "normal",
      autoSize: true,
      z: nextZ(),
    };
    state.texts.push(text);
    state.selectedNoteId = null;
    state.selectedTextId = text.id;
    state.selectedShapeId = null;
    state.selectedImageId = null;
    state.selectedConnectionId = null;
    clearMultiSelection();
    render();
    queueSave();
    startTextEditing(text.id);
  }

  async function addImageFromFile(file, world = viewportCenterWorld()) {
    if (!isImageFile(file)) return false;
    try {
      const src = await readFileAsDataUrl(file);
      await addImageFromSource(src, world, file.name || "图片");
      return true;
    } catch (error) {
      console.error(error);
      window.alert("图片导入失败，请换一张图片再试。");
      return false;
    }
  }

  async function addImageFromSource(src, world, name = "图片") {
    const imageElement = await loadImageElement(src);
    const dimensions = fitImageDimensions(imageElement.naturalWidth || imageElement.width, imageElement.naturalHeight || imageElement.height);
    pushHistory();
    const image = {
      id: makeId("image"),
      x: world.x - dimensions.w / 2,
      y: world.y - dimensions.h / 2,
      w: dimensions.w,
      h: dimensions.h,
      src,
      name,
      z: nextZ(),
    };
    state.images.push(image);
    selectObject(image.id);
    render();
    queueSave();
  }

  function fitImageDimensions(width, height) {
    const safeWidth = Math.max(1, finiteOr(width, IMAGE_INITIAL_MAX_SIZE));
    const safeHeight = Math.max(1, finiteOr(height, IMAGE_INITIAL_MAX_SIZE));
    const scale = Math.min(1, IMAGE_INITIAL_MAX_SIZE / safeWidth, IMAGE_INITIAL_MAX_SIZE / safeHeight);
    return {
      w: clamp(Math.round(safeWidth * scale), IMAGE_MIN_SIZE, IMAGE_MAX_SIZE),
      h: clamp(Math.round(safeHeight * scale), IMAGE_MIN_SIZE, IMAGE_MAX_SIZE),
    };
  }

  function viewportCenterWorld() {
    const rect = viewport.getBoundingClientRect();
    return toWorld(rect.left + rect.width / 2, rect.top + rect.height / 2);
  }

  function readFileAsDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.addEventListener("load", () => resolve(String(reader.result || "")));
      reader.addEventListener("error", () => reject(reader.error || new Error("File read failed")));
      reader.readAsDataURL(file);
    });
  }

  function loadImageElement(src) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error("Image load failed"));
      image.src = src;
    });
  }

  function onPaste(event) {
    if (isEditingNote()) return;
    const file = imageFileFromClipboard(event.clipboardData);
    if (!file) return;
    event.preventDefault();
    addImageFromFile(file, pasteTargetWorld());
  }

  function imageFileFromClipboard(clipboardData) {
    if (!clipboardData) return null;
    const files = Array.from(clipboardData.files || []);
    const file = files.find(isImageFile);
    if (file) return file;

    const items = Array.from(clipboardData.items || []);
    const imageItem = items.find((item) => item.type && item.type.startsWith("image/"));
    return imageItem ? imageItem.getAsFile() : null;
  }

  function isImageFile(file) {
    if (!file) return false;
    if (file.type && file.type.startsWith("image/")) return true;
    return /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(file.name || "");
  }

  function rememberPointerPosition(event) {
    if (!Number.isFinite(event.clientX) || !Number.isFinite(event.clientY)) return;
    lastPointerClient = { x: event.clientX, y: event.clientY };
  }

  function pasteTargetWorld() {
    const rect = viewport.getBoundingClientRect();
    if (
      lastPointerClient &&
      lastPointerClient.x >= rect.left &&
      lastPointerClient.x <= rect.right &&
      lastPointerClient.y >= rect.top &&
      lastPointerClient.y <= rect.bottom
    ) {
      return toWorld(lastPointerClient.x, lastPointerClient.y);
    }
    return viewportCenterWorld();
  }

  function onImagePointerDown(event) {
    if (event.button === 1) {
      startPanFromPointer(event, noteLayer);
      return;
    }

    const imageElement = event.target.closest(".image-box");
    if (!imageElement) return;
    const image = findImage(imageElement.dataset.id);
    if (!image) return;
    finishTextEditing();

    if (
      state.tool === "select" &&
      isObjectSelectedForGroupMove(image.id) &&
      !event.target.closest(".image-delete, .image-resize-handle") &&
      startSelectionMove(event, noteLayer)
    ) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    selectObject(image.id);
    bringImageToFront(image);

    if (event.target.closest(".image-delete")) {
      render();
      return;
    }

    if (state.connectionDraft) {
      confirmConnectionToTarget(image);
      return;
    }

    if (state.tool === "connector") {
      handleConnectorObjectClick(image, toWorld(event.clientX, event.clientY));
      return;
    }

    const resizeHandle = event.target.closest(".image-resize-handle");
    if (resizeHandle) {
      pushHistory();
      noteLayer.setPointerCapture(event.pointerId);
      pointerMode = {
        type: "resize-image",
        pointerId: event.pointerId,
        imageId: image.id,
        startX: event.clientX,
        startY: event.clientY,
        startW: image.w,
        startH: image.h,
      };
      document.body.classList.add("is-dragging-note");
      render();
      return;
    }

    if (state.tool === "select") {
      pushHistory();
      const world = toWorld(event.clientX, event.clientY);
      noteLayer.setPointerCapture(event.pointerId);
      pointerMode = {
        type: "move-image",
        pointerId: event.pointerId,
        imageId: image.id,
        offsetX: world.x - image.x,
        offsetY: world.y - image.y,
      };
      document.body.classList.add("is-dragging-note");
    }

    render();
    queueSave();
  }

  function onImageClick(event) {
    const deleteButton = event.target.closest(".image-delete");
    if (!deleteButton) return;
    const imageElement = deleteButton.closest(".image-box");
    const image = imageElement && findImage(imageElement.dataset.id);
    if (!image) return;
    event.preventDefault();
    event.stopPropagation();
    pushHistory();
    deleteImage(image.id);
    render();
    queueSave();
  }

  function onTextPointerDown(event) {
    if (event.button === 1) {
      startPanFromPointer(event, noteLayer);
      return;
    }

    if (event.target.closest(".text-toolbar")) return;
    const textElement = event.target.closest(".text-box");
    if (!textElement) return;
    const text = findText(textElement.dataset.id);
    if (!text) return;
    const resizeHandle = event.target.closest(".text-resize-handle");

    if (editingTextId === text.id) {
      event.stopPropagation();
      return;
    }

    if (state.tool === "select" && isObjectSelectedForGroupMove(text.id) && !resizeHandle && startSelectionMove(event, noteLayer)) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    finishTextEditing();
    selectObject(text.id);
    bringTextToFront(text);

    if (state.connectionDraft) {
      confirmConnectionToTarget(text);
      return;
    }

    if (state.tool === "connector") {
      handleConnectorObjectClick(text, toWorld(event.clientX, event.clientY));
      return;
    }

    if (resizeHandle) {
      pushHistory();
      noteLayer.setPointerCapture(event.pointerId);
      pointerMode = {
        type: "resize-text",
        pointerId: event.pointerId,
        textId: text.id,
        startX: event.clientX,
        startY: event.clientY,
        startW: text.w,
        startH: text.h,
      };
      document.body.classList.add("is-dragging-note");
      render();
      return;
    }

    if (state.tool === "select") {
      pushHistory();
      noteLayer.setPointerCapture(event.pointerId);
      pointerMode = {
        type: "move-text",
        pointerId: event.pointerId,
        textId: text.id,
        startX: event.clientX,
        startY: event.clientY,
        startTextX: text.x,
        startTextY: text.y,
      };
      document.body.classList.add("is-dragging-note");
    }

    render();
    queueSave();
  }

  function onTextDoubleClick(event) {
    if (event.target.closest(".text-toolbar, .text-resize-handle")) return;
    const textElement = event.target.closest(".text-box");
    if (!textElement) return;
    const text = findText(textElement.dataset.id);
    if (!text) return;

    enterTextEditing(text, event);
  }

  function enterTextEditing(text, event) {
    event.preventDefault();
    event.stopPropagation();
    lastTextPointerClick = null;
    cancelPointerMode();
    cancelConnectionDraft();
    finishShapeTextEditing();
    selectObject(text.id);
    bringTextToFront(text);
    startTextEditing(text.id);
    render();
    queueSave();
  }

  function handleCompletedTextClick(mode, event) {
    if (!mode || mode.type !== "move-text") return false;

    const moved = Math.hypot(event.clientX - mode.startX, event.clientY - mode.startY);
    if (moved > TEXT_DOUBLE_CLICK_DISTANCE) {
      lastTextPointerClick = null;
      return false;
    }

    const now = event.timeStamp || performance.now();
    const previous = lastTextPointerClick;
    lastTextPointerClick = {
      id: mode.textId,
      time: now,
      x: event.clientX,
      y: event.clientY,
    };

    const isDoubleClick =
      previous &&
      previous.id === mode.textId &&
      now - previous.time <= TEXT_DOUBLE_CLICK_MS &&
      Math.hypot(event.clientX - previous.x, event.clientY - previous.y) <= TEXT_DOUBLE_CLICK_DISTANCE;

    if (!isDoubleClick) return false;
    const text = findText(mode.textId);
    if (!text) return false;
    enterTextEditing(text, event);
    return true;
  }

  function onTextInput(event) {
    const content = event.target.closest(".text-content");
    if (!content) return;
    const textElement = content.closest(".text-box");
    const text = textElement && findText(textElement.dataset.id);
    if (!text) return;
    text.text = content.innerText.replace(/\n$/, "");
    fitTextToContent(text, content);
    applyTextElementStyle(text, textElement);
    renderCanvas();
    renderConnectionHandles();
    renderTextToolbar();
    queueSave();
  }

  function onTextFocus(event) {
    const textElement = event.target.closest(".text-box");
    if (!textElement) return;
    const text = findText(textElement.dataset.id);
    if (!text) return;
    state.selectedNoteId = null;
    state.selectedTextId = text.id;
    state.selectedShapeId = null;
    state.selectedImageId = null;
    state.selectedConnectionId = null;
    clearMultiSelection();
    bringTextToFront(text);
    render();
    queueSave();
  }

  function onTextToolbarPointerDown(event) {
    event.stopPropagation();
    const text = getSelectedText();
    if (!text || !event.target.closest("[data-text-move]")) return;
    event.preventDefault();
    pushHistory();
    noteLayer.setPointerCapture(event.pointerId);
    pointerMode = {
      type: "move-text",
      pointerId: event.pointerId,
      textId: text.id,
      startX: event.clientX,
      startY: event.clientY,
      startTextX: text.x,
      startTextY: text.y,
    };
    document.body.classList.add("is-dragging-note");
  }

  function onTextToolbarInput(event) {
    const text = getSelectedText();
    if (!text) return;
    const target = event.target;
    let shouldFit = false;

    if (target.matches("[data-text-font]")) {
      text.fontFamily = normalizeFontFamily(target.value, text.fontFamily);
      state.textFontFamily = text.fontFamily;
      shouldFit = true;
    }

    if (target.matches("[data-text-size]")) {
      text.fontSize = clamp(finiteOr(target.value, text.fontSize), TEXT_MIN_FONT_SIZE, TEXT_MAX_FONT_SIZE);
      state.textFontSize = text.fontSize;
      shouldFit = true;
    }

    if (target.matches("[data-text-color]")) {
      text.color = normalizeColor(target.value, text.color);
      state.color = text.color;
    }

    if (shouldFit) fitVisibleTextToContent(text);
    render();
    queueSave();
  }

  function onTextToolbarClick(event) {
    const text = getSelectedText();
    if (!text) return;
    const deleteButton = event.target.closest("[data-text-delete]");
    const boldButton = event.target.closest("[data-text-bold]");
    const italicButton = event.target.closest("[data-text-italic]");

    if (deleteButton) {
      pushHistory();
      deleteText(text.id);
      render();
      queueSave();
      return;
    }

    if (boldButton) {
      text.fontWeight = text.fontWeight === TEXT_BOLD_WEIGHT ? TEXT_REGULAR_WEIGHT : TEXT_BOLD_WEIGHT;
      fitVisibleTextToContent(text);
      render();
      queueSave();
      return;
    }

    if (italicButton) {
      text.fontStyle = text.fontStyle === "italic" ? "normal" : "italic";
      fitVisibleTextToContent(text);
      render();
      queueSave();
    }
  }

  function updateDraftShape(shape, startX, startY, point, lockRatio = false) {
    let dx = point.x - startX;
    let dy = point.y - startY;

    if (lockRatio) {
      const side = Math.max(Math.abs(dx), Math.abs(dy), 1);
      dx = side * Math.sign(dx || 1);
      dy = side * Math.sign(dy || 1);
    }

    shape.x = Math.min(startX, startX + dx);
    shape.y = Math.min(startY, startY + dy);
    shape.w = Math.max(1, Math.abs(dx));
    shape.h = Math.max(1, Math.abs(dy));
  }

  function handleConnectorNoteClick(note, worldPoint = null) {
    handleConnectorObjectClick(note, worldPoint);
  }

  function handleConnectorObjectClick(object, worldPoint = null) {
    if (!state.pendingConnectionNoteId) {
      state.pendingConnectionNoteId = object.id;
      selectObject(object.id);
      render();
      return;
    }

    if (state.pendingConnectionNoteId === object.id) {
      state.pendingConnectionNoteId = null;
      render();
      return;
    }

    const fromObject = findConnectable(state.pendingConnectionNoteId);
    const targetWorldPoint = worldPoint || noteCenter(object);
    const sourceToward = noteCenter(object);
    const startSnap = fromObject ? snappedSideAnchor(fromObject, sourceToward) : null;
    const startPoint = startSnap ? startSnap.point : null;
    const endSnap = snappedSideAnchor(object, (startSnap && startSnap.point) || targetWorldPoint);

    pushHistory();
    state.connections.push({
      id: makeId("connection"),
      from: state.pendingConnectionNoteId,
      to: object.id,
      fromSide: startSnap ? startSnap.side : null,
      toSide: endSnap ? endSnap.side : null,
      fromAnchor: fromObject && startPoint ? pointToAnchor(fromObject, startPoint) : null,
      toAnchor: endSnap && endSnap.point ? pointToAnchor(object, endSnap.point) : null,
      fromMarker: state.lineStartMarker,
      toMarker: state.lineEndMarker,
      mode: state.lineMode,
      color: state.color,
      size: Math.max(2, Math.round(state.strokeSize * 0.55)),
    });
    state.pendingConnectionNoteId = null;
    selectObject(object.id);
    render();
    queueSave();
  }

  function startConnectionFromHandle(noteId, side, event) {
    const object = findConnectable(noteId);
    const normalizedSide = normalizeSide(side) || "e";
    if (!object) return;
    const startPoint = sidePoint(object, normalizedSide);

    state.connectionDraft = {
      from: object.id,
      fromSide: normalizedSide,
      fromAnchor: pointToAnchor(object, startPoint),
      current: toWorld(event.clientX, event.clientY),
      hoverNoteId: null,
      fromMarker: state.lineStartMarker,
      toMarker: state.lineEndMarker,
      mode: state.lineMode,
      color: state.color,
      size: Math.max(2, Math.round(state.strokeSize * 0.55)),
    };
    state.pendingConnectionNoteId = object.id;
    selectObject(object.id);
    render();
  }

  function updateConnectionDraft(event) {
    const draft = state.connectionDraft;
    if (!draft) return;
    const targetObject = connectableAtClient(event.clientX, event.clientY, draft.from);
    draft.current = toWorld(event.clientX, event.clientY);
    const nextHoverId = targetObject ? targetObject.id : null;
    const hoverChanged = draft.hoverNoteId !== nextHoverId;
    draft.hoverNoteId = nextHoverId;
    renderCanvas();
    if (hoverChanged) renderNotes();
  }

  function confirmConnectionToNote(note) {
    confirmConnectionToTarget(note);
  }

  function confirmConnectionToTarget(object) {
    const draft = state.connectionDraft;
    if (!draft) return;

    if (object.id === draft.from) {
      cancelConnectionDraft();
      render();
      return;
    }

    const fromObject = findConnectable(draft.from);
    const startPoint =
      (fromObject && resolveObjectAnchor(fromObject, draft.fromAnchor)) ||
      (fromObject && sidePoint(fromObject, draft.fromSide)) ||
      null;
    const endSnap = snappedSideAnchor(object, draft.current || startPoint || noteCenter(object));

    pushHistory();
    state.connections.push({
      id: makeId("connection"),
      from: draft.from,
      to: object.id,
      fromSide: draft.fromSide,
      toSide: endSnap ? endSnap.side : null,
      fromAnchor: fromObject && startPoint ? pointToAnchor(fromObject, startPoint) : normalizeAnchor(draft.fromAnchor),
      toAnchor: endSnap && endSnap.point ? pointToAnchor(object, endSnap.point) : null,
      fromMarker: normalizeMarker(draft.fromMarker, state.lineStartMarker),
      toMarker: normalizeMarker(draft.toMarker, state.lineEndMarker),
      mode: draft.mode,
      color: draft.color,
      size: draft.size,
    });
    selectObject(object.id);
    cancelConnectionDraft();
    render();
    queueSave();
  }

  function cancelConnectionDraft() {
    state.connectionDraft = null;
    state.pendingConnectionNoteId = null;
  }

  function noteAtClient(clientX, clientY, excludeId = null) {
    return connectableAtClient(clientX, clientY, excludeId);
  }

  function connectableAtClient(clientX, clientY, excludeId = null) {
    const world = toWorld(clientX, clientY);
    return [...state.notes, ...state.texts, ...state.images, ...state.shapes]
      .sort((a, b) => finiteOr(b.z, 0) - finiteOr(a.z, 0))
      .find((object) => {
        if (object.id === excludeId) return false;
        if (isShapeObject(object)) {
          return shapeHitTest(object, world, Math.max(6, 10 / state.camera.scale));
        }
        const rect = objectScreenRect(object);
        return clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom;
      });
  }

  function eraseAt(world) {
    const threshold = Math.max(8, 15 / state.camera.scale);
    const beforeShapeCount = state.shapes.length;
    const beforeStrokeCount = state.strokes.length;
    const beforeConnectionCount = state.connections.length;
    const removedShapeIds = new Set(state.shapes.filter((shape) => shapeHitTest(shape, world, threshold)).map((shape) => shape.id));
    const removedStrokeIds = new Set(state.strokes.filter((stroke) => strokeHitTest(stroke, world, threshold)).map((stroke) => stroke.id));
    const removedConnectionIds = new Set(state.connections.filter((connection) => connectionHitTest(connection, world, threshold)).map((connection) => connection.id));
    state.shapes = state.shapes.filter((shape) => !removedShapeIds.has(shape.id));
    state.strokes = state.strokes.filter((stroke) => !removedStrokeIds.has(stroke.id));
    state.connections = state.connections.filter((connection) => !removedConnectionIds.has(connection.id));
    if (removedStrokeIds.size) state.selectedStrokeIds = state.selectedStrokeIds.filter((id) => !removedStrokeIds.has(id));
    if (removedConnectionIds.has(state.selectedConnectionId)) state.selectedConnectionId = null;
    if (removedShapeIds.size) {
      state.connections = state.connections.filter((connection) => !removedShapeIds.has(connection.from) && !removedShapeIds.has(connection.to));
      if (removedShapeIds.has(state.selectedShapeId)) state.selectedShapeId = null;
      state.selectedShapeIds = state.selectedShapeIds.filter((id) => !removedShapeIds.has(id));
      if (removedShapeIds.has(state.pendingConnectionNoteId) || removedShapeIds.has(state.connectionDraft?.from) || removedShapeIds.has(state.connectionDraft?.hoverNoteId)) {
        cancelConnectionDraft();
      }
    }
    if (
      state.shapes.length !== beforeShapeCount ||
      state.strokes.length !== beforeStrokeCount ||
      state.connections.length !== beforeConnectionCount
    ) {
      renderCanvas();
      queueSave();
    }
  }

  function strokeHitTest(stroke, point, threshold) {
    const points = stroke.points;
    if (points.length === 1) return distance(points[0], point) <= threshold + stroke.size / 2;
    for (let index = 1; index < points.length; index += 1) {
      const distanceToStroke = distanceToSegment(point, points[index - 1], points[index]);
      if (distanceToStroke <= threshold + stroke.size / 2) return true;
    }
    return false;
  }

  function strokeAtWorld(point) {
    const threshold = Math.max(6, 10 / state.camera.scale);
    for (let index = state.strokes.length - 1; index >= 0; index -= 1) {
      const stroke = state.strokes[index];
      if (strokeHitTest(stroke, point, threshold)) return stroke;
    }
    return null;
  }

  function shapeHitTest(shape, point, threshold) {
    if (shape.type === "ellipse") {
      const rx = shape.w / 2 + threshold;
      const ry = shape.h / 2 + threshold;
      const cx = shape.x + shape.w / 2;
      const cy = shape.y + shape.h / 2;
      if (rx <= 0 || ry <= 0) return false;
      return ((point.x - cx) ** 2) / (rx ** 2) + ((point.y - cy) ** 2) / (ry ** 2) <= 1;
    }

    const points = shapePolygon(shape);
    if (!points.length) {
      return (
        point.x >= shape.x - threshold &&
        point.x <= shape.x + shape.w + threshold &&
        point.y >= shape.y - threshold &&
        point.y <= shape.y + shape.h + threshold
      );
    }

    if (pointInPolygon(point, points)) return true;
    for (let index = 0; index < points.length; index += 1) {
      const a = points[index];
      const b = points[(index + 1) % points.length];
      if (distanceToSegment(point, a, b) <= threshold) return true;
    }
    return false;
  }

  function shapeAtWorld(point, excludeId = null) {
    return state.shapes
      .map((shape, index) => ({ shape, index }))
      .sort((a, b) => finiteOr(b.shape.z, 0) - finiteOr(a.shape.z, 0) || b.index - a.index)
      .map((item) => item.shape)
      .find((shape) => shape.id !== excludeId && shapeHitTest(shape, point, Math.max(6, 10 / state.camera.scale)));
  }

  function shapePolygon(shape) {
    const x = shape.x;
    const y = shape.y;
    const w = shape.w;
    const h = shape.h;
    const cx = x + w / 2;
    const cy = y + h / 2;

    if (shape.type === "diamond") {
      return [
        { x: cx, y },
        { x: x + w, y: cy },
        { x: cx, y: y + h },
        { x, y: cy },
      ];
    }

    if (shape.type === "triangle") {
      return [
        { x: cx, y },
        { x: x + w, y: y + h },
        { x, y: y + h },
      ];
    }

    return [
      { x, y },
      { x: x + w, y },
      { x: x + w, y: y + h },
      { x, y: y + h },
    ];
  }

  function connectionHitTest(connection, point, threshold) {
    const fromObject = findConnectable(connection.from);
    const toObject = findConnectable(connection.to);
    if (!fromObject || !toObject) return false;
    const geometry = connectionGeometry(connection, fromObject, toObject);
    if (!geometry) return false;
    const hitDistance = threshold + CONNECTION_HIT_PAD + connection.size / 2;

    if (connection.mode !== "curve") {
      return distanceToSegment(point, geometry.start, geometry.end) <= hitDistance;
    }

    if (distanceToSegment(point, geometry.start, geometry.end) <= hitDistance) return true;

    let previous = geometry.start;
    for (let step = 1; step <= 28; step += 1) {
      const current = cubicPoint(geometry.start, geometry.control1, geometry.control2, geometry.end, step / 28);
      if (distanceToSegment(point, previous, current) <= hitDistance) return true;
      previous = current;
    }
    return false;
  }

  function connectionAtWorld(point) {
    const threshold = Math.max(6, 10 / state.camera.scale);
    for (let index = state.connections.length - 1; index >= 0; index -= 1) {
      const connection = state.connections[index];
      if (connectionHitTest(connection, point, threshold)) return connection;
    }
    return null;
  }

  function render() {
    renderCanvas();
    renderNotes();
    renderControls();
  }

  function resizeCanvas() {
    const rect = viewport.getBoundingClientRect();
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    viewWidth = Math.max(1, Math.floor(rect.width));
    viewHeight = Math.max(1, Math.floor(rect.height));
    canvas.width = Math.floor(viewWidth * dpr);
    canvas.height = Math.floor(viewHeight * dpr);
    canvas.style.width = `${viewWidth}px`;
    canvas.style.height = `${viewHeight}px`;
    positionColorPanel();
    positionShapeStrip();
    positionLineMarkerMenu("from");
    positionLineMarkerMenu("to");
    render();
  }

  function renderCanvas() {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, viewWidth, viewHeight);
    ctx.fillStyle = "#f5f7f8";
    ctx.fillRect(0, 0, viewWidth, viewHeight);
    drawGrid();

    ctx.save();
    ctx.scale(state.camera.scale, state.camera.scale);
    ctx.translate(-state.camera.x, -state.camera.y);
    for (const connection of state.connections) {
      drawConnection(connection);
    }
    drawConnectionDraft();
    for (const shape of [...state.shapes].sort((a, b) => finiteOr(a.z, 0) - finiteOr(b.z, 0))) {
      drawShape(shape);
    }
    for (const stroke of state.strokes) {
      drawStroke(stroke);
    }
    ctx.restore();
    renderShapeTextEditor();
  }

  function drawGrid() {
    const scale = state.camera.scale;
    const small = 40;
    const large = small * 5;
    const left = state.camera.x;
    const top = state.camera.y;
    const right = left + viewWidth / scale;
    const bottom = top + viewHeight / scale;
    const startX = Math.floor(left / small) * small;
    const startY = Math.floor(top / small) * small;

    ctx.save();
    ctx.lineWidth = 1;

    for (let x = startX; x <= right; x += small) {
      const screenX = Math.round((x - left) * scale) + 0.5;
      const isLarge = Math.abs(x % large) < 0.1;
      ctx.strokeStyle = isLarge ? "rgba(80, 102, 116, 0.16)" : "rgba(80, 102, 116, 0.08)";
      ctx.beginPath();
      ctx.moveTo(screenX, 0);
      ctx.lineTo(screenX, viewHeight);
      ctx.stroke();
    }

    for (let y = startY; y <= bottom; y += small) {
      const screenY = Math.round((y - top) * scale) + 0.5;
      const isLarge = Math.abs(y % large) < 0.1;
      ctx.strokeStyle = isLarge ? "rgba(80, 102, 116, 0.16)" : "rgba(80, 102, 116, 0.08)";
      ctx.beginPath();
      ctx.moveTo(0, screenY);
      ctx.lineTo(viewWidth, screenY);
      ctx.stroke();
    }

    ctx.restore();
  }

  function drawStroke(stroke) {
    const points = stroke.points;
    if (state.selectedStrokeIds.includes(stroke.id)) drawSelectedStrokeOutline(stroke);

    ctx.strokeStyle = stroke.color;
    ctx.fillStyle = stroke.color;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.lineWidth = stroke.size;

    if (points.length === 1) {
      ctx.beginPath();
      ctx.arc(points[0].x, points[0].y, stroke.size / 2, 0, Math.PI * 2);
      ctx.fill();
      return;
    }

    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (let index = 1; index < points.length; index += 1) {
      const previous = points[index - 1];
      const current = points[index];
      const midX = (previous.x + current.x) / 2;
      const midY = (previous.y + current.y) / 2;
      ctx.quadraticCurveTo(previous.x, previous.y, midX, midY);
    }
    const last = points[points.length - 1];
    ctx.lineTo(last.x, last.y);
    ctx.stroke();
  }

  function drawSelectedStrokeOutline(stroke) {
    const points = stroke.points;
    ctx.save();
    ctx.strokeStyle = "rgba(15, 118, 110, 0.3)";
    ctx.fillStyle = "rgba(15, 118, 110, 0.3)";
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.lineWidth = stroke.size + 10;

    if (points.length === 1) {
      ctx.beginPath();
      ctx.arc(points[0].x, points[0].y, Math.max(6, stroke.size / 2 + 5), 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      return;
    }

    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (let index = 1; index < points.length; index += 1) {
      const previous = points[index - 1];
      const current = points[index];
      const midX = (previous.x + current.x) / 2;
      const midY = (previous.y + current.y) / 2;
      ctx.quadraticCurveTo(previous.x, previous.y, midX, midY);
    }
    const last = points[points.length - 1];
    ctx.lineTo(last.x, last.y);
    ctx.stroke();
    ctx.restore();
  }

  function drawShape(shape) {
    const outlineKind =
      shape.id === state.connectionDraft?.hoverNoteId
        ? "target"
        : shape.id === state.pendingConnectionNoteId || shape.id === state.connectionDraft?.from
          ? "source"
          : shape.id === state.selectedShapeId || state.selectedShapeIds.includes(shape.id)
            ? "selected"
            : null;

    ctx.save();
    ctx.strokeStyle = shape.color;
    ctx.fillStyle = colorWithAlpha(shape.color, 0.14);
    ctx.lineWidth = shape.size;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    drawShapePath(shape);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
    if (shape.id !== editingShapeTextId) drawShapeText(shape);
    if (outlineKind) drawSelectedShapeOutline(shape, outlineKind);
  }

  function drawShapeText(shape) {
    if (!shape.text) return;
    const maxWidth = Math.max(12, shape.w - SHAPE_TEXT_PADDING * 2);
    const maxHeight = Math.max(12, shape.h - SHAPE_TEXT_PADDING * 2);
    const fontSize = Math.min(SHAPE_TEXT_FONT_SIZE, Math.max(11, Math.floor(maxHeight * 0.38)));
    const lineHeight = Math.round(fontSize * 1.35);
    const lines = wrapCanvasText(shape.text, maxWidth, fontSize);
    const maxLines = Math.max(1, Math.floor(maxHeight / lineHeight));
    const visibleLines = lines.slice(0, maxLines);
    if (lines.length > maxLines) {
      visibleLines[visibleLines.length - 1] = ellipsizeCanvasText(visibleLines[visibleLines.length - 1], maxWidth, fontSize);
    }

    ctx.save();
    ctx.font = `${TEXT_REGULAR_WEIGHT} ${fontSize}px "Microsoft YaHei", "PingFang SC", "Segoe UI", sans-serif`;
    ctx.fillStyle = "#17202a";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const centerX = shape.x + shape.w / 2;
    const startY = shape.y + shape.h / 2 - ((visibleLines.length - 1) * lineHeight) / 2;
    visibleLines.forEach((line, index) => {
      ctx.fillText(line, centerX, startY + index * lineHeight);
    });
    ctx.restore();
  }

  function wrapCanvasText(text, maxWidth, fontSize) {
    ctx.save();
    ctx.font = `${TEXT_REGULAR_WEIGHT} ${fontSize}px "Microsoft YaHei", "PingFang SC", "Segoe UI", sans-serif`;
    const lines = [];
    const paragraphs = String(text).split(/\r?\n/);
    for (const paragraph of paragraphs) {
      if (!paragraph) {
        lines.push("");
        continue;
      }
      let line = "";
      for (const char of Array.from(paragraph)) {
        const nextLine = line + char;
        if (line && ctx.measureText(nextLine).width > maxWidth) {
          lines.push(line);
          line = char;
        } else {
          line = nextLine;
        }
      }
      lines.push(line);
    }
    ctx.restore();
    return lines.length ? lines : [""];
  }

  function ellipsizeCanvasText(text, maxWidth, fontSize) {
    ctx.save();
    ctx.font = `${TEXT_REGULAR_WEIGHT} ${fontSize}px "Microsoft YaHei", "PingFang SC", "Segoe UI", sans-serif`;
    let nextText = text || "";
    while (nextText && ctx.measureText(`${nextText}...`).width > maxWidth) {
      nextText = nextText.slice(0, -1);
    }
    ctx.restore();
    return `${nextText}...`;
  }

  function drawSelectedShapeOutline(shape, kind = "selected") {
    const color = kind === "target" ? "#2563eb" : kind === "source" ? "#0284c7" : "#0f766e";
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = Math.max(2, shape.size + 2);
    ctx.setLineDash([10, 7]);
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    drawShapePath(shape);
    ctx.stroke();
    ctx.setLineDash([]);
    if (kind === "selected") drawShapeResizeHandles(shape, color);
    ctx.restore();
  }

  function drawShapeResizeHandles(shape, color) {
    const size = SHAPE_RESIZE_HANDLE_SIZE / state.camera.scale;
    ctx.save();
    ctx.fillStyle = "#fff";
    ctx.strokeStyle = color;
    ctx.lineWidth = Math.max(1.5 / state.camera.scale, 0.75);
    for (const handle of shapeResizeHandles(shape)) {
      ctx.beginPath();
      ctx.rect(handle.x - size / 2, handle.y - size / 2, size, size);
      ctx.fill();
      ctx.stroke();
    }
    ctx.restore();
  }

  function shapeResizeHandles(shape) {
    const left = shape.x;
    const top = shape.y;
    const right = shape.x + shape.w;
    const bottom = shape.y + shape.h;
    const centerX = shape.x + shape.w / 2;
    const centerY = shape.y + shape.h / 2;
    return [
      { direction: "nw", x: left, y: top },
      { direction: "n", x: centerX, y: top },
      { direction: "ne", x: right, y: top },
      { direction: "e", x: right, y: centerY },
      { direction: "se", x: right, y: bottom },
      { direction: "s", x: centerX, y: bottom },
      { direction: "sw", x: left, y: bottom },
      { direction: "w", x: left, y: centerY },
    ];
  }

  function shapeResizeHandleAtWorld(shape, point) {
    if (!shape) return null;
    const threshold = Math.max(8 / state.camera.scale, 4);
    const hit = shapeResizeHandles(shape).find((handle) => Math.abs(point.x - handle.x) <= threshold && Math.abs(point.y - handle.y) <= threshold);
    return hit ? hit.direction : null;
  }

  function drawShapePath(shape) {
    const x = shape.x;
    const y = shape.y;
    const w = shape.w;
    const h = shape.h;
    const cx = x + w / 2;
    const cy = y + h / 2;

    ctx.beginPath();
    if (shape.type === "ellipse") {
      ctx.ellipse(cx, cy, w / 2, h / 2, 0, 0, Math.PI * 2);
      return;
    }

    if (shape.type === "diamond") {
      ctx.moveTo(cx, y);
      ctx.lineTo(x + w, cy);
      ctx.lineTo(cx, y + h);
      ctx.lineTo(x, cy);
      ctx.closePath();
      return;
    }

    if (shape.type === "triangle") {
      ctx.moveTo(cx, y);
      ctx.lineTo(x + w, y + h);
      ctx.lineTo(x, y + h);
      ctx.closePath();
      return;
    }

    ctx.rect(x, y, w, h);
  }

  function drawConnection(connection) {
    const fromObject = findConnectable(connection.from);
    const toObject = findConnectable(connection.to);
    if (!fromObject || !toObject) return;

    const geometry = connectionGeometry(connection, fromObject, toObject);
    if (!geometry) return;

    ctx.save();
    ctx.shadowColor = "rgba(15, 23, 42, 0.16)";
    ctx.shadowBlur = connection.id === state.selectedConnectionId ? 12 : 6;
    if (connection.id === state.selectedConnectionId) drawSelectedConnectionOutline(geometry, connection);
    drawConnectionUnderlay(geometry, connection, connection.id === state.selectedConnectionId ? 0.16 : 0.1, connection.size + 6);
    strokeConnectionPath(geometry, connection);
    ctx.shadowBlur = 0;
    drawConnectionEndpointMarker(geometry, connection, "from");
    drawConnectionEndpointMarker(geometry, connection, "to");
    ctx.restore();
  }

  function drawSelectedConnectionOutline(geometry, connection) {
    ctx.save();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = colorWithAlpha(connection.color, 0.16);
    ctx.lineWidth = connection.size + 12;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    traceConnectionPath(geometry, connection.mode);
    ctx.stroke();

    ctx.strokeStyle = "#0f766e";
    ctx.lineWidth = Math.max(2.5, connection.size + 2.5);
    ctx.setLineDash([12, 8]);
    traceConnectionPath(geometry, connection.mode);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  }

  function drawConnectionDraft() {
    const draft = state.connectionDraft;
    if (!draft) return;
    const fromObject = findConnectable(draft.from);
    if (!fromObject) return;
    const targetObject = draft.hoverNoteId ? findConnectable(draft.hoverNoteId) : null;
    const start = resolveObjectAnchor(fromObject, draft.fromAnchor) || sidePoint(fromObject, draft.fromSide);
    const endSnap = targetObject ? snappedSideAnchor(targetObject, draft.current || start) : null;
    const end = endSnap ? endSnap.point : draft.current;
    const targetSide = endSnap ? endSnap.side : null;
    const geometry = connectionPathGeometry(start, end, draft.mode, draft.fromSide, targetSide);

    ctx.save();
    drawConnectionUnderlay(geometry, draft, 0.16, draft.size + 8);
    ctx.setLineDash([12, 8]);
    ctx.globalAlpha = 0.94;
    strokeConnectionPath(geometry, draft);
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
    drawConnectionEndpointMarker(geometry, draft, "from");
    drawConnectionEndpointMarker(geometry, draft, "to");
    if (targetObject) drawConnectionTargetHalo(end, draft);
    ctx.restore();
  }

  function drawConnectionUnderlay(geometry, connection, alpha, width) {
    ctx.save();
    ctx.strokeStyle = colorWithAlpha(connection.color, alpha);
    ctx.lineWidth = width;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    traceConnectionPath(geometry, connection.mode);
    ctx.stroke();
    ctx.restore();
  }

  function strokeConnectionPath(geometry, connection) {
    ctx.strokeStyle = connection.color;
    ctx.lineWidth = Math.max(2, connection.size);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    traceConnectionPath(geometry, connection.mode);
    ctx.stroke();
  }

  function traceConnectionPath(geometry, mode) {
    ctx.beginPath();
    ctx.moveTo(geometry.start.x, geometry.start.y);

    if (mode === "curve") {
      ctx.bezierCurveTo(
        geometry.control1.x,
        geometry.control1.y,
        geometry.control2.x,
        geometry.control2.y,
        geometry.end.x,
        geometry.end.y,
      );
    } else {
      ctx.lineTo(geometry.end.x, geometry.end.y);
    }
  }

  function drawConnectionEndpointMarker(geometry, connection, target) {
    const marker = normalizeMarker(
      target === "from" ? connection.fromMarker : connection.toMarker,
      target === "from" ? state.lineStartMarker : state.lineEndMarker,
    );
    if (marker === "none") return;

    const point = target === "from" ? geometry.start : geometry.end;
    const baseAngle = connectionEndpointAngle(geometry, connection.mode, target);
    const angle = target === "from" ? baseAngle + Math.PI : baseAngle;
    const length = Math.max(10, connection.size * 4);
    const halfWidth = Math.max(4, connection.size * 1.45);
    const strokeWidth = Math.max(1.75, connection.size * 0.85);

    ctx.save();
    ctx.translate(point.x, point.y);
    ctx.rotate(angle);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.lineWidth = strokeWidth;
    ctx.strokeStyle = connection.color;
    ctx.fillStyle = connection.color;

    if (marker === "dot") {
      ctx.beginPath();
      ctx.arc(0, 0, Math.max(3.5, connection.size * 0.8), 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      return;
    }

    if (marker === "circle") {
      ctx.fillStyle = "#ffffff";
      ctx.beginPath();
      ctx.arc(0, 0, Math.max(4.4, connection.size * 0.95), 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
      return;
    }

    if (marker === "bar") {
      ctx.beginPath();
      ctx.moveTo(0, -halfWidth);
      ctx.lineTo(0, halfWidth);
      ctx.stroke();
      ctx.restore();
      return;
    }

    if (marker === "diamond") {
      ctx.fillStyle = "#ffffff";
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(-length * 0.48, halfWidth);
      ctx.lineTo(-length, 0);
      ctx.lineTo(-length * 0.48, -halfWidth);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.restore();
      return;
    }

    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(-length, halfWidth);
    ctx.lineTo(-length * 0.72, 0);
    ctx.lineTo(-length, -halfWidth);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  function drawConnectionTargetHalo(point, connection) {
    ctx.save();
    ctx.strokeStyle = colorWithAlpha(connection.color, 0.32);
    ctx.lineWidth = Math.max(2, connection.size * 0.75);
    ctx.beginPath();
    ctx.arc(point.x, point.y, Math.max(9, connection.size * 2.8), 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  function connectionEndpointAngle(geometry, mode, target) {
    if (mode === "curve" && geometry.control1 && geometry.control2) {
      if (target === "from") {
        return Math.atan2(geometry.control1.y - geometry.start.y, geometry.control1.x - geometry.start.x);
      }
      return Math.atan2(geometry.end.y - geometry.control2.y, geometry.end.x - geometry.control2.x);
    }
    return Math.atan2(geometry.end.y - geometry.start.y, geometry.end.x - geometry.start.x);
  }

  function connectionGeometry(connection, fromNote, toNote) {
    const fromCenter = noteCenter(fromNote);
    const fromAnchor = resolveObjectAnchor(fromNote, connection.fromAnchor);
    const toAnchor = resolveObjectAnchor(toNote, connection.toAnchor);
    const fromSide = fromAnchor && !normalizeSide(connection.fromSide) ? null : resolveConnectionSide(connection.fromSide, connection.fromAnchor);
    const toSide = toAnchor && !normalizeSide(connection.toSide) ? null : resolveConnectionSide(connection.toSide, connection.toAnchor);
    const start =
      fromAnchor ||
      (fromSide ? sidePoint(fromNote, fromSide) : null) ||
      edgePoint(fromNote, noteCenter(toNote));
    const end =
      toAnchor ||
      (toSide ? sidePoint(toNote, toSide) : null) ||
      edgePoint(toNote, start || fromCenter);
    if (!start || !end) return null;
    return connectionPathGeometry(start, end, connection.mode, fromSide, toSide);
  }

  function connectionPathGeometry(start, end, mode, fromSide = null, toSide = null) {
    if (mode !== "curve") {
      return { start, end };
    }

    const startVector = sideVector(fromSide);
    const endVector = sideVector(toSide);
    if (startVector && endVector) {
      const distance = Math.hypot(end.x - start.x, end.y - start.y);
      const offset = clamp(distance * 0.35, 56, 220);
      return {
        start,
        end,
        control1: {
          x: start.x + startVector.x * offset,
          y: start.y + startVector.y * offset,
        },
        control2: {
          x: end.x + endVector.x * offset,
          y: end.y + endVector.y * offset,
        },
      };
    }

    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const horizontal = Math.abs(dx) >= Math.abs(dy);
    const offset = clamp((horizontal ? Math.abs(dx) : Math.abs(dy)) * 0.45, 64, 240);
    const sign = horizontal ? Math.sign(dx || 1) : Math.sign(dy || 1);
    const control1 = horizontal ? { x: start.x + offset * sign, y: start.y } : { x: start.x, y: start.y + offset * sign };
    const control2 = horizontal ? { x: end.x - offset * sign, y: end.y } : { x: end.x, y: end.y - offset * sign };
    return { start, end, control1, control2 };
  }

  function noteCenter(note) {
    return {
      x: note.x + note.w / 2,
      y: note.y + note.h / 2,
    };
  }

  function sidePoint(note, side) {
    const center = noteCenter(note);
    if (side === "n") return { x: center.x, y: note.y };
    if (side === "e") return { x: note.x + note.w, y: center.y };
    if (side === "s") return { x: center.x, y: note.y + note.h };
    if (side === "w") return { x: note.x, y: center.y };
    return center;
  }

  function pointToAnchor(object, point) {
    if (!object || !point) return null;
    const width = Math.max(1, object.w);
    const height = Math.max(1, object.h);
    return {
      x: clamp((point.x - object.x) / width, 0, 1),
      y: clamp((point.y - object.y) / height, 0, 1),
    };
  }

  function pointSide(object, point) {
    return resolveConnectionSide(null, pointToAnchor(object, point));
  }

  function snappedSideAnchor(object, toward) {
    if (!object) return null;
    const edge = edgePoint(object, toward || noteCenter(object));
    if (!edge) return null;
    const side = pointSide(object, edge);
    return {
      side,
      point: side ? sidePoint(object, side) : edge,
    };
  }

  function resolveConnectionSide(side, anchor) {
    const normalizedSide = normalizeSide(side);
    if (normalizedSide) return normalizedSide;
    const normalizedAnchor = normalizeAnchor(anchor);
    if (!normalizedAnchor) return null;
    const distances = [
      { side: "n", distance: normalizedAnchor.y },
      { side: "e", distance: 1 - normalizedAnchor.x },
      { side: "s", distance: 1 - normalizedAnchor.y },
      { side: "w", distance: normalizedAnchor.x },
    ];
    distances.sort((left, right) => left.distance - right.distance);
    return distances[0] ? distances[0].side : null;
  }

  function sideVector(side) {
    if (side === "n") return { x: 0, y: -1 };
    if (side === "e") return { x: 1, y: 0 };
    if (side === "s") return { x: 0, y: 1 };
    if (side === "w") return { x: -1, y: 0 };
    return null;
  }

  function resolveObjectAnchor(object, anchor) {
    const normalizedAnchor = normalizeAnchor(anchor);
    if (!object || !normalizedAnchor) return null;
    return {
      x: object.x + object.w * normalizedAnchor.x,
      y: object.y + object.h * normalizedAnchor.y,
    };
  }

  function noteScreenRect(note) {
    return objectScreenRect(note);
  }

  function objectScreenRect(object) {
    const left = (object.x - state.camera.x) * state.camera.scale;
    const top = (object.y - state.camera.y) * state.camera.scale;
    const width = object.w * state.camera.scale;
    const height = object.h * state.camera.scale;
    return {
      left,
      top,
      right: left + width,
      bottom: top + height,
      width,
      height,
    };
  }

  function startShapeTextEditing(shapeId) {
    const shape = findShape(shapeId);
    if (!shape) return;
    if (editingShapeTextId && editingShapeTextId !== shape.id) finishShapeTextEditing();
    editingShapeTextId = shape.id;
    shapeTextEditHasHistory = false;
    const editor = getShapeTextEditor();
    editor.dataset.shapeId = shape.id;
    editor.value = shape.text || "";
    editor.hidden = false;
    if (editor.parentElement !== noteLayer) noteLayer.appendChild(editor);
    renderShapeTextEditor();
    requestAnimationFrame(() => {
      editor.focus({ preventScroll: true });
      editor.setSelectionRange(editor.value.length, editor.value.length);
    });
  }

  function getShapeTextEditor() {
    if (shapeTextEditor) return shapeTextEditor;
    const editor = document.createElement("textarea");
    editor.className = "shape-text-editor";
    editor.spellcheck = false;
    editor.setAttribute("aria-label", "图形文字");
    editor.addEventListener("pointerdown", (event) => event.stopPropagation());
    editor.addEventListener("dblclick", (event) => event.stopPropagation());
    editor.addEventListener("input", onShapeTextEditorInput);
    editor.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        finishShapeTextEditing();
      }
    });
    editor.addEventListener("blur", () => {
      window.setTimeout(() => {
        if (document.activeElement !== editor) finishShapeTextEditing();
      }, 0);
    });
    shapeTextEditor = editor;
    return editor;
  }

  function onShapeTextEditorInput(event) {
    const editor = event.target;
    const shape = findShape(editor.dataset.shapeId);
    if (!shape) return;
    if (!shapeTextEditHasHistory) {
      pushHistory();
      shapeTextEditHasHistory = true;
    }
    shape.text = editor.value.replace(/\n$/, "");
    renderCanvas();
    queueSave();
  }

  function finishShapeTextEditing() {
    if (!editingShapeTextId && !shapeTextEditor) return;
    const editor = shapeTextEditor;
    const shape = editor && findShape(editor.dataset.shapeId);
    if (shape && editor) {
      const nextText = editor.value.replace(/\n$/, "");
      if (shape.text !== nextText) {
        if (!shapeTextEditHasHistory) pushHistory();
        shape.text = nextText;
        queueSave();
      }
    }
    editingShapeTextId = null;
    shapeTextEditHasHistory = false;
    if (editor) {
      editor.hidden = true;
      editor.dataset.shapeId = "";
    }
    renderCanvas();
  }

  function hideShapeTextEditor() {
    editingShapeTextId = null;
    shapeTextEditHasHistory = false;
    if (shapeTextEditor) {
      shapeTextEditor.hidden = true;
      shapeTextEditor.dataset.shapeId = "";
    }
  }

  function renderShapeTextEditor() {
    if (!editingShapeTextId || !shapeTextEditor) return;
    const shape = findShape(editingShapeTextId);
    if (!shape) {
      finishShapeTextEditing();
      return;
    }
    const rect = objectScreenRect(shape);
    shapeTextEditor.style.width = `${shape.w}px`;
    shapeTextEditor.style.height = `${shape.h}px`;
    shapeTextEditor.style.transform = `translate(${rect.left}px, ${rect.top}px) scale(${state.camera.scale})`;
    shapeTextEditor.style.zIndex = "100002";
  }

  function edgePoint(note, toward) {
    const center = noteCenter(note);
    const dx = toward.x - center.x;
    const dy = toward.y - center.y;
    if (dx === 0 && dy === 0) return center;
    const halfW = note.w / 2;
    const halfH = note.h / 2;
    const tx = dx === 0 ? Infinity : halfW / Math.abs(dx);
    const ty = dy === 0 ? Infinity : halfH / Math.abs(dy);
    const t = Math.min(tx, ty);
    return {
      x: center.x + dx * t,
      y: center.y + dy * t,
    };
  }

  function renderNotes() {
    const visibleIds = new Set();
    const selected = selectedIdGroups();
    const groupMovable = canMoveSelectionAsGroup(selected);

    for (const note of state.notes) {
      visibleIds.add(note.id);
      let element = noteElements.get(note.id);
      if (!element) {
        element = createNoteElement(note);
        noteElements.set(note.id, element);
      }
      if (element.parentElement !== noteLayer) noteLayer.appendChild(element);

      const x = (note.x - state.camera.x) * state.camera.scale;
      const y = (note.y - state.camera.y) * state.camera.scale;
      element.style.width = `${note.w}px`;
      element.style.height = `${note.h}px`;
      element.style.setProperty("--note-bg", note.color);
      element.style.transform = `translate(${x}px, ${y}px) scale(${state.camera.scale})`;
      element.style.zIndex = String(note.z);
      const isSelected = selected.noteIds.has(note.id);
      element.classList.toggle("is-selected", isSelected);
      element.classList.toggle("is-group-movable", groupMovable && isSelected);
      element.classList.toggle("is-link-source", note.id === state.pendingConnectionNoteId || note.id === state.connectionDraft?.from);
      element.classList.toggle("is-connect-target", note.id === state.connectionDraft?.hoverNoteId);
      element.dataset.id = note.id;

      const body = element.querySelector(".note-body");
      if (document.activeElement !== body && body.value !== note.text) {
        body.value = note.text;
      }
      const keepBottom = Boolean(
        pointerMode &&
          pointerMode.type === "resize-note" &&
          pointerMode.noteId === note.id &&
          pointerMode.direction.includes("n"),
      );
      if (fitNoteToContent(note, body, keepBottom)) {
        const adjustedX = (note.x - state.camera.x) * state.camera.scale;
        const adjustedY = (note.y - state.camera.y) * state.camera.scale;
        element.style.height = `${note.h}px`;
        element.style.transform = `translate(${adjustedX}px, ${adjustedY}px) scale(${state.camera.scale})`;
        renderCanvas();
        queueSave();
      }
    }

    for (const [id, element] of noteElements.entries()) {
      if (visibleIds.has(id)) continue;
      element.remove();
      noteElements.delete(id);
    }

    renderTexts();
    renderImages();
    renderConnectionHandles();
    renderTextToolbar();
  }

  function renderTexts() {
    const visibleIds = new Set();
    const selected = selectedIdGroups();
    const groupMovable = canMoveSelectionAsGroup(selected);

    for (const text of state.texts) {
      visibleIds.add(text.id);
      let element = textElements.get(text.id);
      if (!element) {
        element = createTextElement(text);
        textElements.set(text.id, element);
      }
      if (element.parentElement !== noteLayer) noteLayer.appendChild(element);
      applyTextElementStyle(text, element);

      const isSelected = selected.textIds.has(text.id);
      const isEditing = editingTextId === text.id;
      element.classList.toggle("is-selected", isSelected);
      element.classList.toggle("is-editing", isEditing);
      element.classList.toggle("is-group-movable", groupMovable && isSelected);
      element.classList.toggle("is-link-source", text.id === state.pendingConnectionNoteId || text.id === state.connectionDraft?.from);
      element.classList.toggle("is-connect-target", text.id === state.connectionDraft?.hoverNoteId);
      element.dataset.id = text.id;

      const content = element.querySelector(".text-content");
      if (content) content.setAttribute("contenteditable", isEditing ? "plaintext-only" : "false");
      if (!isEditing && document.activeElement !== content && content.innerText !== text.text) {
        content.textContent = text.text;
      }
      if (!isEditing && textNeedsFit(content)) {
        fitTextToContent(text, content);
        applyTextElementStyle(text, element);
        queueSave();
      }
    }

    for (const [id, element] of textElements.entries()) {
      if (visibleIds.has(id)) continue;
      element.remove();
      textElements.delete(id);
    }
  }

  function renderImages() {
    const visibleIds = new Set();
    const selected = selectedIdGroups();
    const groupMovable = canMoveSelectionAsGroup(selected);

    for (const image of state.images) {
      visibleIds.add(image.id);
      let element = imageElements.get(image.id);
      if (!element) {
        element = createImageElement(image);
        imageElements.set(image.id, element);
      }
      if (element.parentElement !== noteLayer) noteLayer.appendChild(element);
      applyImageElementStyle(image, element);

      const isSelected = selected.imageIds.has(image.id);
      element.classList.toggle("is-selected", isSelected);
      element.classList.toggle("is-group-movable", groupMovable && isSelected);
      element.classList.toggle("is-link-source", image.id === state.pendingConnectionNoteId || image.id === state.connectionDraft?.from);
      element.classList.toggle("is-connect-target", image.id === state.connectionDraft?.hoverNoteId);
      element.dataset.id = image.id;

      const img = element.querySelector("img");
      if (img && img.src !== image.src) img.src = image.src;
      if (img) img.alt = image.name || "图片";
    }

    for (const [id, element] of imageElements.entries()) {
      if (visibleIds.has(id)) continue;
      element.remove();
      imageElements.delete(id);
    }
  }

  function applyTextElementStyle(text, element) {
    const x = (text.x - state.camera.x) * state.camera.scale;
    const y = (text.y - state.camera.y) * state.camera.scale;
    element.style.width = `${text.w}px`;
    element.style.height = `${text.h}px`;
    element.style.setProperty("--text-color", text.color);
    element.style.setProperty("--text-font", text.fontFamily);
    element.style.setProperty("--text-size", `${text.fontSize}px`);
    element.style.setProperty("--text-weight", text.fontWeight);
    element.style.setProperty("--text-style", text.fontStyle);
    element.style.transform = `translate(${x}px, ${y}px) scale(${state.camera.scale})`;
    element.style.zIndex = String(text.z);
  }

  function applyImageElementStyle(image, element) {
    const x = (image.x - state.camera.x) * state.camera.scale;
    const y = (image.y - state.camera.y) * state.camera.scale;
    element.style.width = `${image.w}px`;
    element.style.height = `${image.h}px`;
    element.style.transform = `translate(${x}px, ${y}px) scale(${state.camera.scale})`;
    element.style.zIndex = String(image.z);
  }

  function createTextElement(text) {
    const element = document.createElement("article");
    element.className = "text-box";
    element.dataset.id = text.id;
    element.innerHTML = `
      <div class="text-content" contenteditable="false" spellcheck="false" role="textbox" aria-label="文本"></div>
      <div class="text-resize-handle" aria-hidden="true"></div>
    `;
    const content = element.querySelector(".text-content");
    content.textContent = text.text;
    content.addEventListener("blur", () => {
      window.setTimeout(() => {
        if (editingTextId === text.id && document.activeElement !== content) finishTextEditing();
      }, 0);
    });
    return element;
  }

  function createImageElement(image) {
    const element = document.createElement("article");
    element.className = "image-box";
    element.dataset.id = image.id;
    element.innerHTML = `
      <img draggable="false" alt="" />
      <button class="image-delete" type="button" aria-label="删除图片">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M4 7h16"></path>
          <path d="M10 11v6"></path>
          <path d="M14 11v6"></path>
          <path d="M6 7l1 14h10l1-14"></path>
          <path d="M9 7V4h6v3"></path>
        </svg>
      </button>
      <div class="image-resize-handle" aria-hidden="true"></div>
    `;
    const img = element.querySelector("img");
    img.src = image.src;
    img.alt = image.name || "图片";
    return element;
  }

  function renderTextToolbar() {
    const text = getSelectedText();
    if (!text || pointerMode || state.connectionDraft) {
      textToolbar.hidden = true;
      return;
    }

    const rect = objectScreenRect(text);
    const toolbarWidth = textToolbar.offsetWidth || 360;
    const left = clamp(rect.left + rect.width / 2 - toolbarWidth / 2, 8, Math.max(8, viewWidth - toolbarWidth - 8));
    const top = Math.max(76, rect.top - 48);
    textToolbar.style.left = `${left}px`;
    textToolbar.style.top = `${top}px`;
    textToolbar.hidden = false;

    const fontSelect = textToolbar.querySelector("[data-text-font]");
    const sizeInput = textToolbar.querySelector("[data-text-size]");
    const colorInput = textToolbar.querySelector("[data-text-color]");
    const boldButton = textToolbar.querySelector("[data-text-bold]");
    const italicButton = textToolbar.querySelector("[data-text-italic]");
    if (fontSelect) fontSelect.value = text.fontFamily;
    if (sizeInput) sizeInput.value = String(Math.round(text.fontSize));
    if (colorInput) colorInput.value = text.color;
    if (boldButton) boldButton.classList.toggle("is-active", text.fontWeight === TEXT_BOLD_WEIGHT);
    if (italicButton) italicButton.classList.toggle("is-active", text.fontStyle === "italic");
  }

  function renderConnectionHandles() {
    connectionHandleLayer.innerHTML = "";
    if (pointerMode || state.connectionDraft || editingTextId) return;
    const object = getSelectedConnectable();
    if (!object) return;

    const rect = objectScreenRect(object);
    const positions = {
      n: { x: rect.left + rect.width / 2, y: rect.top - CONNECTION_HANDLE_OFFSET },
      e: { x: rect.right + CONNECTION_HANDLE_OFFSET, y: rect.top + rect.height / 2 },
      s: { x: rect.left + rect.width / 2, y: rect.bottom + CONNECTION_HANDLE_OFFSET },
      w: { x: rect.left - CONNECTION_HANDLE_OFFSET, y: rect.top + rect.height / 2 },
    };

    for (const [side, position] of Object.entries(positions)) {
      const button = document.createElement("button");
      button.className = `note-connect-handle note-connect-${side}`;
      button.type = "button";
      button.dataset.noteId = object.id;
      button.dataset.side = side;
      button.setAttribute("aria-label", "创建连接");
      button.textContent = "+";
      button.style.left = `${position.x}px`;
      button.style.top = `${position.y}px`;
      connectionHandleLayer.appendChild(button);
    }

    if (connectionHandleLayer.parentElement !== noteLayer) noteLayer.appendChild(connectionHandleLayer);
  }

  function createNoteElement(note) {
    const element = document.createElement("article");
    element.className = "note";
    element.dataset.id = note.id;
    element.innerHTML = `
      <div class="note-grip">
        <span class="note-dots" aria-hidden="true"><span></span><span></span><span></span></span>
        <button class="note-delete" type="button" aria-label="删除便签">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12"></path><path d="M18 6L6 18"></path></svg>
        </button>
      </div>
      <textarea class="note-body" spellcheck="false" placeholder="写点什么"></textarea>
      <div class="note-resize-handle note-resize-n" data-resize="n" aria-hidden="true"></div>
      <div class="note-resize-handle note-resize-e" data-resize="e" aria-hidden="true"></div>
      <div class="note-resize-handle note-resize-s" data-resize="s" aria-hidden="true"></div>
      <div class="note-resize-handle note-resize-w" data-resize="w" aria-hidden="true"></div>
      <div class="note-resize-handle note-resize-ne" data-resize="ne" aria-hidden="true"></div>
      <div class="note-resize-handle note-resize-se" data-resize="se" aria-hidden="true"></div>
      <div class="note-resize-handle note-resize-sw" data-resize="sw" aria-hidden="true"></div>
      <div class="note-resize-handle note-resize-nw" data-resize="nw" aria-hidden="true"></div>
    `;
    return element;
  }

  function resizeNote(note, mode, event) {
    const dx = (event.clientX - mode.startX) / state.camera.scale;
    const dy = (event.clientY - mode.startY) / state.camera.scale;
    const direction = mode.direction || "se";

    if (direction.includes("e")) {
      note.w = clamp(mode.startW + dx, NOTE_MIN_WIDTH, NOTE_MAX_WIDTH);
    }

    if (direction.includes("s")) {
      note.h = clamp(mode.startH + dy, NOTE_MIN_HEIGHT, NOTE_MAX_HEIGHT);
    }

    if (direction.includes("w")) {
      note.w = clamp(mode.startW - dx, NOTE_MIN_WIDTH, NOTE_MAX_WIDTH);
      note.x = mode.startNoteX + mode.startW - note.w;
    }

    if (direction.includes("n")) {
      note.h = clamp(mode.startH - dy, NOTE_MIN_HEIGHT, NOTE_MAX_HEIGHT);
      note.y = mode.startNoteY + mode.startH - note.h;
    }
  }

  function resizeImage(image, mode, event) {
    const dx = (event.clientX - mode.startX) / state.camera.scale;
    const dy = (event.clientY - mode.startY) / state.camera.scale;
    let nextWidth = clamp(mode.startW + dx, IMAGE_MIN_SIZE, IMAGE_MAX_SIZE);
    let nextHeight = clamp(mode.startH + dy, IMAGE_MIN_SIZE, IMAGE_MAX_SIZE);

    if (!event.shiftKey) {
      const ratio = mode.startW / Math.max(1, mode.startH);
      if (Math.abs(dx) >= Math.abs(dy)) {
        nextHeight = clamp(nextWidth / ratio, IMAGE_MIN_SIZE, IMAGE_MAX_SIZE);
      } else {
        nextWidth = clamp(nextHeight * ratio, IMAGE_MIN_SIZE, IMAGE_MAX_SIZE);
      }
    }

    image.w = nextWidth;
    image.h = nextHeight;
  }

  function resizeShape(shape, mode, event) {
    const dx = (event.clientX - mode.startX) / state.camera.scale;
    const dy = (event.clientY - mode.startY) / state.camera.scale;
    const direction = mode.direction || "se";
    let nextX = mode.startShapeX;
    let nextY = mode.startShapeY;
    let nextW = mode.startW;
    let nextH = mode.startH;

    if (direction.includes("e")) nextW = mode.startW + dx;
    if (direction.includes("s")) nextH = mode.startH + dy;
    if (direction.includes("w")) {
      nextW = mode.startW - dx;
      nextX = mode.startShapeX + dx;
    }
    if (direction.includes("n")) {
      nextH = mode.startH - dy;
      nextY = mode.startShapeY + dy;
    }

    if (nextW < MIN_SHAPE_SIZE) {
      if (direction.includes("w")) nextX = mode.startShapeX + mode.startW - MIN_SHAPE_SIZE;
      nextW = MIN_SHAPE_SIZE;
    }
    if (nextH < MIN_SHAPE_SIZE) {
      if (direction.includes("n")) nextY = mode.startShapeY + mode.startH - MIN_SHAPE_SIZE;
      nextH = MIN_SHAPE_SIZE;
    }

    if (event.shiftKey) {
      const side = Math.max(nextW, nextH);
      if (direction.includes("w")) nextX = mode.startShapeX + mode.startW - side;
      if (direction.includes("n")) nextY = mode.startShapeY + mode.startH - side;
      nextW = side;
      nextH = side;
    }

    shape.x = nextX;
    shape.y = nextY;
    shape.w = clamp(nextW, MIN_SHAPE_SIZE, 2400);
    shape.h = clamp(nextH, MIN_SHAPE_SIZE, 2400);
  }

  function fitNoteToContent(note, body, keepBottom = false) {
    if (!body) return false;
    if (!body.value) return false;
    const desiredHeight = clamp(Math.ceil(measureNoteBodyContentHeight(body) + NOTE_HEADER_HEIGHT + 8), NOTE_MIN_HEIGHT, NOTE_MAX_HEIGHT);
    if (desiredHeight <= note.h + 1) return false;
    if (keepBottom) note.y -= desiredHeight - note.h;
    note.h = desiredHeight;
    return true;
  }

  function measureNoteBodyContentHeight(body) {
    const previousHeight = body.style.height;
    const previousMinHeight = body.style.minHeight;
    body.style.height = "0px";
    body.style.minHeight = "0px";
    const contentHeight = body.scrollHeight;
    body.style.height = previousHeight;
    body.style.minHeight = previousMinHeight;
    return contentHeight;
  }

  function focusNoteBody(noteId) {
    const focus = () => {
      const element = noteElements.get(noteId);
      const body = element && element.querySelector(".note-body");
      if (!body) return;
      body.focus({ preventScroll: true });
      body.setSelectionRange(body.value.length, body.value.length);
    };
    requestAnimationFrame(focus);
    window.setTimeout(focus, 80);
  }

  function focusTextContent(textId) {
    const focus = () => {
      const element = textElements.get(textId);
      const content = element && element.querySelector(".text-content");
      if (!content) return;
      content.setAttribute("contenteditable", "plaintext-only");
      content.focus({ preventScroll: true });
      const range = document.createRange();
      range.selectNodeContents(content);
      range.collapse(false);
      const selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
    };
    requestAnimationFrame(focus);
    window.setTimeout(focus, 80);
  }

  function startTextEditing(textId) {
    const text = findText(textId);
    if (!text) return;
    if (editingTextId && editingTextId !== text.id) finishTextEditing();
    editingTextId = text.id;
    selectObject(text.id);
    renderTexts();
    renderConnectionHandles();
    renderTextToolbar();
    focusTextContent(text.id);
  }

  function finishTextEditing() {
    if (!editingTextId) return;
    const text = findText(editingTextId);
    const element = text && textElements.get(text.id);
    const content = element && element.querySelector(".text-content");
    if (text && content) {
      const nextText = content.innerText.replace(/\n$/, "");
      if (text.text !== nextText) {
        text.text = nextText;
        queueSave();
      }
      fitTextToContent(text, content);
      content.setAttribute("contenteditable", "false");
    }
    editingTextId = null;
    renderTexts();
    renderConnectionHandles();
    renderTextToolbar();
    renderCanvas();
  }

  function fitTextToContent(text, content) {
    if (!content) return;
    const measure = document.createElement("div");
    measure.className = "text-content";
    measure.textContent = text.text || TEXT_PLACEHOLDER;
    measure.setAttribute("aria-hidden", "true");
    measure.style.position = "fixed";
    measure.style.left = "-10000px";
    measure.style.top = "-10000px";
    measure.style.display = "inline-block";
    measure.style.height = "auto";
    measure.style.minHeight = "0";
    measure.style.width = "max-content";
    measure.style.maxWidth = `${TEXT_MAX_WIDTH}px`;
    measure.style.visibility = "hidden";
    measure.style.pointerEvents = "none";
    measure.style.setProperty("--text-color", text.color);
    measure.style.setProperty("--text-font", text.fontFamily);
    measure.style.setProperty("--text-size", `${text.fontSize}px`);
    measure.style.setProperty("--text-weight", text.fontWeight);
    measure.style.setProperty("--text-style", text.fontStyle);
    document.body.appendChild(measure);
    const preserveWidth = text.autoSize === false;
    const width = preserveWidth
      ? clamp(text.w, TEXT_MIN_WIDTH, TEXT_MAX_WIDTH)
      : clamp(Math.ceil(Math.max(measure.getBoundingClientRect().width, measure.scrollWidth, text.w) + 2), TEXT_MIN_WIDTH, TEXT_MAX_WIDTH);
    measure.style.width = `${width}px`;
    const measuredHeight = clamp(Math.ceil(measure.scrollHeight + 2), TEXT_MIN_HEIGHT, TEXT_MAX_HEIGHT);
    const height = preserveWidth ? Math.max(text.h, measuredHeight) : measuredHeight;
    measure.remove();
    text.w = width;
    text.h = height;
  }

  function textNeedsFit(content) {
    if (!content) return false;
    return content.scrollHeight > content.clientHeight + 1 || content.scrollWidth > content.clientWidth + 1;
  }

  function fitVisibleTextToContent(text) {
    const element = textElements.get(text.id);
    const content = element && element.querySelector(".text-content");
    if (content) fitTextToContent(text, content);
  }

  function resizeText(text, mode, event) {
    const dx = (event.clientX - mode.startX) / state.camera.scale;
    const dy = (event.clientY - mode.startY) / state.camera.scale;
    text.w = clamp(mode.startW + dx, TEXT_MIN_WIDTH, TEXT_MAX_WIDTH);
    text.h = clamp(mode.startH + dy, TEXT_MIN_HEIGHT, TEXT_MAX_HEIGHT);
    text.autoSize = false;
  }

  function updateSelectionMarquee(mode) {
    const viewportRect = viewport.getBoundingClientRect();
    const left = Math.min(mode.startClientX, mode.currentClientX) - viewportRect.left;
    const top = Math.min(mode.startClientY, mode.currentClientY) - viewportRect.top;
    const width = Math.abs(mode.currentClientX - mode.startClientX);
    const height = Math.abs(mode.currentClientY - mode.startClientY);
    selectionMarquee.hidden = false;
    selectionMarquee.style.left = `${left}px`;
    selectionMarquee.style.top = `${top}px`;
    selectionMarquee.style.width = `${width}px`;
    selectionMarquee.style.height = `${height}px`;
  }

  function applyBoxSelection(mode) {
    const rect = normalizedWorldRect(mode.startWorld, mode.currentWorld);
    const noteIds = state.notes.filter((note) => objectFullyInsideRect(note, rect)).map((note) => note.id);
    const textIds = state.texts.filter((text) => objectFullyInsideRect(text, rect)).map((text) => text.id);
    const imageIds = state.images.filter((image) => objectFullyInsideRect(image, rect)).map((image) => image.id);
    const shapeIds = state.shapes.filter((shape) => objectFullyInsideRect(shape, rect)).map((shape) => shape.id);
    const strokeIds = state.strokes.filter((stroke) => strokeFullyInsideRect(stroke, rect)).map((stroke) => stroke.id);
    applyMultiSelection(noteIds, textIds, shapeIds, imageIds, strokeIds);
  }

  function normalizedWorldRect(a, b) {
    const left = Math.min(a.x, b.x);
    const top = Math.min(a.y, b.y);
    const right = Math.max(a.x, b.x);
    const bottom = Math.max(a.y, b.y);
    return { left, top, right, bottom };
  }

  function objectFullyInsideRect(object, rect) {
    return object.x >= rect.left && object.y >= rect.top && object.x + object.w <= rect.right && object.y + object.h <= rect.bottom;
  }

  function strokeFullyInsideRect(stroke, rect) {
    const bounds = strokeBounds(stroke);
    return bounds ? objectFullyInsideRect(bounds, rect) : false;
  }

  function strokeBounds(stroke) {
    if (!stroke || !stroke.points || !stroke.points.length) return null;
    const padding = Math.max(1, finiteOr(stroke.size, 1) / 2);
    let left = Infinity;
    let top = Infinity;
    let right = -Infinity;
    let bottom = -Infinity;

    for (const point of stroke.points) {
      left = Math.min(left, point.x - padding);
      top = Math.min(top, point.y - padding);
      right = Math.max(right, point.x + padding);
      bottom = Math.max(bottom, point.y + padding);
    }

    if (!Number.isFinite(left) || !Number.isFinite(top) || !Number.isFinite(right) || !Number.isFinite(bottom)) return null;
    return { x: left, y: top, w: right - left, h: bottom - top };
  }

  function selectedObjectCount(selected = selectedIdGroups()) {
    return selected.noteIds.size + selected.textIds.size + selected.shapeIds.size + selected.imageIds.size + selected.strokeIds.size;
  }

  function canMoveSelectionAsGroup(selected = selectedIdGroups()) {
    return state.tool === "select" && (selectedObjectCount(selected) > 1 || selected.strokeIds.size > 0) && !state.connectionDraft;
  }

  function isObjectSelectedForGroupMove(id, selected = selectedIdGroups()) {
    return canMoveSelectionAsGroup(selected) && (selected.noteIds.has(id) || selected.textIds.has(id) || selected.shapeIds.has(id) || selected.imageIds.has(id));
  }

  function isStrokeSelectedForGroupMove(id, selected = selectedIdGroups()) {
    return canMoveSelectionAsGroup(selected) && selected.strokeIds.has(id);
  }

  function startSelectionMove(event, captureTarget) {
    const selected = selectedIdGroups();
    if (!canMoveSelectionAsGroup(selected)) return false;
    const start = toWorld(event.clientX, event.clientY);
    const items = [
      ...[...selected.noteIds].map((id) => ({ object: findNote(id), type: "note" })),
      ...[...selected.textIds].map((id) => ({ object: findText(id), type: "text" })),
      ...[...selected.shapeIds].map((id) => ({ object: findShape(id), type: "shape" })),
      ...[...selected.imageIds].map((id) => ({ object: findImage(id), type: "image" })),
      ...[...selected.strokeIds].map((id) => ({ object: findStroke(id), type: "stroke" })),
    ]
      .filter((item) => item.object)
      .map((item) => ({
        type: item.type,
        id: item.object.id,
        startX: item.object.x,
        startY: item.object.y,
        points: item.type === "stroke" ? item.object.points.map((point) => ({ x: point.x, y: point.y })) : null,
      }));

    if (!items.length) return false;
    event.preventDefault();
    event.stopPropagation();
    pushHistory();
    if (captureTarget && captureTarget.setPointerCapture) captureTarget.setPointerCapture(event.pointerId);
    pointerMode = {
      type: "move-selection",
      pointerId: event.pointerId,
      startX: start.x,
      startY: start.y,
      items,
    };
    document.body.classList.remove("is-selection-hover");
    document.body.classList.add("is-dragging-note");
    render();
    return true;
  }

  function moveSelection(mode, event) {
    const world = toWorld(event.clientX, event.clientY);
    const dx = world.x - mode.startX;
    const dy = world.y - mode.startY;

    for (const item of mode.items) {
      if (item.type === "stroke") {
        const stroke = findStroke(item.id);
        if (!stroke || !item.points) continue;
        stroke.points = item.points.map((point) => ({ x: point.x + dx, y: point.y + dy }));
        continue;
      }

      const object = item.type === "note" ? findNote(item.id) : item.type === "text" ? findText(item.id) : item.type === "image" ? findImage(item.id) : findShape(item.id);
      if (!object) continue;
      object.x = item.startX + dx;
      object.y = item.startY + dy;
    }

    renderNotes();
    renderCanvas();
    queueSave();
  }

  function applyMultiSelection(noteIds, textIds, shapeIds, imageIds = [], strokeIds = []) {
    state.selectedNoteIds = noteIds;
    state.selectedTextIds = textIds;
    state.selectedShapeIds = shapeIds;
    state.selectedImageIds = imageIds;
    state.selectedStrokeIds = strokeIds;
    const total = noteIds.length + textIds.length + shapeIds.length + imageIds.length + strokeIds.length;
    state.selectedNoteId = total === 1 && noteIds.length === 1 ? noteIds[0] : null;
    state.selectedTextId = total === 1 && textIds.length === 1 ? textIds[0] : null;
    state.selectedShapeId = total === 1 && shapeIds.length === 1 ? shapeIds[0] : null;
    state.selectedImageId = total === 1 && imageIds.length === 1 ? imageIds[0] : null;
    state.selectedConnectionId = null;
  }

  function clearMultiSelection() {
    state.selectedNoteIds = [];
    state.selectedTextIds = [];
    state.selectedShapeIds = [];
    state.selectedImageIds = [];
    state.selectedStrokeIds = [];
  }

  function clearSelection() {
    state.selectedNoteId = null;
    state.selectedTextId = null;
    state.selectedShapeId = null;
    state.selectedImageId = null;
    state.selectedConnectionId = null;
    document.body.classList.remove("is-selection-hover");
    clearMultiSelection();
  }

  function selectedIdGroups() {
    const noteIds = new Set(state.selectedNoteIds);
    const textIds = new Set(state.selectedTextIds);
    const shapeIds = new Set(state.selectedShapeIds);
    const imageIds = new Set(state.selectedImageIds);
    const strokeIds = new Set(state.selectedStrokeIds);
    const connectionIds = new Set();
    if (state.selectedNoteId) noteIds.add(state.selectedNoteId);
    if (state.selectedTextId) textIds.add(state.selectedTextId);
    if (state.selectedShapeId) shapeIds.add(state.selectedShapeId);
    if (state.selectedImageId) imageIds.add(state.selectedImageId);
    if (state.selectedConnectionId) connectionIds.add(state.selectedConnectionId);
    return {
      noteIds,
      textIds,
      shapeIds,
      imageIds,
      strokeIds,
      connectionIds,
      total: noteIds.size + textIds.size + shapeIds.size + imageIds.size + strokeIds.size + connectionIds.size,
    };
  }

  function deleteSelectedObjects(selected = selectedIdGroups()) {
    if (!selected.total) return;
    const connectableIds = new Set([...selected.noteIds, ...selected.textIds, ...selected.shapeIds, ...selected.imageIds]);
    const connectionIds = selected.connectionIds || new Set();
    const strokeIds = selected.strokeIds || new Set();
    state.notes = state.notes.filter((note) => !selected.noteIds.has(note.id));
    state.texts = state.texts.filter((text) => !selected.textIds.has(text.id));
    state.shapes = state.shapes.filter((shape) => !selected.shapeIds.has(shape.id));
    state.images = state.images.filter((image) => !selected.imageIds.has(image.id));
    state.strokes = state.strokes.filter((stroke) => !strokeIds.has(stroke.id));
    state.connections = state.connections.filter(
      (connection) => !connectionIds.has(connection.id) && !connectableIds.has(connection.from) && !connectableIds.has(connection.to),
    );
    if (connectableIds.has(state.pendingConnectionNoteId) || connectableIds.has(state.connectionDraft?.from) || connectableIds.has(state.connectionDraft?.hoverNoteId)) {
      cancelConnectionDraft();
    }
    clearSelection();
  }

  function toWorld(clientX, clientY) {
    const rect = viewport.getBoundingClientRect();
    return {
      x: (clientX - rect.left) / state.camera.scale + state.camera.x,
      y: (clientY - rect.top) / state.camera.scale + state.camera.y,
    };
  }

  function applyHistoryAction(action) {
    if (action === "undo-5") undoSteps(5);
    else if (action === "undo-all") undoSteps(undoStack.length);
    else if (action === "redo-1") redoSteps(1);
    else if (action === "redo-5") redoSteps(5);
    else if (action === "redo-all") redoSteps(redoStack.length);
    else undoSteps(1);
    setHistoryMenuOpen(false);
  }

  function normalizeHistorySteps(stack, stepCount) {
    if (!stack.length) return 0;
    const numericStepCount = Math.floor(finiteOr(stepCount, 1));
    return clamp(numericStepCount || 1, 1, stack.length);
  }

  function pushHistory() {
    undoStack.push(snapshot());
    if (undoStack.length > 160) undoStack.shift();
    redoStack.length = 0;
  }

  function snapshot() {
    return JSON.stringify({
      camera: state.camera,
      color: state.color,
      strokeSize: state.strokeSize,
      textFontFamily: state.textFontFamily,
      textFontSize: state.textFontSize,
      lineMode: state.lineMode,
      lineStartMarker: state.lineStartMarker,
      lineEndMarker: state.lineEndMarker,
      shapeType: state.shapeType,
      shapes: state.shapes,
      strokes: state.strokes,
      connections: state.connections,
      notes: state.notes,
      texts: state.texts,
      images: state.images,
    });
  }

  function restore(snapshotValue) {
    try {
      const data = JSON.parse(snapshotValue);
      state.camera = normalizeCamera(data.camera || {});
      state.color = normalizeColor(data.color, state.color);
      state.strokeSize = clamp(finiteOr(data.strokeSize, state.strokeSize), 2, 36);
      state.textFontFamily = normalizeFontFamily(data.textFontFamily, state.textFontFamily);
      state.textFontSize = clamp(finiteOr(data.textFontSize, state.textFontSize), TEXT_MIN_FONT_SIZE, TEXT_MAX_FONT_SIZE);
      state.lineMode = data.lineMode === "curve" ? "curve" : "straight";
      state.lineStartMarker = normalizeMarker(data.lineStartMarker, state.lineStartMarker);
      state.lineEndMarker = normalizeMarker(data.lineEndMarker, state.lineEndMarker);
      state.shapeType = SHAPE_TYPES.includes(data.shapeType) ? data.shapeType : "rect";
      state.shapes = Array.isArray(data.shapes) ? data.shapes.map(normalizeShape).filter(Boolean) : [];
      state.strokes = Array.isArray(data.strokes) ? data.strokes.map(normalizeStroke).filter(Boolean) : [];
      state.connections = Array.isArray(data.connections) ? data.connections.map(normalizeConnection).filter(Boolean) : [];
      state.notes = Array.isArray(data.notes) ? data.notes.map(normalizeNote).filter(Boolean) : [];
      state.texts = Array.isArray(data.texts) ? data.texts.map(normalizeText).filter(Boolean) : [];
      state.images = Array.isArray(data.images) ? data.images.map(normalizeImage).filter(Boolean) : [];
      hideShapeTextEditor();
      clearSelection();
      state.pendingConnectionNoteId = null;
      state.connectionDraft = null;
      render();
      saveNow();
    } catch {
      return false;
    }
    return true;
  }

  function undo() {
    undoSteps(1);
  }

  function redo() {
    redoSteps(1);
  }

  function undoSteps(stepCount = 1) {
    finishTextEditing();
    finishShapeTextEditing();
    const steps = normalizeHistorySteps(undoStack, stepCount);
    if (!steps) return;
    const previousSnapshots = [];
    while (previousSnapshots.length < steps && undoStack.length) previousSnapshots.push(undoStack.pop());
    const currentSnapshot = snapshot();
    previousSnapshots.forEach((snapshotValue, index) => {
      redoStack.push(index === 0 ? currentSnapshot : previousSnapshots[index - 1]);
      if (redoStack.length > 160) redoStack.shift();
    });
    restore(previousSnapshots[previousSnapshots.length - 1]);
  }

  function redoSteps(stepCount = 1) {
    finishTextEditing();
    finishShapeTextEditing();
    const steps = normalizeHistorySteps(redoStack, stepCount);
    if (!steps) return;
    const nextSnapshots = [];
    while (nextSnapshots.length < steps && redoStack.length) nextSnapshots.push(redoStack.pop());
    const currentSnapshot = snapshot();
    nextSnapshots.forEach((snapshotValue, index) => {
      undoStack.push(index === 0 ? currentSnapshot : nextSnapshots[index - 1]);
      if (undoStack.length > 160) undoStack.shift();
    });
    restore(nextSnapshots[nextSnapshots.length - 1]);
  }

  function queueSave() {
    window.clearTimeout(saveTimer);
    saveTimer = window.setTimeout(saveNow, 160);
  }

  function saveNow() {
    try {
      localStorage.setItem(STORAGE_KEY, snapshot());
    } catch {
      return false;
    }
    return true;
  }

  async function exportBoard(format = "json") {
    finishTextEditing();
    finishShapeTextEditing();
    setExportMenuOpen(false);
    const exportFormat = ["json", "png", "pdf"].includes(format) ? format : "json";
    try {
      const target = await getExportTarget(exportFormat);
      if (!target) return;
      if (exportFormat === "png") {
        await exportBoardAsPng(target);
        return;
      }
      if (exportFormat === "pdf") {
        await exportBoardAsPdf(target);
        return;
      }
      await exportBoardAsJson(target);
    } catch (error) {
      console.error(error);
      window.alert("导出失败，请再试一次。");
    }
  }

  async function exportBoardAsJson(target) {
    await saveExportBlob(new Blob([snapshot()], { type: "application/json" }), target);
  }

  async function exportBoardAsPng(target) {
    const exportCanvas = await createExportCanvas();
    const blob = await canvasToBlob(exportCanvas, "image/png");
    if (blob) await saveExportBlob(blob, target);
  }

  async function exportBoardAsPdf(target) {
    const exportCanvas = await createExportCanvas();
    const jpegBytes = dataUrlToBytes(exportCanvas.toDataURL("image/jpeg", 0.92));
    const pdfBlob = createPdfFromJpeg(jpegBytes, exportCanvas.width, exportCanvas.height);
    await saveExportBlob(pdfBlob, target);
  }

  function exportFileName(extension) {
    return `flowboard-${new Date().toISOString().slice(0, 10)}.${extension}`;
  }

  async function getExportTarget(format) {
    const options = exportSaveOptions(format);
    if (!window.showSaveFilePicker) return { fileName: options.suggestedName };

    try {
      return {
        fileName: options.suggestedName,
        handle: await window.showSaveFilePicker(options),
      };
    } catch (error) {
      if (error && error.name === "AbortError") return null;
      console.warn(error);
      return { fileName: options.suggestedName };
    }
  }

  function exportSaveOptions(format) {
    const definitions = {
      json: {
        description: "JSON 数据",
        mime: "application/json",
        extension: ".json",
      },
      png: {
        description: "PNG 图片",
        mime: "image/png",
        extension: ".png",
      },
      pdf: {
        description: "PDF 文档",
        mime: "application/pdf",
        extension: ".pdf",
      },
    };
    const definition = definitions[format] || definitions.json;
    return {
      suggestedName: exportFileName(definition.extension.slice(1)),
      types: [
        {
          description: definition.description,
          accept: {
            [definition.mime]: [definition.extension],
          },
        },
      ],
    };
  }

  async function saveExportBlob(blob, target) {
    if (target.handle) {
      const writable = await target.handle.createWritable();
      await writable.write(blob);
      await writable.close();
      return;
    }
    downloadBlob(blob, target.fileName);
  }

  function downloadBlob(blob, fileName) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  }

  function canvasToBlob(targetCanvas, type, quality) {
    return new Promise((resolve) => targetCanvas.toBlob(resolve, type, quality));
  }

  async function createExportCanvas() {
    const bounds = boardContentBounds();
    const scale = clamp(
      Math.min(EXPORT_DEFAULT_SCALE, EXPORT_MAX_CANVAS_SIZE / bounds.w, EXPORT_MAX_CANVAS_SIZE / bounds.h),
      0.25,
      EXPORT_DEFAULT_SCALE,
    );
    const exportCanvas = document.createElement("canvas");
    exportCanvas.width = Math.max(1, Math.ceil(bounds.w * scale));
    exportCanvas.height = Math.max(1, Math.ceil(bounds.h * scale));
    const exportCtx = exportCanvas.getContext("2d");
    await drawExportBoard(exportCtx, exportCanvas, bounds, scale);
    return exportCanvas;
  }

  async function drawExportBoard(exportCtx, exportCanvas, bounds, scale) {
    const previous = {
      ctx,
      dpr,
      viewWidth,
      viewHeight,
      camera: { ...state.camera },
      selectedNoteId: state.selectedNoteId,
      selectedTextId: state.selectedTextId,
      selectedShapeId: state.selectedShapeId,
      selectedImageId: state.selectedImageId,
      selectedConnectionId: state.selectedConnectionId,
      selectedNoteIds: [...state.selectedNoteIds],
      selectedTextIds: [...state.selectedTextIds],
      selectedShapeIds: [...state.selectedShapeIds],
      selectedImageIds: [...state.selectedImageIds],
      selectedStrokeIds: [...state.selectedStrokeIds],
      pendingConnectionNoteId: state.pendingConnectionNoteId,
      connectionDraft: state.connectionDraft,
      editingShapeTextId,
    };

    try {
      ctx = exportCtx;
      dpr = 1;
      viewWidth = exportCanvas.width;
      viewHeight = exportCanvas.height;
      state.camera = { x: bounds.x, y: bounds.y, scale };
      state.selectedNoteId = null;
      state.selectedTextId = null;
      state.selectedShapeId = null;
      state.selectedImageId = null;
      state.selectedConnectionId = null;
      state.selectedNoteIds = [];
      state.selectedTextIds = [];
      state.selectedShapeIds = [];
      state.selectedImageIds = [];
      state.selectedStrokeIds = [];
      state.pendingConnectionNoteId = null;
      state.connectionDraft = null;
      editingShapeTextId = null;

      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, viewWidth, viewHeight);
      ctx.fillStyle = "#f5f7f8";
      ctx.fillRect(0, 0, viewWidth, viewHeight);
      drawGrid();

      ctx.save();
      ctx.scale(scale, scale);
      ctx.translate(-bounds.x, -bounds.y);
      for (const connection of state.connections) drawConnection(connection);
      for (const shape of [...state.shapes].sort((a, b) => finiteOr(a.z, 0) - finiteOr(b.z, 0))) drawShape(shape);
      for (const stroke of state.strokes) drawStroke(stroke);
      const domObjects = [
        ...state.notes.map((object) => ({ type: "note", object })),
        ...state.texts.map((object) => ({ type: "text", object })),
        ...state.images.map((object) => ({ type: "image", object })),
      ].sort((a, b) => finiteOr(a.object.z, 0) - finiteOr(b.object.z, 0));
      for (const item of domObjects) {
        if (item.type === "note") drawExportNote(item.object);
        if (item.type === "text") drawExportText(item.object);
        if (item.type === "image") await drawExportImage(item.object);
      }
      ctx.restore();
    } finally {
      ctx = previous.ctx;
      dpr = previous.dpr;
      viewWidth = previous.viewWidth;
      viewHeight = previous.viewHeight;
      state.camera = previous.camera;
      state.selectedNoteId = previous.selectedNoteId;
      state.selectedTextId = previous.selectedTextId;
      state.selectedShapeId = previous.selectedShapeId;
      state.selectedImageId = previous.selectedImageId;
      state.selectedConnectionId = previous.selectedConnectionId;
      state.selectedNoteIds = previous.selectedNoteIds;
      state.selectedTextIds = previous.selectedTextIds;
      state.selectedShapeIds = previous.selectedShapeIds;
      state.selectedImageIds = previous.selectedImageIds;
      state.selectedStrokeIds = previous.selectedStrokeIds;
      state.pendingConnectionNoteId = previous.pendingConnectionNoteId;
      state.connectionDraft = previous.connectionDraft;
      editingShapeTextId = previous.editingShapeTextId;
    }
  }

  function boardContentBounds() {
    const bounds = [];
    for (const note of state.notes) bounds.push(expandBounds(objectBounds(note), 24));
    for (const text of state.texts) bounds.push(expandBounds(objectBounds(text), 16));
    for (const image of state.images) bounds.push(expandBounds(objectBounds(image), 16));
    for (const shape of state.shapes) bounds.push(expandBounds(objectBounds(shape), 24));
    for (const stroke of state.strokes) {
      const boundsForStroke = strokeBounds(stroke);
      if (boundsForStroke) bounds.push(expandBounds(boundsForStroke, 18));
    }
    for (const connection of state.connections) {
      const boundsForConnection = connectionWorldBounds(connection);
      if (boundsForConnection) bounds.push(boundsForConnection);
    }

    if (!bounds.length) {
      return {
        x: state.camera.x,
        y: state.camera.y,
        w: Math.max(1, viewWidth / state.camera.scale),
        h: Math.max(1, viewHeight / state.camera.scale),
      };
    }

    let left = Math.min(...bounds.map((item) => item.x));
    let top = Math.min(...bounds.map((item) => item.y));
    let right = Math.max(...bounds.map((item) => item.x + item.w));
    let bottom = Math.max(...bounds.map((item) => item.y + item.h));
    left -= EXPORT_PADDING;
    top -= EXPORT_PADDING;
    right += EXPORT_PADDING;
    bottom += EXPORT_PADDING;

    const minWidth = 360;
    const minHeight = 260;
    if (right - left < minWidth) {
      const extra = (minWidth - (right - left)) / 2;
      left -= extra;
      right += extra;
    }
    if (bottom - top < minHeight) {
      const extra = (minHeight - (bottom - top)) / 2;
      top -= extra;
      bottom += extra;
    }

    return { x: left, y: top, w: right - left, h: bottom - top };
  }

  function objectBounds(object) {
    return { x: object.x, y: object.y, w: object.w, h: object.h };
  }

  function expandBounds(bounds, padding) {
    return {
      x: bounds.x - padding,
      y: bounds.y - padding,
      w: bounds.w + padding * 2,
      h: bounds.h + padding * 2,
    };
  }

  function connectionWorldBounds(connection) {
    const fromObject = findConnectable(connection.from);
    const toObject = findConnectable(connection.to);
    if (!fromObject || !toObject) return null;
    const geometry = connectionGeometry(connection, fromObject, toObject);
    if (!geometry) return null;
    const points = [geometry.start, geometry.end];
    if (connection.mode === "curve") {
      for (let step = 1; step < 28; step += 1) {
        points.push(cubicPoint(geometry.start, geometry.control1, geometry.control2, geometry.end, step / 28));
      }
    }
    return boundsFromPoints(points, connection.size + 18);
  }

  function boundsFromPoints(points, padding = 0) {
    const left = Math.min(...points.map((point) => point.x)) - padding;
    const top = Math.min(...points.map((point) => point.y)) - padding;
    const right = Math.max(...points.map((point) => point.x)) + padding;
    const bottom = Math.max(...points.map((point) => point.y)) + padding;
    return { x: left, y: top, w: right - left, h: bottom - top };
  }

  function drawExportNote(note) {
    ctx.save();
    ctx.shadowColor = "rgba(23, 32, 42, 0.12)";
    ctx.shadowBlur = 14;
    ctx.shadowOffsetY = 8;
    roundedRect(note.x, note.y, note.w, note.h, 8);
    ctx.fillStyle = note.color;
    ctx.fill();
    ctx.shadowColor = "transparent";
    ctx.fillStyle = "rgba(255, 255, 255, 0.22)";
    ctx.fillRect(note.x, note.y, note.w, NOTE_HEADER_HEIGHT);
    drawWrappedExportText(note.text, note.x + 12, note.y + NOTE_HEADER_HEIGHT + 11, note.w - 24, note.h - NOTE_HEADER_HEIGHT - 20, {
      color: "#20262d",
      font: '600 16px "Microsoft YaHei", "PingFang SC", "Segoe UI", sans-serif',
      lineHeight: 22,
      align: "left",
    });
    ctx.restore();
  }

  function drawExportText(text) {
    const style = text.fontStyle === "italic" ? "italic " : "";
    const font = `${style}${text.fontWeight} ${text.fontSize}px ${text.fontFamily}`;
    drawWrappedExportText(text.text, text.x + 6, text.y + 4, Math.max(12, text.w - 12), Math.max(12, text.h - 8), {
      color: text.color,
      font,
      lineHeight: text.fontSize * 1.25,
      align: "left",
    });
  }

  async function drawExportImage(image) {
    try {
      const loadedImage = await loadImageElement(image.src);
      ctx.save();
      try {
        roundedRect(image.x, image.y, image.w, image.h, 6);
        ctx.clip();
        ctx.drawImage(loadedImage, image.x, image.y, image.w, image.h);
      } finally {
        ctx.restore();
      }
    } catch {
      ctx.save();
      try {
        roundedRect(image.x, image.y, image.w, image.h, 6);
        ctx.fillStyle = "#e5ebef";
        ctx.fill();
        ctx.fillStyle = "#64748b";
        ctx.font = '600 14px "Microsoft YaHei", "PingFang SC", "Segoe UI", sans-serif';
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("图片无法导出", image.x + image.w / 2, image.y + image.h / 2);
      } finally {
        ctx.restore();
      }
    }
  }

  function drawWrappedExportText(text, x, y, maxWidth, maxHeight, options) {
    if (!text) return;
    ctx.save();
    ctx.font = options.font;
    ctx.fillStyle = options.color;
    ctx.textAlign = options.align || "left";
    ctx.textBaseline = "top";
    const lines = wrapTextToWidth(text, maxWidth, options.font);
    const maxLines = Math.max(1, Math.floor(maxHeight / options.lineHeight));
    const visibleLines = lines.slice(0, maxLines);
    if (lines.length > maxLines) {
      visibleLines[visibleLines.length - 1] = ellipsizeText(visibleLines[visibleLines.length - 1], maxWidth, options.font);
    }
    visibleLines.forEach((line, index) => {
      const drawX = options.align === "center" ? x + maxWidth / 2 : x;
      ctx.fillText(line, drawX, y + index * options.lineHeight);
    });
    ctx.restore();
  }

  function wrapTextToWidth(text, maxWidth, font) {
    ctx.save();
    ctx.font = font;
    const lines = [];
    for (const paragraph of String(text).split(/\r?\n/)) {
      if (!paragraph) {
        lines.push("");
        continue;
      }
      let line = "";
      for (const char of Array.from(paragraph)) {
        const nextLine = line + char;
        if (line && ctx.measureText(nextLine).width > maxWidth) {
          lines.push(line);
          line = char;
        } else {
          line = nextLine;
        }
      }
      lines.push(line);
    }
    ctx.restore();
    return lines;
  }

  function ellipsizeText(text, maxWidth, font) {
    ctx.save();
    ctx.font = font;
    let nextText = text || "";
    while (nextText && ctx.measureText(`${nextText}...`).width > maxWidth) nextText = nextText.slice(0, -1);
    ctx.restore();
    return `${nextText}...`;
  }

  function roundedRect(x, y, width, height, radius) {
    const r = Math.min(radius, width / 2, height / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + width - r, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + r);
    ctx.lineTo(x + width, y + height - r);
    ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
    ctx.lineTo(x + r, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  function dataUrlToBytes(dataUrl) {
    const base64 = dataUrl.split(",")[1] || "";
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    return bytes;
  }

  function createPdfFromJpeg(jpegBytes, imageWidth, imageHeight) {
    const encoder = new TextEncoder();
    const pageWidth = imageWidth * 0.75;
    const pageHeight = imageHeight * 0.75;
    const content = `q\n${pageWidth} 0 0 ${pageHeight} 0 0 cm\n/Im0 Do\nQ`;
    const parts = [];
    const offsets = [0];
    let offset = 0;

    const add = (value) => {
      const bytes = typeof value === "string" ? encoder.encode(value) : value;
      parts.push(bytes);
      offset += bytes.length;
    };
    const addObject = (number, value) => {
      offsets[number] = offset;
      add(`${number} 0 obj\n${value}\nendobj\n`);
    };

    add("%PDF-1.4\n%\xE2\xE3\xCF\xD3\n");
    addObject(1, "<< /Type /Catalog /Pages 2 0 R >>");
    addObject(2, "<< /Type /Pages /Kids [3 0 R] /Count 1 >>");
    addObject(
      3,
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>`,
    );
    offsets[4] = offset;
    add(`4 0 obj\n<< /Type /XObject /Subtype /Image /Width ${imageWidth} /Height ${imageHeight} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpegBytes.length} >>\nstream\n`);
    add(jpegBytes);
    add("\nendstream\nendobj\n");
    addObject(5, `<< /Length ${encoder.encode(content).length} >>\nstream\n${content}\nendstream`);

    const xrefOffset = offset;
    add("xref\n0 6\n0000000000 65535 f \n");
    for (let index = 1; index <= 5; index += 1) {
      add(`${String(offsets[index]).padStart(10, "0")} 00000 n \n`);
    }
    add(`trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`);
    return new Blob(parts, { type: "application/pdf" });
  }

  function importBoard() {
    finishTextEditing();
    finishShapeTextEditing();
    const file = importFileInput.files && importFileInput.files[0];
    importFileInput.value = "";
    if (!file) return;

    if (isImageFile(file)) {
      addImageFromFile(file, viewportCenterWorld());
      return;
    }

    const reader = new FileReader();
    reader.addEventListener("load", () => {
      pushHistory();
      if (!restore(String(reader.result || ""))) {
        window.alert("这个文件不能导入。");
      }
    });
    reader.readAsText(file);
  }

  function clearBoard() {
    finishTextEditing();
    finishShapeTextEditing();
    if (!state.shapes.length && !state.strokes.length && !state.connections.length && !state.notes.length && !state.texts.length && !state.images.length) return;
    if (!window.confirm("清空当前白板？")) return;
    pushHistory();
    state.shapes = [];
    state.strokes = [];
    state.connections = [];
    state.notes = [];
    state.texts = [];
    state.images = [];
    hideShapeTextEditor();
    clearSelection();
    state.pendingConnectionNoteId = null;
    state.connectionDraft = null;
    render();
    queueSave();
  }

  function bringNoteToFront(note) {
    note.z = nextZ();
  }

  function bringTextToFront(text) {
    text.z = nextZ();
  }

  function bringShapeToFront(shape) {
    shape.z = nextZ();
  }

  function bringImageToFront(image) {
    image.z = nextZ();
  }

  function nextZ() {
    return [...state.notes, ...state.texts, ...state.images, ...state.shapes].reduce((highest, object) => Math.max(highest, finiteOr(object.z, 0)), 0) + 1;
  }

  function findNote(id) {
    return state.notes.find((note) => note.id === id);
  }

  function findText(id) {
    return state.texts.find((text) => text.id === id);
  }

  function findShape(id) {
    return state.shapes.find((shape) => shape.id === id);
  }

  function findStroke(id) {
    return state.strokes.find((stroke) => stroke.id === id);
  }

  function findImage(id) {
    return state.images.find((image) => image.id === id);
  }

  function findConnection(id) {
    return state.connections.find((connection) => connection.id === id);
  }

  function findConnectable(id) {
    return findNote(id) || findText(id) || findShape(id) || findImage(id);
  }

  function getSelectedText() {
    return state.selectedTextId ? findText(state.selectedTextId) : null;
  }

  function getSelectedShape() {
    return state.selectedShapeId ? findShape(state.selectedShapeId) : null;
  }

  function getSelectedConnection() {
    return state.selectedConnectionId ? findConnection(state.selectedConnectionId) : null;
  }

  function getSelectedConnectable() {
    return state.selectedTextId ? findText(state.selectedTextId) : state.selectedNoteId ? findNote(state.selectedNoteId) : state.selectedImageId ? findImage(state.selectedImageId) : getSelectedShape();
  }

  function selectConnection(id) {
    const connection = findConnection(id);
    if (!connection) {
      clearSelection();
      return;
    }
    clearSelection();
    state.selectedConnectionId = connection.id;
    state.lineMode = connection.mode;
    state.lineStartMarker = normalizeMarker(connection.fromMarker, state.lineStartMarker);
    state.lineEndMarker = normalizeMarker(connection.toMarker, state.lineEndMarker);
  }

  function selectObject(id) {
    clearMultiSelection();
    state.selectedConnectionId = null;
    if (findText(id)) {
      state.selectedTextId = id;
      state.selectedNoteId = null;
      state.selectedShapeId = null;
      state.selectedImageId = null;
      return;
    }
    if (findNote(id)) {
      state.selectedNoteId = id;
      state.selectedTextId = null;
      state.selectedShapeId = null;
      state.selectedImageId = null;
      return;
    }
    if (findShape(id)) {
      state.selectedShapeId = id;
      state.selectedNoteId = null;
      state.selectedTextId = null;
      state.selectedImageId = null;
      return;
    }
    if (findImage(id)) {
      state.selectedImageId = id;
      state.selectedNoteId = null;
      state.selectedTextId = null;
      state.selectedShapeId = null;
      return;
    }
    clearSelection();
  }

  function isShapeObject(object) {
    return object && SHAPE_TYPES.includes(object.type);
  }

  function deleteText(id) {
    state.texts = state.texts.filter((text) => text.id !== id);
    state.connections = state.connections.filter((connection) => connection.from !== id && connection.to !== id);
    if (state.selectedTextId === id) state.selectedTextId = null;
    if (state.pendingConnectionNoteId === id || state.connectionDraft?.from === id || state.connectionDraft?.hoverNoteId === id) {
      cancelConnectionDraft();
    }
  }

  function deleteImage(id) {
    state.images = state.images.filter((image) => image.id !== id);
    state.connections = state.connections.filter((connection) => connection.from !== id && connection.to !== id);
    if (state.selectedImageId === id) state.selectedImageId = null;
    state.selectedImageIds = state.selectedImageIds.filter((imageId) => imageId !== id);
    if (state.pendingConnectionNoteId === id || state.connectionDraft?.from === id || state.connectionDraft?.hoverNoteId === id) {
      cancelConnectionDraft();
    }
  }

  function isEditingNote() {
    return Boolean(
      document.activeElement &&
        document.activeElement.closest(".note-body, .text-content, .shape-text-editor, #color-value, .text-toolbar input, .text-toolbar select"),
    );
  }

  function makeId(prefix) {
    if (window.crypto && crypto.randomUUID) return `${prefix}-${crypto.randomUUID()}`;
    return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function colorWithAlpha(color, alpha) {
    const match = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(color);
    if (!match) return `rgba(15, 118, 110, ${alpha})`;
    const r = parseInt(match[1], 16);
    const g = parseInt(match[2], 16);
    const b = parseInt(match[3], 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  function distance(a, b) {
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  function distanceToSegment(point, a, b) {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    if (dx === 0 && dy === 0) return distance(point, a);
    const t = clamp(((point.x - a.x) * dx + (point.y - a.y) * dy) / (dx * dx + dy * dy), 0, 1);
    return Math.hypot(point.x - (a.x + t * dx), point.y - (a.y + t * dy));
  }

  function pointInPolygon(point, polygon) {
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
      const pi = polygon[i];
      const pj = polygon[j];
      const intersects = pi.y > point.y !== pj.y > point.y && point.x < ((pj.x - pi.x) * (point.y - pi.y)) / (pj.y - pi.y) + pi.x;
      if (intersects) inside = !inside;
    }
    return inside;
  }

  function cubicPoint(start, control1, control2, end, t) {
    const mt = 1 - t;
    return {
      x: mt ** 3 * start.x + 3 * mt ** 2 * t * control1.x + 3 * mt * t ** 2 * control2.x + t ** 3 * end.x,
      y: mt ** 3 * start.y + 3 * mt ** 2 * t * control1.y + 3 * mt * t ** 2 * control2.y + t ** 3 * end.y,
    };
  }
})();
