# Synced And Reference Blocks Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add shared synced block groups and read-only reference instances to normal pages, with local-first persistence, instance-level search hits, and page-package safe import/export.

**Architecture:** Keep one new page block type, `synced_block`, whose page-side payload is only `{ groupId, instanceId, mode }`. Store the shared body once in workspace-level `syncedBlockGroups`, persist it in SQLite, and expand it into per-page instance hits for search. For v1, creation uses a two-step block-handle range flow instead of building a general block multi-select system, and any mutation that touches shared groups falls back to full snapshot replace instead of inventing a new incremental save command.

**Tech Stack:** React 19, TypeScript, Zustand vanilla, Vitest, Testing Library, Tauri 2, Rust, rusqlite, SQLite FTS5.

---

## File Structure

- Modify `src/domain/types.ts`: add `synced_block`, sync/reference mode, and workspace-level shared-group records.
- Create `src/domain/syncedBlocks.ts`: pure helpers for validation, summaries, primary migration, instance lookup, and unsync cloning.
- Create `src/domain/syncedBlocks.test.ts`: focused coverage for shared-group helpers.
- Modify `src/utils/blockFactory.ts`: create synced block instances with stable ids.
- Modify `src/store/createWorkspaceStore.ts`: add shared-group state and actions for create/insert/edit/delete/unsync/duplicate flows.
- Modify `src/store/createWorkspaceStore.test.ts`: store regression coverage for shared-group lifecycle.
- Modify `src/lib/workspaceRepository.ts`: include `syncedBlockGroups` in load/save normalization and force full replace when shared groups change.
- Modify `src/lib/workspaceRepository.test.ts`: verify full-replace fallback and legacy snapshot normalization.
- Modify `src/domain/search.ts`: expand synced/reference instances into page-level results.
- Modify `src/domain/search.test.ts`: cover per-instance synced/reference hits and same-page multi-hit behavior.
- Modify `src/components/editor/BlockEditor.tsx`: wire sync-range creation, picker dialog, synced block rendering, and new store callbacks.
- Modify `src/components/editor/BlockFrame.tsx`: allow extra menu actions alongside the existing handle menu.
- Modify `src/components/editor/BlockHandleMenu.tsx`: render sync-specific actions, unsync actions, and primary-jump actions.
- Modify `src/components/editor/SlashMenu.tsx`: add “同步块” and “引用块” command entries.
- Modify `src/components/editor/SlashMenu.test.tsx`: cover the new slash entries.
- Modify `src/components/editor/blocks/ParagraphBlock.tsx`, `TodoBlock.tsx`, `ListBlock.tsx`, `RichTextEditable.tsx`, and `AutoGrowTextarea.tsx`: add light read-only support for reference rendering.
- Create `src/components/editor/blocks/SyncedBlockContainer.tsx`: render shared group content inline with mixed editing rules.
- Create `src/components/editor/blocks/SyncedBlockContainer.test.tsx`: focused UI coverage for sync, reference, and primary-jump behavior.
- Create `src/components/editor/SyncedBlockPickerDialog.tsx`: choose an existing shared group and insert it as sync or reference.
- Create `src/components/editor/SyncedBlockPickerDialog.test.tsx`: picker search/select regression tests.
- Modify `src/components/editor/BlockEditor.test.tsx`: editor coverage for two-step sync-range creation and picker insertion.
- Modify `src/components/search/SearchDialog.tsx`: pass through synced/reference source labels without collapsing same-page results.
- Modify `src/components/search/SearchDialog.test.tsx`: verify synced/reference labels in grouped results.
- Modify `src/app/App.tsx`: pass shared groups and synced-block callbacks into page editing and local search.
- Modify `src/app/App.test.tsx`: integration coverage for sync/reference search navigation.
- Modify `src/styles/index.css`: style synced block chrome, picker dialog, inline banners, and reference read-only state.
- Modify `src/ui/copy.ts`: add copy for sync-range flow, picker labels, missing-group placeholders, and primary-edit affordances.
- Modify `src-tauri/src/storage/models.rs`: add Rust snapshot and page-package models for synced groups.
- Modify `src-tauri/src/storage/schema.rs`: add the synced-group table and migration.
- Modify `src-tauri/src/storage/search.rs`: expand synced/reference instances into per-page search documents.
- Modify `src-tauri/src/storage/mod.rs`: load/save synced groups, include them in backup/page-package flows, and add Rust regression tests.
- Modify `docs/updates.md`: record the user-visible synced/reference block feature once implementation is complete.

---

### Task 1: Add The Shared-Group Domain Model And Helpers

**Files:**
- Modify: `src/domain/types.ts`
- Modify: `src/utils/blockFactory.ts`
- Create: `src/domain/syncedBlocks.ts`
- Create: `src/domain/syncedBlocks.test.ts`

- [ ] **Step 1: Write the failing pure-domain tests**

Create `src/domain/syncedBlocks.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import {
  buildSyncedBlockSummary,
  cloneBlocksForUnsync,
  collectSyncedGroupInstances,
  findPrimaryInstanceLocation,
  getNextPrimaryInstanceId,
  validateSyncedGroupBlocks,
} from './syncedBlocks'
import type { PageRecord, SyncedBlockGroupRecord } from './types'

const now = '2026-07-06T00:00:00.000Z'

function createPage(id: string, blocks: PageRecord['blocks']): PageRecord {
  return {
    id,
    parentId: null,
    title: id,
    icon: null,
    cover: null,
    properties: {},
    blocks,
    createdAt: now,
    updatedAt: now,
  }
}

describe('syncedBlocks', () => {
  it('accepts normal blocks and rejects nested synced containers', () => {
    expect(
      validateSyncedGroupBlocks([
        { id: 'block_1', type: 'paragraph', text: 'Alpha' },
        { id: 'block_2', type: 'todo', text: 'Beta', checked: false },
      ]),
    ).toEqual({ ok: true })

    expect(
      validateSyncedGroupBlocks([
        { id: 'block_1', type: 'paragraph', text: 'Alpha' },
        {
          id: 'block_nested',
          type: 'synced_block',
          groupId: 'group_nested',
          instanceId: 'instance_nested',
          mode: 'sync',
        },
      ]),
    ).toEqual({
      ok: false,
      reason: 'nested_synced_block',
      blockId: 'block_nested',
    })
  })

  it('clones unsynced blocks with fresh ids', () => {
    const blocks = cloneBlocksForUnsync(
      [
        { id: 'block_1', type: 'paragraph', text: 'Alpha' },
        { id: 'block_2', type: 'todo', text: 'Beta', checked: true },
      ],
      (() => {
        let index = 0
        return () => `block_new_${++index}`
      })(),
    )

    expect(blocks).toEqual([
      { id: 'block_new_1', type: 'paragraph', text: 'Alpha' },
      { id: 'block_new_2', type: 'todo', text: 'Beta', checked: true },
    ])
  })

  it('derives summaries and primary replacement from existing instances', () => {
    const group: SyncedBlockGroupRecord = {
      id: 'group_1',
      blocks: [
        { id: 'block_1', type: 'heading_2', text: 'Weekly review' },
        { id: 'block_2', type: 'paragraph', text: 'Summary paragraph' },
      ],
      primaryInstanceId: 'instance_1',
      createdAt: now,
      updatedAt: now,
    }

    const pages = [
      createPage('page_1', [
        {
          id: 'container_1',
          type: 'synced_block',
          groupId: 'group_1',
          instanceId: 'instance_1',
          mode: 'sync',
        },
      ]),
      createPage('page_2', [
        {
          id: 'container_2',
          type: 'synced_block',
          groupId: 'group_1',
          instanceId: 'instance_2',
          mode: 'reference',
        },
      ]),
    ]

    expect(buildSyncedBlockSummary(group)).toBe('Weekly review')
    expect(collectSyncedGroupInstances(pages, 'group_1')).toEqual([
      {
        pageId: 'page_1',
        containerBlockId: 'container_1',
        instanceId: 'instance_1',
        mode: 'sync',
      },
      {
        pageId: 'page_2',
        containerBlockId: 'container_2',
        instanceId: 'instance_2',
        mode: 'reference',
      },
    ])
    expect(findPrimaryInstanceLocation(pages, group)).toEqual({
      pageId: 'page_1',
      containerBlockId: 'container_1',
      instanceId: 'instance_1',
      mode: 'sync',
    })
    expect(getNextPrimaryInstanceId(group.primaryInstanceId, ['instance_2'])).toBe('instance_2')
  })
})
```

- [ ] **Step 2: Run the focused tests to verify they fail**

Run:

```bash
npx vitest run src/domain/syncedBlocks.test.ts
```

Expected: FAIL because the synced-block domain model and helper module do not exist yet.

- [ ] **Step 3: Add the minimal shared-group model and helper functions**

In `src/domain/types.ts`, extend the block and snapshot contracts:

```ts
export type BlockType =
  | 'paragraph'
  | 'heading_1'
  | 'heading_2'
  | 'heading_3'
  | 'todo'
  | 'bulleted_list'
  | 'numbered_list'
  | 'child_page'
  | 'code'
  | 'table'
  | 'image'
  | 'video'
  | 'audio'
  | 'whiteboard'
  | 'data_table'
  | 'data_table_inline'
  | 'mindmap'
  | 'synced_block'

export type SyncedBlockMode = 'sync' | 'reference'

export interface SyncedBlockInstanceBlock extends BlockBase {
  type: 'synced_block'
  groupId: string
  instanceId: string
  mode: SyncedBlockMode
}

export interface SyncedBlockGroupRecord {
  id: string
  blocks: BlockRecord[]
  primaryInstanceId: string
  createdAt: string
  updatedAt: string
}

export type BlockRecord =
  | ParagraphBlock
  | Heading1Block
  | Heading2Block
  | Heading3Block
  | TodoBlock
  | BulletedListBlock
  | NumberedListBlock
  | ChildPageBlock
  | CodeBlock
  | TableBlock
  | ImageBlock
  | VideoBlock
  | AudioBlock
  | WhiteboardBlock
  | DataTableBlock
  | MindmapBlock
  | SyncedBlockInstanceBlock

export interface WorkspaceSnapshot {
  boards: BoardRecord[]
  dataTables?: DataTableRecord[]
  mindmaps?: MindmapRecord[]
  syncedBlockGroups?: SyncedBlockGroupRecord[]
  pages: PageRecord[]
  pageProperties?: PagePropertyDefinition[]
  settings: WorkspaceSettings
}
```

In `src/utils/blockFactory.ts`, add a dedicated factory instead of hand-rolling container blocks in the store:

```ts
import type { SyncedBlockInstanceBlock, SyncedBlockMode } from '../domain/types'

export function createSyncedBlockInstanceBlock(
  groupId: string,
  instanceId: string,
  mode: SyncedBlockMode,
): SyncedBlockInstanceBlock {
  return {
    id: createId('block'),
    type: 'synced_block',
    groupId,
    instanceId,
    mode,
  }
}
```

Create `src/domain/syncedBlocks.ts` with the smallest reusable helper surface:

```ts
import type {
  BlockRecord,
  PageRecord,
  SyncedBlockGroupRecord,
  SyncedBlockInstanceBlock,
  SyncedBlockMode,
} from './types'

export const INLINE_EDITABLE_SYNC_BLOCK_TYPES = new Set<BlockRecord['type']>([
  'paragraph',
  'heading_1',
  'heading_2',
  'heading_3',
  'todo',
  'bulleted_list',
  'numbered_list',
])

export function validateSyncedGroupBlocks(
  blocks: BlockRecord[],
):
  | { ok: true }
  | { ok: false; reason: 'empty_selection' | 'nested_synced_block'; blockId?: string } {
  if (blocks.length === 0) {
    return { ok: false, reason: 'empty_selection' }
  }

  const nested = blocks.find((block) => block.type === 'synced_block')
  if (nested) {
    return { ok: false, reason: 'nested_synced_block', blockId: nested.id }
  }

  return { ok: true }
}

export function buildSyncedBlockSummary(group: SyncedBlockGroupRecord) {
  for (const block of group.blocks) {
    switch (block.type) {
      case 'paragraph':
      case 'heading_1':
      case 'heading_2':
      case 'heading_3':
      case 'todo': {
        const text = block.text.trim()
        if (text) {
          return text.slice(0, 48)
        }
        break
      }
      case 'bulleted_list':
      case 'numbered_list': {
        const text = (block.items[0] ?? '').trim()
        if (text) {
          return text.slice(0, 48)
        }
        break
      }
    }
  }

  return '同步块'
}

export function cloneBlocksForUnsync(
  blocks: BlockRecord[],
  createBlockId: () => string,
): BlockRecord[] {
  return structuredClone(blocks).map((block) => ({
    ...block,
    id: createBlockId(),
  }))
}

export function collectSyncedGroupInstances(pages: PageRecord[], groupId: string) {
  return pages.flatMap((page) =>
    page.blocks.flatMap((block) =>
      block.type === 'synced_block' && block.groupId === groupId
        ? [
            {
              pageId: page.id,
              containerBlockId: block.id,
              instanceId: block.instanceId,
              mode: block.mode,
            },
          ]
        : [],
    ),
  )
}

export function findPrimaryInstanceLocation(
  pages: PageRecord[],
  group: SyncedBlockGroupRecord,
) {
  return collectSyncedGroupInstances(pages, group.id).find(
    (instance) => instance.instanceId === group.primaryInstanceId,
  ) ?? null
}

export function getNextPrimaryInstanceId(
  deletedPrimaryInstanceId: string,
  remainingInstanceIds: string[],
) {
  if (remainingInstanceIds.length === 0) {
    return null
  }

  return remainingInstanceIds.find((instanceId) => instanceId !== deletedPrimaryInstanceId)
    ?? remainingInstanceIds[0]
}

export function isInlineEditableSyncedBlock(
  block: BlockRecord,
  mode: SyncedBlockMode,
  isPrimary: boolean,
) {
  if (mode !== 'sync') {
    return false
  }

  if (INLINE_EDITABLE_SYNC_BLOCK_TYPES.has(block.type)) {
    return true
  }

  return isPrimary
}
```

- [ ] **Step 4: Run the focused tests to verify they pass**

Run:

```bash
npx vitest run src/domain/syncedBlocks.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/domain/types.ts src/utils/blockFactory.ts src/domain/syncedBlocks.ts src/domain/syncedBlocks.test.ts
git commit -m "feat: add synced block domain model"
```

---

### Task 2: Normalize Shared Groups In Store State And Repository Persistence

**Files:**
- Modify: `src/store/createWorkspaceStore.ts`
- Modify: `src/store/createWorkspaceStore.test.ts`
- Modify: `src/lib/workspaceRepository.ts`
- Modify: `src/lib/workspaceRepository.test.ts`

- [ ] **Step 1: Write the failing normalization and save-strategy tests**

Add to `src/lib/workspaceRepository.test.ts`:

```ts
it('loads legacy snapshots with syncedBlockGroups defaulted to an empty array', async () => {
  const { repository } = createRepository()
  const legacy = {
    ...createSnapshot(),
    syncedBlockGroups: undefined,
  }

  await repository.replace(legacy as never)

  await expect(repository.load()).resolves.toEqual({
    ...legacy,
    syncedBlockGroups: [],
  })
})

it('falls back to replaceWorkspaceBackup when only synced groups changed', async () => {
  const { repository, calls } = createRepository()
  const snapshot = {
    ...createSnapshot(),
    syncedBlockGroups: [
      {
        id: 'group_1',
        blocks: [{ id: 'block_1', type: 'paragraph', text: 'Alpha' }],
        primaryInstanceId: 'instance_1',
        createdAt: '2026-07-06T00:00:00.000Z',
        updatedAt: '2026-07-06T00:00:00.000Z',
      },
    ],
  }

  await repository.replace(snapshot as never)
  calls.length = 0

  await repository.save({
    ...snapshot,
    syncedBlockGroups: [
      {
        ...snapshot.syncedBlockGroups[0],
        blocks: [{ id: 'block_1', type: 'paragraph', text: 'Alpha updated' }],
        updatedAt: '2026-07-06T00:10:00.000Z',
      },
    ],
  } as never)

  expect(calls).toEqual(['replaceWorkspaceBackup'])
})
```

Add to `src/store/createWorkspaceStore.test.ts`:

```ts
it('bootstraps syncedBlockGroups as an empty array for legacy workspaces', async () => {
  const counted = createCountingRepository({
    ...createWorkspace(),
    syncedBlockGroups: undefined,
  } as never)
  const store = createWorkspaceStore(counted.repository)

  await store.getState().bootstrap()

  expect(store.getState().syncedBlockGroups).toEqual([])
})
```

- [ ] **Step 2: Run the focused tests to verify they fail**

Run:

```bash
npx vitest run src/lib/workspaceRepository.test.ts src/store/createWorkspaceStore.test.ts
```

Expected: FAIL because the snapshot shape and repository logic do not know about `syncedBlockGroups`.

- [ ] **Step 3: Thread synced groups through store snapshots and repository save rules**

In `src/store/createWorkspaceStore.ts`, extend state and normalization:

```ts
export interface WorkspaceState {
  boards: BoardRecord[]
  dataTables: DataTableRecord[]
  mindmaps: MindmapRecord[]
  syncedBlockGroups: SyncedBlockGroupRecord[]
  pages: PageRecord[]
  pageProperties: PagePropertyDefinition[]
  settings: WorkspaceSettings
  // ...
}
```

```ts
function createEmptyState(): WorkspaceState {
  return {
    boards: [],
    dataTables: [],
    mindmaps: [],
    syncedBlockGroups: [],
    pages: [],
    pageProperties: [],
    settings: {
      lastOpenedPageId: null,
      sidebarLayout: 'compact',
      sidebarWidth: 272,
      pinnedSidebarItems: [],
    },
    // ...
  }
}
```

Add `synced_block` to the live block type whitelist and default the shared-group array during bootstrap normalization:

```ts
const rawSyncedBlockGroups = Array.isArray(
  (snapshot as WorkspaceSnapshot & { syncedBlockGroups?: SyncedBlockGroupRecord[] }).syncedBlockGroups,
)
  ? snapshot.syncedBlockGroups ?? []
  : []

if (!Array.isArray((snapshot as WorkspaceSnapshot & { syncedBlockGroups?: SyncedBlockGroupRecord[] }).syncedBlockGroups)) {
  didChange = true
}

const liveBlockTypes = new Set<BlockRecord['type']>([
  'paragraph',
  'heading_1',
  'heading_2',
  'heading_3',
  'todo',
  'bulleted_list',
  'numbered_list',
  'child_page',
  'code',
  'table',
  'image',
  'video',
  'audio',
  'whiteboard',
  'data_table',
  'mindmap',
  'synced_block',
])
```

Include `syncedBlockGroups` everywhere snapshots are created or restored:

```ts
function createSnapshotFromState(
  state: Pick<
    WorkspaceState,
    'boards' | 'dataTables' | 'mindmaps' | 'syncedBlockGroups' | 'pages' | 'pageProperties' | 'settings'
  >,
): WorkspaceSnapshot {
  return structuredClone({
    boards: state.boards,
    dataTables: state.dataTables,
    mindmaps: state.mindmaps,
    syncedBlockGroups: state.syncedBlockGroups,
    pages: state.pages,
    pageProperties: state.pageProperties,
    settings: state.settings,
  })
}
```

In `src/lib/workspaceRepository.ts`, preserve the array on load/save and deliberately force full replace when it changes:

```ts
const nextSnapshot = {
  ...snapshot,
  dataTables: snapshot.dataTables ?? persistedSnapshot?.dataTables ?? [],
  mindmaps: snapshot.mindmaps ?? persistedSnapshot?.mindmaps ?? [],
  syncedBlockGroups: snapshot.syncedBlockGroups ?? persistedSnapshot?.syncedBlockGroups ?? [],
  pageProperties: snapshot.pageProperties ?? persistedSnapshot?.pageProperties ?? [],
}
```

```ts
const syncedGroupsChanged =
  JSON.stringify(previous.syncedBlockGroups) !== JSON.stringify(next.syncedBlockGroups)

const changeCount =
  (pagePropertiesChanged ? 1 : 0) +
  (syncedGroupsChanged ? 1 : 0) +
  changedPages.length +
  changedBoards.length +
  changedDataTables.length +
  changedMindmaps.length

if (syncedGroupsChanged) {
  return false
}
```

```ts
return (
  Array.isArray(previous.dataTables) &&
  Array.isArray(previous.mindmaps) &&
  Array.isArray(previous.syncedBlockGroups) &&
  Array.isArray(previous.pageProperties) &&
  sameRecordOrder(previous.pages, next.pages) &&
  sameRecordOrder(previous.boards, next.boards) &&
  sameRecordOrder(previous.dataTables, next.dataTables) &&
  sameRecordOrder(previous.mindmaps, next.mindmaps) &&
  JSON.stringify(previous.settings) === JSON.stringify(next.settings)
)
```

- [ ] **Step 4: Run the focused tests to verify they pass**

Run:

```bash
npx vitest run src/lib/workspaceRepository.test.ts src/store/createWorkspaceStore.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/store/createWorkspaceStore.ts src/store/createWorkspaceStore.test.ts src/lib/workspaceRepository.ts src/lib/workspaceRepository.test.ts
git commit -m "feat: normalize synced group snapshots"
```

---

### Task 3: Persist Shared Groups In SQLite And Include Them In Backup/Page-Package Flows

**Files:**
- Modify: `src-tauri/src/storage/models.rs`
- Modify: `src-tauri/src/storage/schema.rs`
- Modify: `src-tauri/src/storage/mod.rs`

- [ ] **Step 1: Write the failing Rust persistence and page-package tests**

Add to `src-tauri/src/storage/mod.rs`:

```rust
#[test]
fn export_workspace_backup_round_trips_synced_block_groups() {
    let storage = Storage::open_in_memory_for_tests().expect("storage opens");
    let snapshot = WorkspaceSnapshot {
        boards: vec![],
        data_tables: vec![],
        mindmaps: vec![],
        synced_block_groups: vec![SyncedBlockGroupRecord {
            id: "group_1".to_string(),
            blocks: vec![serde_json::json!({
                "id": "group_block_1",
                "type": "paragraph",
                "text": "Shared text"
            })],
            primary_instance_id: "instance_1".to_string(),
            created_at: "2026-07-06T00:00:00.000Z".to_string(),
            updated_at: "2026-07-06T00:00:00.000Z".to_string(),
        }],
        pages: vec![PageRecord {
            id: "page_1".to_string(),
            parent_id: None,
            title: "Page".to_string(),
            icon: None,
            cover: None,
            properties: Some(serde_json::json!({})),
            is_full_width: None,
            is_small_text: None,
            font_family: None,
            show_outline: None,
            blocks: vec![serde_json::json!({
                "id": "container_1",
                "type": "synced_block",
                "groupId": "group_1",
                "instanceId": "instance_1",
                "mode": "sync"
            })],
            created_at: "2026-07-06T00:00:00.000Z".to_string(),
            updated_at: "2026-07-06T00:00:00.000Z".to_string(),
        }],
        page_properties: vec![],
        settings: WorkspaceSettings { last_opened_page_id: Some("page_1".to_string()) },
    };

    storage.replace_workspace_backup(snapshot.clone()).expect("replace snapshot");

    assert_eq!(storage.export_workspace_backup().expect("export snapshot"), snapshot);
}

#[test]
fn page_package_import_rewrites_synced_group_and_instance_ids() {
    let source = Storage::open_in_memory_for_tests().expect("source opens");
    let target = Storage::open_in_memory_for_tests().expect("target opens");
    let snapshot = WorkspaceSnapshot {
        boards: vec![],
        data_tables: vec![],
        mindmaps: vec![],
        synced_block_groups: vec![SyncedBlockGroupRecord {
            id: "group_1".to_string(),
            blocks: vec![serde_json::json!({
                "id": "group_block_1",
                "type": "paragraph",
                "text": "Shared text"
            })],
            primary_instance_id: "instance_1".to_string(),
            created_at: "2026-07-06T00:00:00.000Z".to_string(),
            updated_at: "2026-07-06T00:00:00.000Z".to_string(),
        }],
        pages: vec![PageRecord {
            id: "page_root".to_string(),
            parent_id: None,
            title: "Root".to_string(),
            icon: None,
            cover: None,
            properties: Some(serde_json::json!({})),
            is_full_width: None,
            is_small_text: None,
            font_family: None,
            show_outline: None,
            blocks: vec![
                serde_json::json!({
                    "id": "container_1",
                    "type": "synced_block",
                    "groupId": "group_1",
                    "instanceId": "instance_1",
                    "mode": "sync"
                }),
                serde_json::json!({
                    "id": "container_2",
                    "type": "synced_block",
                    "groupId": "group_1",
                    "instanceId": "instance_2",
                    "mode": "reference"
                }),
            ],
            created_at: "2026-07-06T00:00:00.000Z".to_string(),
            updated_at: "2026-07-06T00:00:00.000Z".to_string(),
        }],
        page_properties: vec![],
        settings: WorkspaceSettings { last_opened_page_id: Some("page_root".to_string()) },
    };

    source.replace_workspace_backup(snapshot).expect("replace source snapshot");
    let archive = source.export_page_package("page_root").expect("export package");
    let result = target.import_page_package(archive).expect("import package");
    let imported = target.export_workspace_backup().expect("export target snapshot");
    let imported_root = imported
        .pages
        .iter()
        .find(|page| page.id == result.root_page_id)
        .expect("imported root");
    let imported_group = imported.synced_block_groups.first().expect("group exists");

    assert_ne!(imported_group.id, "group_1");
    assert_ne!(imported_group.primary_instance_id, "instance_1");
    assert_eq!(imported_root.blocks.len(), 2);
    assert_eq!(
        imported_root.blocks[0].get("groupId").and_then(serde_json::Value::as_str),
        Some(imported_group.id.as_str())
    );
    assert_ne!(
        imported_root.blocks[0].get("instanceId").and_then(serde_json::Value::as_str),
        Some("instance_1")
    );
    assert_ne!(
        imported_root.blocks[1].get("instanceId").and_then(serde_json::Value::as_str),
        Some("instance_2")
    );
}
```

- [ ] **Step 2: Run the focused Rust tests to verify they fail**

Run:

```bash
cd src-tauri && cargo test export_workspace_backup_round_trips_synced_block_groups
cd src-tauri && cargo test page_package_import_rewrites_synced_group_and_instance_ids
```

Expected: FAIL because Rust snapshots and page packages do not know about synced groups yet.

- [ ] **Step 3: Add the new SQLite table, snapshot model, and page-package rewrite path**

In `src-tauri/src/storage/models.rs`, add the shared-group record and thread it through the workspace and package payloads:

```rust
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncedBlockGroupRecord {
    pub id: String,
    pub blocks: Vec<Value>,
    pub primary_instance_id: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceSnapshot {
    pub boards: Vec<BoardRecord>,
    #[serde(default)]
    pub data_tables: Vec<DataTableRecord>,
    #[serde(default)]
    pub mindmaps: Vec<MindmapRecord>,
    #[serde(default)]
    pub synced_block_groups: Vec<SyncedBlockGroupRecord>,
    pub pages: Vec<PageRecord>,
    #[serde(default)]
    pub page_properties: Vec<PagePropertyDefinition>,
    pub settings: WorkspaceSettings,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PagePackageManifest {
    pub kind: String,
    pub version: u32,
    pub root_page_id: String,
    pub pages: Vec<PageRecord>,
    pub boards: Vec<BoardRecord>,
    pub data_tables: Vec<DataTableRecord>,
    pub mindmaps: Vec<MindmapRecord>,
    #[serde(default)]
    pub synced_block_groups: Vec<SyncedBlockGroupRecord>,
    pub assets: Vec<AssetMeta>,
}
```

In `src-tauri/src/storage/schema.rs`, add the new table with a small migration instead of rewriting the whole schema:

```rust
pub const SCHEMA_VERSION: i64 = 4;
```

Inside `initialize_schema`:

```rust
CREATE TABLE IF NOT EXISTS zhiqi_synced_block_groups (
  id TEXT PRIMARY KEY NOT NULL,
  blocks_json TEXT NOT NULL,
  primary_instance_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
```

Add a v4 migration:

```rust
if current_version < 4 {
    migrate_to_v4(connection)?;
}

fn migrate_to_v4(connection: &Connection) -> StorageResult<()> {
    connection.execute_batch(
        "
        CREATE TABLE IF NOT EXISTS zhiqi_synced_block_groups (
          id TEXT PRIMARY KEY NOT NULL,
          blocks_json TEXT NOT NULL,
          primary_instance_id TEXT NOT NULL,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
        ",
    )?;
    Ok(())
}
```

In `src-tauri/src/storage/mod.rs`, load and save the new table:

```rust
pub fn export_workspace_backup(&self) -> StorageResult<WorkspaceSnapshot> {
    Ok(WorkspaceSnapshot {
        boards: self.load_boards()?,
        data_tables: self.load_data_tables()?,
        mindmaps: self.load_mindmaps()?,
        synced_block_groups: self.load_synced_block_groups()?,
        pages: self.load_pages()?,
        page_properties: self.load_page_property_definitions()?,
        settings: self.load_settings()?,
    })
}
```

```rust
pub fn replace_workspace_backup(&self, snapshot: WorkspaceSnapshot) -> StorageResult<()> {
    self.with_transaction(|| {
        self.clear_workspace()?;
        for (position, page) in snapshot.pages.iter().enumerate() {
            self.insert_page(page, position)?;
        }
        for (position, board) in snapshot.boards.iter().enumerate() {
            self.insert_board(board, position)?;
        }
        for (position, data_table) in snapshot.data_tables.iter().enumerate() {
            self.insert_data_table(data_table, position)?;
        }
        for (position, mindmap) in snapshot.mindmaps.iter().enumerate() {
            self.insert_mindmap(mindmap, position)?;
        }
        self.replace_synced_block_groups(&snapshot.synced_block_groups)?;
        self.replace_page_property_definitions(&snapshot.page_properties)?;
        self.save_settings(&snapshot.settings)?;
        self.rebuild_search_documents()?;
        Ok(())
    })
}
```

Add helpers:

```rust
fn replace_synced_block_groups(
    &self,
    groups: &[SyncedBlockGroupRecord],
) -> StorageResult<()> {
    self.connection
        .execute("DELETE FROM zhiqi_synced_block_groups", [])?;

    for group in groups {
        self.connection.execute(
            "INSERT INTO zhiqi_synced_block_groups
              (id, blocks_json, primary_instance_id, created_at, updated_at)
              VALUES (?1, ?2, ?3, ?4, ?5)",
            params![
                group.id,
                serde_json::to_string(&group.blocks)?,
                group.primary_instance_id,
                group.created_at,
                group.updated_at
            ],
        )?;
    }

    Ok(())
}

fn load_synced_block_groups(&self) -> StorageResult<Vec<SyncedBlockGroupRecord>> {
    let mut statement = self.connection.prepare(
        "SELECT id, blocks_json, primary_instance_id, created_at, updated_at
          FROM zhiqi_synced_block_groups
          ORDER BY created_at, id",
    )?;

    let rows = statement.query_map([], |row| {
        Ok(SyncedBlockGroupRecord {
            id: row.get(0)?,
            blocks: serde_json::from_str(&row.get::<_, String>(1)?)?,
            primary_instance_id: row.get(2)?,
            created_at: row.get(3)?,
            updated_at: row.get(4)?,
        })
    })?;

    rows.collect::<Result<Vec<_>, _>>().map_err(Into::into)
}
```

Thread groups into page-package export and import:

```rust
let synced_group_ids = collect_synced_group_ids_from_pages(&pages);
let synced_block_groups = self
    .load_synced_block_groups()?
    .into_iter()
    .filter(|group| synced_group_ids.iter().any(|id| id == &group.id))
    .collect::<Vec<_>>();
```

```rust
let manifest = PagePackageManifest {
    kind: PAGE_PACKAGE_KIND.to_string(),
    version: PAGE_PACKAGE_VERSION,
    root_page_id: root_page_id.to_string(),
    pages,
    boards,
    data_tables,
    mindmaps,
    synced_block_groups,
    assets,
};
```

Validate package integrity and remap ids on import:

```rust
fn collect_synced_group_ids_from_pages(pages: &[PageRecord]) -> Vec<String> {
    let mut ids = std::collections::BTreeSet::new();

    for page in pages {
        for block in &page.blocks {
            if block.get("type").and_then(Value::as_str) == Some("synced_block") {
                if let Some(group_id) = block.get("groupId").and_then(Value::as_str) {
                    ids.insert(group_id.to_string());
                }
            }
        }
    }

    ids.into_iter().collect()
}
```

```rust
for group in &manifest.synced_block_groups {
    for block in &group.blocks {
        if block.get("type").and_then(Value::as_str) == Some("synced_block") {
            return Err(StorageError::invalid_payload("synced groups must not contain nested synced blocks"));
        }
    }
}
```

```rust
let mut group_id_map = std::collections::HashMap::new();
let mut instance_id_map = std::collections::HashMap::new();

for group in &manifest.synced_block_groups {
    group_id_map.insert(group.id.clone(), import_id("group", &mut counter));
}

for page in &manifest.pages {
    for block in &page.blocks {
        if block.get("type").and_then(Value::as_str) == Some("synced_block") {
            if let Some(instance_id) = block.get("instanceId").and_then(Value::as_str) {
                instance_id_map.insert(instance_id.to_string(), import_id("instance", &mut counter));
            }
        }
    }
}
```

```rust
fn rewrite_synced_group_blocks(
    groups: &mut [SyncedBlockGroupRecord],
    instance_id_map: &std::collections::HashMap<String, String>,
    counter: &mut u64,
) {
    for group in groups {
        if let Some(next_primary) = instance_id_map.get(&group.primary_instance_id) {
            group.primary_instance_id = next_primary.clone();
        }

        for block in &mut group.blocks {
            if let Some(object) = block.as_object_mut() {
                if object.contains_key("id") {
                    object.insert("id".to_string(), Value::String(import_id("block", counter)));
                }
            }
        }
    }
}
```

```rust
fn rewrite_synced_block_instances(
    blocks: &mut [Value],
    group_id_map: &std::collections::HashMap<String, String>,
    instance_id_map: &std::collections::HashMap<String, String>,
) {
    for block in blocks {
        let Some(object) = block.as_object_mut() else {
            continue;
        };

        if object.get("type").and_then(Value::as_str) != Some("synced_block") {
            continue;
        }

        if let Some(group_id) = object.get("groupId").and_then(Value::as_str).map(str::to_string) {
            if let Some(next_id) = group_id_map.get(&group_id) {
                object.insert("groupId".to_string(), Value::String(next_id.clone()));
            }
        }

        if let Some(instance_id) = object.get("instanceId").and_then(Value::as_str).map(str::to_string) {
            if let Some(next_id) = instance_id_map.get(&instance_id) {
                object.insert("instanceId".to_string(), Value::String(next_id.clone()));
            }
        }
    }
}
```

- [ ] **Step 4: Run the focused Rust tests to verify they pass**

Run:

```bash
cd src-tauri && cargo test export_workspace_backup_round_trips_synced_block_groups
cd src-tauri && cargo test page_package_import_rewrites_synced_group_and_instance_ids
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/storage/models.rs src-tauri/src/storage/schema.rs src-tauri/src/storage/mod.rs
git commit -m "feat: persist synced groups in sqlite"
```

---

### Task 4: Expand Search Documents Per Page Instance For Sync And Reference Content

**Files:**
- Modify: `src-tauri/src/storage/search.rs`
- Modify: `src-tauri/src/storage/mod.rs`

- [ ] **Step 1: Write the failing Rust search test**

Add to `src-tauri/src/storage/mod.rs`:

```rust
#[test]
fn search_workspace_returns_synced_and_reference_hits_per_instance() {
    let storage = Storage::open_in_memory_for_tests().expect("storage opens");
    let snapshot = WorkspaceSnapshot {
        boards: vec![],
        data_tables: vec![],
        mindmaps: vec![],
        synced_block_groups: vec![SyncedBlockGroupRecord {
            id: "group_1".to_string(),
            blocks: vec![serde_json::json!({
                "id": "group_block_1",
                "type": "paragraph",
                "text": "Shared alpha note"
            })],
            primary_instance_id: "instance_sync".to_string(),
            created_at: "2026-07-06T00:00:00.000Z".to_string(),
            updated_at: "2026-07-06T00:00:00.000Z".to_string(),
        }],
        pages: vec![
            PageRecord {
                id: "page_sync".to_string(),
                parent_id: None,
                title: "Sync page".to_string(),
                icon: None,
                cover: None,
                properties: Some(serde_json::json!({})),
                is_full_width: None,
                is_small_text: None,
                font_family: None,
                show_outline: None,
                blocks: vec![serde_json::json!({
                    "id": "container_sync",
                    "type": "synced_block",
                    "groupId": "group_1",
                    "instanceId": "instance_sync",
                    "mode": "sync"
                })],
                created_at: "2026-07-06T00:00:00.000Z".to_string(),
                updated_at: "2026-07-06T00:00:00.000Z".to_string(),
            },
            PageRecord {
                id: "page_reference".to_string(),
                parent_id: None,
                title: "Reference page".to_string(),
                icon: None,
                cover: None,
                properties: Some(serde_json::json!({})),
                is_full_width: None,
                is_small_text: None,
                font_family: None,
                show_outline: None,
                blocks: vec![serde_json::json!({
                    "id": "container_reference",
                    "type": "synced_block",
                    "groupId": "group_1",
                    "instanceId": "instance_reference",
                    "mode": "reference"
                })],
                created_at: "2026-07-06T00:00:00.000Z".to_string(),
                updated_at: "2026-07-06T00:00:00.000Z".to_string(),
            },
        ],
        page_properties: vec![],
        settings: WorkspaceSettings { last_opened_page_id: Some("page_sync".to_string()) },
    };

    storage.replace_workspace_backup(snapshot).expect("replace snapshot");

    let results = storage.search_workspace("Shared alpha note", 20).expect("search");

    assert!(results.iter().any(|result| {
        result.page_id == "page_sync"
            && result.block_id.as_deref() == Some("container_sync")
            && result.match_source == "synced_block"
            && result.source_label == "同步块内容"
    }));

    assert!(results.iter().any(|result| {
        result.page_id == "page_reference"
            && result.block_id.as_deref() == Some("container_reference")
            && result.match_source == "reference_block"
            && result.source_label == "引用块内容"
    }));
}
```

- [ ] **Step 2: Run the focused Rust test to verify it fails**

Run:

```bash
cd src-tauri && cargo test search_workspace_returns_synced_and_reference_hits_per_instance
```

Expected: FAIL because search only indexes direct page blocks today.

- [ ] **Step 3: Expand page documents through synced containers using the container block id**

In `src-tauri/src/storage/search.rs`, extend the page indexer signature:

```rust
use super::models::{DataTableRecord, PagePropertyDefinition, PageRecord, SearchResult, SyncedBlockGroupRecord};

pub fn replace_page_document(
    connection: &Connection,
    page: &PageRecord,
    page_property_definitions: &[PagePropertyDefinition],
    synced_block_groups: &[SyncedBlockGroupRecord],
) -> StorageResult<()> {
    // existing title/property documents...
    let group_map = synced_block_groups
        .iter()
        .map(|group| (group.id.as_str(), group))
        .collect::<std::collections::HashMap<_, _>>();

    documents.extend(block_documents(page, &group_map));
    // ...
}
```

Keep the minimal navigation contract by indexing the page container block id, not the shared inner block id:

```rust
fn block_documents(
    page: &PageRecord,
    synced_groups: &std::collections::HashMap<&str, &SyncedBlockGroupRecord>,
) -> Vec<SearchDocument> {
    let mut documents = Vec::new();

    for block in &page.blocks {
        let Some(object) = block.as_object() else {
            continue;
        };

        if object.get("type").and_then(Value::as_str) == Some("synced_block") {
            let Some(group_id) = object.get("groupId").and_then(Value::as_str) else {
                continue;
            };
            let Some(instance_mode) = object.get("mode").and_then(Value::as_str) else {
                continue;
            };
            let Some(container_block_id) = object.get("id").and_then(Value::as_str) else {
                continue;
            };
            let Some(group) = synced_groups.get(group_id) else {
                continue;
            };

            for (index, inner_block) in group.blocks.iter().enumerate() {
                let Some(excerpt) = block_excerpt(inner_block) else {
                    continue;
                };

                documents.push(SearchDocument {
                    document_id: format!("page:{}:synced:{}:{}", page.id, container_block_id, index),
                    kind: "page".to_string(),
                    page_id: page.id.clone(),
                    block_id: Some(container_block_id.to_string()),
                    board_id: None,
                    database_id: None,
                    record_id: None,
                    title: page.title.clone(),
                    icon: page.icon.clone(),
                    excerpt: excerpt.clone(),
                    body: excerpt,
                    match_source: if instance_mode == "reference" {
                        "reference_block".to_string()
                    } else {
                        "synced_block".to_string()
                    },
                    match_key: None,
                    source_label: if instance_mode == "reference" {
                        "引用块内容".to_string()
                    } else {
                        "同步块内容".to_string()
                    },
                });
            }

            continue;
        }

        documents.extend(plain_block_documents(page, block));
    }

    documents
}
```

In `src-tauri/src/storage/mod.rs`, load groups whenever page documents are rebuilt:

```rust
let page_property_definitions = self.load_page_property_definitions()?;
let synced_block_groups = self.load_synced_block_groups()?;
search::replace_page_document(
    &self.connection,
    page,
    &page_property_definitions,
    &synced_block_groups,
)?;
```

Do the same inside `rebuild_search_documents`.

- [ ] **Step 4: Run the focused Rust test to verify it passes**

Run:

```bash
cd src-tauri && cargo test search_workspace_returns_synced_and_reference_hits_per_instance
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/storage/search.rs src-tauri/src/storage/mod.rs
git commit -m "feat: index synced block instances for search"
```

---

### Task 5: Add Store Actions For Creating, Editing, Unsyncing, Duplicating, And Cleaning Up Instances

**Files:**
- Modify: `src/store/createWorkspaceStore.ts`
- Modify: `src/store/createWorkspaceStore.test.ts`

- [ ] **Step 1: Write the failing store lifecycle tests**

Add to `src/store/createWorkspaceStore.test.ts`:

```ts
it('creates a synced group from consecutive blocks and replaces them with one container', async () => {
  const counted = createCountingRepository({
    ...createWorkspace(),
    syncedBlockGroups: [],
    pages: [
      {
        ...createWorkspace().pages[0],
        blocks: [
          { id: 'block_1', type: 'paragraph', text: 'Alpha' },
          { id: 'block_2', type: 'todo', text: 'Beta', checked: false },
          { id: 'block_3', type: 'paragraph', text: 'Gamma' },
        ],
      },
    ],
  } as never)
  const store = createWorkspaceStore(counted.repository)

  await store.getState().bootstrap()
  await store.getState().createSyncedBlockFromRange('page_1', 'block_1', 'block_2')

  expect(store.getState().syncedBlockGroups).toHaveLength(1)
  expect(store.getState().syncedBlockGroups[0]?.blocks).toEqual([
    { id: 'block_1', type: 'paragraph', text: 'Alpha' },
    { id: 'block_2', type: 'todo', text: 'Beta', checked: false },
  ])
  expect(store.getState().pages[0]?.blocks).toEqual([
    expect.objectContaining({
      type: 'synced_block',
      groupId: store.getState().syncedBlockGroups[0]?.id,
      mode: 'sync',
    }),
    { id: 'block_3', type: 'paragraph', text: 'Gamma' },
  ])
})

it('updates shared text from a sync instance and unsyncs a single container into local blocks', async () => {
  const now = '2026-07-06T00:00:00.000Z'
  const counted = createCountingRepository({
    ...createWorkspace(),
    syncedBlockGroups: [
      {
        id: 'group_1',
        blocks: [{ id: 'group_block_1', type: 'paragraph', text: 'Shared text' }],
        primaryInstanceId: 'instance_1',
        createdAt: now,
        updatedAt: now,
      },
    ],
    pages: [
      {
        ...createWorkspace().pages[0],
        id: 'page_1',
        blocks: [
          {
            id: 'container_1',
            type: 'synced_block',
            groupId: 'group_1',
            instanceId: 'instance_1',
            mode: 'sync',
          },
        ],
      },
      {
        ...createWorkspace().pages[0],
        id: 'page_2',
        blocks: [
          {
            id: 'container_2',
            type: 'synced_block',
            groupId: 'group_1',
            instanceId: 'instance_2',
            mode: 'reference',
          },
        ],
      },
    ],
    settings: { lastOpenedPageId: 'page_1' },
  } as never)
  const store = createWorkspaceStore(counted.repository)

  await store.getState().bootstrap()
  await store.getState().updateSyncedGroupBlock('group_1', 'group_block_1', {
    id: 'group_block_1',
    type: 'paragraph',
    text: 'Updated shared text',
  })
  await store.getState().flushPendingSaves()

  expect(store.getState().syncedBlockGroups[0]?.blocks[0]).toEqual({
    id: 'group_block_1',
    type: 'paragraph',
    text: 'Updated shared text',
  })

  await store.getState().unsyncBlockInstance('page_1', 'container_1')

  expect(store.getState().pages.find((page) => page.id === 'page_1')?.blocks).toEqual([
    expect.objectContaining({
      type: 'paragraph',
      text: 'Updated shared text',
    }),
  ])
  expect(store.getState().pages.find((page) => page.id === 'page_2')?.blocks).toEqual([
    expect.objectContaining({
      id: 'container_2',
      type: 'synced_block',
      groupId: 'group_1',
    }),
  ])
})

it('migrates the primary instance when the current primary container is deleted', async () => {
  const now = '2026-07-06T00:00:00.000Z'
  const counted = createCountingRepository({
    ...createWorkspace(),
    syncedBlockGroups: [
      {
        id: 'group_1',
        blocks: [{ id: 'group_block_1', type: 'paragraph', text: 'Shared text' }],
        primaryInstanceId: 'instance_1',
        createdAt: now,
        updatedAt: now,
      },
    ],
    pages: [
      {
        ...createWorkspace().pages[0],
        id: 'page_1',
        blocks: [
          {
            id: 'container_1',
            type: 'synced_block',
            groupId: 'group_1',
            instanceId: 'instance_1',
            mode: 'sync',
          },
        ],
      },
      {
        ...createWorkspace().pages[0],
        id: 'page_2',
        blocks: [
          {
            id: 'container_2',
            type: 'synced_block',
            groupId: 'group_1',
            instanceId: 'instance_2',
            mode: 'sync',
          },
        ],
      },
    ],
    settings: { lastOpenedPageId: 'page_1' },
  } as never)
  const store = createWorkspaceStore(counted.repository)

  await store.getState().bootstrap()
  await store.getState().deleteBlock('page_1', 'container_1')

  expect(store.getState().syncedBlockGroups[0]?.primaryInstanceId).toBe('instance_2')
})
```

- [ ] **Step 2: Run the focused tests to verify they fail**

Run:

```bash
npx vitest run src/store/createWorkspaceStore.test.ts
```

Expected: FAIL because the store has no synced-block lifecycle actions.

- [ ] **Step 3: Add the minimal shared-group action surface and reuse the debounced page save path**

In `src/store/createWorkspaceStore.ts`, add the new public actions:

```ts
export interface WorkspaceState {
  // existing fields...
  syncedBlockGroups: SyncedBlockGroupRecord[]
  createSyncedBlockFromRange: (
    pageId: PageId,
    startBlockId: string,
    endBlockId: string,
  ) => Promise<SyncedBlockInstanceBlock | null>
  replaceBlockWithSyncedInstance: (
    pageId: PageId,
    blockId: string,
    groupId: string,
    mode: SyncedBlockMode,
  ) => Promise<SyncedBlockInstanceBlock | null>
  updateSyncedGroupBlock: (
    groupId: string,
    blockId: string,
    nextBlock: BlockRecord,
  ) => Promise<void>
  unsyncBlockInstance: (pageId: PageId, blockId: string) => Promise<void>
}
```

Create a small helper so page delete, page duplicate, and block delete can share the same instance cleanup path:

```ts
function removeSyncedInstanceFromSnapshot(
  snapshot: WorkspaceSnapshot,
  pageId: PageId,
  blockId: string,
) {
  const page = snapshot.pages.find((item) => item.id === pageId)
  const container = page?.blocks.find(
    (block): block is SyncedBlockInstanceBlock => block.id === blockId && block.type === 'synced_block',
  )

  if (!page || !container) {
    return snapshot
  }

  const nextPages = snapshot.pages.map((currentPage) =>
    currentPage.id === pageId
      ? {
          ...currentPage,
          updatedAt: new Date().toISOString(),
          blocks: currentPage.blocks.filter((block) => block.id !== blockId),
        }
      : currentPage,
  )

  const remainingInstances = collectSyncedGroupInstances(nextPages, container.groupId)
  const nextGroups = snapshot.syncedBlockGroups
    .map((group) => {
      if (group.id !== container.groupId) {
        return group
      }

      if (remainingInstances.length === 0) {
        return null
      }

      return {
        ...group,
        primaryInstanceId:
          group.primaryInstanceId === container.instanceId
            ? getNextPrimaryInstanceId(group.primaryInstanceId, remainingInstances.map((item) => item.instanceId))
              ?? group.primaryInstanceId
            : group.primaryInstanceId,
        updatedAt: new Date().toISOString(),
      }
    })
    .filter(Boolean) as SyncedBlockGroupRecord[]

  return {
    ...snapshot,
    pages: nextPages,
    syncedBlockGroups: nextGroups,
  }
}
```

Implement creation from a consecutive range by moving those blocks into one shared group and inserting a single container:

```ts
createSyncedBlockFromRange: async (pageId, startBlockId, endBlockId) => {
  const state = get()
  const now = new Date().toISOString()
  let createdContainer: SyncedBlockInstanceBlock | null = null

  const nextPages = state.pages.map((page) => {
    if (page.id !== pageId) {
      return page
    }

    const startIndex = page.blocks.findIndex((block) => block.id === startBlockId)
    const endIndex = page.blocks.findIndex((block) => block.id === endBlockId)

    if (startIndex < 0 || endIndex < 0) {
      return page
    }

    const from = Math.min(startIndex, endIndex)
    const to = Math.max(startIndex, endIndex)
    const selectedBlocks = page.blocks.slice(from, to + 1)
    const validation = validateSyncedGroupBlocks(selectedBlocks)

    if (!validation.ok) {
      return page
    }

    const groupId = createId('group')
    const instanceId = createId('instance')
    createdContainer = createSyncedBlockInstanceBlock(groupId, instanceId, 'sync')
    const blocks = [...page.blocks]
    blocks.splice(from, to - from + 1, createdContainer)

    return {
      ...page,
      updatedAt: now,
      blocks,
    }
  })

  if (!createdContainer) {
    return null
  }

  const selectedPage = state.pages.find((page) => page.id === pageId)!
  const startIndex = selectedPage.blocks.findIndex((block) => block.id === startBlockId)
  const endIndex = selectedPage.blocks.findIndex((block) => block.id === endBlockId)
  const movedBlocks = selectedPage.blocks.slice(Math.min(startIndex, endIndex), Math.max(startIndex, endIndex) + 1)

  const nextSnapshot = createSnapshotFromState({
    ...state,
    pages: nextPages,
    syncedBlockGroups: [
      ...state.syncedBlockGroups,
      {
        id: createdContainer.groupId,
        blocks: structuredClone(movedBlocks),
        primaryInstanceId: createdContainer.instanceId,
        createdAt: now,
        updatedAt: now,
      },
    ],
  })

  pushUndoSnapshot(state)
  set({ syncedBlockGroups: nextSnapshot.syncedBlockGroups, pages: nextSnapshot.pages, saveStatus: 'saving' })
  await repository.save(nextSnapshot)
  set({ syncedBlockGroups: nextSnapshot.syncedBlockGroups, pages: nextSnapshot.pages, saveStatus: 'saved' })
  return createdContainer
}
```

Implement slash/picker insertion by replacing the current empty block:

```ts
replaceBlockWithSyncedInstance: async (pageId, blockId, groupId, mode) => {
  const state = get()
  const container = createSyncedBlockInstanceBlock(groupId, createId('instance'), mode)
  const nextPages = state.pages.map((page) =>
    page.id === pageId
      ? {
          ...page,
          updatedAt: new Date().toISOString(),
          blocks: page.blocks.map((block) => (block.id === blockId ? { ...container, id: block.id } : block)),
        }
      : page,
  )

  pushUndoSnapshot(state)
  set({ pages: nextPages, saveStatus: 'saving' })
  await repository.save(createSnapshotFromState({ ...state, pages: nextPages }))
  set({ pages: nextPages, saveStatus: 'saved' })
  return { ...container, id: blockId }
}
```

Use the existing debounced save path for shared-body edits:

```ts
updateSyncedGroupBlock: async (groupId, blockId, nextBlock) => {
  const state = get()
  const nextSyncedBlockGroups = state.syncedBlockGroups.map((group) =>
    group.id === groupId
      ? {
          ...group,
          updatedAt: new Date().toISOString(),
          blocks: group.blocks.map((block) => (block.id === blockId ? nextBlock : block)),
        }
      : group,
  )

  pushUndoSnapshot(state)
  set({
    syncedBlockGroups: nextSyncedBlockGroups,
    saveStatus: 'saving',
  })
  scheduleBlockSave()
}
```

Unsync by cloning the shared blocks into local page blocks and removing only this instance:

```ts
unsyncBlockInstance: async (pageId, blockId) => {
  const state = get()
  const page = state.pages.find((item) => item.id === pageId)
  const container = page?.blocks.find(
    (block): block is SyncedBlockInstanceBlock => block.id === blockId && block.type === 'synced_block',
  )
  const group = state.syncedBlockGroups.find((item) => item.id === container?.groupId)

  if (!page || !container || !group) {
    return
  }

  const localBlocks = cloneBlocksForUnsync(group.blocks, () => createId('block'))
  const nextPages = state.pages.map((currentPage) => {
    if (currentPage.id !== pageId) {
      return currentPage
    }

    const index = currentPage.blocks.findIndex((block) => block.id === blockId)
    const blocks = [...currentPage.blocks]
    blocks.splice(index, 1, ...localBlocks)

    return {
      ...currentPage,
      updatedAt: new Date().toISOString(),
      blocks,
    }
  })

  const nextSnapshot = removeSyncedInstanceFromSnapshot(
    createSnapshotFromState({ ...state, pages: nextPages }),
    pageId,
    blockId,
  )

  pushUndoSnapshot(state)
  set({
    pages: nextSnapshot.pages,
    syncedBlockGroups: nextSnapshot.syncedBlockGroups ?? [],
    saveStatus: 'saving',
  })
  await repository.save(nextSnapshot)
  set({
    pages: nextSnapshot.pages,
    syncedBlockGroups: nextSnapshot.syncedBlockGroups ?? [],
    saveStatus: 'saved',
  })
}
```

Intercept synced containers inside existing delete and duplicate flows:

```ts
deleteBlock: async (pageId, blockId) => {
  const state = get()
  const page = state.pages.find((item) => item.id === pageId)
  const container = page?.blocks.find(
    (block): block is SyncedBlockInstanceBlock => block.id === blockId && block.type === 'synced_block',
  )

  if (container) {
    const nextSnapshot = removeSyncedInstanceFromSnapshot(createSnapshotFromState(state), pageId, blockId)
    pushUndoSnapshot(state)
    set({
      pages: nextSnapshot.pages,
      syncedBlockGroups: nextSnapshot.syncedBlockGroups ?? [],
      saveStatus: 'saving',
    })
    await repository.save(nextSnapshot)
    set({
      pages: nextSnapshot.pages,
      syncedBlockGroups: nextSnapshot.syncedBlockGroups ?? [],
      saveStatus: 'saved',
    })
    return
  }

  // existing non-synced delete path
}
```

```ts
if (source.type === 'synced_block') {
  const clone = {
    ...source,
    id: createId('block'),
    instanceId: createId('instance'),
  }
  blocks.splice(index + 1, 0, clone)
  return {
    ...page,
    updatedAt: now,
    blocks,
  }
}
```

- [ ] **Step 4: Run the focused tests to verify they pass**

Run:

```bash
npx vitest run src/store/createWorkspaceStore.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/store/createWorkspaceStore.ts src/store/createWorkspaceStore.test.ts
git commit -m "feat: add synced block store actions"
```

---

### Task 6: Add The Creation UX, Picker Dialog, And Inline Synced/Reference Renderer

**Files:**
- Modify: `src/components/editor/BlockEditor.tsx`
- Modify: `src/components/editor/BlockFrame.tsx`
- Modify: `src/components/editor/BlockHandleMenu.tsx`
- Modify: `src/components/editor/SlashMenu.tsx`
- Modify: `src/components/editor/SlashMenu.test.tsx`
- Modify: `src/components/editor/blocks/ParagraphBlock.tsx`
- Modify: `src/components/editor/blocks/TodoBlock.tsx`
- Modify: `src/components/editor/blocks/ListBlock.tsx`
- Modify: `src/components/editor/RichTextEditable.tsx`
- Modify: `src/components/editor/AutoGrowTextarea.tsx`
- Create: `src/components/editor/SyncedBlockPickerDialog.tsx`
- Create: `src/components/editor/SyncedBlockPickerDialog.test.tsx`
- Create: `src/components/editor/blocks/SyncedBlockContainer.tsx`
- Create: `src/components/editor/blocks/SyncedBlockContainer.test.tsx`
- Modify: `src/components/editor/BlockEditor.test.tsx`
- Modify: `src/styles/index.css`
- Modify: `src/ui/copy.ts`

- [ ] **Step 1: Write the failing editor tests**

Add to `src/components/editor/SlashMenu.test.tsx`:

```tsx
it('shows synced and reference insert commands', () => {
  render(<SlashMenu query="/同步" onPick={vi.fn()} />)

  expect(screen.getByRole('button', { name: '同步块' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: '引用块' })).toBeInTheDocument()
})
```

Create `src/components/editor/SyncedBlockPickerDialog.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { SyncedBlockPickerDialog } from './SyncedBlockPickerDialog'

describe('SyncedBlockPickerDialog', () => {
  it('lets the user pick an existing shared group', async () => {
    const user = userEvent.setup()
    const onPick = vi.fn()

    render(
      <SyncedBlockPickerDialog
        open
        mode="reference"
        groups={[
          {
            id: 'group_1',
            summary: 'Weekly review',
            blockCount: 2,
          },
        ]}
        onClose={vi.fn()}
        onPick={onPick}
      />,
    )

    await user.click(screen.getByRole('button', { name: /Weekly review/ }))

    expect(onPick).toHaveBeenCalledWith('group_1')
  })
})
```

Create `src/components/editor/blocks/SyncedBlockContainer.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { SyncedBlockContainer } from './SyncedBlockContainer'

const group = {
  id: 'group_1',
  blocks: [{ id: 'group_block_1', type: 'paragraph', text: 'Shared text' }],
  primaryInstanceId: 'instance_1',
  createdAt: '2026-07-06T00:00:00.000Z',
  updatedAt: '2026-07-06T00:00:00.000Z',
}

describe('SyncedBlockContainer', () => {
  it('renders reference content as read-only', () => {
    render(
      <SyncedBlockContainer
        containerBlock={{
          id: 'container_1',
          type: 'synced_block',
          groupId: 'group_1',
          instanceId: 'instance_2',
          mode: 'reference',
        }}
        group={group as never}
        isPrimary={false}
        allPages={[]}
        onUpdateGroupBlock={vi.fn()}
        onUnsync={vi.fn()}
        onOpenPrimary={vi.fn()}
      />,
    )

    expect(screen.getByText('引用块')).toBeInTheDocument()
    expect(screen.getByText('Shared text')).toBeInTheDocument()
  })

  it('redirects complex non-primary editing to the primary instance', async () => {
    const user = userEvent.setup()
    const onOpenPrimary = vi.fn()

    render(
      <SyncedBlockContainer
        containerBlock={{
          id: 'container_2',
          type: 'synced_block',
          groupId: 'group_2',
          instanceId: 'instance_2',
          mode: 'sync',
        }}
        group={{
          ...group,
          id: 'group_2',
          blocks: [{ id: 'group_code', type: 'code', language: 'ts', text: 'const a = 1' }],
          primaryInstanceId: 'instance_1',
        } as never}
        isPrimary={false}
        allPages={[]}
        onUpdateGroupBlock={vi.fn()}
        onUnsync={vi.fn()}
        onOpenPrimary={onOpenPrimary}
      />,
    )

    await user.click(screen.getByRole('button', { name: '前往原位置编辑' }))
    expect(onOpenPrimary).toHaveBeenCalled()
  })
})
```

Add to `src/components/editor/BlockEditor.test.tsx`:

```tsx
it('starts a sync range on one block and completes it on a later block', async () => {
  const user = userEvent.setup()
  const onCreateSyncedBlockFromRange = vi.fn()

  render(
    <BlockEditor
      page={page as never}
      allPages={[page as never]}
      syncedBlockGroups={[]}
      onUpdateBlock={vi.fn()}
      onCreateSyncedBlockFromRange={onCreateSyncedBlockFromRange}
    />,
  )

  await user.click(screen.getAllByRole('button', { name: '拖动块' })[0]!)
  await user.click(screen.getByRole('button', { name: '开始同步选区' }))
  await user.click(screen.getAllByRole('button', { name: '拖动块' })[1]!)
  await user.click(screen.getByRole('button', { name: '同步到这里（2 块）' }))

  expect(onCreateSyncedBlockFromRange).toHaveBeenCalledWith('b1', 'b2')
})
```

- [ ] **Step 2: Run the focused editor tests to verify they fail**

Run:

```bash
npx vitest run src/components/editor/SlashMenu.test.tsx src/components/editor/SyncedBlockPickerDialog.test.tsx src/components/editor/blocks/SyncedBlockContainer.test.tsx src/components/editor/BlockEditor.test.tsx
```

Expected: FAIL because the picker, renderer, and sync-range actions do not exist.

- [ ] **Step 3: Add the minimal UI flow without inventing a general block multi-select system**

In `src/components/editor/SlashMenu.tsx`, split slash command ids from real `BlockType` values:

```ts
type SlashCommandId = BlockType | 'insert_synced_block' | 'insert_reference_block'

interface SlashMenuOption {
  id: SlashCommandId
  type?: BlockType
  label: string
  description: string
  icon: string
  group: 'text' | 'list' | 'media' | 'page_data'
}
```

Add the two new entries:

```ts
{
  id: 'insert_synced_block',
  label: '同步块',
  description: '插入一个会随共享内容联动更新的实例',
  icon: '⇄',
  group: 'page_data',
},
{
  id: 'insert_reference_block',
  label: '引用块',
  description: '插入一个只读的共享内容引用',
  icon: '❞',
  group: 'page_data',
},
```

Let `BlockFrame` forward menu actions instead of hard-coding only duplicate/delete:

```ts
export interface BlockMenuAction {
  label: string
  icon: string
  danger?: boolean
  onSelect: () => void
}

interface BlockFrameProps {
  // existing props...
  menuActions?: BlockMenuAction[]
}
```

Then `BlockHandleMenu` can render them before the standard duplicate/delete section:

```tsx
{menuActions?.length ? (
  <>
    <section className="block-menu-section">
      <div className="block-menu-label">同步块</div>
      <div className="block-menu-section-options">
        {menuActions.map((action) => (
          <button
            key={action.label}
            type="button"
            className={action.danger ? 'block-menu-action block-menu-danger' : 'block-menu-action'}
            onClick={action.onSelect}
          >
            <span className="block-menu-icon" aria-hidden="true">
              {action.icon}
            </span>
            <span>{action.label}</span>
          </button>
        ))}
      </div>
    </section>
    <div className="block-menu-divider" />
  </>
) : null}
```

In `src/components/editor/BlockEditor.tsx`, keep the range flow intentionally simple:

```ts
const [pendingSyncRangeStartBlockId, setPendingSyncRangeStartBlockId] = useState<string | null>(null)
const [syncedPickerState, setSyncedPickerState] = useState<{
  targetBlockId: string
  mode: SyncedBlockMode
} | null>(null)
```

Build per-block menu actions from that state:

```ts
function getSyncedMenuActions(block: BlockRecord): BlockMenuAction[] {
  if (block.type === 'synced_block') {
    return [
      {
        label: '取消同步',
        icon: '⤺',
        onSelect: () => {
          void onUnsyncBlockInstance?.(block.id)
        },
      },
    ]
  }

  if (!pendingSyncRangeStartBlockId) {
    return [
      {
        label: '开始同步选区',
        icon: '⇄',
        onSelect: () => setPendingSyncRangeStartBlockId(block.id),
      },
    ]
  }

  if (pendingSyncRangeStartBlockId === block.id) {
    return [
      {
        label: '按当前块创建同步块',
        icon: '⇄',
        onSelect: () => {
          void onCreateSyncedBlockFromRange?.(block.id, block.id)
          setPendingSyncRangeStartBlockId(null)
        },
      },
      {
        label: '取消同步选区',
        icon: '×',
        onSelect: () => setPendingSyncRangeStartBlockId(null),
      },
    ]
  }

  const startIndex = page.blocks.findIndex((item) => item.id === pendingSyncRangeStartBlockId)
  const currentIndex = page.blocks.findIndex((item) => item.id === block.id)
  const blockCount = Math.abs(currentIndex - startIndex) + 1

  return [
    {
      label: `同步到这里（${blockCount} 块）`,
      icon: '⇄',
      onSelect: () => {
        void onCreateSyncedBlockFromRange?.(pendingSyncRangeStartBlockId, block.id)
        setPendingSyncRangeStartBlockId(null)
      },
    },
    {
      label: '取消同步选区',
      icon: '×',
      onSelect: () => setPendingSyncRangeStartBlockId(null),
    },
  ]
}
```

Open the picker when the slash command chooses sync/reference:

```ts
async function pickBlockSlashCommand(commandId: SlashCommandId) {
  const command = blockSlashCommand

  if (!command) {
    return
  }

  setBlockSlashCommand(null)

  if (commandId === 'insert_synced_block' || commandId === 'insert_reference_block') {
    setSyncedPickerState({
      targetBlockId: command.blockId,
      mode: commandId === 'insert_reference_block' ? 'reference' : 'sync',
    })
    return
  }

  await turnBlockInto(command.blockId, commandId)
}
```

Add a small inline banner instead of selection highlighting:

```tsx
{pendingSyncRangeStartBlockId ? (
  <div className="editor-inline-banner">
    <span>已记录同步起点，去另一个块的更多菜单完成选区。</span>
    <button type="button" onClick={() => setPendingSyncRangeStartBlockId(null)}>
      取消
    </button>
  </div>
) : null}
```

Create `src/components/editor/SyncedBlockPickerDialog.tsx` as a plain modal, not a floating anchor menu:

```tsx
interface SyncedBlockPickerDialogProps {
  open: boolean
  mode: SyncedBlockMode
  groups: Array<{ id: string; summary: string; blockCount: number }>
  onClose: () => void
  onPick: (groupId: string) => void
}

export function SyncedBlockPickerDialog({
  open,
  mode,
  groups,
  onClose,
  onPick,
}: SyncedBlockPickerDialogProps) {
  const [query, setQuery] = useState('')
  const filteredGroups = groups.filter((group) =>
    group.summary.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()),
  )

  if (!open) {
    return null
  }

  return createPortal(
    <div className="synced-picker-overlay" onMouseDown={onClose}>
      <section
        role="dialog"
        aria-modal="true"
        aria-label={mode === 'reference' ? '插入引用块' : '插入同步块'}
        className="synced-picker-dialog"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <input
          className="synced-picker-input"
          placeholder="搜索共享内容"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <div className="synced-picker-list">
          {filteredGroups.map((group) => (
            <button
              key={group.id}
              type="button"
              className="synced-picker-item"
              onClick={() => onPick(group.id)}
            >
              <span className="synced-picker-item-title">{group.summary}</span>
              <span className="synced-picker-item-meta">{group.blockCount} 个块</span>
            </button>
          ))}
        </div>
      </section>
    </div>,
    document.body,
  )
}
```

Create `src/components/editor/blocks/SyncedBlockContainer.tsx` as a focused renderer instead of recursively reusing the whole page editor:

```tsx
interface SyncedBlockContainerProps {
  containerBlock: SyncedBlockInstanceBlock
  group: SyncedBlockGroupRecord | null
  isPrimary: boolean
  allPages: PageRecord[]
  onUpdateGroupBlock: (groupId: string, blockId: string, nextBlock: BlockRecord) => void
  onUnsync: () => void
  onOpenPrimary: () => void
}

export function SyncedBlockContainer({
  containerBlock,
  group,
  isPrimary,
  allPages,
  onUpdateGroupBlock,
  onUnsync,
  onOpenPrimary,
}: SyncedBlockContainerProps) {
  if (!group) {
    return (
      <div className="synced-block-missing">
        <div className="synced-block-missing-title">同步内容不可用</div>
        <div className="synced-block-missing-actions">
          <button type="button" onClick={onUnsync}>
            解除同步
          </button>
        </div>
      </div>
    )
  }

  return (
    <div
      className={
        containerBlock.mode === 'reference'
          ? 'synced-block-container synced-block-container-reference'
          : 'synced-block-container'
      }
    >
      <div className="synced-block-header">
        <span className="synced-block-badge">
          {containerBlock.mode === 'reference' ? '引用块' : '同步块'}
        </span>
        {!isPrimary && containerBlock.mode === 'sync' ? (
          <button type="button" className="synced-block-open-primary" onClick={onOpenPrimary}>
            前往原位置编辑
          </button>
        ) : null}
      </div>
      <div className="synced-block-body">
        {group.blocks.map((block) => {
          if (
            (block.type === 'paragraph' ||
              block.type === 'heading_1' ||
              block.type === 'heading_2' ||
              block.type === 'heading_3') &&
            containerBlock.mode === 'reference'
          ) {
            return <div key={block.id} className="synced-block-text-readonly">{block.text}</div>
          }

          if (block.type === 'paragraph' || block.type === 'heading_1' || block.type === 'heading_2' || block.type === 'heading_3') {
            return (
              <ParagraphBlock
                key={block.id}
                value={block.text}
                richText={block.richText}
                variant={block.type}
                onChange={({ text, richText }) =>
                  onUpdateGroupBlock(group.id, block.id, { ...block, text, richText })
                }
              />
            )
          }

          if (block.type === 'todo') {
            return containerBlock.mode === 'reference' ? (
              <div key={block.id} className="synced-block-text-readonly">
                {block.checked ? '☑ ' : '☐ '}
                {block.text}
              </div>
            ) : (
              <TodoBlock
                key={block.id}
                text={block.text}
                richText={block.richText}
                checked={block.checked}
                onChange={({ text, richText, checked }) =>
                  onUpdateGroupBlock(group.id, block.id, { ...block, text, richText, checked })
                }
              />
            )
          }

          if (block.type === 'bulleted_list' || block.type === 'numbered_list') {
            return containerBlock.mode === 'reference' ? (
              <div key={block.id} className="synced-block-text-readonly">
                {(block.items[0] ?? '').trim()}
              </div>
            ) : (
              <ListBlock
                key={block.id}
                type={block.type}
                value={block.items[0] ?? ''}
                onChange={(value) =>
                  onUpdateGroupBlock(group.id, block.id, { ...block, items: [value] })
                }
              />
            )
          }

          return (
            <div key={block.id} className="synced-block-complex-shell">
              <div className="synced-block-complex-overlay">
                {!isPrimary || containerBlock.mode === 'reference' ? (
                  <button type="button" onClick={onOpenPrimary}>
                    前往原位置编辑
                  </button>
                ) : null}
              </div>
              <div className="synced-block-complex-label">{block.type}</div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
```

In `src/ui/copy.ts`, add the user-facing strings used above:

```ts
editor: {
  // existing entries...
  syncedRangeHint: '已记录同步起点，去另一个块的更多菜单完成选区。',
  syncedBlockLabel: '同步块',
  referenceBlockLabel: '引用块',
  startSyncedRange: '开始同步选区',
  cancelSyncedRange: '取消同步选区',
  finishSyncedRange: '同步到这里',
  unsyncBlock: '取消同步',
  openPrimarySyncedBlock: '前往原位置编辑',
  missingSyncedBlock: '同步内容不可用',
}
```

- [ ] **Step 4: Run the focused editor tests to verify they pass**

Run:

```bash
npx vitest run src/components/editor/SlashMenu.test.tsx src/components/editor/SyncedBlockPickerDialog.test.tsx src/components/editor/blocks/SyncedBlockContainer.test.tsx src/components/editor/BlockEditor.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/editor/BlockEditor.tsx src/components/editor/BlockFrame.tsx src/components/editor/BlockHandleMenu.tsx src/components/editor/SlashMenu.tsx src/components/editor/SlashMenu.test.tsx src/components/editor/blocks/ParagraphBlock.tsx src/components/editor/blocks/TodoBlock.tsx src/components/editor/blocks/ListBlock.tsx src/components/editor/RichTextEditable.tsx src/components/editor/AutoGrowTextarea.tsx src/components/editor/SyncedBlockPickerDialog.tsx src/components/editor/SyncedBlockPickerDialog.test.tsx src/components/editor/blocks/SyncedBlockContainer.tsx src/components/editor/blocks/SyncedBlockContainer.test.tsx src/components/editor/BlockEditor.test.tsx src/styles/index.css src/ui/copy.ts
git commit -m "feat: add synced block editor ui"
```

---

### Task 7: Expand Local Search, Wire The App, Update The Changelog, And Verify

**Files:**
- Modify: `src/domain/search.ts`
- Modify: `src/domain/search.test.ts`
- Modify: `src/components/search/SearchDialog.tsx`
- Modify: `src/components/search/SearchDialog.test.tsx`
- Modify: `src/app/App.tsx`
- Modify: `src/app/App.test.tsx`
- Modify: `docs/updates.md`

- [ ] **Step 1: Write the failing local search and app wiring tests**

Add to `src/domain/search.test.ts`:

```ts
it('returns synced and reference hits per page instance', () => {
  const pages = [
    {
      id: 'page_sync',
      parentId: null,
      title: 'Sync page',
      icon: null,
      cover: null,
      properties: {},
      blocks: [
        {
          id: 'container_sync',
          type: 'synced_block' as const,
          groupId: 'group_1',
          instanceId: 'instance_sync',
          mode: 'sync' as const,
        },
      ],
      createdAt: '2026-07-06T00:00:00.000Z',
      updatedAt: '2026-07-06T00:00:00.000Z',
    },
    {
      id: 'page_reference',
      parentId: null,
      title: 'Reference page',
      icon: null,
      cover: null,
      properties: {},
      blocks: [
        {
          id: 'container_reference',
          type: 'synced_block' as const,
          groupId: 'group_1',
          instanceId: 'instance_reference',
          mode: 'reference' as const,
        },
      ],
      createdAt: '2026-07-06T00:00:00.000Z',
      updatedAt: '2026-07-06T00:00:00.000Z',
    },
  ]
  const syncedBlockGroups = [
    {
      id: 'group_1',
      blocks: [{ id: 'group_block_1', type: 'paragraph' as const, text: 'Shared alpha note' }],
      primaryInstanceId: 'instance_sync',
      createdAt: '2026-07-06T00:00:00.000Z',
      updatedAt: '2026-07-06T00:00:00.000Z',
    },
  ]

  expect(searchPages(pages as never, [], syncedBlockGroups as never, 'Shared alpha note')).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        pageId: 'page_sync',
        blockId: 'container_sync',
        matchSource: 'synced_block',
        sourceLabel: '同步块内容',
      }),
      expect.objectContaining({
        pageId: 'page_reference',
        blockId: 'container_reference',
        matchSource: 'reference_block',
        sourceLabel: '引用块内容',
      }),
    ]),
  )
})
```

Add to `src/components/search/SearchDialog.test.tsx`:

```tsx
it('shows synced and reference source labels', () => {
  render(
    <SearchDialog
      open
      pages={[]}
      onClose={vi.fn()}
      onOpenPage={vi.fn()}
      onSearch={vi.fn().mockResolvedValue([
        {
          kind: 'page',
          pageId: 'page_sync',
          blockId: 'container_sync',
          title: 'Sync page',
          icon: null,
          excerpt: 'Shared alpha note',
          matchSource: 'synced_block',
          sourceLabel: '同步块内容',
        },
        {
          kind: 'page',
          pageId: 'page_reference',
          blockId: 'container_reference',
          title: 'Reference page',
          icon: null,
          excerpt: 'Shared alpha note',
          matchSource: 'reference_block',
          sourceLabel: '引用块内容',
        },
      ])}
    />,
  )

  expect(screen.getByText('同步块内容')).toBeInTheDocument()
  expect(screen.getByText('引用块内容')).toBeInTheDocument()
})
```

Add to `src/app/App.test.tsx`:

```tsx
it('navigates search results to the synced container instance block', async () => {
  const user = userEvent.setup()
  const snapshot = {
    boards: [],
    dataTables: [],
    mindmaps: [],
    syncedBlockGroups: [
      {
        id: 'group_1',
        blocks: [{ id: 'group_block_1', type: 'paragraph', text: 'Shared alpha note' }],
        primaryInstanceId: 'instance_sync',
        createdAt: '2026-07-06T00:00:00.000Z',
        updatedAt: '2026-07-06T00:00:00.000Z',
      },
    ],
    pageProperties: [],
    pages: [
      {
        id: 'page_sync',
        parentId: null,
        title: 'Sync page',
        icon: null,
        cover: null,
        properties: {},
        blocks: [
          {
            id: 'container_sync',
            type: 'synced_block',
            groupId: 'group_1',
            instanceId: 'instance_sync',
            mode: 'sync',
          },
        ],
        createdAt: '2026-07-06T00:00:00.000Z',
        updatedAt: '2026-07-06T00:00:00.000Z',
      },
    ],
    settings: { lastOpenedPageId: 'page_sync' },
  }

  render(<App repository={createMemoryRepository(snapshot as never)} initialEntries={['/pages/page_sync']} />)

  await user.keyboard('{Meta>}k{/Meta}')
  await user.type(screen.getByPlaceholderText('搜索页面或内容'), 'Shared alpha note')
  await user.keyboard('{Enter}')

  expect(await screen.findByText('Shared alpha note')).toBeInTheDocument()
})
```

- [ ] **Step 2: Run the focused search and app tests to verify they fail**

Run:

```bash
npx vitest run src/domain/search.test.ts src/components/search/SearchDialog.test.tsx src/app/App.test.tsx
```

Expected: FAIL because local search and app wiring do not expand synced groups yet.

- [ ] **Step 3: Expand local search through shared groups, wire the page route, and update the changelog**

In `src/domain/search.ts`, change the page search signature and expand `synced_block` containers through the group map:

```ts
export function searchPages(
  pages: PageRecord[],
  definitions: PagePropertyDefinition[],
  syncedBlockGroups: SyncedBlockGroupRecord[],
  query: string,
): SearchResult[] {
  const groupMap = new Map(syncedBlockGroups.map((group) => [group.id, group]))
  // existing query normalization...
  const entries: SearchEntry[] = [
    createSearchEntry(page.title, 'title', '标题'),
    ...getPropertySearchEntries(page, definitions),
    ...page.blocks.flatMap((block) => getBlockSearchEntries(block, pageTitleById, groupMap)),
  ].flatMap((entry) => (entry ? [entry] : []))
  // existing filtering...
}
```

Extend `getBlockSearchEntries`:

```ts
function getBlockSearchEntries(
  block: BlockRecord,
  pageTitleById: Map<string, string>,
  syncedGroupMap: Map<string, SyncedBlockGroupRecord>,
): SearchEntry[] {
  if (block.type === 'synced_block') {
    const group = syncedGroupMap.get(block.groupId)
    if (!group) {
      return []
    }

    return group.blocks.flatMap((innerBlock) =>
      getBlockSearchEntries(innerBlock, pageTitleById, syncedGroupMap).map((entry) => ({
        ...entry,
        blockId: block.id,
        matchSource: block.mode === 'reference' ? 'reference_block' : 'synced_block',
        sourceLabel: block.mode === 'reference' ? '引用块内容' : '同步块内容',
      })),
    )
  }

  // existing plain block cases...
}
```

In `src/components/search/SearchDialog.tsx`, pass the new dataset into local search:

```ts
interface SearchDialogProps {
  open: boolean
  pages: PageRecord[]
  pageProperties?: PagePropertyDefinition[]
  boards?: BoardRecord[]
  dataTables?: DataTableRecord[]
  mindmaps?: MindmapRecord[]
  syncedBlockGroups?: SyncedBlockGroupRecord[]
  // ...
}
```

```ts
const localResults = useMemo(
  () => [
    ...searchPages(pages, pageProperties, syncedBlockGroups, query),
    ...searchBoards(pages, boards, query),
    ...searchMindmaps(pages, mindmaps, query),
    ...searchDataTables(pages, dataTables, query),
  ],
  [boards, dataTables, mindmaps, pageProperties, pages, query, syncedBlockGroups],
)
```

In `src/app/App.tsx`, thread the groups into both search and page editing:

```tsx
<SearchDialog
  open={isSearchOpen}
  pages={pages}
  pageProperties={pageProperties}
  boards={boards}
  dataTables={dataTables}
  mindmaps={mindmaps}
  syncedBlockGroups={syncedBlockGroups}
  // ...
/>
```

```tsx
<BlockEditor
  page={page}
  allPages={pages}
  boards={boards}
  dataTables={dataTables}
  mindmaps={mindmaps}
  syncedBlockGroups={syncedBlockGroups}
  onCreateSyncedBlockFromRange={(startBlockId, endBlockId) =>
    store.getState().createSyncedBlockFromRange(page.id, startBlockId, endBlockId)
  }
  onReplaceBlockWithSyncedInstance={(blockId, groupId, mode) =>
    store.getState().replaceBlockWithSyncedInstance(page.id, blockId, groupId, mode)
  }
  onUpdateSyncedGroupBlock={(groupId, blockId, nextBlock) => {
    void store.getState().updateSyncedGroupBlock(groupId, blockId, nextBlock)
  }}
  onUnsyncBlockInstance={(blockId) => {
    void store.getState().unsyncBlockInstance(page.id, blockId)
  }}
  onOpenPrimarySyncedBlock={(pageId, blockId) => {
    navigate(`/pages/${pageId}`, blockId ? { state: { focusBlockId: blockId } } : undefined)
  }}
  // existing props...
/>
```

Update `docs/updates.md` once the implementation is actually shipped:

```md
## 2026-07-06 同步块与引用块 v1

提交：未提交

简要描述：

普通页面现在支持把一组连续块转成“同步块”，并在其他页面插入“同步块”或“引用块”；同步实例里的简单文本改动会联动到所有实例，搜索也会按实例位置返回“同步块内容 / 引用块内容”命中。

详细描述：
- 新增 `synced_block` 容器块和工作区级 `syncedBlockGroups` 共享内容存储。
- 支持通过块更多菜单两步创建同步块：先记录起点，再在另一个块上完成选区。
- 支持通过斜杠菜单插入已有同步块或只读引用块。
- 简单文本块支持在同步实例内直接编辑；复杂块在非主实例里会引导回主实例编辑。
- 删除单个实例只影响当前容器；删除最后一个实例会清理共享组；取消同步会把当前实例替换为本地普通块。
- 页面包导入导出会同时带上相关共享组，并重写 `groupId / instanceId / primaryInstanceId`。
- 搜索会按页面实例展开共享内容，而不是只落在共享组本体上。

验证情况：
- 待运行 `npm test`
- 待运行 `cargo test --manifest-path src-tauri/Cargo.toml`
- 待运行 `npm run build`
- 待运行 `npm run tauri:build:windows`
```

- [ ] **Step 4: Run the final verification**

Run:

```bash
npx vitest run src/domain/syncedBlocks.test.ts src/lib/workspaceRepository.test.ts src/store/createWorkspaceStore.test.ts src/components/editor/SlashMenu.test.tsx src/components/editor/SyncedBlockPickerDialog.test.tsx src/components/editor/blocks/SyncedBlockContainer.test.tsx src/components/editor/BlockEditor.test.tsx src/domain/search.test.ts src/components/search/SearchDialog.test.tsx src/app/App.test.tsx
cd src-tauri && cargo test
cd .. && npm test
npm run build
npm run tauri:build:windows
```

Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add src/domain/search.ts src/domain/search.test.ts src/components/search/SearchDialog.tsx src/components/search/SearchDialog.test.tsx src/app/App.tsx src/app/App.test.tsx docs/updates.md
git commit -m "feat: ship synced and reference blocks v1"
```

---

## Self-Review

- Spec coverage: one shared storage model, consecutive-block sync units, hidden-but-real primary instance, mixed editing, block-menu creation, slash-menu insertion, per-instance search hits, page-package id rewriting, unsync, primary migration, and last-instance cleanup all map to explicit tasks above.
- Placeholder scan: there are no `TODO`, `TBD`, “similar to above”, or “handle later” steps inside the tasks; each task names concrete files, tests, commands, and implementation shapes.
- Type consistency: the page container type is always `synced_block`; the workspace-level record is always `SyncedBlockGroupRecord`; page-side mode is always `sync | reference`; search labels are always `同步块内容 / 引用块内容`.
- Scope guard: this v1 plan deliberately does **not** add nested synced groups, dedicated shared-group rename/history screens, drag-reorder inside shared groups, or page-outline/backlink aggregation from inside synced content. The goal here is to ship the shared-content core without inventing a second editor architecture.
