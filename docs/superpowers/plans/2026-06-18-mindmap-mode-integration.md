# Mindmap Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a first-class `mindmap` content type to the knowledge base with a document entry block, separate storage, and a standalone editor page that supports minimal node-tree editing.

**Architecture:** Extend the existing workspace snapshot and store with a separate `mindmaps` collection and a `mindmap` block type. Reuse the existing route/store/preview patterns from `whiteboard`, but keep mindmap business rules in dedicated `src/components/mindmap/*` and `src/domain/types.ts` structures so node trees do not leak into whiteboard code.

**Tech Stack:** React 19, TypeScript, React Router, Zustand vanilla store, Dexie, Vitest, Testing Library

---

## File structure and responsibilities

- `src/domain/types.ts`
  - Add `MindmapId`, `MindmapNode`, `MindmapRecord`, `MindmapBlock`
  - Extend `BlockType`, `BlockRecord`, `WorkspaceSnapshot`, `WorkspaceBackup`
- `src/lib/db.ts`
  - Add `mindmaps` Dexie table
- `src/lib/workspaceRepository.ts`
  - Load/save/replace `mindmaps`
  - Preserve compatibility with snapshots that do not have `mindmaps`
- `src/utils/blockFactory.ts`
  - Add `createMindmapRecord`, `createMindmapBlock`
- `src/domain/seed.ts`
  - Seed `mindmaps: []`
- `src/store/createWorkspaceStore.ts`
  - Hold `mindmaps` in state
  - Add rename/update mindmap actions
  - Insert/turn block into `mindmap`
  - Add node tree editing actions
- `src/store/createWorkspaceStore.test.ts`
  - Cover state transitions for `mindmap` records and node editing
- `src/components/editor/SlashMenu.tsx`
  - Add `mindmap` slash command
- `src/components/editor/BlockEditor.tsx`
  - Render `MindmapBlock`
  - Open mindmap route from a document block
- `src/components/editor/blocks/MindmapBlock.tsx`
  - Document entry card for a mindmap
- `src/components/editor/blocks/MindmapBlock.test.tsx`
  - Card rendering, missing state, open action
- `src/components/mindmap/mindmapModel.ts`
  - Create empty mindmap, node helpers, data guards
- `src/components/mindmap/mindmapLayout.ts`
  - Convert node tree into positioned nodes and connectors
- `src/components/mindmap/mindmapPreview.ts`
  - Build SVG preview for the entry card
- `src/components/mindmap/MindmapCanvas.tsx`
  - Minimal visual editor for nodes and edges
- `src/components/mindmap/MindmapPage.tsx`
  - Standalone mindmap page shell
- `src/components/mindmap/*.test.ts[x]`
  - Cover minimal editor, layout, preview, page shell
- `src/app/App.tsx`
  - Add `/pages/:pageId/mindmaps/:mindmapId` route
- `src/app/App.test.tsx`
  - Cover navigation from block to page
- `src/ui/copy.ts`
  - Add display copy for `mindmap`
- `src/styles/index.css`
  - Add entry card and mindmap page/editor styles

## Task 1: Extend workspace schema for `mindmap`

**Files:**
- Modify: `src/domain/types.ts`
- Modify: `src/lib/db.ts`
- Modify: `src/lib/workspaceRepository.ts`
- Modify: `src/domain/seed.ts`
- Test: `src/lib/workspaceRepository.test.ts`

- [ ] **Step 1: Write the failing repository migration test**

```ts
it('loads legacy snapshots without mindmaps as an empty array', async () => {
  const repository = createDexieWorkspaceRepository()

  await db.pages.bulkPut([
    {
      id: 'page_1',
      parentId: null,
      title: '首页',
      icon: null,
      cover: null,
      blocks: [],
      createdAt: '2026-06-18T00:00:00.000Z',
      updatedAt: '2026-06-18T00:00:00.000Z',
    },
  ])
  await db.settings.put({ id: 'workspace', lastOpenedPageId: 'page_1' })

  const snapshot = await repository.load()

  expect(snapshot).not.toBeNull()
  expect(snapshot?.mindmaps).toEqual([])
})
```

- [ ] **Step 2: Run the repository test to verify it fails**

Run: `npm test -- src/lib/workspaceRepository.test.ts`
Expected: FAIL with a missing `mindmaps` property or type mismatch.

- [ ] **Step 3: Add the `mindmap` domain types and snapshot shape**

```ts
export type MindmapId = string

export interface MindmapNode {
  id: string
  parentId: string | null
  text: string
  order: number
  side?: 'left' | 'right'
  collapsed?: boolean
}

export interface MindmapRecord {
  id: MindmapId
  title: string
  rootNodeId: string
  nodes: Record<string, MindmapNode>
  viewport: {
    x: number
    y: number
    zoom: number
  }
  createdAt: string
  updatedAt: string
}

export interface MindmapBlock extends BlockBase {
  type: 'mindmap'
  mindmapId: MindmapId
}

export type BlockType = /* existing */ | 'mindmap'

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
  | MindmapBlock

export interface WorkspaceSnapshot {
  boards: BoardRecord[]
  mindmaps: MindmapRecord[]
  pages: PageRecord[]
  settings: WorkspaceSettings
}
```

- [ ] **Step 4: Extend Dexie and repository load/save behavior**

```ts
export class WorkspaceDb extends Dexie {
  boards!: Table<BoardRecord, string>
  mindmaps!: Table<MindmapRecord, string>
  pages!: Table<PageRecord, string>
  settings!: Table<WorkspaceSettingsRow, string>
}

db.version(2).stores({
  boards: 'id, updatedAt',
  mindmaps: 'id, updatedAt',
  pages: 'id, parentId, updatedAt',
  settings: 'id',
})
```

```ts
const [boards, mindmaps, pages, settings] = await Promise.all([
  db.boards.toArray(),
  db.mindmaps.toArray(),
  db.pages.toArray(),
  db.settings.get(SETTINGS_ID),
])

return {
  boards,
  mindmaps,
  pages,
  settings: {
    lastOpenedPageId: settings.lastOpenedPageId,
  },
}
```

- [ ] **Step 5: Seed empty `mindmaps` in the workspace**

```ts
export function createSeedWorkspace(): WorkspaceSnapshot {
  const rootPage = createRootPage()

  return {
    boards: [],
    mindmaps: [],
    pages: [rootPage],
    settings: {
      lastOpenedPageId: rootPage.id,
    },
  }
}
```

- [ ] **Step 6: Run the repository test to verify it passes**

Run: `npm test -- src/lib/workspaceRepository.test.ts`
Expected: PASS

- [ ] **Step 7: Commit the schema migration**

```bash
git add src/domain/types.ts src/lib/db.ts src/lib/workspaceRepository.ts src/lib/workspaceRepository.test.ts src/domain/seed.ts
git commit -m "feat: add mindmap workspace schema"
```

## Task 2: Add block factory and store support for `mindmap`

**Files:**
- Modify: `src/utils/blockFactory.ts`
- Modify: `src/store/createWorkspaceStore.ts`
- Test: `src/store/createWorkspaceStore.test.ts`

- [ ] **Step 1: Write the failing store test for inserting a mindmap block**

```ts
it('creates a mindmap record when inserting a mindmap block', async () => {
  const repository = createMemoryRepository()
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
  expect(state.mindmaps[0]?.rootNodeId).toBeTruthy()
})
```

- [ ] **Step 2: Run the store test to verify it fails**

Run: `npm test -- src/store/createWorkspaceStore.test.ts`
Expected: FAIL with missing `mindmaps` state or unsupported `mindmap` block insertion.

- [ ] **Step 3: Add block factory helpers for mindmaps**

```ts
export function createMindmapRecord(now = new Date().toISOString()): MindmapRecord {
  const rootNodeId = createId('mindmap_node')

  return {
    id: createId('mindmap'),
    title: '未命名思维导图',
    rootNodeId,
    nodes: {
      [rootNodeId]: {
        id: rootNodeId,
        parentId: null,
        text: '中心主题',
        order: 0,
      },
    },
    viewport: {
      x: 0,
      y: 0,
      zoom: 1,
    },
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

- [ ] **Step 4: Extend the store state and insertion logic**

```ts
export interface WorkspaceState {
  boards: BoardRecord[]
  mindmaps: MindmapRecord[]
  pages: PageRecord[]
  // ...
  renameMindmap: (mindmapId: string, title: string) => Promise<void>
  updateMindmap: (mindmapId: string, updater: (mindmap: MindmapRecord) => MindmapRecord) => Promise<void>
}
```

```ts
if (type === 'mindmap') {
  const mindmap = createMindmapRecord(now)
  nextMindmaps = [...state.mindmaps, mindmap]

  return {
    ...page,
    updatedAt: now,
    blocks: [...page.blocks, createMindmapBlock(mindmap.id)],
  }
}
```

- [ ] **Step 5: Ensure import/export and undo snapshots carry `mindmaps`**

```ts
function createSnapshotFromState(
  state: Pick<WorkspaceState, 'boards' | 'mindmaps' | 'pages' | 'settings'>,
): WorkspaceSnapshot {
  return structuredClone({
    boards: state.boards,
    mindmaps: state.mindmaps,
    pages: state.pages,
    settings: state.settings,
  })
}
```

```ts
return JSON.stringify(
  createBackupPayload({
    boards: state.boards,
    mindmaps: state.mindmaps,
    pages: state.pages,
    settings: state.settings,
  }),
  null,
  2,
)
```

- [ ] **Step 6: Run the store test to verify it passes**

Run: `npm test -- src/store/createWorkspaceStore.test.ts`
Expected: PASS

- [ ] **Step 7: Commit the store integration**

```bash
git add src/utils/blockFactory.ts src/store/createWorkspaceStore.ts src/store/createWorkspaceStore.test.ts
git commit -m "feat: store mindmaps separately from pages"
```

## Task 3: Add the slash command and document entry block

**Files:**
- Modify: `src/components/editor/SlashMenu.tsx`
- Modify: `src/components/editor/BlockEditor.tsx`
- Modify: `src/ui/copy.ts`
- Modify: `src/styles/index.css`
- Create: `src/components/editor/blocks/MindmapBlock.tsx`
- Create: `src/components/mindmap/mindmapPreview.ts`
- Test: `src/components/editor/SlashMenu.test.tsx`
- Test: `src/components/editor/BlockEditor.test.tsx`
- Test: `src/components/editor/blocks/MindmapBlock.test.tsx`

- [ ] **Step 1: Write the failing slash menu and card tests**

```ts
it('shows the mindmap option in the slash menu', () => {
  render(<SlashMenu query="/" onPick={() => undefined} />)

  expect(screen.getByRole('button', { name: '思维导图' })).toBeInTheDocument()
  expect(screen.getByText('插入一个可点击进入的思维导图入口')).toBeInTheDocument()
})
```

```ts
it('renders a mindmap card and opens it when clicked', async () => {
  const user = userEvent.setup()
  const onOpen = vi.fn()

  render(
    <MindmapBlock
      title="未命名思维导图"
      updatedLabel="刚刚更新"
      previewUrl={null}
      isMissing={false}
      onOpen={onOpen}
    />,
  )

  await user.click(screen.getByRole('button', { name: '打开思维导图 未命名思维导图' }))

  expect(onOpen).toHaveBeenCalledTimes(1)
})
```

- [ ] **Step 2: Run the editor tests to verify they fail**

Run: `npm test -- src/components/editor/SlashMenu.test.tsx src/components/editor/BlockEditor.test.tsx src/components/editor/blocks/MindmapBlock.test.tsx`
Expected: FAIL with missing slash option, missing `MindmapBlock`, or no `mindmap` render branch.

- [ ] **Step 3: Add the slash menu option and copy**

```ts
{
  type: 'mindmap',
  label: '思维导图',
  description: '插入一个可点击进入的思维导图入口',
  icon: '◎',
  group: 'page_data',
}
```

```ts
mindmap: {
  untitled: '未命名思维导图',
  broken: '思维导图不存在',
  updatedJustNow: '刚刚更新',
}
```

- [ ] **Step 4: Create the preview and entry card**

```ts
export function buildMindmapPreviewSvgDataUrl(mindmap: MindmapRecord): string {
  const text = encodeXml(mindmap.nodes[mindmap.rootNodeId]?.text ?? '中心主题')
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="320" height="180" viewBox="0 0 320 180">
      <rect width="320" height="180" rx="16" fill="#fbfbfa" />
      <rect x="116" y="72" width="88" height="36" rx="10" fill="#ffffff" stroke="#d7d7d3" />
      <line x1="84" y1="90" x2="116" y2="90" stroke="#bdbdb7" stroke-width="2" />
      <line x1="204" y1="90" x2="236" y2="90" stroke="#bdbdb7" stroke-width="2" />
      <text x="160" y="94" text-anchor="middle" font-size="12" fill="#2f2f2b">${text}</text>
    </svg>
  `.trim()

  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}
```

```tsx
export function MindmapBlock({ title, updatedLabel, previewUrl, isMissing, onOpen }: Props) {
  return (
    <button
      type="button"
      className={isMissing ? 'mindmap-card mindmap-card-missing' : 'mindmap-card'}
      aria-label={`打开思维导图 ${title}`}
      onClick={onOpen}
    >
      <span className="mindmap-card-preview" aria-hidden="true">
        {previewUrl ? <img className="mindmap-card-preview-image" src={previewUrl} alt="" /> : <span className="mindmap-card-preview-empty">空白导图</span>}
      </span>
      <span className="mindmap-card-body">
        <span className="mindmap-card-title">{title}</span>
        <span className="mindmap-card-meta">{updatedLabel}</span>
      </span>
      <span className="mindmap-card-open" aria-hidden="true">打开</span>
    </button>
  )
}
```

- [ ] **Step 5: Render `mindmap` inside `BlockEditor`**

```tsx
case 'mindmap': {
  const mindmap = mindmapMap.get(block.mindmapId)

  return renderBlockRow(
    block,
    <MindmapBlock
      title={mindmap?.title ?? uiCopy.mindmap.broken}
      updatedLabel={mindmap ? uiCopy.mindmap.updatedJustNow : '引用已丢失'}
      previewUrl={mindmap ? buildMindmapPreviewSvgDataUrl(mindmap) : null}
      isMissing={!mindmap}
      onOpen={() => onOpenMindmap?.(block.mindmapId)}
    />,
  )
}
```

- [ ] **Step 6: Run the editor tests to verify they pass**

Run: `npm test -- src/components/editor/SlashMenu.test.tsx src/components/editor/BlockEditor.test.tsx src/components/editor/blocks/MindmapBlock.test.tsx`
Expected: PASS

- [ ] **Step 7: Commit the document entry block**

```bash
git add src/components/editor/SlashMenu.tsx src/components/editor/BlockEditor.tsx src/components/editor/blocks/MindmapBlock.tsx src/components/editor/blocks/MindmapBlock.test.tsx src/components/mindmap/mindmapPreview.ts src/ui/copy.ts src/styles/index.css
git commit -m "feat: add mindmap document entry block"
```

## Task 4: Add the mindmap route and standalone page shell

**Files:**
- Modify: `src/app/App.tsx`
- Test: `src/app/App.test.tsx`
- Create: `src/components/mindmap/MindmapPage.tsx`
- Test: `src/components/mindmap/MindmapPage.test.tsx`

- [ ] **Step 1: Write the failing route test**

```ts
it('navigates to the mindmap page from a mindmap block', async () => {
  const user = userEvent.setup()
  const store = createWorkspaceStore(createMemoryRepository())

  await store.getState().bootstrap()
  const pageId = store.getState().currentPageId as string
  await store.getState().insertBlock(pageId, 'mindmap')
  const mindmapId = store.getState().mindmaps[0].id

  render(<App store={store} initialEntries={[`/pages/${pageId}`]} />)

  await user.click(screen.getByRole('button', { name: /打开思维导图/ }))

  expect(await screen.findByRole('heading', { name: '未命名思维导图' })).toBeInTheDocument()
  expect(mindmapId).toBeTruthy()
})
```

- [ ] **Step 2: Run the route test to verify it fails**

Run: `npm test -- src/app/App.test.tsx src/components/mindmap/MindmapPage.test.tsx`
Expected: FAIL with missing route or missing `MindmapPage`.

- [ ] **Step 3: Create the page shell**

```tsx
export function MindmapPage({ page, mindmap, onBack, onRename, children }: Props) {
  const [draftTitle, setDraftTitle] = useState(mindmap?.title ?? '')

  useEffect(() => {
    setDraftTitle(mindmap?.title ?? '')
  }, [mindmap?.title])

  return (
    <section className="mindmap-page">
      <header className="mindmap-page-header">
        <div className="mindmap-page-header-main">
          <button type="button" className="mindmap-page-back" onClick={onBack}>
            返回页面
          </button>
          <div className="mindmap-page-heading">
            {mindmap ? (
              <input
                aria-label="思维导图标题"
                className="mindmap-page-title-input"
                value={draftTitle}
                onChange={(event) => {
                  const nextTitle = event.target.value
                  setDraftTitle(nextTitle)
                  onRename(nextTitle)
                }}
              />
            ) : (
              <h1 className="mindmap-page-title-text">思维导图不存在</h1>
            )}
            <p className="mindmap-page-meta">来源：{page.title}</p>
          </div>
        </div>
      </header>
      <div className="mindmap-page-surface">
        {mindmap ? children : <div className="mindmap-page-empty">当前引用的思维导图已不存在</div>}
      </div>
    </section>
  )
}
```

- [ ] **Step 4: Add the route to `App.tsx`**

```tsx
<Route
  path="/pages/:pageId/mindmaps/:mindmapId"
  element={
    <MindmapRoute
      pages={pages}
      mindmaps={mindmaps}
      currentPageId={currentPageId}
      onRoutePageChange={onRoutePageChange}
      onRenameMindmap={onRenameMindmap}
    />
  }
/>
```

- [ ] **Step 5: Run the route test to verify it passes**

Run: `npm test -- src/app/App.test.tsx src/components/mindmap/MindmapPage.test.tsx`
Expected: PASS

- [ ] **Step 6: Commit the page shell**

```bash
git add src/app/App.tsx src/app/App.test.tsx src/components/mindmap/MindmapPage.tsx src/components/mindmap/MindmapPage.test.tsx
git commit -m "feat: add mindmap page route"
```

## Task 5: Implement the minimal node-tree model and editor

**Files:**
- Create: `src/components/mindmap/mindmapModel.ts`
- Create: `src/components/mindmap/mindmapLayout.ts`
- Create: `src/components/mindmap/MindmapCanvas.tsx`
- Modify: `src/store/createWorkspaceStore.ts`
- Test: `src/components/mindmap/mindmapModel.test.ts`
- Test: `src/components/mindmap/mindmapLayout.test.ts`
- Test: `src/components/mindmap/MindmapCanvas.test.tsx`
- Test: `src/store/createWorkspaceStore.test.ts`

- [ ] **Step 1: Write the failing model and store tests**

```ts
it('creates an empty mindmap with a single root node', () => {
  const mindmap = createEmptyMindmapRecord('2026-06-18T00:00:00.000Z')

  expect(Object.keys(mindmap.nodes)).toHaveLength(1)
  expect(mindmap.nodes[mindmap.rootNodeId]).toMatchObject({
    parentId: null,
    text: '中心主题',
    order: 0,
  })
})
```

```ts
it('adds a child node to a mindmap', async () => {
  const repository = createMemoryRepository()
  const store = createWorkspaceStore(repository)

  await store.getState().bootstrap()
  const pageId = store.getState().currentPageId as string
  await store.getState().insertBlock(pageId, 'mindmap')

  const mindmapId = store.getState().mindmaps[0].id
  const rootNodeId = store.getState().mindmaps[0].rootNodeId
  await store.getState().addMindmapChildNode(mindmapId, rootNodeId)

  const nextMindmap = store.getState().mindmaps[0]
  expect(Object.keys(nextMindmap.nodes)).toHaveLength(2)
  expect(
    Object.values(nextMindmap.nodes).find((node) => node.parentId === rootNodeId)?.text,
  ).toBe('新节点')
})
```

- [ ] **Step 2: Run the mindmap tests to verify they fail**

Run: `npm test -- src/components/mindmap/mindmapModel.test.ts src/components/mindmap/mindmapLayout.test.ts src/components/mindmap/MindmapCanvas.test.tsx src/store/createWorkspaceStore.test.ts`
Expected: FAIL with missing model helpers, missing canvas, or missing store actions.

- [ ] **Step 3: Add the model helpers**

```ts
export function createEmptyMindmapRecord(now = new Date().toISOString()): MindmapRecord {
  const rootNodeId = createId('mindmap_node')

  return {
    id: createId('mindmap'),
    title: '未命名思维导图',
    rootNodeId,
    nodes: {
      [rootNodeId]: {
        id: rootNodeId,
        parentId: null,
        text: '中心主题',
        order: 0,
      },
    },
    viewport: {
      x: 0,
      y: 0,
      zoom: 1,
    },
    createdAt: now,
    updatedAt: now,
  }
}

export function addChildNode(mindmap: MindmapRecord, parentId: string, now = new Date().toISOString()): MindmapRecord {
  const siblingCount = Object.values(mindmap.nodes).filter((node) => node.parentId === parentId).length
  const nodeId = createId('mindmap_node')

  return {
    ...mindmap,
    nodes: {
      ...mindmap.nodes,
      [nodeId]: {
        id: nodeId,
        parentId,
        text: '新节点',
        order: siblingCount,
      },
    },
    updatedAt: now,
  }
}
```

- [ ] **Step 4: Add layout and the minimal canvas**

```ts
export function buildMindmapLayout(mindmap: MindmapRecord) {
  const root = mindmap.nodes[mindmap.rootNodeId]
  const children = Object.values(mindmap.nodes)
    .filter((node) => node.parentId === mindmap.rootNodeId)
    .sort((a, b) => a.order - b.order)

  return {
    nodes: [
      { id: root.id, x: 420, y: 220, text: root.text, parentId: null },
      ...children.map((node, index) => ({
        id: node.id,
        x: 620,
        y: 140 + index * 96,
        text: node.text,
        parentId: node.parentId,
      })),
    ],
  }
}
```

```tsx
export function MindmapCanvas({ mindmap, onRenameNode, onAddChildNode, onAddSiblingNode, onDeleteNode }: Props) {
  const layout = buildMindmapLayout(mindmap)

  return (
    <div className="mindmap-canvas">
      <svg className="mindmap-canvas-svg" viewBox="0 0 960 540" aria-label="思维导图画布">
        {layout.nodes
          .filter((node) => node.parentId)
          .map((node) => {
            const parent = layout.nodes.find((candidate) => candidate.id === node.parentId)!
            return <line key={`${parent.id}-${node.id}`} x1={parent.x + 80} y1={parent.y} x2={node.x - 80} y2={node.y} className="mindmap-edge" />
          })}
      </svg>
      <div className="mindmap-node-layer">
        {layout.nodes.map((node) => (
          <div
            key={node.id}
            className="mindmap-node-card"
            style={{ left: `${node.x}px`, top: `${node.y}px` }}
          >
            <input
              aria-label={`节点 ${node.id}`}
              value={node.text}
              onChange={(event) => onRenameNode(node.id, event.target.value)}
            />
            <div className="mindmap-node-actions">
              <button type="button" onClick={() => onAddChildNode(node.id)}>子级</button>
              <button type="button" onClick={() => onAddSiblingNode(node.id)}>同级</button>
              {node.parentId ? <button type="button" onClick={() => onDeleteNode(node.id)}>删除</button> : null}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 5: Wire node editing actions through the store**

```ts
export interface WorkspaceState {
  // ...
  addMindmapChildNode: (mindmapId: string, parentNodeId: string) => Promise<void>
  addMindmapSiblingNode: (mindmapId: string, nodeId: string) => Promise<void>
  renameMindmapNode: (mindmapId: string, nodeId: string, text: string) => Promise<void>
  deleteMindmapNode: (mindmapId: string, nodeId: string) => Promise<void>
}
```

```ts
addMindmapChildNode: async (mindmapId, parentNodeId) => {
  const state = get()
  const nextMindmaps = state.mindmaps.map((mindmap) =>
    mindmap.id === mindmapId ? addChildNode(mindmap, parentNodeId) : mindmap,
  )

  pushUndoSnapshot(state)
  set({ saveStatus: 'saving' })

  await repository.save({
    boards: state.boards,
    mindmaps: nextMindmaps,
    pages: state.pages,
    settings: state.settings,
  })

  set({
    boards: state.boards,
    mindmaps: nextMindmaps,
    pages: state.pages,
    saveStatus: 'saved',
  })
}
```

- [ ] **Step 6: Run the mindmap tests to verify they pass**

Run: `npm test -- src/components/mindmap/mindmapModel.test.ts src/components/mindmap/mindmapLayout.test.ts src/components/mindmap/MindmapCanvas.test.tsx src/store/createWorkspaceStore.test.ts`
Expected: PASS

- [ ] **Step 7: Commit the minimal editor**

```bash
git add src/components/mindmap src/store/createWorkspaceStore.ts src/store/createWorkspaceStore.test.ts
git commit -m "feat: add minimal mindmap editor"
```

## Task 6: Connect the editor page, guards, and full verification

**Files:**
- Modify: `src/components/mindmap/MindmapPage.tsx`
- Modify: `src/app/App.tsx`
- Modify: `src/components/editor/blocks/MindmapBlock.tsx`
- Test: `src/app/App.test.tsx`
- Test: `src/components/editor/blocks/MindmapBlock.test.tsx`
- Test: `src/store/createWorkspaceStore.test.ts`

- [ ] **Step 1: Write the failing integration tests for export and missing references**

```ts
it('exports mindmaps in workspace json', async () => {
  const store = createWorkspaceStore(createMemoryRepository())
  await store.getState().bootstrap()
  await store.getState().insertBlock(store.getState().currentPageId as string, 'mindmap')

  const payload = JSON.parse(await store.getState().exportJson()) as { mindmaps?: unknown[] }

  expect(payload.mindmaps).toHaveLength(1)
})
```

```ts
it('shows missing mindmap state when the record does not exist', () => {
  render(
    <MindmapBlock
      title="思维导图不存在"
      updatedLabel=""
      previewUrl={null}
      isMissing
      onOpen={() => undefined}
    />,
  )

  expect(screen.getByText('思维导图不存在')).toBeInTheDocument()
})
```

- [ ] **Step 2: Run the integration tests to verify they fail**

Run: `npm test -- src/app/App.test.tsx src/components/editor/blocks/MindmapBlock.test.tsx src/store/createWorkspaceStore.test.ts`
Expected: FAIL with missing export payload, broken reference state, or incomplete route wiring.

- [ ] **Step 3: Mount the canvas inside the page route**

```tsx
return (
  <MindmapPage
    page={page}
    mindmap={mindmap}
    onBack={() => navigate(`/pages/${page.id}`)}
    onRename={(title) => {
      if (mindmap) {
        void onRenameMindmap(mindmap.id, title)
      }
    }}
  >
    {mindmap ? (
      <MindmapCanvas
        mindmap={mindmap}
        onRenameNode={(nodeId, text) => void onRenameMindmapNode(mindmap.id, nodeId, text)}
        onAddChildNode={(nodeId) => void onAddMindmapChildNode(mindmap.id, nodeId)}
        onAddSiblingNode={(nodeId) => void onAddMindmapSiblingNode(mindmap.id, nodeId)}
        onDeleteNode={(nodeId) => void onDeleteMindmapNode(mindmap.id, nodeId)}
      />
    ) : null}
  </MindmapPage>
)
```

- [ ] **Step 4: Ensure export/import and missing-state guards are complete**

```ts
return {
  version: BACKUP_VERSION,
  exportedAt: new Date().toISOString(),
  boards: snapshot.boards,
  mindmaps: snapshot.mindmaps,
  pages: snapshot.pages,
  settings: snapshot.settings,
}
```

```tsx
<span className="mindmap-card-title">
  {isMissing ? '思维导图不存在' : title}
</span>
```

- [ ] **Step 5: Run the full test suite**

Run: `npm test`
Expected: PASS

- [ ] **Step 6: Run the production build**

Run: `npm run build`
Expected: build succeeds without TypeScript errors

- [ ] **Step 7: Commit the final integration**

```bash
git add src
git commit -m "feat: integrate mindmap mode into knowledge base"
```

## Self-review

- Spec coverage
  - `mindmap` 入口块：Task 2, Task 3
  - 独立 `MindmapRecord`：Task 1, Task 2
  - 独立导图路由与页面：Task 4, Task 6
  - 节点树而非白板元素作为数据真相：Task 1, Task 5
  - 基础自动布局：Task 5
  - V1 最小编辑流：Task 5
  - 导出备份与异常态：Task 6
- Placeholder scan
  - No `TODO`, `TBD`, or deferred “later” steps remain
- Type consistency
  - Use `MindmapRecord`, `MindmapNode`, `MindmapBlock`, `mindmaps`, and `mindmapId` consistently
