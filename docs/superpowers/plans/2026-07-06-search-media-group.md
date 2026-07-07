# Search Media Group Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a dedicated media group/filter in search results and show media descriptions alongside file names.

**Architecture:** Keep media hits as existing `page` search results and classify them in the dialog by `matchSource === 'media'` so the change stays narrow. Update both the in-memory TypeScript search path and the Rust desktop indexing path so browser and desktop search stay aligned.

**Tech Stack:** React, TypeScript, Vitest, Rust, rusqlite

---

### Task 1: Lock the UI behavior with tests

**Files:**
- Modify: `src/components/search/SearchDialog.test.tsx`
- Test: `src/components/search/SearchDialog.test.tsx`

- [ ] **Step 1: Write the failing test**

Add a test that returns one media hit and one normal page hit from `onSearch`, then assert:
- a `媒体` group heading is rendered
- the media filter chip is rendered
- clicking the media filter keeps only the media result visible

- [ ] **Step 2: Run test to verify it fails**

Run: `C:/Program Files/nodejs/npm.cmd test -- src/components/search/SearchDialog.test.tsx`
Expected: FAIL because the media group/filter does not exist yet.

- [ ] **Step 3: Write minimal implementation**

Update `SearchDialog.tsx` and `src/ui/copy.ts` to:
- add `media` to `SearchFilter`
- filter media results by `matchSource === 'media'`
- render a separate media group and exclude those hits from the normal page group

- [ ] **Step 4: Run test to verify it passes**

Run: `C:/Program Files/nodejs/npm.cmd test -- src/components/search/SearchDialog.test.tsx`
Expected: PASS

### Task 2: Lock visible media excerpt behavior with tests

**Files:**
- Modify: `src/domain/search.test.ts`
- Test: `src/domain/search.test.ts`

- [ ] **Step 1: Write the failing test**

Extend media search coverage to assert an image/audio result excerpt includes both filename and description text when `caption` or `alt` exists.

- [ ] **Step 2: Run test to verify it fails**

Run: `C:/Program Files/nodejs/npm.cmd test -- src/domain/search.test.ts`
Expected: FAIL because media excerpts currently only show filenames.

- [ ] **Step 3: Write minimal implementation**

Update `src/domain/search.ts` and `src-tauri/src/storage/search.rs` so media excerpts are built as:
- filename only when no description exists
- `filename / description...` when caption or alt exists

- [ ] **Step 4: Run test to verify it passes**

Run: `C:/Program Files/nodejs/npm.cmd test -- src/domain/search.test.ts`
Expected: PASS

### Task 3: Record the user-visible change

**Files:**
- Modify: `docs/updates.md`

- [ ] **Step 1: Add a brief update entry**

Document the new media search group and the visible media description improvement in the latest 2026-07-06 section.

- [ ] **Step 2: Verify wording**

Check that the entry includes a short summary, detailed bullets, and the verification commands used for this task.

### Task 4: Run focused verification

**Files:**
- Verify only

- [ ] **Step 1: Run focused frontend tests**

Run: `C:/Program Files/nodejs/npm.cmd test -- src/domain/search.test.ts src/components/search/SearchDialog.test.tsx`
Expected: PASS

- [ ] **Step 2: Run focused desktop Rust tests if available**

Run: `cargo test search`
Expected: PASS, or document if no direct targeted test exists.

- [ ] **Step 3: Report actual verification status**

Only claim completion after the fresh command output confirms the result.
