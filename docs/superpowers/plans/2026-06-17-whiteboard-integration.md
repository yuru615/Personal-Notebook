# Whiteboard Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在现有知识库中接入独立存储的白板文档，并通过命令菜单插入白板块入口，点击后进入白板编辑页。

**Architecture:** 扩展当前工作区快照与 store，新增 `boards` 数据集合与 `whiteboard` 块类型；在现有 React Router 壳内新增白板路由与页面容器；复用旧 `Flowboard` 的核心数据/绘制逻辑，避免把旧整页 HTML 直接嵌入当前应用。

**Tech Stack:** React 19, TypeScript, React Router, Zustand vanilla store, Dexie, Vitest, Testing Library

---

## 文件结构与职责

- `src/domain/types.ts`
  - 扩展 `BlockType`、`BlockRecord`、`WorkspaceSnapshot`
  - 新增 `BoardRecord`、`WhiteboardBlock`
- `src/utils/blockFactory.ts`
  - 支持创建 `whiteboard` 块
- `src/lib/db.ts`
  - 增加 `boards` 表定义
- `src/lib/workspaceRepository.ts`
  - load/save/replace 时读写 `boards`
  - 老快照无 `boards` 时补空数组
- `src/lib/workspaceRepository.test.ts`
  - 覆盖仓库层迁移与保存行为
- `src/store/createWorkspaceStore.ts`
  - 新增白板创建、查询、更新、按块创建白板的动作
  - 在插入块流程中接入 `whiteboard`
- `src/store/createWorkspaceStore.test.ts`
  - 覆盖白板数据与块的联动
- `src/ui/copy.ts`
  - 补白板中文文案
- `src/components/editor/SlashMenu.tsx`
  - 命令菜单增加“白板”
- `src/components/editor/BlockEditor.tsx`
  - 渲染 `whiteboard` 块
- `src/components/editor/blocks/WhiteboardBlock.tsx`
  - 页面内白板缩略卡片
- `src/components/editor/blocks/WhiteboardBlock.test.tsx`
  - 卡片渲染与点击行为
- `src/app/App.tsx`
  - 增加白板路由与白板页面入口
- `src/app/App.test.tsx`
  - 覆盖白板路由跳转
- `src/components/whiteboard/WhiteboardPage.tsx`
  - 白板编辑页壳
- `src/components/whiteboard/WhiteboardCanvas.tsx`
  - React 白板容器，承接旧白板引擎
- `src/components/whiteboard/whiteboardModel.ts`
  - 白板快照缺省值、序列化辅助
- `src/components/whiteboard/whiteboardPreview.ts`
  - 缩略图生成辅助
- `src/components/whiteboard/*.test.ts[x]`
  - 覆盖标题、异常态、预览
- `src/styles/index.css`
  - 白板块卡片、白板页样式

## Task 1: 扩展领域类型与仓库迁移

**Files:**
- Modify: `src/domain/types.ts`
- Modify: `src/utils/blockFactory.ts`
- Modify: `src/lib/db.ts`
- Modify: `src/lib/workspaceRepository.ts`
- Test: `src/lib/workspaceRepository.test.ts`

- [ ] **Step 1: 写仓库层失败测试，锁定 `boards` 迁移行为**

```ts
it('loads legacy snapshots without boards as an empty boards array', async () => {
  const repository = createDexieWorkspaceRepository()

  await db.pages.bulkPut([
    {
      id: 'page_1',
      parentId: null,
      title: '页面',
      icon: null,
      cover: null,
      blocks: [],
      createdAt: '2026-06-17T00:00:00.000Z',
      updatedAt: '2026-06-17T00:00:00.000Z',
    },
  ])
  await db.settings.put({ id: 'workspace', lastOpenedPageId: 'page_1' })

  const snapshot = await repository.load()

  expect(snapshot).not.toBeNull()
  expect(snapshot?.boards).toEqual([])
})
```

- [ ] **Step 2: 运行单测，确认先红**

Run: `npm test -- src/lib/workspaceRepository.test.ts`
Expected: FAIL，提示 `boards` 字段缺失或类型不匹配。

- [ ] **Step 3: 最小实现类型与仓库迁移**

```ts
export interface BoardRecord {
  id: string
  title: string
  snapshot: unknown
  createdAt: string
  updatedAt: string
}

export interface WhiteboardBlock extends BlockBase {
  type: 'whiteboard'
  boardId: string
}

export type BlockType = /* existing */ | 'whiteboard'

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

export interface WorkspaceSnapshot {
  pages: PageRecord[]
  boards: BoardRecord[]
  settings: WorkspaceSettings
}
```

```ts
return {
  pages,
  boards: boards ?? [],
  settings: {
    lastOpenedPageId: settings.lastOpenedPageId,
  },
}
```

- [ ] **Step 4: 让块工厂支持 `whiteboard` 默认结构**

```ts
case 'whiteboard':
  return { id: createId('block'), type, boardId: '' }
```

- [ ] **Step 5: 运行仓库测试确认转绿**

Run: `npm test -- src/lib/workspaceRepository.test.ts`
Expected: PASS

- [ ] **Step 6: 提交这一小步**

```bash
git add src/domain/types.ts src/utils/blockFactory.ts src/lib/db.ts src/lib/workspaceRepository.ts src/lib/workspaceRepository.test.ts
git commit -m "feat: add workspace board schema"
```

## Task 2: 扩展 store，支持白板文档与白板块联动

**Files:**
- Modify: `src/store/createWorkspaceStore.ts`
- Test: `src/store/createWorkspaceStore.test.ts`
- Modify: `src/domain/seed.ts`

- [ ] **Step 1: 写 store 失败测试，锁定“插入白板块会同时创建 BoardRecord”**

```ts
it('creates a board record when inserting a whiteboard block', async () => {
  const repository = createMemoryRepository()
  const store = createWorkspaceStore(repository)

  await store.getState().bootstrap()
  const pageId = store.getState().currentPageId as string
  await store.getState().insertBlock(pageId, 'whiteboard')

  const state = store.getState()
  const page = state.pages.find((item) => item.id === pageId)
  const block = page?.blocks.find((item) => item.type === 'whiteboard')

  expect(block).toBeDefined()
  expect(state.boards).toHaveLength(1)
  expect(block && 'boardId' in block ? block.boardId : null).toBe(state.boards[0]?.id)
})
```

- [ ] **Step 2: 运行 store 单测，确认先红**

Run: `npm test -- src/store/createWorkspaceStore.test.ts`
Expected: FAIL，提示 `boards` 状态或 `whiteboard` 插入逻辑不存在。

- [ ] **Step 3: 给 store 增加白板状态与动作**

```ts
export interface WorkspaceState {
  pages: PageRecord[]
  boards: BoardRecord[]
  // ...
  createBoard: (title?: string) => Promise<BoardRecord>
  updateBoard: (boardId: string, updater: (board: BoardRecord) => BoardRecord) => Promise<void>
}
```

```ts
function createBoardRecord(title = '未命名白板'): BoardRecord {
  const now = new Date().toISOString()
  return {
    id: createId('board'),
    title,
    snapshot: createEmptyBoardSnapshot(),
    createdAt: now,
    updatedAt: now,
  }
}
```

- [ ] **Step 4: 在 `insertBlock` / `insertBlockAfter` 中接入 `whiteboard`**

```ts
if (type === 'whiteboard') {
  const board = createBoardRecord()
  insertedBlock = {
    id: createId('block'),
    type: 'whiteboard',
    boardId: board.id,
  }
  nextBoards = [...state.boards, board]
}
```

- [ ] **Step 5: 确保 seed 和 import/export 也带上 `boards`**

```ts
return {
  pages: [rootPage],
  boards: [],
  settings: {
    lastOpenedPageId: rootPage.id,
  },
}
```

- [ ] **Step 6: 运行 store 测试确认转绿**

Run: `npm test -- src/store/createWorkspaceStore.test.ts`
Expected: PASS

- [ ] **Step 7: 提交这一小步**

```bash
git add src/store/createWorkspaceStore.ts src/store/createWorkspaceStore.test.ts src/domain/seed.ts
git commit -m "feat: store whiteboard records separately"
```

## Task 3: 命令菜单与文档白板块卡片

**Files:**
- Modify: `src/components/editor/SlashMenu.tsx`
- Modify: `src/components/editor/BlockEditor.tsx`
- Create: `src/components/editor/blocks/WhiteboardBlock.tsx`
- Create: `src/components/editor/blocks/WhiteboardBlock.test.tsx`
- Modify: `src/ui/copy.ts`
- Modify: `src/styles/index.css`
- Test: `src/components/editor/SlashMenu.test.tsx`
- Test: `src/components/editor/BlockEditor.test.tsx`

- [ ] **Step 1: 写菜单失败测试，锁定“白板”命令项可见**

```ts
it('shows the whiteboard option in the slash menu', () => {
  render(<SlashMenu query="/" onPick={() => undefined} />)

  expect(screen.getByRole('button', { name: '白板' })).toBeInTheDocument()
  expect(screen.getByText('插入一个可点击进入的白板缩略入口')).toBeInTheDocument()
})
```

- [ ] **Step 2: 写块卡片失败测试，锁定标题与点击**

```ts
it('renders a whiteboard card and opens it when clicked', async () => {
  const user = userEvent.setup()
  const onOpen = vi.fn()

  render(
    <WhiteboardBlock
      title="未命名白板"
      updatedAt="2026-06-17T00:00:00.000Z"
      onOpen={onOpen}
      preview={null}
      isMissing={false}
    />,
  )

  await user.click(screen.getByRole('button', { name: '打开白板 未命名白板' }))

  expect(onOpen).toHaveBeenCalledTimes(1)
})
```

- [ ] **Step 3: 运行编辑器相关测试，确认先红**

Run: `npm test -- src/components/editor/SlashMenu.test.tsx src/components/editor/BlockEditor.test.tsx src/components/editor/blocks/WhiteboardBlock.test.tsx`
Expected: FAIL，提示没有白板菜单项、没有 `WhiteboardBlock` 组件。

- [ ] **Step 4: 最小实现命令菜单项与白板块卡片**

```ts
{
  type: 'whiteboard',
  label: '白板',
  description: '插入一个可点击进入的白板缩略入口',
  icon: '◫',
  group: 'page_data',
}
```

```tsx
export function WhiteboardBlock({ title, updatedAt, preview, isMissing, onOpen }: Props) {
  return (
    <button type="button" className="whiteboard-card" onClick={onOpen} aria-label={`打开白板 ${title}`}>
      <span className="whiteboard-card-preview">{preview ?? <span className="whiteboard-card-empty">空白白板</span>}</span>
      <span className="whiteboard-card-body">
        <span className="whiteboard-card-title">{isMissing ? '白板不存在' : title}</span>
        <span className="whiteboard-card-meta">{formatRelativeBoardTime(updatedAt)}</span>
      </span>
      <span className="whiteboard-card-open">打开</span>
    </button>
  )
}
```

- [ ] **Step 5: 在 `BlockEditor` 中接上 `whiteboard` 渲染**

```tsx
case 'whiteboard':
  return (
    <WhiteboardBlock
      title={board?.title ?? '白板不存在'}
      updatedAt={board?.updatedAt ?? ''}
      preview={board ? buildBoardPreview(board.snapshot) : null}
      isMissing={!board}
      onOpen={() => onOpenWhiteboard?.(block.boardId)}
    />
  )
```

- [ ] **Step 6: 运行编辑器测试确认转绿**

Run: `npm test -- src/components/editor/SlashMenu.test.tsx src/components/editor/BlockEditor.test.tsx src/components/editor/blocks/WhiteboardBlock.test.tsx`
Expected: PASS

- [ ] **Step 7: 提交这一小步**

```bash
git add src/components/editor/SlashMenu.tsx src/components/editor/BlockEditor.tsx src/components/editor/blocks/WhiteboardBlock.tsx src/components/editor/blocks/WhiteboardBlock.test.tsx src/ui/copy.ts src/styles/index.css
git commit -m "feat: add whiteboard block entry card"
```

## Task 4: 增加白板路由与白板页壳

**Files:**
- Modify: `src/app/App.tsx`
- Test: `src/app/App.test.tsx`
- Create: `src/components/whiteboard/WhiteboardPage.tsx`
- Create: `src/components/whiteboard/WhiteboardPage.test.tsx`

- [ ] **Step 1: 写路由失败测试，锁定点击白板块后进入白板路由**

```ts
it('navigates to the whiteboard page from a whiteboard block', async () => {
  const user = userEvent.setup()
  const store = createWorkspaceStore(createMemoryRepository())

  await store.getState().bootstrap()
  const pageId = store.getState().currentPageId as string
  await store.getState().insertBlock(pageId, 'whiteboard')
  const boardId = store.getState().boards[0].id

  render(<App store={store} initialEntries={[`/pages/${pageId}`]} />)

  await user.click(screen.getByRole('button', { name: /打开白板/ }))

  expect(await screen.findByRole('heading', { name: '未命名白板' })).toBeInTheDocument()
  expect(window.location.pathname).not.toBe(`/pages/${pageId}`)
  expect(boardId).toBeTruthy()
})
```

- [ ] **Step 2: 运行 App 测试，确认先红**

Run: `npm test -- src/app/App.test.tsx src/components/whiteboard/WhiteboardPage.test.tsx`
Expected: FAIL，提示没有白板页面或没有对应路由。

- [ ] **Step 3: 最小实现白板页壳**

```tsx
export function WhiteboardPage({ page, board, onBack, onRename }: Props) {
  if (!board) {
    return <div className="page-empty">白板不存在</div>
  }

  return (
    <section className="whiteboard-page">
      <header className="whiteboard-page-header">
        <button type="button" onClick={onBack}>返回页面</button>
        <input value={board.title} onChange={(event) => onRename(event.target.value)} aria-label="白板标题" />
      </header>
      <div className="whiteboard-page-canvas-placeholder" />
    </section>
  )
}
```

- [ ] **Step 4: 在 `App.tsx` 增加 `/pages/:pageId/boards/:boardId` 路由**

```tsx
<Route
  path="/pages/:pageId/boards/:boardId"
  element={
    <BoardRoute
      pages={pages}
      boards={boards}
      onRenameBoard={onRenameBoard}
    />
  }
/>
```

- [ ] **Step 5: 运行路由测试确认转绿**

Run: `npm test -- src/app/App.test.tsx src/components/whiteboard/WhiteboardPage.test.tsx`
Expected: PASS

- [ ] **Step 6: 提交这一小步**

```bash
git add src/app/App.tsx src/app/App.test.tsx src/components/whiteboard/WhiteboardPage.tsx src/components/whiteboard/WhiteboardPage.test.tsx
git commit -m "feat: add whiteboard page route"
```

## Task 5: 迁移旧白板最小核心引擎

**Files:**
- Create: `src/components/whiteboard/whiteboardModel.ts`
- Create: `src/components/whiteboard/WhiteboardCanvas.tsx`
- Create: `src/components/whiteboard/whiteboardPreview.ts`
- Test: `src/components/whiteboard/whiteboardModel.test.ts`
- Test: `src/components/whiteboard/whiteboardPreview.test.ts`
- Modify: `src/components/whiteboard/WhiteboardPage.tsx`
- Modify: `src/store/createWorkspaceStore.ts`
- Test: `src/store/createWorkspaceStore.test.ts`

- [ ] **Step 1: 先写模型失败测试，锁定空白快照与标题改名更新时间**

```ts
it('creates an empty whiteboard snapshot', () => {
  expect(createEmptyBoardSnapshot()).toEqual({
    version: 1,
    elements: [],
    viewport: { x: 0, y: 0, zoom: 1 },
  })
})
```

```ts
it('updates board title and updatedAt', async () => {
  const store = createWorkspaceStore(createMemoryRepository())
  await store.getState().bootstrap()
  await store.getState().insertBlock(store.getState().currentPageId as string, 'whiteboard')

  const boardId = store.getState().boards[0].id
  const before = store.getState().boards[0].updatedAt
  await store.getState().renameBoard(boardId, '流程草图')

  expect(store.getState().boards[0].title).toBe('流程草图')
  expect(store.getState().boards[0].updatedAt >= before).toBe(true)
})
```

- [ ] **Step 2: 运行白板模型与 store 测试，确认先红**

Run: `npm test -- src/components/whiteboard/whiteboardModel.test.ts src/store/createWorkspaceStore.test.ts`
Expected: FAIL

- [ ] **Step 3: 封装最小白板模型与预览接口**

```ts
export interface WhiteboardSnapshot {
  version: 1
  elements: Array<{ id: string; type: 'pen' | 'rect' | 'text'; points?: number[]; text?: string }>
  viewport: { x: number; y: number; zoom: number }
}

export function createEmptyBoardSnapshot(): WhiteboardSnapshot {
  return {
    version: 1,
    elements: [],
    viewport: { x: 0, y: 0, zoom: 1 },
  }
}
```

- [ ] **Step 4: 用 React 容器先接一个最小可保存画布**

```tsx
export function WhiteboardCanvas({ board, onChange }: Props) {
  const [snapshot, setSnapshot] = useState(board.snapshot as WhiteboardSnapshot)

  function handleAddDemoRect() {
    const next = {
      ...snapshot,
      elements: [...snapshot.elements, { id: crypto.randomUUID(), type: 'rect', points: [24, 24, 220, 140] }],
    }
    setSnapshot(next)
    onChange(next)
  }

  return (
    <div className="whiteboard-canvas">
      <button type="button" onClick={handleAddDemoRect}>添加矩形</button>
      <canvas aria-label="白板画布" />
    </div>
  )
}
```

- [ ] **Step 5: 运行白板相关测试确认转绿**

Run: `npm test -- src/components/whiteboard/whiteboardModel.test.ts src/components/whiteboard/whiteboardPreview.test.ts src/store/createWorkspaceStore.test.ts`
Expected: PASS

- [ ] **Step 6: 提交这一小步**

```bash
git add src/components/whiteboard src/store/createWorkspaceStore.ts src/store/createWorkspaceStore.test.ts
git commit -m "feat: add minimal whiteboard canvas engine"
```

## Task 6: 完成 JSON 备份、异常态与回归

**Files:**
- Modify: `src/store/createWorkspaceStore.ts`
- Modify: `src/app/App.tsx`
- Test: `src/app/App.test.tsx`
- Test: `src/store/createWorkspaceStore.test.ts`
- Test: `src/components/editor/blocks/WhiteboardBlock.test.tsx`

- [ ] **Step 1: 写失败测试，锁定导出包含 `boards` 与丢失引用异常态**

```ts
it('exports boards in workspace json', async () => {
  const store = createWorkspaceStore(createMemoryRepository())
  await store.getState().bootstrap()
  await store.getState().insertBlock(store.getState().currentPageId as string, 'whiteboard')

  const payload = JSON.parse(await store.getState().exportJson()) as { boards?: unknown[] }

  expect(payload.boards).toHaveLength(1)
})
```

```ts
it('shows missing whiteboard state when the board record does not exist', () => {
  render(
    <WhiteboardBlock
      title="白板不存在"
      updatedAt=""
      preview={null}
      isMissing
      onOpen={() => undefined}
    />,
  )

  expect(screen.getByText('白板不存在')).toBeInTheDocument()
})
```

- [ ] **Step 2: 运行相关测试，确认先红**

Run: `npm test -- src/store/createWorkspaceStore.test.ts src/components/editor/blocks/WhiteboardBlock.test.tsx src/app/App.test.tsx`
Expected: FAIL

- [ ] **Step 3: 最小实现导出与异常态保护**

```ts
return JSON.stringify(
  createBackupPayload({
    pages: state.pages,
    boards: state.boards,
    settings: state.settings,
  }),
  null,
  2,
)
```

```tsx
if (!board) {
  return (
    <WhiteboardBlock
      title="白板不存在"
      updatedAt=""
      preview={null}
      isMissing
      onOpen={() => undefined}
    />
  )
}
```

- [ ] **Step 4: 运行目标测试与全量测试**

Run: `npm test`
Expected: PASS

- [ ] **Step 5: 构建验证**

Run: `npm run build`
Expected: build 成功，无 TypeScript 错误

- [ ] **Step 6: 提交最终集成**

```bash
git add src
git commit -m "feat: integrate whiteboard into knowledge base"
```

## 自检

- Spec coverage
  - `boards` 独立存储：Task 1、2
  - `whiteboard` 块：Task 1、2、3
  - 命令菜单插入：Task 3
  - 白板卡片：Task 3
  - 独立白板路由与页面：Task 4
  - 旧白板核心迁移最小版：Task 5
  - JSON 备份与异常态：Task 6
- Placeholder scan
  - 未使用 `TODO` / `TBD` / “稍后实现”
- Type consistency
  - 统一使用 `BoardRecord`、`WhiteboardBlock`、`boards`、`boardId`
