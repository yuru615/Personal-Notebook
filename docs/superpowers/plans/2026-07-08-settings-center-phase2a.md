# Settings Center Phase 2A Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the settings center's placeholder search section into real workspace preferences, and finish the maintenance section by exposing orphan asset cleanup.

**Architecture:** Reuse `WorkspaceSettings` for search presentation preferences so they travel with the workspace and affect the existing global search dialog without introducing a second search-config system. Keep maintenance actions thin by exposing already-existing repository cleanup behavior through the store and settings page instead of adding new storage commands.

**Tech Stack:** React 19, TypeScript, Zustand vanilla, React Router, Vitest

---

## Scope Notes

- This is a small follow-up slice after Phase 1.
- Only land low-risk, already-supported behavior:
  - search result grouping
  - search source-label visibility
  - search excerpt length
  - orphan asset cleanup entry
- Do not add full workspace restore, search-index rebuild, or new desktop permissions in this plan.

## File Structure

- Modify `E:\Workspace\个人知识库-桌面端\src\domain\types.ts`
  - Add workspace-scoped search preferences contracts.
- Modify `E:\Workspace\个人知识库-桌面端\src\store\createWorkspaceStore.ts`
  - Normalize and persist search preferences; expose orphan asset cleanup and settings actions.
- Modify `E:\Workspace\个人知识库-桌面端\src\store\createWorkspaceStore.test.ts`
  - Cover search preferences defaults/persistence and orphan asset cleanup.
- Modify `E:\Workspace\个人知识库-桌面端\src\components\search\SearchDialog.tsx`
  - Respect search preferences for grouping, source labels, and excerpt length.
- Modify `E:\Workspace\个人知识库-桌面端\src\components\search\SearchDialog.test.tsx`
  - Cover grouped/ungrouped rendering, source-label visibility, and excerpt truncation.
- Modify `E:\Workspace\个人知识库-桌面端\src\components\settings\SettingsCenter.tsx`
  - Replace the placeholder search section and add orphan asset cleanup to maintenance.
- Modify `E:\Workspace\个人知识库-桌面端\src\components\settings\SettingsCenter.test.tsx`
  - Cover the new search controls and orphan asset cleanup button.
- Modify `E:\Workspace\个人知识库-桌面端\src\app\App.tsx`
  - Pass new settings actions into the settings route and search dialog.
- Modify `E:\Workspace\个人知识库-桌面端\docs\updates.md`
  - Record the Phase 2A settings-center follow-up.

## Tasks

### Task 1: Add Search Preferences To Workspace Settings

**Files:**
- Modify: `E:\Workspace\个人知识库-桌面端\src\domain\types.ts`
- Modify: `E:\Workspace\个人知识库-桌面端\src\store\createWorkspaceStore.ts`
- Test: `E:\Workspace\个人知识库-桌面端\src\store\createWorkspaceStore.test.ts`

- [ ] Add failing tests for:
  - default normalized search preferences
  - persisting `setSearchPreferences(...)`
  - orphan asset cleanup delegating to repository
- [ ] Run `npm run test -- src/store/createWorkspaceStore.test.ts` and confirm the new assertions fail for the expected reason.
- [ ] Add `SearchExcerptLength`, `SearchPreferences`, and `WorkspaceSettings.searchPreferences`.
- [ ] Normalize search preferences in the store and expose:
  - `setSearchPreferences`
  - `cleanupOrphanAssets`
- [ ] Re-run `npm run test -- src/store/createWorkspaceStore.test.ts`.

### Task 2: Apply Search Preferences In The Search Dialog

**Files:**
- Modify: `E:\Workspace\个人知识库-桌面端\src\components\search\SearchDialog.tsx`
- Test: `E:\Workspace\个人知识库-桌面端\src\components\search\SearchDialog.test.tsx`

- [ ] Add failing tests for:
  - ungrouped result rendering when grouping is disabled
  - hidden source labels when disabled
  - shorter excerpt output when excerpt length is set to `short`
- [ ] Run `npm run test -- src/components/search/SearchDialog.test.tsx` and confirm the new cases fail.
- [ ] Add a `searchPreferences` prop and apply the minimum rendering logic:
  - grouped sections on/off
  - source label on/off
  - excerpt trimming helper
- [ ] Re-run `npm run test -- src/components/search/SearchDialog.test.tsx`.

### Task 3: Wire The Settings UI And App Shell

**Files:**
- Modify: `E:\Workspace\个人知识库-桌面端\src\components\settings\SettingsCenter.tsx`
- Modify: `E:\Workspace\个人知识库-桌面端\src\components\settings\SettingsCenter.test.tsx`
- Modify: `E:\Workspace\个人知识库-桌面端\src\app\App.tsx`

- [ ] Add failing tests for:
  - toggling search grouping from settings
  - toggling source-label visibility from settings
  - switching excerpt length from settings
  - triggering orphan asset cleanup from the maintenance section
- [ ] Run `npm run test -- src/components/settings/SettingsCenter.test.tsx`.
- [ ] Replace the search placeholder with real controls and add the orphan asset cleanup action.
- [ ] Pass the new handlers from `App.tsx` into both `SettingsCenter` and `SearchDialog`.
- [ ] Re-run:
  - `npm run test -- src/components/settings/SettingsCenter.test.tsx`
  - `npm run test -- src/app/App.test.tsx`

### Task 4: Update Notes And Verify

**Files:**
- Modify: `E:\Workspace\个人知识库-桌面端\docs\updates.md`

- [ ] Add a new `2026-07-08` update entry for the Phase 2A follow-up.
- [ ] Run the targeted verification set:
  - `npm run test -- src/store/createWorkspaceStore.test.ts src/components/search/SearchDialog.test.tsx src/components/settings/SettingsCenter.test.tsx src/app/App.test.tsx`
  - `npm run build`

## Self-Review

- Spec coverage:
  - turns the search settings section from placeholder into real controls
  - keeps preferences workspace-scoped
  - finishes the maintenance section with the missing orphan asset cleanup entry
- Placeholder scan:
  - no TODO steps
  - no deferred implementation hidden inside a task
- Risk check:
  - no new Tauri commands
  - no restore/rebuild actions
  - no worktree requirement
