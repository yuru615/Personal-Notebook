# Synced And Reference Blocks Closure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the synced block and reference block feature so it is safe for long-term workspace data, interaction-consistent in the editor, and stable in search and import/export flows.

**Architecture:** Keep the current one-model design: page blocks only store synced block instances, while shared bodies remain in workspace-level `syncedBlockGroups`. Implement closure in the order B -> A -> C: first seal data integrity and persistence paths, then unify editor behavior, then lock search and product semantics without expanding into a full relation graph.

**Tech Stack:** React 19, TypeScript, Zustand vanilla, Vitest, Testing Library, Tauri 2, Rust, rusqlite, SQLite FTS5.

---

## File Structure

- Modify `src/store/createWorkspaceStore.ts`: close resource scanning, deletion reconciliation, copy semantics, and snapshot repair.
- Modify `src/store/createWorkspaceStore.test.ts`: add regression coverage for synced-group resource retention, page duplication semantics, and instance lifecycle.
- Modify `src/domain/syncedBlocks.ts`: add or centralize snapshot/group repair helpers as pure logic where possible.
- Modify `src/domain/syncedBlocks.test.ts`: cover helper-level repair and semantics.
- Modify `src/lib/workspaceRepository.ts`: normalize and repair synced-group data on load/save boundaries if needed.
- Modify `src/lib/workspaceRepository.test.ts`: verify legacy and malformed snapshot handling.
- Modify `src-tauri/src/storage/mod.rs`: keep page-package and JSON flows aligned with synced-group semantics.
- Modify `src-tauri/src/storage/models.rs`: ensure synced-group models fully participate in package and backup payloads.
- Modify `src-tauri/src/storage/search.rs`: confirm search documents preserve instance-based synced/reference hits.
- Modify `src/components/editor/BlockEditor.tsx`: unify menu rules, focus restoration, and instance actions.
- Modify `src/components/editor/BlockEditor.synced.test.tsx`: cover keyboard/focus/menu regressions.
- Modify `src/components/editor/blocks/SyncedBlockContainer.tsx`: unify primary/sync/reference/missing rendering rules and focus semantics.
- Modify `src/components/editor/blocks/SyncedBlockContainer.test.tsx`: cover the behavior matrix for readonly, complex-block shells, and fallback actions.
- Modify `src/components/search/SearchDialog.tsx`: preserve instance-based jump behavior and source labels.
- Modify `src/components/search/SearchDialog.test.tsx`: cover synced/reference result labels and jump semantics.
- Modify `src/styles/index.css`: align the four visual states and interaction feedback.
- Modify `src/styles/pageOutlineLayout.test.ts`: lock state-specific CSS regressions.
- Modify `docs/updates.md`: append the closure work summary after implementation lands.

---

### Task 1: Seal Synced-Group Data Integrity In The Store

**Files:**
- Modify: `src/store/createWorkspaceStore.ts`
- Modify: `src/store/createWorkspaceStore.test.ts`
- Modify: `src/domain/syncedBlocks.ts`
- Modify: `src/domain/syncedBlocks.test.ts`

- [ ] **Step 1: Write the failing tests for resource retention and instance lifecycle**

Add focused tests to `src/store/createWorkspaceStore.test.ts` for:

```ts
it('keeps whiteboards referenced from synced groups during page deletion', async () => {
  // build one synced group containing a whiteboard block
  // delete the page that hosts the synced instance
  // expect the whiteboard to stay until the last synced instance is gone
})

it('keeps data tables and mindmaps referenced from synced groups during resource filtering', async () => {
  // same structure as the whiteboard test
})

it('reassigns primaryInstanceId when deleting the primary synced instance', async () => {
  // create one group with two instances
  // delete the primary instance
  // expect the remaining instance to become primary
})

it('removes the synced group when the last instance is deleted', async () => {
  // create one group with one instance
  // delete the instance
  // expect the group array to be empty
})
```

- [ ] **Step 2: Run the targeted store test file and verify failure**

Run:

```bash
npm run test -- src/store/createWorkspaceStore.test.ts
```

Expected:

- new synced-group regression tests fail
- existing store tests still run

- [ ] **Step 3: Implement the minimal store fixes**

Update `src/store/createWorkspaceStore.ts` so that:

```ts
function collectReferencedBoardIds(
  pages: PageRecord[],
  syncedBlockGroups: SyncedBlockGroupRecord[] = [],
) {
  const ids = new Set<string>()

  for (const page of pages) {
    for (const block of page.blocks) {
      if (block.type === 'whiteboard') {
        ids.add(block.boardId)
      }
    }
  }

  for (const group of syncedBlockGroups) {
    for (const block of group.blocks) {
      if (block.type === 'whiteboard') {
        ids.add(block.boardId)
      }
    }
  }

  return ids
}
```

Apply the same pattern to:

- `collectReferencedDataTableIds`
- `collectReferencedMindmapIds`
- `filterResourcesReferencedByPages`

Keep the primary-instance reconciliation in one path and avoid inventing a second state machine.

- [ ] **Step 4: Add one pure helper regression for malformed group repair**

In `src/domain/syncedBlocks.test.ts`, add:

```ts
it('returns null when no replacement primary instance exists', () => {
  expect(getNextPrimaryInstanceId('instance_1', [])).toBeNull()
})
```

If a new pure repair helper is introduced, test it here instead of pushing all logic into store-only tests.

- [ ] **Step 5: Re-run the focused integrity tests**

Run:

```bash
npm run test -- src/domain/syncedBlocks.test.ts src/store/createWorkspaceStore.test.ts
```

Expected:

- all synced-group integrity tests pass

- [ ] **Step 6: Commit**

```bash
git add src/domain/syncedBlocks.ts src/domain/syncedBlocks.test.ts src/store/createWorkspaceStore.ts src/store/createWorkspaceStore.test.ts
git commit -m "fix: seal synced group store integrity"
```

---

### Task 2: Lock Copy, Backup, And Page-Package Semantics

**Files:**
- Modify: `src/store/createWorkspaceStore.test.ts`
- Modify: `src/lib/workspaceRepository.ts`
- Modify: `src/lib/workspaceRepository.test.ts`
- Modify: `src-tauri/src/storage/mod.rs`
- Modify: `src-tauri/src/storage/models.rs`
- Modify: `src-tauri/src/storage/search.rs`

- [ ] **Step 1: Write the failing duplication and snapshot-boundary tests**

Add tests that explicitly lock the chosen semantics:

```ts
it('duplicates a page with synced instances still pointing at the original group', async () => {
  // duplicate a page that contains a synced_block
  // expect the copied block to keep groupId
  // expect the copied block to get a fresh instanceId
})

it('repairs malformed synced groups when loading a snapshot', async () => {
  // load a snapshot where primaryInstanceId no longer exists
  // expect repository/store normalization to repair it or drop the dead group
})
```

Add Rust-side or repository-side regression coverage for:

- page package export includes referenced synced groups
- page package import rewrites group and instance ids while preserving intra-package sharing

- [ ] **Step 2: Run the boundary tests and verify failure**

Run:

```bash
npm run test -- src/store/createWorkspaceStore.test.ts src/lib/workspaceRepository.test.ts
```

And:

```bash
cargo test --manifest-path src-tauri/Cargo.toml synced
```

Expected:

- at least one new JS test fails
- at least one new Rust/package test fails or is missing

- [ ] **Step 3: Implement normalization and package fixes**

Keep the logic minimal:

- preserve current page-duplicate behavior
- normalize malformed synced groups at one boundary
- reuse existing page-package id remap flow instead of inventing a parallel exporter

Implementation direction:

```ts
// repository/store boundary
const repairedSyncedGroups = reconcileSyncedBlockGroups(
  repairedPages,
  snapshot.syncedBlockGroups ?? [],
)
```

Rust side should mirror the same invariants:

- no exported instance without its group
- imported groups always get fresh ids
- imported instances inside one package continue sharing the same remapped group id

- [ ] **Step 4: Re-run the boundary regression suite**

Run:

```bash
npm run test -- src/store/createWorkspaceStore.test.ts src/lib/workspaceRepository.test.ts
```

And:

```bash
cargo test --manifest-path src-tauri/Cargo.toml synced
```

Expected:

- duplication semantics locked
- malformed snapshot repair covered
- page-package regressions pass

- [ ] **Step 5: Commit**

```bash
git add src/store/createWorkspaceStore.test.ts src/lib/workspaceRepository.ts src/lib/workspaceRepository.test.ts src-tauri/src/storage/mod.rs src-tauri/src/storage/models.rs src-tauri/src/storage/search.rs
git commit -m "fix: lock synced block persistence semantics"
```

---

### Task 3: Unify The Editor Behavior Matrix

**Files:**
- Modify: `src/components/editor/BlockEditor.tsx`
- Modify: `src/components/editor/BlockEditor.synced.test.tsx`
- Modify: `src/components/editor/blocks/SyncedBlockContainer.tsx`
- Modify: `src/components/editor/blocks/SyncedBlockContainer.test.tsx`
- Modify: `src/styles/index.css`
- Modify: `src/styles/pageOutlineLayout.test.ts`

- [ ] **Step 1: Write the failing editor-behavior tests**

Add or extend tests for:

```ts
it('shows open-primary and unsync actions for reference instances', async () => {})
it('hides open-primary for the primary sync instance', async () => {})
it('restores focus to the first local block after unsync', async () => {})
it('renders complex blocks in reference mode as readonly shells with one jump action', async () => {})
it('renders a distinct visual focus state for reference instances', () => {})
```

- [ ] **Step 2: Run the synced editor test set and verify failure**

Run:

```bash
npm run test -- src/components/editor/BlockEditor.synced.test.tsx src/components/editor/blocks/SyncedBlockContainer.test.tsx src/styles/pageOutlineLayout.test.ts
```

Expected:

- focus/menu/state tests fail before implementation

- [ ] **Step 3: Implement the UI rule set**

Make the rules explicit in code:

- primary sync instance: editable where supported, no “前往原位置”
- non-primary sync instance: editable where supported, can jump to primary
- reference instance: readonly, can jump to primary, can unsync
- missing instance: degraded shell, can only unsync

Keep the rendering lightweight. Prefer:

```ts
const canOpenPrimary =
  primaryLocation !== null &&
  (block.mode === 'reference' || group?.primaryInstanceId !== block.instanceId)
```

For complex block handling, keep the current shell strategy and unify labels instead of introducing embedded editors.

- [ ] **Step 4: Re-run the synced editor suite**

Run:

```bash
npm run test -- src/components/editor/BlockEditor.synced.test.tsx src/components/editor/blocks/SyncedBlockContainer.test.tsx src/styles/pageOutlineLayout.test.ts
```

Expected:

- menu rules pass
- focus rules pass
- style regression assertions pass

- [ ] **Step 5: Commit**

```bash
git add src/components/editor/BlockEditor.tsx src/components/editor/BlockEditor.synced.test.tsx src/components/editor/blocks/SyncedBlockContainer.tsx src/components/editor/blocks/SyncedBlockContainer.test.tsx src/styles/index.css src/styles/pageOutlineLayout.test.ts
git commit -m "fix: unify synced block editor behavior"
```

---

### Task 4: Lock Search Semantics And User-Visible Labels

**Files:**
- Modify: `src/components/search/SearchDialog.tsx`
- Modify: `src/components/search/SearchDialog.test.tsx`
- Modify: `src/domain/search.ts`
- Modify: `src/domain/search.test.ts`
- Modify: `docs/updates.md`

- [ ] **Step 1: Write the failing search regressions**

Add tests for:

```ts
it('keeps synced block hits attached to the instance page', () => {})
it('keeps reference block hits attached to the instance page', () => {})
it('renders distinct source labels for synced and reference content', async () => {})
```

The assertion should verify the jump target is the instance block, not the primary block.

- [ ] **Step 2: Run the search tests and verify failure**

Run:

```bash
npm run test -- src/domain/search.test.ts src/components/search/SearchDialog.test.tsx
```

Expected:

- instance-based jump regression fails before the fix or explicit lock-in

- [ ] **Step 3: Implement the minimal search closure**

Preserve the current product decision:

- search hit location = the actual instance location
- source label = synced block content vs reference block content
- “前往原位置” remains an editor action, not a search redirect rule

If the current code already behaves this way, keep the implementation minimal and let the new tests become the contract.

- [ ] **Step 4: Document the user-visible closure**

Append a new entry to `docs/updates.md` covering:

- synced-group data integrity fixes
- editor behavior unification
- instance-based search semantics

- [ ] **Step 5: Re-run the search and build checks**

Run:

```bash
npm run test -- src/domain/search.test.ts src/components/search/SearchDialog.test.tsx
npm run build
```

Expected:

- search regressions pass
- production build passes

- [ ] **Step 6: Commit**

```bash
git add src/domain/search.ts src/domain/search.test.ts src/components/search/SearchDialog.tsx src/components/search/SearchDialog.test.tsx docs/updates.md
git commit -m "fix: close synced block search semantics"
```

---

## Self-Review

- Spec coverage:
  - B data integrity is covered by Task 1 and Task 2
  - A editor behavior is covered by Task 3
  - C search/product semantics is covered by Task 4
- Placeholder scan:
  - no `TODO` or `TBD`
  - each task names files, tests, and commands
- Type consistency:
  - plan consistently uses `syncedBlockGroups`, `groupId`, `instanceId`, `primaryInstanceId`, `reference`, and `sync`

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-07-07-synced-and-reference-blocks-closure.md`. Two execution options:

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

Which approach?
