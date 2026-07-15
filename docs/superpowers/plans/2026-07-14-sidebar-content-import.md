# Sidebar Content Import Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the compact sidebar's top import button add Markdown files or page packages through one “导入内容” flow, without changing destructive workspace restore.

**Architecture:** `App.tsx` owns file-type routing and reuses the existing Markdown/page-package import paths. `SidebarTree` exposes one explicit content-import callback. No storage or archive schema changes are needed.

**Tech Stack:** TypeScript, React, Vitest, Testing Library.

---

### Task 1: Define the sidebar interaction first

**Files:**
- Modify: `src/components/sidebar/SidebarTree.test.tsx`
- Modify: `src/app/App.test.tsx`

- [x] Add a failing SidebarTree test that passes `onImportContent`, clicks the `导入内容` button, and expects that callback once.
- [x] Add a failing App test that clicks the compact `导入内容` button, selects `guide.md`, and expects the unified file selector to accept `.zhiqi`, `.zip`, `.md`, and `.markdown`.
- [x] Run the two tests and confirm they fail because the button is still named `导入` and dispatches workspace restoration.

### Task 2: Reuse existing safe import paths

**Files:**
- Modify: `src/app/App.tsx`
- Modify: `src/components/sidebar/SidebarTree.tsx`
- Modify: `src/ui/copy.ts`

- [x] Add one combined file filter and an `importContent` dispatcher in `App.tsx`.
- [x] Route Markdown to the existing Markdown parser/page creator and archives to the existing additive page-package importer.
- [x] Rename the SidebarTree callback and button label to `onImportContent` / `导入内容`; keep `onImportWorkspace` in the utility menu unchanged.
- [x] Run the focused tests and confirm they pass.

### Task 3: Record and verify

**Files:**
- Modify: `docs/updates.md`

- [x] Add a short dated user-facing update entry.
- [x] Run the focused UI tests, then `npm test`, `npm run lint`, and `npm run build`.
