# Mindmap Special Block Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 `E:\Workspace\实验软件\mindmap-web` 作为知识库里的一个新特殊块接入，正文里显示为卡片，点击后进入独立导图编辑页，并保持原导图应用源码、交互和界面逻辑不变。

**Architecture:** 知识库只做外层宿主，不拆 `mindmap-web` 源码，不把它改写成知识库内部组件。知识库新增 `mindmaps` 记录集合和 `mindmap` 块类型，把 `mindmap-web/dist` 复制进 `public/mindmap-web/` 后通过 iframe 挂载。宿主页在 iframe 加载前把当前导图 snapshot 写入 `localStorage['mindmap-web.document.v1']`，并在编辑过程中把同源存储变化回收进当前 `MindmapRecord`。

**Tech Stack:** React 19, TypeScript, React Router, Zustand vanilla store, Dexie, Vitest, Testing Library, static iframe host, localStorage handoff

---

## 文件结构与职责

- `src/domain/types.ts`
  - 扩展 `BlockType`、`BlockRecord`、`WorkspaceSnapshot`
  - 新增 `MindmapId`、`MindmapRecord`、`MindmapBlock`
- `src/domain/seed.ts`
  - 新工作区默认值增加 `mindmaps: []`
- `src/components/mindmap/mindmapModel.ts`
  - 宿主侧常量与纯函数：固定 storage key、默认空导图、标题提取
- `src/components/mindmap/mindmapModel.test.ts`
  - 校验默认 snapshot 和标题提取
- `src/utils/blockFactory.ts`
  - 新增 `createMindmapRecord()`、`createMindmapBlock()`
- `src/lib/db.ts`
  - 新增 `mindmaps` 表和 Dexie 版本升级
- `src/lib/workspaceRepository.ts`
  - 读写 `mindmaps`
  - 兼容旧快照没有 `mindmaps` 的情况
- `src/lib/workspaceRepository.test.ts`
  - 覆盖旧数据迁移与新字段保存
- `src/store/createWorkspaceStore.ts`
  - 管理 `mindmaps`
  - 插入/复制/恢复 mindmap 块
  - 导出导入、撤销重做、非页面资源持久化纳入 `mindmaps`
- `src/store/createWorkspaceStore.test.ts`
  - 覆盖插入、复制、导出、恢复
- `src/components/editor/SlashMenu.tsx`
  - 增加“思维导图”命令菜单项
- `src/components/editor/BlockEditor.tsx`
  - 渲染 `mindmap` 卡片块
  - 触发打开与恢复
- `src/components/editor/blocks/MindmapBlock.tsx`
  - 正文中的导图卡片
- `src/components/editor/blocks/MindmapBlock.test.tsx`
  - 卡片渲染、点击与缺失态
- `src/components/mindmap/MindmapPage.tsx`
  - 独立导图编辑页外壳，只保留左上返回按钮
- `src/components/mindmap/MindmapPage.test.tsx`
  - 校验没有知识库额外头部 UI
- `src/components/mindmap/MindmapFrame.tsx`
  - iframe 注入、storage 监听、离开前兜底写回
- `src/components/mindmap/MindmapFrame.test.tsx`
  - 校验 storage 接管逻辑
- `src/components/mindmap/mindmapStaticBundle.test.ts`
  - 校验导入后的 `index.html` 使用相对资源路径
- `src/app/App.tsx`
  - 注入 `mindmaps`
  - 新增 `/pages/:pageId/mindmaps/:mindmapId` 路由
  - mindmap 路由下隐藏侧栏
- `src/app/App.test.tsx`
  - 校验 mindmap 路由显示与侧栏隐藏
- `src/styles/index.css`
  - 导图卡片与导图路由页样式
- `public/mindmap-web/index.html`
  - 从实验软件复制来的入口页，资源路径改为相对路径
- `public/mindmap-web/favicon.svg`
  - 从实验软件复制来的图标
- `public/mindmap-web/assets/*`
  - 从实验软件复制来的静态产物

## Task 1: 扩展领域模型、默认导图结构和仓库读写

**Files:**
- Create: `src/components/mindmap/mindmapModel.ts`
- Create: `src/components/mindmap/mindmapModel.test.ts`
- Modify: `src/domain/types.ts`
- Modify: `src/domain/seed.ts`
- Modify: `src/utils/blockFactory.ts`
- Modify: `src/lib/db.ts`
- Modify: `src/lib/workspaceRepository.ts`
- Test: `src/lib/workspaceRepository.test.ts`

- [ ] **Step 1: 先写失败测试，锁定默认空导图和旧快照迁移**

```ts
// src/components/mindmap/mindmapModel.test.ts
import { describe, expect, it } from 'vitest'
import {
  DEFAULT_MINDMAP_TITLE,
  MINDMAP_STORAGE_KEY,
  createEmptyMindmapSnapshot,
  extractMindmapTitle,
} from './mindmapModel'

describe('mindmapModel', () => {
  it('creates the default standalone mindmap document shape', () => {
    const snapshot = createEmptyMindmapSnapshot()

    expect(MINDMAP_STORAGE_KEY).toBe('mindmap-web.document.v1')
    expect(snapshot).toMatchObject({
      id: 'doc-root',
      title: DEFAULT_MINDMAP_TITLE,
      structure: 'mindmap',
      rootId: 'node-root',
      viewport: { x: 0, y: 0, scale: 1 },
    })
    expect(snapshot.nodes['node-root']).toMatchObject({
      id: 'node-root',
      parentId: null,
      childIds: [],
      text: '中心主题',
      collapsed: false,
    })
  })

  it('extracts a safe title from an incoming snapshot', () => {
    expect(extractMindmapTitle({ title: '产品规划' })).toBe('产品规划')
    expect(extractMindmapTitle({ title: '   ' })).toBe(DEFAULT_MINDMAP_TITLE)
    expect(extractMindmapTitle(null)).toBe(DEFAULT_MINDMAP_TITLE)
  })
})
```

```ts
// src/lib/workspaceRepository.test.ts
it('loads legacy persisted data without mindmaps as an empty mindmaps array', async () => {
  const repository = createDexieWorkspaceRepository()
  const now = '2026-06-24T00:00:00.000Z'

  await db.pages.put({
    id: 'page_legacy',
    parentId: null,
    title: 'Legacy',
    icon: null,
    cover: null,
    blocks: [{ id: 'block_legacy', type: 'paragraph', text: 'legacy' }],
    createdAt: now,
    updatedAt: now,
  })
  await db.settings.put({
    id: 'workspace',
    lastOpenedPageId: 'page_legacy',
  })

  await expect(repository.load()).resolves.toEqual({
    boards: [],
    dataTables: [],
    mindmaps: [],
    pages: [
      {
        id: 'page_legacy',
        parentId: null,
        title: 'Legacy',
        icon: null,
        cover: null,
        blocks: [{ id: 'block_legacy', type: 'paragraph', text: 'legacy' }],
        createdAt: now,
        updatedAt: now,
      },
    ],
    settings: {
      lastOpenedPageId: 'page_legacy',
    },
  })
})
```

- [ ] **Step 2: 运行这组测试，确认先红**

Run: `npm test -- src/components/mindmap/mindmapModel.test.ts src/lib/workspaceRepository.test.ts`
Expected: FAIL，提示 `mindmapModel` 文件不存在，或 `mindmaps` 字段缺失。

- [ ] **Step 3: 最小实现模型、工厂和仓库迁移**

```ts
// src/domain/types.ts
export type MindmapId = string

export interface MindmapBlock extends BlockBase {
  type: 'mindmap'
  mindmapId: MindmapId
}

export interface MindmapRecord {
  id: MindmapId
  title: string
  snapshot: unknown
  createdAt: string
  updatedAt: string
}

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
  | 'whiteboard'
  | 'data_table'
  | 'data_table_inline'
  | 'mindmap'

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
  | WhiteboardBlock
  | DataTableBlock
  | MindmapBlock

export interface WorkspaceSnapshot {
  boards: BoardRecord[]
  dataTables?: DataTableRecord[]
  mindmaps?: MindmapRecord[]
  pages: PageRecord[]
  settings: WorkspaceSettings
}
```

```ts
// src/components/mindmap/mindmapModel.ts
export const MINDMAP_STORAGE_KEY = 'mindmap-web.document.v1'
export const DEFAULT_MINDMAP_TITLE = '未命名导图'

export function createEmptyMindmapSnapshot() {
  return {
    id: 'doc-root',
    title: DEFAULT_MINDMAP_TITLE,
    structure: 'mindmap',
    themeId: 'classic',
    nodeShape: 'rounded',
    autoBalanceLayout: false,
    rootId: 'node-root',
    viewport: { x: 0, y: 0, scale: 1 },
    nodes: {
      'node-root': {
        id: 'node-root',
        parentId: null,
        childIds: [],
        text: '中心主题',
        collapsed: false,
        style: {
          nodeColor: '#ffffff',
          branchColor: '#0f766e',
        },
      },
    },
    updatedAt: new Date().toISOString(),
  }
}

export function extractMindmapTitle(snapshot: unknown) {
  if (!snapshot || typeof snapshot !== 'object') {
    return DEFAULT_MINDMAP_TITLE
  }

  const title = (snapshot as { title?: unknown }).title
  return typeof title === 'string' && title.trim() ? title.trim() : DEFAULT_MINDMAP_TITLE
}
```

```ts
// src/utils/blockFactory.ts
import { createEmptyMindmapSnapshot, extractMindmapTitle } from '../components/mindmap/mindmapModel'

export function createMindmapRecord(now = new Date().toISOString()): MindmapRecord {
  const snapshot = createEmptyMindmapSnapshot()
  return {
    id: createId('mindmap'),
    title: extractMindmapTitle(snapshot),
    snapshot,
    createdAt: now,
    updatedAt: now,
  }
}

export function createMindmapBlock(mindmapId: MindmapId): MindmapBlock {
  return {
    id: createId('block'),
    type: 'mindmap',
    mindmapId,
  }
}
```

```ts
// src/domain/seed.ts
return {
  boards: [],
  dataTables: [],
  mindmaps: [],
  pages: [rootPage],
  settings: {
    lastOpenedPageId: rootPage.id,
  },
}
```

```ts
// src/lib/db.ts
import type {
  BoardRecord,
  DataTableRecord,
  MindmapRecord,
  PageRecord,
  WorkspaceSettings,
} from '../domain/types'

class WorkspaceDatabase extends Dexie {
  boards!: Table<BoardRecord, string>
  dataTables!: Table<DataTableRecord, string>
  mindmaps!: Table<MindmapRecord, string>
  pages!: Table<PageRecord, string>
  settings!: Table<WorkspaceSettingsRow, string>

  constructor() {
    super('notion-web')

    this.version(8).stores({
      boards: 'id',
      dataTables: 'id',
      mindmaps: 'id',
      pages: 'id, parentId, updatedAt',
      settings: 'id',
    })
  }
}
```

```ts
// src/lib/workspaceRepository.ts
const [boards, pages, settings] = await Promise.all([
  db.boards.toArray(),
  db.pages.toArray(),
  db.settings.get(SETTINGS_ID),
])

return {
  boards,
  dataTables: await db.dataTables.toArray(),
  mindmaps: await db.mindmaps.toArray(),
  pages,
  settings: {
    lastOpenedPageId: settings.lastOpenedPageId,
  },
}
```

```ts
// src/lib/workspaceRepository.ts
async save(snapshot) {
  const [dataTables, mindmaps] = await Promise.all([
    snapshot.dataTables ?? db.dataTables.toArray(),
    snapshot.mindmaps ?? db.mindmaps.toArray(),
  ])

  await this.replace({
    ...snapshot,
    dataTables,
    mindmaps,
  })
}

async replace(snapshot) {
  await db.transaction('rw', db.boards, db.dataTables, db.mindmaps, db.pages, db.settings, async () => {
    await db.boards.clear()
    await db.dataTables.clear()
    await db.mindmaps.clear()
    await db.pages.clear()
    await db.settings.clear()
    await db.boards.bulkPut(snapshot.boards)
    await db.dataTables.bulkPut(snapshot.dataTables ?? [])
    await db.mindmaps.bulkPut(snapshot.mindmaps ?? [])
    await db.pages.bulkPut(snapshot.pages)
    await db.settings.put(toSettingsRow(snapshot))
  })
}
```

- [ ] **Step 4: 再跑目标测试，确认转绿**

Run: `npm test -- src/components/mindmap/mindmapModel.test.ts src/lib/workspaceRepository.test.ts`
Expected: PASS

- [ ] **Step 5: 提交这一小步**

```bash
git add src/components/mindmap/mindmapModel.ts src/components/mindmap/mindmapModel.test.ts src/domain/types.ts src/domain/seed.ts src/utils/blockFactory.ts src/lib/db.ts src/lib/workspaceRepository.ts src/lib/workspaceRepository.test.ts
git commit -m "feat: add mindmap workspace schema"
```

## Task 2: 扩展 store，支持 mindmap 记录、导入导出和恢复

**Files:**
- Modify: `src/store/createWorkspaceStore.ts`
- Test: `src/store/createWorkspaceStore.test.ts`
- Modify: `src/utils/blockFactory.ts`

- [ ] **Step 1: 先写失败测试，锁定插入、复制、导出和恢复**

```ts
// src/store/createWorkspaceStore.test.ts
it('creates a mindmap record when inserting a mindmap block', async () => {
  const repository = createDexieWorkspaceRepository()
  const store = createWorkspaceStore(repository)

  await store.getState().bootstrap()
  const pageId = store.getState().currentPageId as string
  await store.getState().insertBlock(pageId, 'mindmap')

  const state = store.getState()
  const page = state.pages.find((item) => item.id === pageId)
  const block = page?.blocks.find((item) => item.type === 'mindmap')

  expect(block).toBeDefined()
  expect(state.mindmaps).toHaveLength(1)
  expect(block && 'mindmapId' in block ? block.mindmapId : null).toBe(state.mindmaps[0]?.id)
})

it('duplicates a mindmap block by cloning the underlying mindmap record', async () => {
  const repository = createDexieWorkspaceRepository()
  const store = createWorkspaceStore(repository)

  await store.getState().bootstrap()
  const pageId = store.getState().currentPageId as string
  const inserted = await store.getState().insertBlock(pageId, 'mindmap')
  await store.getState().duplicateBlock(pageId, inserted?.id as string)

  const state = store.getState()
  expect(state.mindmaps).toHaveLength(2)
  expect(state.mindmaps[1].id).not.toBe(state.mindmaps[0].id)
  expect(state.mindmaps[1].title).toContain('副本')
})

it('exports mindmaps in workspace json', async () => {
  const repository = createDexieWorkspaceRepository()
  const store = createWorkspaceStore(repository)

  await store.getState().bootstrap()
  const pageId = store.getState().currentPageId as string
  await store.getState().insertBlock(pageId, 'mindmap')

  const payload = JSON.parse(await store.getState().exportJson()) as { mindmaps?: unknown[] }
  expect(payload.mindmaps).toHaveLength(1)
})

it('restores a missing mindmap reference with the same id', async () => {
  const repository = createDexieWorkspaceRepository()
  const store = createWorkspaceStore(repository)

  await store.getState().bootstrap()
  const pageId = store.getState().currentPageId as string
  await store.getState().insertBlock(pageId, 'mindmap')

  const [firstMindmap] = store.getState().mindmaps
  store.setState({
    ...store.getState(),
    mindmaps: [],
  })

  const restored = await store.getState().restoreMissingMindmapReference(pageId, firstMindmap.id)
  expect(restored?.id).toBe(firstMindmap.id)
})
```

- [ ] **Step 2: 运行 store 测试，确认先红**

Run: `npm test -- src/store/createWorkspaceStore.test.ts`
Expected: FAIL，提示 `mindmaps` 状态或 `mindmap` 相关动作不存在。

- [ ] **Step 3: 给 WorkspaceState 增加最小 mindmap 状态和动作**

```ts
// src/store/createWorkspaceStore.ts
import { createMindmapBlock, createMindmapRecord } from '../utils/blockFactory'
import type { MindmapRecord } from '../domain/types'

export interface WorkspaceState {
  boards: BoardRecord[]
  dataTables: DataTableRecord[]
  mindmaps: MindmapRecord[]
  pages: PageRecord[]
  settings: WorkspaceSettings
  // ...
  updateMindmapSnapshot: (mindmapId: string, snapshot: unknown) => Promise<void>
  restoreMissingMindmapReference: (pageId: PageId, mindmapId: string) => Promise<MindmapRecord | null>
}

function createEmptyState(): WorkspaceState {
  return {
    boards: [],
    dataTables: [],
    mindmaps: [],
    pages: [],
    settings: {
      lastOpenedPageId: null,
    },
    updateMindmapSnapshot: async () => {
      throw new Error('not implemented')
    },
    restoreMissingMindmapReference: async () => {
      throw new Error('not implemented')
    },
  }
}
```

- [ ] **Step 4: 把所有 workspace 快照辅助函数都纳入 `mindmaps`**

```ts
// src/store/createWorkspaceStore.ts
function normalizeWorkspaceSnapshot(snapshot: WorkspaceSnapshot) {
  let didChange = !Array.isArray((snapshot as WorkspaceSnapshot & { boards?: BoardRecord[] }).boards)
  const rawBoards = Array.isArray((snapshot as WorkspaceSnapshot & { boards?: BoardRecord[] }).boards)
    ? snapshot.boards
    : []
  const rawDataTables = Array.isArray(
    (snapshot as WorkspaceSnapshot & { dataTables?: DataTableRecord[] }).dataTables,
  )
    ? snapshot.dataTables
    : []
  const rawMindmaps = Array.isArray(
    (snapshot as WorkspaceSnapshot & { mindmaps?: MindmapRecord[] }).mindmaps,
  )
    ? snapshot.mindmaps
    : []

  const normalizedBoards = normalizeBoards(rawBoards)
  const boards = normalizedBoards.boards
  const dataTables = structuredClone(rawDataTables)
  const mindmaps = structuredClone(rawMindmaps)

  if (!Array.isArray((snapshot as WorkspaceSnapshot & { dataTables?: DataTableRecord[] }).dataTables)) {
    didChange = true
  }
  if (!Array.isArray((snapshot as WorkspaceSnapshot & { mindmaps?: MindmapRecord[] }).mindmaps)) {
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
    'whiteboard',
    'data_table',
    'mindmap',
  ])

  return {
    snapshot: didChange
      ? { boards, dataTables, mindmaps, pages, settings: snapshot.settings }
      : { ...snapshot, boards, dataTables, mindmaps },
    didChange,
  }
}
```

```ts
// src/store/createWorkspaceStore.ts
function createBackupPayload(snapshot: WorkspaceSnapshot): WorkspaceBackup {
  return {
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    boards: snapshot.boards,
    dataTables: snapshot.dataTables ?? [],
    mindmaps: snapshot.mindmaps ?? [],
    pages: snapshot.pages,
    settings: snapshot.settings,
  }
}

function normalizeImportedSnapshot(payload: unknown): WorkspaceSnapshot {
  const candidate = payload as {
    boards?: unknown
    dataTables?: unknown
    mindmaps?: unknown
    pages?: unknown
    settings?: { lastOpenedPageId?: unknown }
  }

  const lastOpenedPageId = candidate.settings?.lastOpenedPageId
  if (lastOpenedPageId !== null && lastOpenedPageId !== undefined && typeof lastOpenedPageId !== 'string') {
    throw new Error('Invalid workspace settings')
  }

  return {
    boards: Array.isArray(candidate.boards) ? structuredClone(candidate.boards as BoardRecord[]) : [],
    dataTables: Array.isArray(candidate.dataTables)
      ? structuredClone(candidate.dataTables as DataTableRecord[])
      : [],
    mindmaps: Array.isArray(candidate.mindmaps)
      ? structuredClone(candidate.mindmaps as MindmapRecord[])
      : [],
    pages: structuredClone(candidate.pages as PageRecord[]),
    settings: createSettings(lastOpenedPageId ?? null),
  }
}
```

```ts
// src/store/createWorkspaceStore.ts
function createSnapshotFromState(
  state: Pick<WorkspaceState, 'boards' | 'dataTables' | 'mindmaps' | 'pages' | 'settings'>,
): WorkspaceSnapshot {
  return structuredClone({
    boards: state.boards,
    dataTables: state.dataTables,
    mindmaps: state.mindmaps,
    pages: state.pages,
    settings: state.settings,
  })
}

async function persistNonPageAssets(
  state: Pick<WorkspaceState, 'boards' | 'dataTables' | 'mindmaps' | 'pages' | 'settings'>,
  nextAssets: Partial<Pick<WorkspaceState, 'boards' | 'dataTables' | 'mindmaps'>>,
) {
  const nextBoards = nextAssets.boards ?? state.boards
  const nextDataTables = nextAssets.dataTables ?? state.dataTables
  const nextMindmaps = nextAssets.mindmaps ?? state.mindmaps

  await repository.save({
    boards: nextBoards,
    dataTables: nextDataTables,
    mindmaps: nextMindmaps,
    pages: state.pages,
    settings: state.settings,
  })

  set({
    boards: nextBoards,
    dataTables: nextDataTables,
    mindmaps: nextMindmaps,
    saveStatus: 'saved',
  })
}
```

- [ ] **Step 5: 接入插入、插入后、复制、转换、更新和恢复逻辑**

```ts
// src/store/createWorkspaceStore.ts
let nextMindmaps = state.mindmaps

if (type === 'mindmap') {
  const mindmap = createMindmapRecord(now)
  nextMindmaps = [...state.mindmaps, mindmap]
  insertedBlock = createMindmapBlock(mindmap.id)
  didInsert = true

  return {
    ...page,
    updatedAt: now,
    blocks: [...page.blocks, insertedBlock],
  }
}
```

```ts
// src/store/createWorkspaceStore.ts
if (type === 'mindmap') {
  const mindmap = createMindmapRecord(now)
  nextMindmaps = [...state.mindmaps, mindmap]
  insertedBlock = createMindmapBlock(mindmap.id)
} else {
  insertedBlock = createBlock(type)
}

await repository.save({
  boards: nextBoards,
  dataTables: nextDataTables,
  mindmaps: nextMindmaps,
  pages: snapshotPages,
  settings: state.settings,
})

set({
  boards: nextBoards,
  dataTables: nextDataTables,
  mindmaps: nextMindmaps,
  pages: snapshotPages,
  saveStatus: 'saved',
})
```

```ts
// src/store/createWorkspaceStore.ts
if (source.type === 'mindmap') {
  const sourceMindmap = state.mindmaps.find((item) => item.id === source.mindmapId)

  if (sourceMindmap) {
    const nextMindmap = {
      ...createMindmapRecord(now),
      title: `${sourceMindmap.title}${COPY_SUFFIX}`,
      snapshot: structuredClone(sourceMindmap.snapshot),
    }

    nextMindmaps = [...state.mindmaps, nextMindmap]
    blocks.splice(index + 1, 0, createMindmapBlock(nextMindmap.id))
  }
}

await repository.save({
  boards: nextBoards,
  dataTables: nextDataTables,
  mindmaps: nextMindmaps,
  pages: nextPages,
  settings: state.settings,
})
```

```ts
// src/store/createWorkspaceStore.ts
const fresh =
  type === 'whiteboard'
    ? (() => {
        const board = createBoardRecord(now)
        nextBoards = [...state.boards, board]
        return createWhiteboardBlock(board.id)
      })()
    : isDataTableCommandType(type)
      ? (() => {
          const dataTable = createDataTableRecord(now)
          nextDataTables = [...state.dataTables, dataTable]
          return createDataTableBlock(dataTable.id, getDataTableDisplayMode(type))
        })()
      : type === 'mindmap'
        ? (() => {
            const mindmap = createMindmapRecord(now)
            nextMindmaps = [...state.mindmaps, mindmap]
            return createMindmapBlock(mindmap.id)
          })()
        : createBlock(type)

return { ...preserveBlockContent(fresh, block), id: block.id }
```

```ts
// src/store/createWorkspaceStore.ts
updateMindmapSnapshot: async (mindmapId, snapshot) => {
  const state = get()
  const now = new Date().toISOString()
  const nextMindmaps = state.mindmaps.map((mindmap) =>
    mindmap.id === mindmapId
      ? {
          ...mindmap,
          title: extractMindmapTitle(snapshot),
          snapshot: structuredClone(snapshot),
          updatedAt: now,
        }
      : mindmap,
  )

  await persistNonPageAssets(state, { mindmaps: nextMindmaps })
},

restoreMissingMindmapReference: async (_pageId, mindmapId) => {
  const state = get()
  if (state.mindmaps.some((mindmap) => mindmap.id === mindmapId)) {
    return state.mindmaps.find((mindmap) => mindmap.id === mindmapId) ?? null
  }

  const now = new Date().toISOString()
  const restored: MindmapRecord = {
    ...createMindmapRecord(now),
    id: mindmapId,
  }
  const nextMindmaps = [...state.mindmaps, restored]

  await persistNonPageAssets(state, { mindmaps: nextMindmaps })
  return restored
},
```

```ts
// src/store/createWorkspaceStore.ts
set({
  boards: snapshot.boards,
  dataTables: snapshot.dataTables ?? [],
  mindmaps: snapshot.mindmaps ?? [],
  pages: snapshot.pages,
  settings: snapshot.settings,
  currentPageId,
  saveStatus: 'saved',
})
```

```ts
// src/store/createWorkspaceStore.ts
function getPlainTextFromBlock(block: BlockRecord): string {
  switch (block.type) {
    case 'paragraph':
    case 'heading_1':
    case 'heading_2':
    case 'heading_3':
    case 'todo':
    case 'code':
      return block.text
    case 'bulleted_list':
    case 'numbered_list':
      return block.items.join('\n')
    case 'table':
      return block.rows.flat().join(' ').trim()
    case 'child_page':
    case 'whiteboard':
    case 'data_table':
    case 'mindmap':
      return ''
  }
}
```

```ts
// src/store/createWorkspaceStore.ts
return JSON.stringify(
  createBackupPayload({
    boards: state.boards,
    dataTables: state.dataTables,
    mindmaps: state.mindmaps,
    pages: state.pages,
    settings: state.settings,
  }),
  null,
  2,
)
```

- [ ] **Step 6: 跑 store 测试，确认转绿**

Run: `npm test -- src/store/createWorkspaceStore.test.ts`
Expected: PASS

- [ ] **Step 7: 提交这一小步**

```bash
git add src/store/createWorkspaceStore.ts src/store/createWorkspaceStore.test.ts src/utils/blockFactory.ts
git commit -m "feat: add mindmap store support"
```

## Task 3: 增加命令菜单、正文卡片和独立导图路由壳

**Files:**
- Modify: `src/components/editor/SlashMenu.tsx`
- Modify: `src/components/editor/BlockEditor.tsx`
- Create: `src/components/editor/blocks/MindmapBlock.tsx`
- Create: `src/components/editor/blocks/MindmapBlock.test.tsx`
- Create: `src/components/mindmap/MindmapPage.tsx`
- Create: `src/components/mindmap/MindmapPage.test.tsx`
- Modify: `src/app/App.tsx`
- Test: `src/app/App.test.tsx`
- Modify: `src/styles/index.css`

- [ ] **Step 1: 先写失败测试，锁定卡片入口和只有返回按钮的页面壳**

```ts
// src/components/editor/blocks/MindmapBlock.test.tsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { MindmapBlock } from './MindmapBlock'

describe('MindmapBlock', () => {
  it('renders a mindmap card and opens it when clicked', async () => {
    const user = userEvent.setup()
    const onOpen = vi.fn()

    render(
      <MindmapBlock
        title="产品规划"
        updatedLabel="2 分钟前更新"
        isMissing={false}
        onOpen={onOpen}
      />,
    )

    await user.click(screen.getByRole('button', { name: '打开思维导图 产品规划' }))
    expect(onOpen).toHaveBeenCalledTimes(1)
  })
})
```

```ts
// src/components/mindmap/MindmapPage.test.tsx
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { MindmapPage } from './MindmapPage'

describe('MindmapPage', () => {
  it('shows only a back button chrome around the iframe area', () => {
    const { container } = render(
      <MindmapPage onBack={() => undefined}>
        <div data-testid="frame-slot" />
      </MindmapPage>,
    )

    expect(screen.getByRole('button', { name: '返回页面' })).toBeInTheDocument()
    expect(screen.getByTestId('frame-slot')).toBeInTheDocument()
    expect(container.querySelector('.page-breadcrumbs')).toBeNull()
    expect(container.querySelector('.page-header')).toBeNull()
  })
})
```

```ts
// src/app/App.test.tsx
it('opens a mindmap route with the sidebar hidden', async () => {
  const pageId = 'page_mindmap'
  const mindmapId = 'mindmap_strategy'

  const store = createWorkspaceStore(createDexieWorkspaceRepository())
  store.setState({
    ...store.getState(),
    currentPageId: pageId,
    mindmaps: [
      {
        id: mindmapId,
        title: '策略图',
        snapshot: createEmptyMindmapSnapshot(),
        createdAt: '2026-06-24T00:00:00.000Z',
        updatedAt: '2026-06-24T00:00:00.000Z',
      },
    ],
    pages: [
      {
        id: pageId,
        parentId: null,
        title: '入口页',
        icon: null,
        cover: null,
        blocks: [{ id: 'block_mindmap', type: 'mindmap', mindmapId }],
        createdAt: '2026-06-24T00:00:00.000Z',
        updatedAt: '2026-06-24T00:00:00.000Z',
      },
    ],
  })

  const { container } = render(
    <App store={store} initialEntries={[`/pages/${pageId}/mindmaps/${mindmapId}`]} />,
  )

  expect(await screen.findByRole('button', { name: '返回页面' })).toBeInTheDocument()
  expect(container.querySelector('.sidebar')).toBeNull()
})
```

- [ ] **Step 2: 运行 UI 测试，确认先红**

Run: `npm test -- src/components/editor/blocks/MindmapBlock.test.tsx src/components/mindmap/MindmapPage.test.tsx src/app/App.test.tsx`
Expected: FAIL，提示相关组件和路由不存在。

- [ ] **Step 3: 最小实现命令菜单项、正文卡片和导图页壳**

```ts
// src/components/editor/SlashMenu.tsx
{
  type: 'mindmap',
  label: '思维导图',
  description: '插入一个可点击进入的思维导图卡片',
  icon: '◎',
  group: 'page_data',
}
```

```tsx
// src/components/editor/blocks/MindmapBlock.tsx
import { CanvasEntryCard } from '../../shared/CanvasEntryCard'

interface MindmapBlockProps {
  title: string
  updatedLabel: string
  isMissing: boolean
  onOpen: () => void
  onRecover?: () => void
}

export function MindmapBlock({
  title,
  updatedLabel,
  isMissing,
  onOpen,
  onRecover,
}: MindmapBlockProps) {
  const card = (
    <CanvasEntryCard
      kindLabel="思维导图"
      title={title}
      meta={updatedLabel}
      emptyPreviewLabel="空白思维导图"
      openLabel="打开"
      isMissing={isMissing}
      onOpen={onOpen}
      className={isMissing ? 'mindmap-card mindmap-card-missing' : 'mindmap-card'}
      previewClassName="mindmap-card-preview"
      bodyClassName="mindmap-card-body"
      titleClassName="mindmap-card-title"
      metaClassName="mindmap-card-meta"
      arrowClassName="mindmap-card-arrow"
      emptyPreviewClassName="mindmap-card-preview-empty"
      previewContent={<span className="mindmap-card-preview-graphic" aria-hidden="true" />}
    />
  )

  if (!isMissing || !onRecover) {
    return card
  }

  return (
    <div className="mindmap-card-shell">
      {card}
      <button type="button" className="mindmap-card-recover" onClick={onRecover}>
        重新创建思维导图
      </button>
    </div>
  )
}
```

```tsx
// src/components/mindmap/MindmapPage.tsx
import type { PropsWithChildren } from 'react'

export function MindmapPage({
  children,
  onBack,
}: PropsWithChildren<{ onBack: () => void }>) {
  return (
    <section className="mindmap-page">
      <div className="mindmap-page-topbar">
        <button type="button" className="mindmap-page-back" aria-label="返回页面" onClick={onBack}>
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M15 18l-6-6 6-6" />
            <path d="M9 12h8" />
          </svg>
        </button>
      </div>
      <div className="mindmap-page-surface">{children}</div>
    </section>
  )
}
```

- [ ] **Step 4: 在 `BlockEditor` 和 `App.tsx` 中接入 `mindmap` 打开链路**

```tsx
// src/components/editor/BlockEditor.tsx
import type { MindmapRecord } from '../../domain/types'
import { MindmapBlock } from './blocks/MindmapBlock'

interface BlockEditorProps {
  mindmaps?: MindmapRecord[]
  onOpenMindmap?: (mindmapId: string) => void
  onRestoreMindmap?: (mindmapId: string) => void
}

export function BlockEditor({
  mindmaps = [],
  onOpenMindmap,
  onRestoreMindmap,
}: BlockEditorProps) {
  const boardMap = new Map(boards.map((board) => [board.id, board]))
  const dataTableMap = new Map(dataTables.map((dataTable) => [dataTable.id, dataTable]))
  const mindmapMap = new Map(mindmaps.map((mindmap) => [mindmap.id, mindmap]))
  case 'mindmap': {
    const mindmap = mindmapMap.get(block.mindmapId)

    return renderBlockRow(
      block,
      <MindmapBlock
        title={mindmap?.title ?? '思维导图不存在'}
        updatedLabel={mindmap ? formatCanvasUpdatedLabel(mindmap.updatedAt) : '引用已丢失'}
        isMissing={!mindmap}
        onOpen={() => onOpenMindmap?.(block.mindmapId)}
        onRecover={!mindmap ? () => onRestoreMindmap?.(block.mindmapId) : undefined}
      />,
    )
  }
}
```

```tsx
// src/app/App.tsx
const state = useSyncExternalStore(store.subscribe, store.getState, store.getState)

<AppRoutes
  boards={state.boards}
  dataTables={state.dataTables}
  mindmaps={state.mindmaps}
  pages={state.pages}
  currentPageId={state.currentPageId}
  onUpdateMindmapSnapshot={(mindmapId, snapshot) =>
    store.getState().updateMindmapSnapshot(mindmapId, snapshot)
  }
  onRestoreMissingMindmap={(pageId, mindmapId) =>
    store.getState().restoreMissingMindmapReference(pageId, mindmapId)
  }
/>
```

```tsx
// src/app/App.tsx
interface AppRoutesProps {
  boards: BoardRecord[]
  dataTables: DataTableRecord[]
  mindmaps: MindmapRecord[]
  pages: AppState['pages']
  currentPageId: AppState['currentPageId']
  onUpdateMindmapSnapshot: (mindmapId: string, snapshot: unknown) => Promise<void>
  onRestoreMissingMindmap: (pageId: string, mindmapId: string) => Promise<MindmapRecord | null>
}

const isMindmapRoute = useMatch('/pages/:pageId/mindmaps/:mindmapId') !== null

<AppShell
  hideSidebar={isWhiteboardRoute || isMindmapRoute}
  sidebar={
    <SidebarTree
      pages={pages}
      boards={boards}
      dataTables={dataTables}
      currentPageId={currentPageId}
      onCreatePage={() => {
        void handleCreatePage()
      }}
      onSearch={() => setIsSearchOpen(true)}
      onReorderPage={(activePageId, overPageId) => {
        void onReorderPage(activePageId, overPageId)
      }}
    />
  }
>

<Route
  path="/pages/:pageId/mindmaps/:mindmapId"
  element={
    <MindmapRoute
      pages={pages}
      mindmaps={mindmaps}
      currentPageId={currentPageId}
      onRoutePageChange={onRoutePageChange}
      onUpdateMindmapSnapshot={onUpdateMindmapSnapshot}
    />
  }
/>
```

```tsx
// src/app/App.tsx
<BlockEditor
  page={page}
  allPages={pages}
  boards={boards}
  dataTables={dataTables}
  mindmaps={mindmaps}
  onOpenMindmap={(mindmapId) => navigate(`/pages/${page.id}/mindmaps/${mindmapId}`)}
  onRestoreMindmap={(mindmapId) => {
    void onRestoreMissingMindmap(page.id, mindmapId)
  }}
/>
```

- [ ] **Step 5: 跑路由和卡片测试，确认转绿**

Run: `npm test -- src/components/editor/blocks/MindmapBlock.test.tsx src/components/mindmap/MindmapPage.test.tsx src/app/App.test.tsx`
Expected: PASS

- [ ] **Step 6: 提交这一小步**

```bash
git add src/components/editor/SlashMenu.tsx src/components/editor/BlockEditor.tsx src/components/editor/blocks/MindmapBlock.tsx src/components/editor/blocks/MindmapBlock.test.tsx src/components/mindmap/MindmapPage.tsx src/components/mindmap/MindmapPage.test.tsx src/app/App.tsx src/app/App.test.tsx src/styles/index.css
git commit -m "feat: add mindmap entry card and route shell"
```

## Task 4: 导入静态 bundle，并实现 iframe storage 接管

**Files:**
- Create: `src/components/mindmap/MindmapFrame.tsx`
- Create: `src/components/mindmap/MindmapFrame.test.tsx`
- Create: `src/components/mindmap/mindmapStaticBundle.test.ts`
- Modify: `src/app/App.tsx`
- Refresh: `public/mindmap-web/index.html`
- Refresh: `public/mindmap-web/favicon.svg`
- Refresh: `public/mindmap-web/assets/*`

- [ ] **Step 1: 先复制静态产物，并把入口资源路径改成相对路径**

Run:

```powershell
New-Item -ItemType Directory -Force -Path 'E:\Workspace\P001_Notion个人知识库\notion-web\public\mindmap-web' | Out-Null
Copy-Item -Recurse -Force 'E:\Workspace\实验软件\mindmap-web\dist\*' 'E:\Workspace\P001_Notion个人知识库\notion-web\public\mindmap-web\'
```

Then edit `public/mindmap-web/index.html` to:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <link rel="icon" type="image/svg+xml" href="./favicon.svg" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>mindmap-web</title>
    <script type="module" crossorigin src="./assets/index-C6JP4z8p.js"></script>
    <link rel="stylesheet" crossorigin href="./assets/index-y0sdhTii.css" />
  </head>
  <body>
    <div id="root"></div>
  </body>
</html>
```

- [ ] **Step 2: 写失败测试，锁定静态资源路径和宿主接管逻辑**

```ts
// src/components/mindmap/mindmapStaticBundle.test.ts
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('mindmap static bundle', () => {
  it('uses relative asset paths inside the imported iframe index', () => {
    const html = readFileSync('public/mindmap-web/index.html', 'utf8')

    expect(html).toContain('src="./assets/')
    expect(html).toContain('href="./assets/')
    expect(html).toContain('href="./favicon.svg"')
  })
})
```

```tsx
// src/components/mindmap/MindmapFrame.test.tsx
import { render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { MindmapFrame } from './MindmapFrame'
import { MINDMAP_STORAGE_KEY, createEmptyMindmapSnapshot } from './mindmapModel'

describe('MindmapFrame', () => {
  it('primes the fixed storage key before mounting the iframe and forwards storage updates', () => {
    const onChange = vi.fn()
    const snapshot = createEmptyMindmapSnapshot()

    render(<MindmapFrame mindmapId="mindmap_1" snapshot={snapshot} onChange={onChange} />)

    expect(JSON.parse(window.localStorage.getItem(MINDMAP_STORAGE_KEY) as string)).toMatchObject({
      id: 'doc-root',
      title: '未命名导图',
    })

    const nextSnapshot = { ...snapshot, title: '策略稿' }
    window.dispatchEvent(
      new StorageEvent('storage', {
        key: MINDMAP_STORAGE_KEY,
        newValue: JSON.stringify(nextSnapshot),
        storageArea: window.localStorage,
      }),
    )

    expect(onChange).toHaveBeenCalledWith(nextSnapshot)
  })
})
```

- [ ] **Step 3: 跑 bundle 和 iframe 测试，确认先红**

Run: `npm test -- src/components/mindmap/mindmapStaticBundle.test.ts src/components/mindmap/MindmapFrame.test.tsx`
Expected: FAIL，提示 `MindmapFrame` 不存在或静态资源路径未改写。

- [ ] **Step 4: 最小实现 iframe 宿主和导图路由页**

```tsx
// src/components/mindmap/MindmapFrame.tsx
import { useEffect, useState } from 'react'
import { MINDMAP_STORAGE_KEY } from './mindmapModel'

const MINDMAP_IFRAME_SRC = '/mindmap-web/index.html'

function parseSnapshot(raw: string | null) {
  if (!raw) {
    return null
  }

  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

export function MindmapFrame({
  mindmapId,
  snapshot,
  onChange,
}: {
  mindmapId: string
  snapshot: unknown
  onChange: (snapshot: unknown) => void
}) {
  const [ready, setReady] = useState(false)

  useEffect(() => {
    const serialized = JSON.stringify(snapshot)
    setReady(false)
    window.localStorage.setItem(MINDMAP_STORAGE_KEY, serialized)
    setReady(true)
  }, [mindmapId, snapshot])

  useEffect(() => {
    const flushLatest = () => {
      const raw = window.localStorage.getItem(MINDMAP_STORAGE_KEY)
      const nextSnapshot = parseSnapshot(raw)
      if (nextSnapshot !== null) {
        onChange(nextSnapshot)
      }
    }

    const handleStorage = (event: StorageEvent) => {
      if (event.key !== MINDMAP_STORAGE_KEY || !event.newValue) {
        return
      }

      const nextSnapshot = parseSnapshot(event.newValue)
      if (nextSnapshot !== null) {
        onChange(nextSnapshot)
      }
    }

    window.addEventListener('storage', handleStorage)
    window.addEventListener('beforeunload', flushLatest)

    return () => {
      flushLatest()
      window.removeEventListener('storage', handleStorage)
      window.removeEventListener('beforeunload', flushLatest)
    }
  }, [mindmapId, onChange])

  if (!ready) {
    return null
  }

  return <iframe title="思维导图编辑器" className="mindmap-frame" src={MINDMAP_IFRAME_SRC} />
}
```

```tsx
// src/app/App.tsx
function MindmapRoute({
  pages,
  mindmaps,
  currentPageId,
  onRoutePageChange,
  onUpdateMindmapSnapshot,
}: {
  pages: PageRecord[]
  mindmaps: MindmapRecord[]
  currentPageId: string | null
  onRoutePageChange: (pageId: string) => Promise<void>
  onUpdateMindmapSnapshot: (mindmapId: string, snapshot: unknown) => Promise<void>
}) {
  const { pageId: routePageId, mindmapId } = useParams()
  const navigate = useNavigate()
  const page = pages.find((item) => item.id === routePageId)
  const mindmap = mindmaps.find((item) => item.id === mindmapId) ?? null

  useEffect(() => {
    if (!page || currentPageId === page.id) {
      return
    }

    void onRoutePageChange(page.id)
  }, [currentPageId, onRoutePageChange, page])

  if (!page) {
    return <div className="page-empty">{uiCopy.app.pageNotFound}</div>
  }

  return (
    <MindmapPage onBack={() => navigate(`/pages/${page.id}`)}>
      {mindmap ? (
        <MindmapFrame
          key={mindmap.id}
          mindmapId={mindmap.id}
          snapshot={mindmap.snapshot}
          onChange={(snapshot) => {
            void onUpdateMindmapSnapshot(mindmap.id, snapshot)
          }}
        />
      ) : (
        <div className="mindmap-page-empty">思维导图不存在</div>
      )}
    </MindmapPage>
  )
}
```

- [ ] **Step 5: 跑 iframe 与路由测试，确认转绿**

Run: `npm test -- src/components/mindmap/mindmapStaticBundle.test.ts src/components/mindmap/MindmapFrame.test.tsx src/app/App.test.tsx`
Expected: PASS

- [ ] **Step 6: 提交这一小步**

```bash
git add src/components/mindmap/MindmapFrame.tsx src/components/mindmap/MindmapFrame.test.tsx src/components/mindmap/mindmapStaticBundle.test.ts src/app/App.tsx public/mindmap-web
git commit -m "feat: host mindmap app in iframe"
```

## Task 5: 回归验证、缺失引用恢复与最终收口

**Files:**
- Modify: `src/components/editor/BlockEditor.tsx`
- Modify: `src/app/App.tsx`
- Modify: `src/styles/index.css`
- Test: `src/store/createWorkspaceStore.test.ts`
- Test: `src/components/editor/blocks/MindmapBlock.test.tsx`
- Test: `src/components/mindmap/MindmapPage.test.tsx`
- Test: `src/components/mindmap/MindmapFrame.test.tsx`
- Test: `src/app/App.test.tsx`

- [ ] **Step 1: 补一条缺失引用 UI 测试，锁定“丢失后可恢复”**

```ts
// src/components/editor/blocks/MindmapBlock.test.tsx
it('shows a recover action when the linked mindmap record is missing', async () => {
  const user = userEvent.setup()
  const onRecover = vi.fn()

  render(
    <MindmapBlock
      title="思维导图不存在"
      updatedLabel="引用已丢失"
      isMissing={true}
      onOpen={() => undefined}
      onRecover={onRecover}
    />,
  )

  await user.click(screen.getByRole('button', { name: '重新创建思维导图' }))
  expect(onRecover).toHaveBeenCalledTimes(1)
})
```

- [ ] **Step 2: 把缺失态和回收兜底打磨完整**

```tsx
// src/components/editor/BlockEditor.tsx
onRecover={!mindmap ? () => onRestoreMindmap?.(block.mindmapId) : undefined}
```

```tsx
// src/components/mindmap/MindmapFrame.tsx
const flushLatest = () => {
  const raw = window.localStorage.getItem(MINDMAP_STORAGE_KEY)
  const nextSnapshot = parseSnapshot(raw)
  if (nextSnapshot !== null) {
    onChange(nextSnapshot)
  }
}
```

```css
/* src/styles/index.css */
.mindmap-page {
  position: relative;
  width: 100%;
  height: 100vh;
  background: #ffffff;
}

.mindmap-page-topbar {
  position: absolute;
  top: 16px;
  left: 16px;
  z-index: 20;
}

.mindmap-page-back {
  width: 40px;
  height: 40px;
  border: 1px solid rgba(15, 23, 42, 0.1);
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.92);
}

.mindmap-page-surface,
.mindmap-frame {
  width: 100%;
  height: 100%;
}

.mindmap-frame {
  display: block;
  border: 0;
}
```

- [ ] **Step 3: 运行完整目标测试**

Run: `npm test -- src/components/mindmap/mindmapModel.test.ts src/lib/workspaceRepository.test.ts src/store/createWorkspaceStore.test.ts src/components/editor/blocks/MindmapBlock.test.tsx src/components/mindmap/MindmapPage.test.tsx src/components/mindmap/MindmapFrame.test.tsx src/components/mindmap/mindmapStaticBundle.test.ts src/app/App.test.tsx`
Expected: PASS

- [ ] **Step 4: 跑一次构建验证**

Run: `npm run build`
Expected: PASS

- [ ] **Step 5: 手工验证导图入口与独立编辑页**

Run:

```bash
npm run dev
```

Manual checks:
- 页面正文里通过 `/` 能插入“思维导图”卡片
- 点击卡片能进入 `/pages/:pageId/mindmaps/:mindmapId`
- 导图页只显示左上返回按钮，不显示侧栏、面包屑、页面头部
- iframe 内原导图应用可正常编辑
- 返回原页面后再次点击同一块，仍进入同一张导图
- 删除块只删除块，不误删底层导图记录
- 人为删除 `mindmaps` 记录后，正文卡片显示缺失态并可恢复

- [ ] **Step 6: 提交最终实现**

```bash
git add src/components/editor/BlockEditor.tsx src/app/App.tsx src/styles/index.css src/store/createWorkspaceStore.ts src/store/createWorkspaceStore.test.ts src/components/editor/blocks/MindmapBlock.test.tsx src/components/mindmap/MindmapFrame.tsx src/components/mindmap/MindmapFrame.test.tsx
git commit -m "feat: integrate standalone mindmap special block"
```
