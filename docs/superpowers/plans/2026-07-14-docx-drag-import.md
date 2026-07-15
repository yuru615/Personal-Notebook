# DOCX Drag Import Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert a dropped local `.docx` into an editable top-level or child page while retaining its original file.

**Architecture:** A pure `docxImport` module parses DOCX XML with existing `jszip` and returns blocks plus image bytes. `App.tsx` persists those assets and calls page store actions. A dedicated child-page action writes the child and its parent block atomically. `SidebarTree` and the page route choose the parent based on the drop target.

**Tech Stack:** TypeScript, React, JSZip, DOMParser, Vitest, Testing Library.

---

### Task 1: Test and implement a pure DOCX converter

**Files:**
- Create: `src/domain/docxImport.test.ts`
- Create: `src/domain/docxImport.ts`

- [x] Write failing tests using generated DOCX ZIP fixtures for document title fallback, headings, paragraphs, lists, tables, image relationship mapping, and invalid ZIP/XML errors.
- [x] Run `npm test -- src/domain/docxImport.test.ts` and confirm failures are from the missing converter.
- [x] Implement `parseDocxPage(fileName, bytes)` using JSZip and DOMParser. Return `{ title, blocks, images }`; use existing block IDs and no browser/storage APIs.
- [x] Run the same test file and confirm all cases pass.

### Task 2: Persist imported assets and create the correct page

**Files:**
- Modify: `src/app/App.test.tsx`
- Modify: `src/app/App.tsx`

- [x] Add failing App tests that dispatch a DOCX drop to the sidebar and current page, then expect an imported page, converted blocks, an original file block, and a `child_page` block for the child case.
- [x] Run the focused App tests and confirm they fail because DOCX drops still route to the inbox.
- [x] Add one `importDocxFile(file, parentId?)` helper. It parses first, persists extracted image assets and the original file asset, replaces image placeholders, then creates top-level pages normally or uses an atomic child-page action.
- [x] Keep non-DOCX files on the existing inbox path.
- [x] Run the focused App tests and confirm they pass.

### Task 3: Direct drops to the intended target

**Files:**
- Modify: `src/components/sidebar/SidebarTree.test.tsx`
- Modify: `src/components/sidebar/SidebarTree.tsx`
- Modify: `src/app/App.tsx`

- [x] Add failing SidebarTree and page-drop tests for a `.docx` dropped into the page-tree blank area and page body.
- [x] Run the focused component tests and confirm they fail because the root shell consumes all file drops.
- [x] Add minimal target-specific `dragover`/`drop` handlers that stop propagation, pass the DOCX file to `importDocxFile`, and leave page reordering untouched.
- [x] Run the focused tests and confirm they pass.

### Task 4: Record and verify

**Files:**
- Modify: `docs/updates.md`

- [x] Add a dated user-facing update entry including local-only processing and supported conversion scope.
- [x] Run `npm test`, `npm run lint`, and `npm run build`.
- [ ] Start the desktop development app and manually test a representative DOCX dropped into each target (requires a disposable local DOCX and user-visible desktop session).
