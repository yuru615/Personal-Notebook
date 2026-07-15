# PDF and Unified File Drop Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Import text-based PDFs as editable pages and route every supported dropped file according to its type and target.

**Architecture:** `pdfImport.ts` dynamically loads `pdfjs-dist`, reads local PDF text and metadata, then maps positioned text items to existing heading/paragraph blocks. `App.tsx` owns one ordered drop dispatcher. Existing page store actions create document pages; existing block and asset actions append ordinary attachments.

**Tech Stack:** TypeScript, React, pdfjs-dist, Vitest, Testing Library.

---

### Task 1: Add the approved local PDF parser dependency

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`

- [x] Run `npm install pdfjs-dist@6.1.200` after the user-approved dependency review.
- [x] Confirm the lockfile records the exact dependency and no unrelated package changes occur.

### Task 2: Test and implement PDF text-to-block conversion

**Files:**
- Create: `src/domain/pdfImport.test.ts`
- Create: `src/domain/pdfImport.ts`

- [x] Write failing tests for metadata/file-name title selection, heading-level inference, paragraph grouping, and empty-text rejection using positioned text fixtures.
- [x] Run `npm test -- src/domain/pdfImport.test.ts` and confirm the missing converter fails.
- [x] Implement a pure positioned-text mapper plus `parsePdfPage(fileName, bytes)` that dynamically loads PDF.js and returns title and blocks.
- [x] Run the test file and confirm it passes.

### Task 3: Generalize drop routing before changing UI targets

**Files:**
- Modify: `src/app/App.test.tsx`
- Modify: `src/app/App.tsx`

- [x] Add failing tests for PDF top-level and child-page import, PDF original-file blocks, Markdown/TXT document drops, and ordinary attachment drops to the current page.
- [x] Run the focused App tests and confirm current behavior only recognizes DOCX or routes attachments to the inbox.
- [x] Add a type classifier and ordered dispatcher: documents create pages; ordinary attachments append to the current page or use the inbox; `.zhiqi` stays out of automatic drop import.
- [x] Reuse the atomic child-page action and existing asset/file block helpers.
- [x] Run the focused App tests and confirm they pass.

### Task 4: Wire sidebar and page-body targets to the shared dispatcher

**Files:**
- Modify: `src/components/sidebar/SidebarTree.test.tsx`
- Modify: `src/components/sidebar/SidebarTree.tsx`
- Modify: `src/app/App.tsx`

- [x] Add failing target tests for mixed document/media drops in the sidebar blank area and page body.
- [x] Run the focused tests and confirm the old DOCX-specific callbacks cannot represent all file categories.
- [x] Replace DOCX-specific target callbacks with one target-aware callback; preserve page reordering and the global shell fallback.
- [x] Run the focused tests and confirm they pass.

### Task 5: Record and verify

**Files:**
- Modify: `docs/updates.md`

- [x] Update the dated user-facing change record.
- [x] Run `npm test`, `npm run lint`, `npm run build`, and `npm run tauri:build:windows`.
