# Page Properties, Text Selection and Link Behavior Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users configure page-property visibility, copy text across adjacent text blocks reliably, and choose how external links open.

**Architecture:** Persist two workspace preferences (new-page property visibility and external-link activation) alongside existing editor settings, and persist one page-level property visibility flag. Keep page-property definitions and values unchanged. Extend the existing editor pointer handling only for a drag that starts in a text editor and crosses into a second text block; left-gutter and blank-area drags remain block marquee selection.

**Tech Stack:** React 19, TypeScript, Zustand vanilla store, Vitest, existing CSS and rich-text editor.

---

### Task 1: Persist page-property visibility and link activation preferences

**Files:**
- Modify: `src/domain/types.ts`
- Modify: `src/store/createWorkspaceStore.ts`
- Test: `src/store/createWorkspaceStore.test.ts`

- [ ] **Step 1: Write failing store tests**

Add a test that a new page inherits `pageDefaults.showProperties`, an existing page can change `showProperties`, and link activation defaults to `modifier` when absent.

- [ ] **Step 2: Run the focused store tests and verify they fail**

Run: `npx vitest run src/store/createWorkspaceStore.test.ts`

- [ ] **Step 3: Add the minimal data contract and store actions**

Add `showProperties` to `PageDisplayDefaults` and `PageRecord`, add `linkOpenMode` to `WorkspaceSettings`, normalize old snapshots so existing pages remain visible, and persist `setPagePropertiesVisible` plus `setLinkOpenMode` through the existing snapshot path.

- [ ] **Step 4: Run the focused store tests and verify they pass**

Run: `npx vitest run src/store/createWorkspaceStore.test.ts`

### Task 2: Expose property visibility and link behavior in existing settings surfaces

**Files:**
- Modify: `src/components/settings/SettingsCenter.tsx`
- Modify: `src/components/settings/SettingsCenter.test.tsx`
- Modify: `src/components/export/ExportImportPanel.tsx`
- Modify: `src/components/export/ExportImportPanel.test.tsx`
- Modify: `src/app/App.tsx`
- Modify: `src/ui/copy.ts`

- [ ] **Step 1: Write failing UI tests**

Assert that Settings Center can set the new-page property default and link activation mode, and that the page right-top menu toggles the current page's property panel.

- [ ] **Step 2: Run focused UI tests and verify they fail**

Run: `npx vitest run src/components/settings/SettingsCenter.test.tsx src/components/export/ExportImportPanel.test.tsx`

- [ ] **Step 3: Wire existing controls without adding a new dialog**

Place the two global controls in the existing editing/page-defaults Settings Center section. Add a `显示页面属性` checkbox to the current page view section in `ExportImportPanel`, and render `PagePropertiesPanel` only when `page.showProperties` is true.

- [ ] **Step 4: Run focused UI tests and verify they pass**

Run: `npx vitest run src/components/settings/SettingsCenter.test.tsx src/components/export/ExportImportPanel.test.tsx`

### Task 3: Preserve text copy across text blocks in safe selection mode

**Files:**
- Modify: `src/components/editor/BlockEditor.tsx`
- Modify: `src/components/editor/BlockEditor.test.tsx`

- [ ] **Step 1: Write the failing editor test**

Cover a primary-button drag beginning in a rich-text block and ending in a second rich-text block while `safe_zone_only` is active; it must not create selected block rows and must keep a DOM text range spanning both editors.

- [ ] **Step 2: Run the focused editor test and verify it fails**

Run: `npx vitest run src/components/editor/BlockEditor.test.tsx`

- [ ] **Step 3: Add the smallest selection bridge**

Track the editable drag start only in safe mode, and once the pointer enters a second text editor, update the DOM text range from the first caret to the current caret. Do not change same-block native selection or the existing left-gutter/blank-area marquee path.

- [ ] **Step 4: Run the focused editor test and verify it passes**

Run: `npx vitest run src/components/editor/BlockEditor.test.tsx`

### Task 4: Apply the configurable external-link activation rule

**Files:**
- Modify: `src/components/editor/RichTextEditable.tsx`
- Modify: `src/components/editor/RichTextEditable.test.tsx`
- Modify: `src/components/editor/BlockEditor.tsx`

- [ ] **Step 1: Write failing rich-text tests**

Assert that normal click opens an external link in `direct` mode, Ctrl-click opens it in `modifier` mode, and page-relation links keep their current direct navigation behavior.

- [ ] **Step 2: Run the focused rich-text tests and verify they fail**

Run: `npx vitest run src/components/editor/RichTextEditable.test.tsx`

- [ ] **Step 3: Pass the setting through the editor and keep external opening centralized**

Add `linkOpenMode` as an optional prop with `modifier` fallback, prevent native navigation for configured external clicks, and call the existing `openExternalLink` helper for both supported modes.

- [ ] **Step 4: Run the focused rich-text tests and verify they pass**

Run: `npx vitest run src/components/editor/RichTextEditable.test.tsx`

### Task 5: Verify the integrated change

**Files:**
- Modify: `docs/updates.md`

- [ ] **Step 1: Add a user-facing update entry**

Describe the page property visibility choices, multi-block copy behavior, and link activation setting, including the verification command results.

- [ ] **Step 2: Run full validation**

Run: `npm test` and `npm run build`

