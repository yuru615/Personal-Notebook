import legacyAppScript from './legacy/app.js?raw'
import legacyIndexHtml from './legacy/index.html?raw'
import legacyStyles from './legacy/styles.css?raw'
import type { MindmapSnapshot } from './mindmapModel'

export const LEGACY_MINDMAP_DOCUMENT_VERSION = '2026-06-19-mindmap-line-markers-v12'

const storageKeySnippet = 'const STORAGE_KEY = "flowboard.mindmap.v1";'
const hydrateSnippet = 'const raw = localStorage.getItem(STORAGE_KEY);'
const clearBrokenStorageSnippet = 'localStorage.removeItem(STORAGE_KEY);'
const saveSnippet = 'localStorage.setItem(STORAGE_KEY, snapshot());'
const queueSaveSnippet = `function queueSave() {
    window.clearTimeout(saveTimer);
    saveTimer = window.setTimeout(saveNow, 160);
  }`
const noteBodyClickSnippet = `    if (event.target.closest(".note-body")) {
      focusNoteBody(note.id);
      queueSave();
      return;
    }`
const notePointerPreludeSnippet = `    const note = findNote(noteElement.dataset.id);
    if (!note) return;
    finishTextEditing();`
const focusNoteBodySelectionSnippet = '      body.setSelectionRange(body.value.length, body.value.length);'
const endPointerModeSnippet = `function endPointerMode(event) {
    if (!pointerMode) return;`
const noteSelectionSnippet = `    state.selectedNoteId = note.id;
    state.selectedTextId = null;
    state.selectedShapeId = null;
    state.selectedImageId = null;
    state.selectedConnectionId = null;
    clearMultiSelection();
    bringNoteToFront(note);`
const textPointerSelectionSnippet = `    finishTextEditing();
    selectObject(text.id);
    bringTextToFront(text);`
const textFocusSelectionSnippet = `    state.selectedNoteId = null;
    state.selectedTextId = text.id;
    state.selectedShapeId = null;
    state.selectedImageId = null;
    state.selectedConnectionId = null;
    clearMultiSelection();
    bringTextToFront(text);`
const imageSelectionSnippet = `    event.preventDefault();
    event.stopPropagation();
    selectObject(image.id);
    bringImageToFront(image);`
const shapeSelectionSnippet = `        pushHistory();
        selectObject(hitShape.id);
        bringShapeToFront(hitShape);`
const noteFocusSnippet = `    state.selectedNoteId = note.id;
    state.selectedTextId = null;
    state.selectedShapeId = null;
    state.selectedImageId = null;
    state.selectedConnectionId = null;
    clearMultiSelection();
    bringNoteToFront(note);
    render();
    queueSave();`
const restoreSignatureSnippet = `  function restore(snapshotValue) {`
const restoreSelectionSnippet = `      hideShapeTextEditor();
      clearSelection();
      state.pendingConnectionNoteId = null;`
const restoreRenderSnippet = `      render();
      saveNow();`
const queueSavePatchedSnippet = `function queueSave() {
    window.clearTimeout(saveTimer);
    if (flowboardHostPayload()) {
      flowboardWriteShadowSnapshot(snapshot());
    }
    saveTimer = window.setTimeout(saveNow, 160);
  }`
const noteBodyClickPatchedSnippet = `    if (event.target.closest(".note-body")) {
      event.stopPropagation();
      render();
      focusNoteBody(note.id);
      return;
    }`
const notePointerPreludePatchedSnippet = `${notePointerPreludeSnippet}
    event.preventDefault();
    event.stopPropagation();`
const focusNoteBodySelectionPatchedSnippet = `${focusNoteBodySelectionSnippet}
      renderConnectionHandles();`
const noteSelectionPatchedSnippet = `    state.selectedNoteId = note.id;
    state.selectedTextId = null;
    state.selectedShapeId = null;
    state.selectedImageId = null;
    state.selectedConnectionId = null;
    clearMultiSelection();`
const textPointerSelectionPatchedSnippet = `    finishTextEditing();
    selectObject(text.id);`
const textFocusSelectionPatchedSnippet = `    state.selectedNoteId = null;
    state.selectedTextId = text.id;
    state.selectedShapeId = null;
    state.selectedImageId = null;
    state.selectedConnectionId = null;
    clearMultiSelection();`
const imageSelectionPatchedSnippet = `    event.preventDefault();
    event.stopPropagation();
    selectObject(image.id);`
const shapeSelectionPatchedSnippet = `        pushHistory();
        selectObject(hitShape.id);`
const noteFocusPatchedSnippet = `    state.selectedNoteId = note.id;
    state.selectedTextId = null;
    state.selectedShapeId = null;
    state.selectedImageId = null;
    state.selectedConnectionId = null;
    clearMultiSelection();
    render();`
const endPointerModePatchedSnippet = `function endPointerMode(event) {
    if (!pointerMode) {
      if (!state.connectionDraft || !event) return;
      const targetObject = connectableAtClient(event.clientX, event.clientY, state.connectionDraft.from);
      if (targetObject) confirmConnectionToTarget(targetObject);
      else {
        cancelConnectionDraft();
        render();
      }
      return;
    }`
const restoreSignaturePatchedSnippet = `  function flowboardCaptureSelection() {
    const activeElement = document.activeElement;
    const selected = selectedIdGroups();
    let focus = null;
    const focusedNote = activeElement && activeElement.closest(".note");
    const focusedText = activeElement && activeElement.closest(".text-box");
    if (focusedNote && activeElement.closest(".note-body")) {
      focus = { type: "note", id: focusedNote.dataset.id || null };
    } else if (focusedText && activeElement.closest(".text-content")) {
      focus = { type: "text", id: focusedText.dataset.id || null };
    }
    return {
      noteIds: [...selected.noteIds],
      textIds: [...selected.textIds],
      shapeIds: [...selected.shapeIds],
      imageIds: [...selected.imageIds],
      strokeIds: [...selected.strokeIds],
      connectionIds: [...selected.connectionIds],
      focus,
    };
  }

  function flowboardRestoreSelection(previousSelection) {
    if (!previousSelection) {
      clearSelection();
      return;
    }
    const noteIds = previousSelection.noteIds.filter((id) => findNote(id));
    const textIds = previousSelection.textIds.filter((id) => findText(id));
    const shapeIds = previousSelection.shapeIds.filter((id) => findShape(id));
    const imageIds = previousSelection.imageIds.filter((id) => findImage(id));
    const strokeIds = previousSelection.strokeIds.filter((id) => findStroke(id));
    applyMultiSelection(noteIds, textIds, shapeIds, imageIds, strokeIds);
    const connectionId = previousSelection.connectionIds.find((id) => findConnection(id)) || null;
    if (connectionId && !selectedIdGroups().total) {
      state.selectedConnectionId = connectionId;
    }
  }

  function flowboardRestoreFocus(previousSelection) {
    if (!previousSelection || !previousSelection.focus || !previousSelection.focus.id) return;
    if (previousSelection.focus.type === "note" && findNote(previousSelection.focus.id)) {
      focusNoteBody(previousSelection.focus.id);
      return;
    }
    if (previousSelection.focus.type === "text" && findText(previousSelection.focus.id)) {
      focusTextContent(previousSelection.focus.id);
    }
  }

  function restore(snapshotValue, options = {}) {
    const preserveSelection = options.preserveSelection === true;
    const previousSelection = preserveSelection ? flowboardCaptureSelection() : null;`
const restoreSelectionPatchedSnippet = `      hideShapeTextEditor();
      if (preserveSelection) flowboardRestoreSelection(previousSelection);
      else clearSelection();
      state.pendingConnectionNoteId = null;`
const restoreRenderPatchedSnippet = `      render();
      if (preserveSelection) flowboardRestoreFocus(previousSelection);
      saveNow();`

const hostBridgeSnippet = `${storageKeySnippet}
  function flowboardHostPayload() {
    return window.__FLOWBOARD_HOST_PAYLOAD__ || null;
  }

  function flowboardShadowStorageKey() {
    const payload = flowboardHostPayload();
    return payload ? STORAGE_KEY + "." + payload.mindmapId : STORAGE_KEY;
  }

  function flowboardShadowUpdatedAtKey() {
    return flowboardShadowStorageKey() + ".updatedAt";
  }

  function flowboardWriteShadowSnapshot(snapshotValue, updatedAt = new Date().toISOString()) {
    localStorage.setItem(flowboardShadowStorageKey(), snapshotValue);
    localStorage.setItem(flowboardShadowUpdatedAtKey(), updatedAt);
  }

  function flowboardShadowSnapshot() {
    const payload = flowboardHostPayload();
    if (!payload) return null;
    const snapshotValue = localStorage.getItem(flowboardShadowStorageKey());
    if (!snapshotValue) return null;
    const shadowUpdatedAt = localStorage.getItem(flowboardShadowUpdatedAtKey());
    if (shadowUpdatedAt && payload.updatedAt && shadowUpdatedAt < payload.updatedAt) {
      return null;
    }
    window.setTimeout(() => {
      flowboardPostSave(snapshotValue);
    }, 0);
    return snapshotValue;
  }

  function flowboardPersistSnapshot(snapshotValue) {
    flowboardWriteShadowSnapshot(snapshotValue);
    if (!flowboardHostPayload()) {
      return;
    }
    flowboardPostSave(snapshotValue);
  }

  window.__FLOWBOARD_HOST_FLUSH__ = () => {
    const nextSnapshot = snapshot();
    flowboardPersistSnapshot(nextSnapshot);
    return JSON.parse(nextSnapshot);
  };

  function flowboardDismissFloatingMenus() {
    if (!flowboardHostPayload()) return;
    if (window.flowboardDismissLineMarkerMenus) window.flowboardDismissLineMarkerMenus();
    if (colorPanel && !colorPanel.hidden) setColorPanelOpen(false);
    if (exportMenu && !exportMenu.hidden) setExportMenuOpen(false);
    if (historyMenu && !historyMenu.hidden) setHistoryMenuOpen(false);
  }

  function flowboardHostSnapshot() {
    const shadowSnapshot = flowboardShadowSnapshot();
    if (shadowSnapshot != null) return shadowSnapshot;
    const payload = flowboardHostPayload();
    if (!payload || payload.snapshot == null) return null;
    return typeof payload.snapshot === "string" ? payload.snapshot : JSON.stringify(payload.snapshot);
  }

  function flowboardPostSave(snapshotValue) {
    const payload = flowboardHostPayload();
    if (!payload || !window.parent) return;
    try {
      window.parent.postMessage(
        {
          source: "mindmap-bridge",
          type: "mindmap-save",
          mindmapId: payload.mindmapId,
          snapshot: JSON.parse(snapshotValue),
        },
        "*",
      );
    } catch {}
  }

  window.addEventListener("message", (event) => {
    const payload = flowboardHostPayload();
    const data = event.data;
    if (!payload || !data || data.source !== "mindmap-host" || data.mindmapId !== payload.mindmapId) return;
    if (data.type !== "mindmap-replace") return;
    const nextSnapshot = typeof data.snapshot === "string" ? data.snapshot : JSON.stringify(data.snapshot || {});
    flowboardWriteShadowSnapshot(nextSnapshot, typeof data.updatedAt === "string" ? data.updatedAt : new Date().toISOString());
    restore(nextSnapshot, { preserveSelection: true });
  });

  window.addEventListener("blur", () => {
    flowboardDismissFloatingMenus();
  });

  window.addEventListener("pagehide", () => {
    flowboardPersistSnapshot(snapshot());
  });`

function patchLegacyAppScript() {
  // ponytail: patch the original mindmap in place instead of rewriting 4k+ lines into React.
  return legacyAppScript
    .replace(storageKeySnippet, hostBridgeSnippet)
    .replace(hydrateSnippet, 'const raw = flowboardHostSnapshot() ?? localStorage.getItem(STORAGE_KEY);')
    .replace(clearBrokenStorageSnippet, 'if (!flowboardHostPayload()) localStorage.removeItem(STORAGE_KEY);')
    .replace(queueSaveSnippet, queueSavePatchedSnippet)
    .replaceAll(noteSelectionSnippet, noteSelectionPatchedSnippet)
    .replace(notePointerPreludeSnippet, notePointerPreludePatchedSnippet)
    .replace(noteBodyClickSnippet, noteBodyClickPatchedSnippet)
    .replace(textPointerSelectionSnippet, textPointerSelectionPatchedSnippet)
    .replace(textFocusSelectionSnippet, textFocusSelectionPatchedSnippet)
    .replace(imageSelectionSnippet, imageSelectionPatchedSnippet)
    .replace(shapeSelectionSnippet, shapeSelectionPatchedSnippet)
    .replace(noteFocusSnippet, noteFocusPatchedSnippet)
    .replace(focusNoteBodySelectionSnippet, focusNoteBodySelectionPatchedSnippet)
    .replace(endPointerModeSnippet, endPointerModePatchedSnippet)
    .replace(restoreSignatureSnippet, restoreSignaturePatchedSnippet)
    .replace(restoreSelectionSnippet, restoreSelectionPatchedSnippet)
    .replace(restoreRenderSnippet, restoreRenderPatchedSnippet)
    .replace(
      saveSnippet,
      'const nextSnapshot = snapshot(); flowboardPersistSnapshot(nextSnapshot);',
    )
}

function escapeInlineScript(value: string) {
  return value.replace(/<\/script/gi, '<\\/script')
}

export function buildLegacyMindmapSrcDoc(
  mindmapId: string,
  snapshot: MindmapSnapshot,
  updatedAt: string,
) {
  const payload = JSON.stringify({
    mindmapId,
    snapshot,
    updatedAt,
  })

  return legacyIndexHtml
    .replace('<link rel="stylesheet" href="./styles.css" />', `<style>${legacyStyles}</style>`)
    .replace(
      '<script src="./app.js"></script>',
      `<script>window.__FLOWBOARD_DOCUMENT_VERSION__ = ${JSON.stringify(
        LEGACY_MINDMAP_DOCUMENT_VERSION,
      )}; window.__FLOWBOARD_HOST_PAYLOAD__ = ${escapeInlineScript(
        payload,
      )};</script><script>${escapeInlineScript(patchLegacyAppScript())}</script>`,
    )
}

