import { describe, expect, it } from 'vitest'
import {
  buildLegacyWhiteboardSrcDoc,
  LEGACY_WHITEBOARD_DOCUMENT_VERSION,
} from './legacyWhiteboardDocument'
import { createEmptyBoardSnapshot } from './whiteboardModel'

describe('legacyWhiteboardDocument', () => {
  it('uses the toolbar-optimization document version', () => {
    expect(LEGACY_WHITEBOARD_DOCUMENT_VERSION).toBe('2026-07-11-whiteboard-middle-pan-v16')
  })

  it('includes pointer-release completion for connection drafts', () => {
    const srcDoc = buildLegacyWhiteboardSrcDoc('board-1', createEmptyBoardSnapshot(), '2026-06-19T00:00:00.000Z')

    expect(srcDoc).toContain(
      'const targetObject = connectableAtClient(event.clientX, event.clientY, state.connectionDraft.from);',
    )
  })

  it('dismisses embedded floating menus when the iframe loses focus', () => {
    const srcDoc = buildLegacyWhiteboardSrcDoc('board-1', createEmptyBoardSnapshot(), '2026-06-19T00:00:00.000Z')

    expect(srcDoc).toContain('function flowboardDismissFloatingMenus() {')
    expect(srcDoc).toContain('window.addEventListener("blur", () => {')
    expect(srcDoc).toContain('if (colorPanel && !colorPanel.hidden) setColorPanelOpen(false);')
    expect(srcDoc).toContain('if (exportMenu && !exportMenu.hidden) setExportMenuOpen(false);')
    expect(srcDoc).toContain('if (historyMenu && !historyMenu.hidden) setHistoryMenuOpen(false);')
  })

  it('includes grouped history controls with multi-step navigation actions', () => {
    const srcDoc = buildLegacyWhiteboardSrcDoc('board-1', createEmptyBoardSnapshot(), '2026-06-19T00:00:00.000Z')

    expect(srcDoc).toContain('id="history-toggle"')
    expect(srcDoc).toContain('id="history-menu"')
    expect(srcDoc).toContain('data-history-action="undo-5"')
    expect(srcDoc).toContain('data-history-action="redo-5"')
    expect(srcDoc).toContain('function setHistoryMenuOpen(isOpen) {')
    expect(srcDoc).toContain('function undoSteps(stepCount = 1) {')
    expect(srcDoc).toContain('function redoSteps(stepCount = 1) {')
    expect(srcDoc).toContain('historyCounts.textContent =')
  })

  it('anchors the shape panel to its own trigger and uses square and circle icons', () => {
    const srcDoc = buildLegacyWhiteboardSrcDoc('board-1', createEmptyBoardSnapshot(), '2026-06-19T00:00:00.000Z')

    expect(srcDoc).toContain('id="shape-picker"')
    expect(srcDoc).toContain('function positionShapeStrip() {')
    expect(srcDoc).toContain('<rect x="6" y="6" width="12" height="12" />')
    expect(srcDoc).toContain('<circle cx="12" cy="12" r="6" />')
  })

  it('returns the shape tool to select when the toolbar trigger is clicked again', () => {
    const srcDoc = buildLegacyWhiteboardSrcDoc('board-1', createEmptyBoardSnapshot(), '2026-06-19T00:00:00.000Z')

    expect(srcDoc).toContain('if (tool === "shape" && state.tool === "shape") {')
    expect(srcDoc).toContain('setTool("select");')
  })

  it('keeps connector creation off the top toolbar and defaults new lines to curves', () => {
    const srcDoc = buildLegacyWhiteboardSrcDoc('board-1', createEmptyBoardSnapshot(), '2026-06-19T00:00:00.000Z')

    expect(srcDoc).not.toContain('data-tool="connector"')
    expect(srcDoc).toContain('lineMode: "curve",')
  })

  it('defaults both endpoints to the first marker and keeps their toolbar buttons neutral', () => {
    const srcDoc = buildLegacyWhiteboardSrcDoc('board-1', createEmptyBoardSnapshot(), '2026-06-19T00:00:00.000Z')

    expect(srcDoc).toContain('const DEFAULT_LINE_START_MARKER = "none";')
    expect(srcDoc).toContain('const DEFAULT_LINE_END_MARKER = "none";')
    expect(srcDoc).toContain('button.innerHTML = lineMarkerPreviewSvg("none", target);')
    expect(srcDoc).not.toContain('button.dataset.lineMarker = marker;')
  })

  it('routes middle-button drags on objects to canvas panning', () => {
    const srcDoc = buildLegacyWhiteboardSrcDoc('board-1', createEmptyBoardSnapshot(), '2026-06-19T00:00:00.000Z')

    expect(srcDoc).toContain('function startPanFromPointer(event, captureTarget = viewport) {')
    expect(srcDoc.match(/startPanFromPointer\(event, noteLayer\);/g)).toHaveLength(3)
  })

  it('renders configurable connection endpoint markers and stronger draft feedback', () => {
    const srcDoc = buildLegacyWhiteboardSrcDoc('board-1', createEmptyBoardSnapshot(), '2026-06-19T00:00:00.000Z')

    expect(srcDoc).toContain('drawConnectionEndpointMarker(geometry, connection, "from");')
    expect(srcDoc).toContain('drawConnectionEndpointMarker(geometry, connection, "to");')
    expect(srcDoc).toContain('drawConnectionEndpointMarker(geometry, draft, "from");')
    expect(srcDoc).toContain('drawConnectionEndpointMarker(geometry, draft, "to");')
    expect(srcDoc).toContain('function connectionEndpointAngle(geometry, mode, target) {')
    expect(srcDoc).toContain('ctx.setLineDash([12, 8]);')
  })

  it('stores fixed connection anchors and renders connections beneath shapes', () => {
    const srcDoc = buildLegacyWhiteboardSrcDoc('board-1', createEmptyBoardSnapshot(), '2026-06-19T00:00:00.000Z')

    expect(srcDoc).toContain('fromAnchor: normalizeAnchor(connection.fromAnchor),')
    expect(srcDoc).toContain('toAnchor: normalizeAnchor(connection.toAnchor),')
    expect(srcDoc).toContain('toSide: normalizeSide(connection.toSide),')
    expect(srcDoc).toContain('function pointToAnchor(object, point) {')
    expect(srcDoc).toContain('function resolveConnectionSide(side, anchor) {')
    expect(srcDoc).toContain('function sideVector(side) {')
    expect(srcDoc).toContain('return connectionPathGeometry(start, end, connection.mode, fromSide, toSide);')
    expect(srcDoc.indexOf('for (const connection of state.connections) {')).toBeLessThan(
      srcDoc.indexOf('for (const shape of [...state.shapes].sort((a, b) => finiteOr(a.z, 0) - finiteOr(b.z, 0))) {'),
    )
    expect(srcDoc.indexOf('for (const connection of state.connections) drawConnection(connection);')).toBeLessThan(
      srcDoc.indexOf('for (const shape of [...state.shapes].sort((a, b) => finiteOr(a.z, 0) - finiteOr(b.z, 0))) drawShape(shape);'),
    )
  })

  it('snaps object connections back to fixed cardinal anchors during preview and commit', () => {
    const srcDoc = buildLegacyWhiteboardSrcDoc('board-1', createEmptyBoardSnapshot(), '2026-06-19T00:00:00.000Z')

    expect(srcDoc).toContain('function snappedSideAnchor(object, toward) {')
    expect(srcDoc).toContain('const startSnap = fromObject ? snappedSideAnchor(fromObject, sourceToward) : null;')
    expect(srcDoc).toContain('const endSnap = snappedSideAnchor(object, (startSnap && startSnap.point) || targetWorldPoint);')
    expect(srcDoc).toContain('const endSnap = snappedSideAnchor(object, draft.current || startPoint || noteCenter(object));')
    expect(srcDoc).toContain('const endSnap = targetObject ? snappedSideAnchor(targetObject, draft.current || start) : null;')
  })

  it('includes connection endpoint controls and marker rendering logic', () => {
    const srcDoc = buildLegacyWhiteboardSrcDoc('board-1', createEmptyBoardSnapshot(), '2026-06-19T00:00:00.000Z')

    expect(srcDoc).toContain('line-start-marker-toggle')
    expect(srcDoc).toContain('line-end-marker-toggle')
    expect(srcDoc).toContain('const LINE_MARKERS = ["none", "arrow", "bar", "dot", "circle", "diamond"];')
    expect(srcDoc).toContain('data-line-marker="${marker}"')
    expect(srcDoc).toContain('fromMarker: normalizeMarker(connection.fromMarker, state.lineStartMarker),')
    expect(srcDoc).toContain('toMarker: normalizeMarker(connection.toMarker, state.lineEndMarker),')
    expect(srcDoc).toContain('function setLineMarker(target, marker) {')
    expect(srcDoc).toContain('function drawConnectionEndpointMarker(geometry, connection, target) {')
    expect(srcDoc).toContain('drawConnectionEndpointMarker(geometry, connection, "from");')
    expect(srcDoc).toContain('drawConnectionEndpointMarker(geometry, connection, "to");')
  })

  it('returns connector mode to select when a line marker toggle closes its own menu', () => {
    const srcDoc = buildLegacyWhiteboardSrcDoc('board-1', createEmptyBoardSnapshot(), '2026-06-19T00:00:00.000Z')

    expect(srcDoc).toContain('if (menu && !menu.hidden) {')
    expect(srcDoc).toContain('if (state.tool === "connector") setTool("select");')
    expect(srcDoc).toContain('else setLineMarkerMenuOpen(null);')
  })

  it('updates history controls with live counts and disabled states', () => {
    const srcDoc = buildLegacyWhiteboardSrcDoc('board-1', createEmptyBoardSnapshot(), '2026-06-19T00:00:00.000Z')

    expect(srcDoc).toContain('undoButton.disabled = !undoStack.length;')
    expect(srcDoc).toContain('redoButton.disabled = !redoStack.length;')
    expect(srcDoc).toContain('historyToggle.disabled = !undoStack.length && !redoStack.length;')
    expect(srcDoc).toContain('historyStatus.textContent = `可回退 ${undoStack.length} 步，可前进 ${redoStack.length} 步`;')
  })

  it('re-renders note connection handles immediately when a note body is clicked', () => {
    const srcDoc = buildLegacyWhiteboardSrcDoc(
      'board-1',
      createEmptyBoardSnapshot(),
      '2026-06-19T00:00:00.000Z',
    )

    expect(srcDoc).toContain('if (event.target.closest(".note-body")) {')
    expect(srcDoc).toContain('render();\n      focusNoteBody(note.id);')
    expect(srcDoc).not.toContain('render();\n      focusNoteBody(note.id);\n      queueSave();')
  })

  it('prevents note pointerdown from bubbling into outer canvas selection logic', () => {
    const srcDoc = buildLegacyWhiteboardSrcDoc(
      'board-1',
      createEmptyBoardSnapshot(),
      '2026-06-19T00:00:00.000Z',
    )

    expect(srcDoc).toContain(
      'const note = findNote(noteElement.dataset.id);\n    if (!note) return;\n    finishTextEditing();\n    event.preventDefault();\n    event.stopPropagation();',
    )
  })

  it('keeps note connection handles after the note body receives deferred focus', () => {
    const srcDoc = buildLegacyWhiteboardSrcDoc(
      'board-1',
      createEmptyBoardSnapshot(),
      '2026-06-19T00:00:00.000Z',
    )

    expect(srcDoc).toContain('event.stopPropagation();\n      render();\n      focusNoteBody(note.id);')
    expect(srcDoc).toContain(
      'body.setSelectionRange(body.value.length, body.value.length);\n      renderConnectionHandles();',
    )
  })

  it('flushes the latest snapshot when the embedded board is being unloaded', () => {
    const srcDoc = buildLegacyWhiteboardSrcDoc('board-1', createEmptyBoardSnapshot(), '2026-06-19T00:00:00.000Z')

    expect(srcDoc).toContain('function flowboardShadowStorageKey() {')
    expect(srcDoc).toContain('function flowboardShadowUpdatedAtKey() {')
    expect(srcDoc).toContain('function flowboardWriteShadowSnapshot(snapshotValue, updatedAt = new Date().toISOString()) {')
    expect(srcDoc).toContain('function flowboardShadowSnapshot() {')
    expect(srcDoc).toContain('if (shadowUpdatedAt && payload.updatedAt && shadowUpdatedAt < payload.updatedAt) {')
    expect(srcDoc).toContain('flowboardPostSave(snapshotValue);')
    expect(srcDoc).toContain('if (flowboardHostPayload()) {')
    expect(srcDoc).toContain('flowboardWriteShadowSnapshot(snapshot());')
    expect(srcDoc).toContain('function flowboardPersistSnapshot(snapshotValue) {')
    expect(srcDoc).toContain('window.__FLOWBOARD_HOST_FLUSH__ = () => {')
    expect(srcDoc).not.toContain('flowboardPersistToWorkspaceStore(snapshotValue);')
    expect(srcDoc).not.toMatch(/indexed[\s\S]*DB\.open\(/)
    expect(srcDoc).toContain('window.addEventListener("pagehide", () => {')
    expect(srcDoc).toContain('flowboardPersistSnapshot(snapshot());')
  })

  it('preserves whiteboard selection when the host pushes a replacement snapshot', () => {
    const srcDoc = buildLegacyWhiteboardSrcDoc(
      'board-1',
      createEmptyBoardSnapshot(),
      '2026-06-19T00:00:00.000Z',
    )

    expect(srcDoc).toContain('function flowboardCaptureSelection() {')
    expect(srcDoc).toContain('function flowboardRestoreSelection(previousSelection) {')
    expect(srcDoc).toContain('function flowboardRestoreFocus(previousSelection) {')
    expect(srcDoc).toContain('function restore(snapshotValue, options = {}) {')
    expect(srcDoc).toContain('const preserveSelection = options.preserveSelection === true;')
    expect(srcDoc).toContain('if (preserveSelection) flowboardRestoreSelection(previousSelection);')
    expect(srcDoc).toContain('if (preserveSelection) flowboardRestoreFocus(previousSelection);')
    expect(srcDoc).toContain('restore(nextSnapshot, { preserveSelection: true });')
  })

  it('does not promote objects in z-order on simple selection clicks', () => {
    const srcDoc = buildLegacyWhiteboardSrcDoc(
      'board-1',
      createEmptyBoardSnapshot(),
      '2026-06-19T00:00:00.000Z',
    )

    expect(srcDoc).not.toContain('clearMultiSelection();\n    bringNoteToFront(note);')
    expect(srcDoc).toContain('clearMultiSelection();\n\n    if (event.target.closest(".note-delete")) return;')
    expect(srcDoc).not.toContain(
      'finishTextEditing();\n    selectObject(text.id);\n    bringTextToFront(text);',
    )
    expect(srcDoc).not.toContain(
      'clearMultiSelection();\n    bringTextToFront(text);\n    render();',
    )
    expect(srcDoc).not.toContain(
      'event.stopPropagation();\n    selectObject(image.id);\n    bringImageToFront(image);',
    )
    expect(srcDoc).not.toContain(
      'pushHistory();\n        selectObject(hitShape.id);\n        bringShapeToFront(hitShape);',
    )
    expect(srcDoc).toContain('pushHistory();\n        selectObject(hitShape.id);\n        pointerMode = {')
  })

  it('does not promote or persist notes on focus-only interactions', () => {
    const srcDoc = buildLegacyWhiteboardSrcDoc(
      'board-1',
      createEmptyBoardSnapshot(),
      '2026-06-19T00:00:00.000Z',
    )

    expect(srcDoc).not.toContain(
      'clearMultiSelection();\n    bringNoteToFront(note);\n    render();\n    queueSave();',
    )
    expect(srcDoc).toContain('function onNoteFocus(event) {')
    expect(srcDoc).toContain('clearMultiSelection();\n    render();')
  })
})
