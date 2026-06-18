# Shared Canvas Boundaries Baseline

- Date: 2026-06-18
- Project: `E:\Workspace\P001_Notion个人知识库\notion-web`
- Purpose: Record which whiteboard and mindmap capabilities are already shared in code, which remain mode-specific, and what rule future optimizations should follow.

## 1. Current baseline

The project is now using the `2C` direction in both architecture and implementation:

- shared canvas-adjacent infrastructure stays reusable
- whiteboard and mindmap keep separate business rules

This document is the implementation-side companion to the earlier architecture spec. The spec answered "what should be shared"; this file answers "what is already shared in code today".

## 2. Shared layer already landed

These parts are now explicitly reusable across whiteboard and mindmap:

### 2.1 Entry-card shell

Shared component:

- `src/components/shared/CanvasEntryCard.tsx`

Current consumers:

- `src/components/editor/blocks/WhiteboardBlock.tsx`
- `src/components/editor/blocks/MindmapBlock.tsx`

What moved into the shared layer:

- clickable card container
- preview region
- title/meta layout
- open-action affordance
- accessible open label pattern

What stays mode-specific:

- copy text
- preview generator
- missing-state meaning
- block type and route target

### 2.2 Standalone editor page shell

Shared component:

- `src/components/shared/StructuredCanvasPage.tsx`

Current consumers:

- `src/components/whiteboard/WhiteboardPage.tsx`
- `src/components/mindmap/MindmapPage.tsx`

What moved into the shared layer:

- back button area
- title input shell
- source-page meta row
- missing-state shell
- page-level composition pattern

What stays mode-specific:

- title label copy
- missing-state copy
- actual editor body
- route wiring
- rename persistence target

### 2.3 Shared preview-image styling

Shared style hook:

- `.canvas-entry-preview-image`

This prevents each mode from carrying its own identical preview image sizing rule.

### 2.4 Shared shell style tokens

Shared style hooks:

- `.canvas-entry-card*`
- `.structured-canvas-page*`

What moved into the shared layer:

- entry card container layout
- entry card title/meta alignment
- entry card missing-state shell
- standalone page header and title shell
- standalone page empty-state shell

What stays mode-specific:

- preview background treatment
- canvas/editor interior styling
- mode-specific visual accents

### 2.5 Shared non-page asset persistence path

Shared store-side helper:

- `persistNonPageAssets(...)` in `src/store/createWorkspaceStore.ts`

Current consumers:

- `renameBoard`
- `updateBoardSnapshot`
- `renameMindmap`
- `addMindmapChildNode`
- `renameMindmapNode`
- `addMindmapSiblingNode`
- `deleteMindmapNode`

What moved into the shared layer:

- immediate optimistic store update for non-page content objects
- repository save shape for `{ boards, mindmaps, pages, settings }`
- saved/error status transition for this class of object

What stays mode-specific:

- how the next board snapshot is produced
- how the next mindmap tree is produced
- mode-specific validation and mutation helpers

## 3. Still mode-specific by design

These are intentionally not shared yet:

### 3.1 Whiteboard-only

- freeform element model
- arbitrary arrows and shape drawing
- whiteboard toolbar semantics
- selection-box and pan interaction rules
- whiteboard snapshot schema

### 3.2 Mindmap-only

- node tree model
- parent/child/sibling operations
- root-node constraints
- automatic tree layout
- node-delete subtree semantics
- mindmap route editing flow

## 4. Shared persistence rule

Mindmap changes now follow one immediate-update-plus-persist path in store code:

- `src/store/createWorkspaceStore.ts`

This matters because the shared rule is not "whiteboard and mindmap must use identical state structures". The real shared rule is:

- update user-visible state immediately
- persist the corresponding content object as one unit
- avoid mode-local action paths that can overwrite earlier edits during rapid interaction

That rule should be reused when future canvas-like content types are added.

## 5. Decision rule for future optimization

Before optimizing whiteboard or mindmap, classify the work first:

1. If it improves card shell, page shell, preview container, save flow shape, or other canvas-adjacent scaffolding:
   - optimize once in the shared layer
2. If it changes node-tree semantics or automatic layout:
   - optimize only in mindmap
3. If it changes freeform drawing, arbitrary connectors, or shape editing:
   - optimize only in whiteboard

## 6. Recommended next shared extractions

These are the next safe candidates for shared work:

1. shared page-shell style tokens for whiteboard/mindmap surface layouts
2. shared preview summary contracts for canvas-like blocks
3. shared content-object persistence helper for non-page assets

These should wait until a second consumer clearly benefits:

1. viewport state model
2. keyboard shortcut registry
3. canvas gesture engine

## 7. Guardrail

Do not share an abstraction just because two files look similar. Only extract when the shared part is structurally the same and the mode-specific rule can stay outside the shared component.
