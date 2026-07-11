# Editor Multi-Block Selection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为正文编辑器补上多选块 v1：鼠标框选、选中态、批量删除、从左侧手柄发起整组拖动，以及一个可持久化的“框选起点”设置项。

**Architecture:** 继续沿用现有编辑器和 store 的职责边界：多选 UI 状态留在 `BlockEditor` 本地，只有“框选起点”进入 `WorkspaceSettings`。批量动作在 store 中新增明确的 `deleteBlocks` / `reorderBlockGroup`，避免把批量操作拆成多次单块保存。

**Tech Stack:** React 19、TypeScript、Zustand vanilla store、Vitest、Testing Library、CSS（`src/styles/index.css`）

---

## File Map

- Modify: `src/utils/reorder.ts`
  - 新增最小化的 `reorderItemGroup`，保持选中块原顺序，并忽略拖到选区内部的情况。
- Modify: `src/utils/reorder.test.ts`
  - 用单元测试锁住分组重排行为。
- Modify: `src/domain/types.ts`
  - 新增 `BlockSelectionStartMode` 类型，并把它挂到 `WorkspaceSettings`。
- Modify: `src/store/createWorkspaceStore.ts`
  - 新增 `setBlockSelectionStartMode`、`deleteBlocks`、`reorderBlockGroup`。
  - 归一化并持久化新的设置项。
- Modify: `src/store/createWorkspaceStore.test.ts`
  - 覆盖设置默认值/持久化，以及两个新的批量 action。
- Modify: `src/components/settings/SettingsCenter.tsx`
  - 在“编辑与页面默认”中加入“框选起点”设置。
- Modify: `src/components/settings/SettingsCenter.test.tsx`
  - 覆盖设置交互。
- Modify: `src/app/App.tsx`
  - 把新设置和批量 action 从 store 传到 `SettingsCenter` / `BlockEditor`。
- Modify: `src/components/editor/BlockEditor.tsx`
  - 持有框选状态、选中块、键盘批量删除、整组拖动与清空规则。
- Modify: `src/components/editor/BlockEditor.test.tsx`
  - 覆盖框选入口、清空、批量删除、整组拖动、未选中手柄仍走单块拖动。
- Modify: `src/styles/index.css`
  - 增加多选高亮和框选矩形样式。
- Create: `src/styles/editorMultiSelectLayout.test.ts`
  - 锁住多选相关样式选择器，防止后续样式回归把选中态弄丢。
- Modify: `docs/updates.md`
  - 记录多选块 v1 的用户可见更新。

---

### Task 1: 增加分组重排工具函数

**Files:**
- Modify: `src/utils/reorder.ts`
- Modify: `src/utils/reorder.test.ts`

- [ ] **Step 1: 先写失败测试**

在 `src/utils/reorder.test.ts` 里追加：

```ts
import { describe, expect, it } from 'vitest'
import { reorderItemGroup, reorderItems } from './reorder'

const items = [
  { id: 'a' },
  { id: 'b' },
  { id: 'c' },
  { id: 'd' },
]

describe('reorderItems', () => {
  it('moves an item before the target when dragging downward', () => {
    const reordered = reorderItems(items, 'a', 'c', 'before')

    expect(reordered.map((item) => item.id)).toEqual(['b', 'a', 'c', 'd'])
  })

  it('moves an item after the target when dragging downward', () => {
    const reordered = reorderItems(items, 'a', 'c', 'after')

    expect(reordered.map((item) => item.id)).toEqual(['b', 'c', 'a', 'd'])
  })
})

describe('reorderItemGroup', () => {
  it('moves a selected group before the target while preserving original order', () => {
    const reordered = reorderItemGroup(items, ['a', 'c'], 'd', 'before')

    expect(reordered.map((item) => item.id)).toEqual(['b', 'a', 'c', 'd'])
  })

  it('moves a selected group after the target while preserving original order', () => {
    const reordered = reorderItemGroup(items, ['a', 'b'], 'd', 'after')

    expect(reordered.map((item) => item.id)).toEqual(['c', 'd', 'a', 'b'])
  })

  it('ignores drops that target an item already inside the moving group', () => {
    const reordered = reorderItemGroup(items, ['b', 'c'], 'c', 'before')

    expect(reordered.map((item) => item.id)).toEqual(['a', 'b', 'c', 'd'])
  })
})
```

- [ ] **Step 2: 运行测试，确认它先失败**

Run:

```bash
npm run test -- src/utils/reorder.test.ts
```

Expected:

```text
FAIL  src/utils/reorder.test.ts
... does not provide an export named 'reorderItemGroup'
```

- [ ] **Step 3: 写最小实现**

把 `src/utils/reorder.ts` 改成：

```ts
export type ReorderPosition = 'before' | 'after'

export function reorderItems<T extends { id: string }>(
  items: T[],
  activeId: string,
  overId: string,
  position: ReorderPosition = 'before',
): T[] {
  const oldIndex = items.findIndex((item) => item.id === activeId)

  if (oldIndex < 0 || activeId === overId) {
    return items
  }

  const moved = items[oldIndex]
  const withoutMoved = items.filter((item) => item.id !== activeId)
  const targetIndex = withoutMoved.findIndex((item) => item.id === overId)

  if (targetIndex < 0) {
    return items
  }

  const next = [...withoutMoved]
  next.splice(position === 'after' ? targetIndex + 1 : targetIndex, 0, moved)
  return next
}

export function reorderItemGroup<T extends { id: string }>(
  items: T[],
  activeIds: string[],
  overId: string,
  position: ReorderPosition = 'before',
): T[] {
  const activeIdSet = new Set(activeIds)
  const moved = items.filter((item) => activeIdSet.has(item.id))

  if (moved.length === 0 || activeIdSet.has(overId)) {
    return items
  }

  const withoutMoved = items.filter((item) => !activeIdSet.has(item.id))
  const targetIndex = withoutMoved.findIndex((item) => item.id === overId)

  if (targetIndex < 0) {
    return items
  }

  const next = [...withoutMoved]
  next.splice(position === 'after' ? targetIndex + 1 : targetIndex, 0, ...moved)
  return next
}
```

- [ ] **Step 4: 再跑测试，确认通过**

Run:

```bash
npm run test -- src/utils/reorder.test.ts
```

Expected:

```text
PASS  src/utils/reorder.test.ts
```

- [ ] **Step 5: 提交这一小步**

```bash
git add src/utils/reorder.ts src/utils/reorder.test.ts
git commit -m "test: add block group reorder helper"
```

---

### Task 2: 在 store 中持久化“框选起点”设置

**Files:**
- Modify: `src/domain/types.ts`
- Modify: `src/store/createWorkspaceStore.ts`
- Modify: `src/store/createWorkspaceStore.test.ts`

- [ ] **Step 1: 先写失败测试**

在 `src/store/createWorkspaceStore.test.ts` 的 settings 测试区追加：

```ts
it("defaults block selection start mode to 'safe_zone_only' and persists changes", async () => {
  const workspace = createWorkspace()
  const counted = createCountingRepository({
    ...workspace,
    settings: {
      lastOpenedPageId: 'page_1',
    },
  })
  const store = createWorkspaceStore(counted.repository)

  await store.getState().bootstrap()

  expect(store.getState().settings.blockSelectionStartMode).toBe('safe_zone_only')
  expect(counted.getReplaceCalls()).toBe(1)

  await store.getState().setBlockSelectionStartMode('content_allowed')

  expect(store.getState().settings.blockSelectionStartMode).toBe('content_allowed')
  expect(counted.getSnapshot()?.settings).toMatchObject({
    lastOpenedPageId: 'page_1',
    blockSelectionStartMode: 'content_allowed',
  })
})
```

- [ ] **Step 2: 运行测试，确认它先失败**

Run:

```bash
npm run test -- src/store/createWorkspaceStore.test.ts
```

Expected:

```text
FAIL  src/store/createWorkspaceStore.test.ts
... setBlockSelectionStartMode is not a function
```

- [ ] **Step 3: 写最小持久化实现**

先在 `src/domain/types.ts` 增加类型和设置字段：

```ts
export type BlockSelectionStartMode = 'safe_zone_only' | 'content_allowed'

export interface WorkspaceSettings {
  lastOpenedPageId: PageId | null
  inboxPageId?: PageId | null
  sidebarLayout?: 'compact' | 'classic'
  sidebarWidth?: number
  pinnedSidebarItems?: SidebarPinnedItem[]
  clipboardCaptureMode?: ClipboardCaptureMode
  blockSelectionStartMode?: BlockSelectionStartMode
  pageDefaults?: Partial<PageDisplayDefaults>
  searchPreferences?: Partial<SearchPreferences>
}
```

再在 `src/store/createWorkspaceStore.ts` 做三件事：

1. 引入 `BlockSelectionStartMode`，并给 `WorkspaceState` / `createEmptyState()` 增加：

```ts
setBlockSelectionStartMode: (mode: BlockSelectionStartMode) => Promise<void>
```

```ts
settings: {
  lastOpenedPageId: null,
  inboxPageId: null,
  sidebarLayout: 'compact',
  sidebarWidth: 272,
  pinnedSidebarItems: [],
  clipboardCaptureMode: 'off',
  blockSelectionStartMode: 'safe_zone_only',
  pageDefaults: DEFAULT_PAGE_DISPLAY_DEFAULTS,
  searchPreferences: DEFAULT_SEARCH_PREFERENCES,
},
```

2. 追加一个和现有 helper 同级的 getter，并把 `createSettings` 的新参数放在**最后一个**，避免打乱现有调用顺序：

```ts
function getBlockSelectionStartMode(settings: WorkspaceSettings) {
  return settings.blockSelectionStartMode === 'content_allowed'
    ? 'content_allowed'
    : 'safe_zone_only'
}

function createSettings(
  lastOpenedPageId: PageId | null,
  sidebarLayout: NonNullable<WorkspaceSettings['sidebarLayout']> = 'compact',
  sidebarWidth = 272,
  pinnedSidebarItems: SidebarPinnedItem[] = [],
  inboxPageId: PageId | null = null,
  clipboardCaptureMode: ClipboardCaptureMode = 'off',
  pageDefaults: PageDisplayDefaults = DEFAULT_PAGE_DISPLAY_DEFAULTS,
  searchPreferences: SearchPreferences = DEFAULT_SEARCH_PREFERENCES,
  blockSelectionStartMode: BlockSelectionStartMode = 'safe_zone_only',
): WorkspaceSettings {
  return {
    lastOpenedPageId,
    inboxPageId,
    sidebarLayout,
    sidebarWidth,
    pinnedSidebarItems,
    clipboardCaptureMode,
    pageDefaults,
    searchPreferences,
    blockSelectionStartMode,
  }
}
```

并在 `normalizeSettings(...)` 里加入：

```ts
const blockSelectionStartMode =
  settings.blockSelectionStartMode === 'content_allowed'
    ? 'content_allowed'
    : 'safe_zone_only'

const didChange =
  ...
  settings.blockSelectionStartMode !== blockSelectionStartMode

return {
  settings: {
    ...
    clipboardCaptureMode,
    pageDefaults,
    searchPreferences,
    blockSelectionStartMode,
  },
  didChange,
}
```

3. 新增 setter，并把所有会重建 settings 的地方都把最后一个参数补上，避免改别的设置时把它重置掉：

```ts
setBlockSelectionStartMode: async (mode) => {
  const state = get()

  if (getBlockSelectionStartMode(state.settings) === mode) {
    return
  }

  const nextSettings = createSettings(
    state.settings.lastOpenedPageId,
    state.settings.sidebarLayout ?? 'compact',
    state.settings.sidebarWidth ?? 272,
    state.settings.pinnedSidebarItems ?? [],
    state.settings.inboxPageId ?? null,
    getClipboardCaptureMode(state.settings),
    getPageDefaults(state.settings),
    getSearchPreferences(state.settings),
    mode,
  )
  const nextSnapshot = createSnapshotFromState({
    ...state,
    settings: nextSettings,
  })

  set({ saveStatus: 'saving' })

  try {
    await repository.save(nextSnapshot)
    set({
      settings: nextSettings,
      saveStatus: 'saved',
    })
  } catch {
    set({ saveStatus: 'error' })
    throw new Error('Failed to update block selection start mode')
  }
},
```

需要同步补最后一个参数的现有调用点，按下面这些方法逐个改：

- `bootstrap`
- `ensureInboxPage`
- `createPage`
- `setCurrentPage`
- `setClipboardCaptureMode`
- `setPageDefaults`
- `setSearchPreferences`
- `setSidebarLayout`
- `setSidebarWidth`
- `togglePinnedSidebarItem`

统一改成这个尾参数模式：

```ts
const nextSettings = createSettings(
  ...,
  getPageDefaults(state.settings),
  getSearchPreferences(state.settings),
  getBlockSelectionStartMode(state.settings),
)
```

`bootstrap` 用 `snapshot.settings` 版本：

```ts
settings: createSettings(
  currentPageId,
  snapshot.settings.sidebarLayout ?? 'compact',
  snapshot.settings.sidebarWidth ?? 272,
  snapshot.settings.pinnedSidebarItems ?? [],
  snapshot.settings.inboxPageId ?? null,
  getClipboardCaptureMode(snapshot.settings),
  getPageDefaults(snapshot.settings),
  getSearchPreferences(snapshot.settings),
  getBlockSelectionStartMode(snapshot.settings),
),
```

- [ ] **Step 4: 再跑测试，确认通过**

Run:

```bash
npm run test -- src/store/createWorkspaceStore.test.ts
```

Expected:

```text
PASS  src/store/createWorkspaceStore.test.ts
```

- [ ] **Step 5: 提交这一小步**

```bash
git add src/domain/types.ts src/store/createWorkspaceStore.ts src/store/createWorkspaceStore.test.ts
git commit -m "feat: persist block selection start mode"
```

---

### Task 3: 在设置中心露出这个设置，并接上 App 路由

**Files:**
- Modify: `src/components/settings/SettingsCenter.tsx`
- Modify: `src/components/settings/SettingsCenter.test.tsx`
- Modify: `src/app/App.tsx`

- [ ] **Step 1: 先写失败测试**

在 `src/components/settings/SettingsCenter.test.tsx` 里追加：

```ts
it('updates block selection start mode from the editing section', async () => {
  const user = userEvent.setup()
  const onSetBlockSelectionStartMode = vi.fn()

  render(
    <SettingsCenter
      {...createProps({
        activeSection: 'editing_page_defaults',
        workspaceSettings: {
          ...createProps().workspaceSettings,
          blockSelectionStartMode: 'safe_zone_only',
        },
        onSetBlockSelectionStartMode,
      })}
    />,
  )

  await user.click(screen.getByRole('button', { name: '允许从正文区域直接框选' }))

  expect(onSetBlockSelectionStartMode).toHaveBeenCalledWith('content_allowed')
})
```

- [ ] **Step 2: 运行测试，确认它先失败**

Run:

```bash
npm run test -- src/components/settings/SettingsCenter.test.tsx
```

Expected:

```text
FAIL  src/components/settings/SettingsCenter.test.tsx
... onSetBlockSelectionStartMode does not exist on SettingsCenterProps
```

- [ ] **Step 3: 写最小 UI 与路由接线**

在 `src/components/settings/SettingsCenter.tsx` 里：

1. 引入类型并扩 props：

```ts
import type {
  AppCloseAction,
  AppSettings,
  BlockSelectionStartMode,
  PageDisplayDefaults,
  SearchPreferences,
  WorkspaceSettings,
} from '../../domain/types'

export interface SettingsCenterProps {
  ...
  onSetBlockSelectionStartMode: (
    mode: BlockSelectionStartMode,
  ) => void | Promise<void>
  ...
}
```

2. 读出当前值：

```ts
const blockSelectionStartMode =
  workspaceSettings.blockSelectionStartMode ?? 'safe_zone_only'
```

3. 在“编辑与页面默认”卡片里追加一组按钮：

```tsx
<div className="settings-card-divider" />
<div className="settings-card-field">
  <div className="settings-card-label">框选起点</div>
  <div className="settings-choice-group">
    <button
      type="button"
      className="settings-choice-button"
      aria-pressed={blockSelectionStartMode === 'safe_zone_only'}
      onClick={() => {
        void onSetBlockSelectionStartMode('safe_zone_only')
      }}
    >
      仅在块左侧或空白处框选
    </button>
    <button
      type="button"
      className="settings-choice-button"
      aria-pressed={blockSelectionStartMode === 'content_allowed'}
      onClick={() => {
        void onSetBlockSelectionStartMode('content_allowed')
      }}
    >
      允许从正文区域直接框选
    </button>
  </div>
</div>
```

在 `src/app/App.tsx` 里同步加 props 和传递：

```ts
interface SettingsRouteProps {
  ...
  onSetBlockSelectionStartMode: (
    mode: NonNullable<WorkspaceSettings['blockSelectionStartMode']>,
  ) => Promise<void>
  ...
}
```

```tsx
<SettingsCenter
  ...
  onSetBlockSelectionStartMode={(mode) => {
    void onSetBlockSelectionStartMode(mode)
  }}
  ...
/>
```

在最外层 settings route 调用处把 store action 接进来：

```tsx
<SettingsRoute
  ...
  onSetBlockSelectionStartMode={(mode) =>
    store.getState().setBlockSelectionStartMode(mode)
  }
  ...
/>
```

- [ ] **Step 4: 再跑测试，确认通过**

Run:

```bash
npm run test -- src/components/settings/SettingsCenter.test.tsx
```

Expected:

```text
PASS  src/components/settings/SettingsCenter.test.tsx
```

- [ ] **Step 5: 提交这一小步**

```bash
git add src/components/settings/SettingsCenter.tsx src/components/settings/SettingsCenter.test.tsx src/app/App.tsx
git commit -m "feat: add block selection start setting"
```

---

### Task 4: 在 BlockEditor 里加入框选、选中态和清空规则

**Files:**
- Modify: `src/components/editor/BlockEditor.tsx`
- Modify: `src/components/editor/BlockEditor.test.tsx`
- Modify: `src/styles/index.css`
- Create: `src/styles/editorMultiSelectLayout.test.ts`

- [ ] **Step 1: 先写失败测试**

先在 `src/components/editor/BlockEditor.test.tsx` 顶部辅助函数区补三个 pointer helper：

```ts
function pointerDownAt(element: Element | Window, clientX: number, clientY: number) {
  fireEvent.pointerDown(element, { button: 0, clientX, clientY })
}

function pointerMoveAt(element: Element | Window, clientX: number, clientY: number) {
  fireEvent.pointerMove(element, { buttons: 1, clientX, clientY })
}

function pointerUpAt(element: Element | Window, clientX: number, clientY: number) {
  fireEvent.pointerUp(element, { button: 0, clientX, clientY })
}
```

再追加下面 4 个测试：

```ts
it('selects rows with a marquee that starts in the safe zone', () => {
  const { container } = render(
    <BlockEditor
      page={page as never}
      allPages={[page as never]}
      onUpdateBlock={vi.fn()}
      blockSelectionStartMode="safe_zone_only"
    />,
  )

  const surface = container.querySelector('.editor-surface')
  const rows = Array.from(container.querySelectorAll('.editor-row'))
  if (!(surface instanceof HTMLElement)) {
    throw new Error('Expected editor surface')
  }

  vi.spyOn(surface, 'getBoundingClientRect').mockReturnValue({
    left: 0,
    top: 0,
    right: 480,
    bottom: 320,
    width: 480,
    height: 320,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  } as DOMRect)

  rows.forEach((row, index) => {
    vi.spyOn(row, 'getBoundingClientRect').mockReturnValue({
      left: 0,
      top: 16 + index * 48,
      right: 420,
      bottom: 56 + index * 48,
      width: 420,
      height: 40,
      x: 0,
      y: 16 + index * 48,
      toJSON: () => ({}),
    } as DOMRect)
  })

  pointerDownAt(surface, 12, 18)
  pointerMoveAt(window, 220, 120)

  expect(rows[0]).toHaveClass('editor-row-selected')
  expect(rows[1]).toHaveClass('editor-row-selected')
  expect(container.querySelector('.editor-selection-marquee')).toBeInTheDocument()

  pointerUpAt(window, 220, 120)
  expect(container.querySelector('.editor-selection-marquee')).not.toBeInTheDocument()
})

it('does not start selection from the content area in safe-zone mode, but does in content-allowed mode', () => {
  const first = render(
    <BlockEditor
      page={page as never}
      allPages={[page as never]}
      onUpdateBlock={vi.fn()}
      blockSelectionStartMode="safe_zone_only"
    />,
  )

  const firstSurface = first.container.querySelector('.editor-surface')
  if (!(firstSurface instanceof HTMLElement)) {
    throw new Error('Expected first editor surface')
  }

  pointerDownAt(firstSurface, 180, 18)
  pointerMoveAt(window, 280, 120)
  expect(first.container.querySelector('.editor-row-selected')).not.toBeInTheDocument()
  pointerUpAt(window, 280, 120)

  const second = render(
    <BlockEditor
      page={page as never}
      allPages={[page as never]}
      onUpdateBlock={vi.fn()}
      blockSelectionStartMode="content_allowed"
    />,
  )

  const secondSurface = second.container.querySelector('.editor-surface')
  const secondRows = Array.from(second.container.querySelectorAll('.editor-row'))
  if (!(secondSurface instanceof HTMLElement)) {
    throw new Error('Expected second editor surface')
  }

  secondRows.forEach((row, index) => {
    vi.spyOn(row, 'getBoundingClientRect').mockReturnValue({
      left: 0,
      top: 16 + index * 48,
      right: 420,
      bottom: 56 + index * 48,
      width: 420,
      height: 40,
      x: 0,
      y: 16 + index * 48,
      toJSON: () => ({}),
    } as DOMRect)
  })

  pointerDownAt(secondSurface, 180, 18)
  pointerMoveAt(window, 280, 120)

  expect(secondRows[0]).toHaveClass('editor-row-selected')
  pointerUpAt(window, 280, 120)
})

it('clears the selection with Escape, plain content click, and page change', async () => {
  const user = userEvent.setup()
  const firstPage = page
  const secondPage = { ...page, id: 'page_b', blocks: page.blocks.slice(0, 2) }
  const { container, rerender } = render(
    <BlockEditor
      page={firstPage as never}
      allPages={[firstPage as never, secondPage as never]}
      onUpdateBlock={vi.fn()}
      blockSelectionStartMode="content_allowed"
    />,
  )

  const surface = container.querySelector('.editor-surface')
  const rows = Array.from(container.querySelectorAll('.editor-row'))
  if (!(surface instanceof HTMLElement)) {
    throw new Error('Expected editor surface')
  }

  rows.forEach((row, index) => {
    vi.spyOn(row, 'getBoundingClientRect').mockReturnValue({
      left: 0,
      top: 16 + index * 48,
      right: 420,
      bottom: 56 + index * 48,
      width: 420,
      height: 40,
      x: 0,
      y: 16 + index * 48,
      toJSON: () => ({}),
    } as DOMRect)
  })

  pointerDownAt(surface, 180, 18)
  pointerMoveAt(window, 280, 120)
  pointerUpAt(window, 280, 120)
  expect(container.querySelector('.editor-row-selected')).toBeInTheDocument()

  fireEvent.keyDown(surface, { key: 'Escape' })
  expect(container.querySelector('.editor-row-selected')).not.toBeInTheDocument()

  pointerDownAt(surface, 180, 18)
  pointerMoveAt(window, 280, 120)
  pointerUpAt(window, 280, 120)
  expect(container.querySelector('.editor-row-selected')).toBeInTheDocument()

  await user.click(screen.getByRole('textbox', { name: '输入正文' }))
  expect(container.querySelector('.editor-row-selected')).not.toBeInTheDocument()

  pointerDownAt(surface, 180, 18)
  pointerMoveAt(window, 280, 120)
  pointerUpAt(window, 280, 120)
  expect(container.querySelector('.editor-row-selected')).toBeInTheDocument()

  rerender(
    <BlockEditor
      page={secondPage as never}
      allPages={[firstPage as never, secondPage as never]}
      onUpdateBlock={vi.fn()}
      blockSelectionStartMode="content_allowed"
    />,
  )

  expect(container.querySelector('.editor-row-selected')).not.toBeInTheDocument()
})
```

新增 `src/styles/editorMultiSelectLayout.test.ts`：

```ts
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const styles = readFileSync('src/styles/index.css', 'utf8')

function cssRule(selector: string) {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = styles.match(new RegExp(`${escapedSelector}\\s*\\{(?<body>[^}]*)\\}`))

  if (!match?.groups?.body) {
    throw new Error(`Missing CSS rule for ${selector}`)
  }

  return match.groups.body
}

describe('editor multi select layout', () => {
  it('styles selected rows and the marquee overlay', () => {
    expect(cssRule('.editor-row-selected')).toContain('background:')
    expect(cssRule('.editor-row-selected')).toContain('box-shadow:')
    expect(cssRule('.editor-selection-marquee')).toContain('position: fixed;')
    expect(cssRule('.editor-selection-marquee')).toContain('pointer-events: none;')
  })
})
```

- [ ] **Step 2: 运行测试，确认它先失败**

Run:

```bash
npm run test -- src/components/editor/BlockEditor.test.tsx src/styles/editorMultiSelectLayout.test.ts
```

Expected:

```text
FAIL  src/components/editor/BlockEditor.test.tsx
... blockSelectionStartMode prop does not exist
FAIL  src/styles/editorMultiSelectLayout.test.ts
... Missing CSS rule for .editor-row-selected
```

- [ ] **Step 3: 写最小 editor 实现**

在 `src/components/editor/BlockEditor.tsx` 里：

1. 扩 props，并复用领域类型：

```ts
import type { ..., BlockSelectionStartMode, ... } from '../../domain/types'

interface BlockEditorProps {
  ...
  blockSelectionStartMode?: BlockSelectionStartMode
  ...
}
```

2. 在本地 state 区增加：

```ts
interface SelectionRect {
  left: number
  top: number
  width: number
  height: number
}

const MARQUEE_START_THRESHOLD = 6
const SAFE_SELECTION_ZONE_WIDTH = 44

const surfaceRef = useRef<HTMLElement | null>(null)
const marqueeStartRef = useRef<{ x: number; y: number } | null>(null)
const marqueeActiveRef = useRef(false)
const [selectedBlockIds, setSelectedBlockIds] = useState<string[]>([])
const [selectionRect, setSelectionRect] = useState<SelectionRect | null>(null)
const [draggingSelectionBlockIds, setDraggingSelectionBlockIds] = useState<string[] | null>(null)
```

3. 增加最小 helper：

```ts
function clearBlockSelection() {
  marqueeStartRef.current = null
  marqueeActiveRef.current = false
  setSelectionRect(null)
  setSelectedBlockIds([])
}

function canStartMarqueeFrom(surface: HTMLElement, clientX: number) {
  if (blockSelectionStartMode === 'content_allowed') {
    return true
  }

  const surfaceRect = surface.getBoundingClientRect()
  return clientX - surfaceRect.left <= SAFE_SELECTION_ZONE_WIDTH
}

function updateMarqueeSelection(
  surface: HTMLElement,
  startX: number,
  startY: number,
  clientX: number,
  clientY: number,
) {
  const left = Math.min(startX, clientX)
  const top = Math.min(startY, clientY)
  const right = Math.max(startX, clientX)
  const bottom = Math.max(startY, clientY)

  setSelectionRect({
    left,
    top,
    width: right - left,
    height: bottom - top,
  })

  const nextSelected = Array.from(
    surface.querySelectorAll<HTMLElement>('.editor-row[data-block-id]'),
  )
    .filter((row) => {
      const rect = row.getBoundingClientRect()
      return !(rect.right < left || rect.left > right || rect.bottom < top || rect.top > bottom)
    })
    .map((row) => row.dataset.blockId)
    .filter((value): value is string => Boolean(value))

  setSelectedBlockIds(nextSelected)
}
```

4. 把 page 变化和 block 变化时的清理规则补上：

```ts
useEffect(() => {
  clearBlockSelection()
  setDraggingSelectionBlockIds(null)
  setSyncedRangeStartBlockId(null)
  setPendingSyncedPicker(null)
  setBlockSlashCommand(null)
}, [page.id])

useEffect(() => {
  setSelectedBlockIds((current) =>
    current.filter((id) => page.blocks.some((block) => block.id === id)),
  )
}, [page.blocks])
```

5. 给行 class 加选中态：

```ts
const isSelected = selectedBlockIds.includes(blockId)

const rowClassName = [
  'editor-row',
  rowKindClassName,
  isSelected ? 'editor-row-selected' : '',
  isDragging ? 'editor-row-dragging' : '',
  dropPosition === 'before' ? 'editor-row-drop-target-before' : '',
  dropPosition === 'after' ? 'editor-row-drop-target-after' : '',
]
  .filter(Boolean)
  .join(' ')
```

6. 给 `.editor-surface` 接上 `ref`、`Escape`、普通点击清空、拖拽框选开始点：

```tsx
<section
  ref={surfaceRef}
  className="editor-surface"
  onInput={keepInputInView}
  onKeyDownCapture={(event) => {
    if (event.key === 'Escape' && selectedBlockIds.length > 0) {
      event.preventDefault()
      clearBlockSelection()
    }
  }}
  onPointerDownCapture={(event) => {
    if (!(event.target instanceof Element)) {
      return
    }

    if (blockSlashCommand) {
      const targetRow = event.target.closest<HTMLElement>('.editor-row')
      if (
        !slashMenuRef.current?.contains(event.target) &&
        targetRow?.dataset.blockId !== blockSlashCommand.blockId
      ) {
        setBlockSlashCommand(null)
      }
    }

    if (
      event.target === event.currentTarget &&
      isPointerInTrailingSurfaceGap(event.currentTarget, event.clientY)
    ) {
      event.preventDefault()
      clearBlockSelection()
      focusTrailingInsertTarget()
      return
    }

    if (event.target.closest('.block-handle')) {
      return
    }

    if (event.target.closest('.editor-row')) {
      clearBlockSelection()
    }

    if (event.button !== 0 || !canStartMarqueeFrom(event.currentTarget, event.clientX)) {
      return
    }

    marqueeStartRef.current = { x: event.clientX, y: event.clientY }
  }}
>
```

7. 用 `surfaceRef` 注册全局 pointer move / up；结束时只隐藏矩形，不清空已选块：

```ts
useEffect(() => {
  function handlePointerMove(event: PointerEvent) {
    const start = marqueeStartRef.current
    const surface = surfaceRef.current

    if (!start || !surface) {
      return
    }

    if (!marqueeActiveRef.current) {
      const distance = Math.hypot(event.clientX - start.x, event.clientY - start.y)
      if (distance < MARQUEE_START_THRESHOLD) {
        return
      }
      marqueeActiveRef.current = true
    }

    updateMarqueeSelection(surface, start.x, start.y, event.clientX, event.clientY)
  }

  function handlePointerUp() {
    marqueeStartRef.current = null
    marqueeActiveRef.current = false
    setSelectionRect(null)
  }

  window.addEventListener('pointermove', handlePointerMove)
  window.addEventListener('pointerup', handlePointerUp)

  return () => {
    window.removeEventListener('pointermove', handlePointerMove)
    window.removeEventListener('pointerup', handlePointerUp)
  }
}, [blockSelectionStartMode, page.id])
```

8. 在 surface 末尾渲染矩形：

```tsx
{selectionRect ? (
  <div
    className="editor-selection-marquee"
    style={{
      left: `${selectionRect.left}px`,
      top: `${selectionRect.top}px`,
      width: `${selectionRect.width}px`,
      height: `${selectionRect.height}px`,
    }}
  />
) : null}
```

9. 在 `src/styles/index.css` 里加样式：

```css
.editor-row-selected {
  background: rgba(91, 132, 196, 0.08);
  box-shadow: inset 0 0 0 1px rgba(91, 132, 196, 0.28);
  border-radius: 8px;
}

.editor-selection-marquee {
  position: fixed;
  pointer-events: none;
  border: 1px solid rgba(91, 132, 196, 0.75);
  background: rgba(91, 132, 196, 0.12);
  border-radius: 8px;
  z-index: 30;
}
```

- [ ] **Step 4: 再跑测试，确认通过**

Run:

```bash
npm run test -- src/components/editor/BlockEditor.test.tsx src/styles/editorMultiSelectLayout.test.ts
```

Expected:

```text
PASS  src/components/editor/BlockEditor.test.tsx
PASS  src/styles/editorMultiSelectLayout.test.ts
```

- [ ] **Step 5: 提交这一小步**

```bash
git add src/components/editor/BlockEditor.tsx src/components/editor/BlockEditor.test.tsx src/styles/index.css src/styles/editorMultiSelectLayout.test.ts
git commit -m "feat: add marquee block selection state"
```

---

### Task 5: 打通批量删除和整组拖动

**Files:**
- Modify: `src/store/createWorkspaceStore.ts`
- Modify: `src/store/createWorkspaceStore.test.ts`
- Modify: `src/components/editor/BlockEditor.tsx`
- Modify: `src/components/editor/BlockEditor.test.tsx`
- Modify: `src/app/App.tsx`

- [ ] **Step 1: 先写失败测试**

在 `src/store/createWorkspaceStore.test.ts` 里追加两个 store 测试：

```ts
it('reorders a selected block group while preserving original order', async () => {
  const workspace = createWorkspace()
  workspace.pages[0] = {
    ...workspace.pages[0],
    blocks: [
      { id: 'b1', type: 'paragraph', text: 'A' },
      { id: 'b2', type: 'paragraph', text: 'B' },
      { id: 'b3', type: 'paragraph', text: 'C' },
      { id: 'b4', type: 'paragraph', text: 'D' },
    ],
  }
  const counted = createCountingRepository(workspace)
  const store = createWorkspaceStore(counted.repository)

  await store.getState().bootstrap()
  await store.getState().reorderBlockGroup('page_1', ['b1', 'b3'], 'b4', 'before')

  expect(
    store.getState().pages.find((page) => page.id === 'page_1')?.blocks.map((block) => block.id),
  ).toEqual(['b2', 'b1', 'b3', 'b4'])
})

it('deletes multiple blocks in one action and removes synced containers safely', async () => {
  const workspace = createWorkspaceWithSyncedGroupAsset([
    { id: 'group_block_1', type: 'paragraph', text: 'Shared source' },
  ])
  workspace.pages = workspace.pages.map((page) =>
    page.id === 'page_1'
      ? {
          ...page,
          blocks: [
            ...page.blocks,
            { id: 'block_tail', type: 'paragraph', text: 'Tail block' },
          ],
        }
      : page,
  )
  const counted = createCountingRepository(workspace)
  const store = createWorkspaceStore(counted.repository)

  await store.getState().bootstrap()
  await store.getState().deleteBlocks('page_1', ['container_1', 'block_tail'])

  expect(
    store.getState().pages.find((page) => page.id === 'page_1')?.blocks.map((block) => block.id),
  ).toEqual([])
  expect(store.getState().syncedBlockGroups).toEqual([])
})
```

在 `src/components/editor/BlockEditor.test.tsx` 里追加 3 个 editor 测试：

```ts
it('deletes the selected block group when pressing Delete', () => {
  const onDeleteBlocks = vi.fn()
  const { container } = render(
    <BlockEditor
      page={page as never}
      allPages={[page as never]}
      onUpdateBlock={vi.fn()}
      onDeleteBlocks={onDeleteBlocks}
      blockSelectionStartMode="content_allowed"
    />,
  )

  const surface = container.querySelector('.editor-surface')
  const rows = Array.from(container.querySelectorAll('.editor-row'))
  if (!(surface instanceof HTMLElement)) {
    throw new Error('Expected editor surface')
  }

  rows.forEach((row, index) => {
    vi.spyOn(row, 'getBoundingClientRect').mockReturnValue({
      left: 0,
      top: 16 + index * 48,
      right: 420,
      bottom: 56 + index * 48,
      width: 420,
      height: 40,
      x: 0,
      y: 16 + index * 48,
      toJSON: () => ({}),
    } as DOMRect)
  })

  pointerDownAt(surface, 180, 18)
  pointerMoveAt(window, 280, 120)
  pointerUpAt(window, 280, 120)

  fireEvent.keyDown(surface, { key: 'Delete' })

  expect(onDeleteBlocks).toHaveBeenCalledWith(['b1', 'b2'])
})

it('reorders the selected block group when dragging from a selected handle', () => {
  const onReorderBlockGroup = vi.fn()
  const onReorderBlock = vi.fn()
  const { container } = render(
    <BlockEditor
      page={page as never}
      allPages={[page as never]}
      onUpdateBlock={vi.fn()}
      onReorderBlock={onReorderBlock}
      onReorderBlockGroup={onReorderBlockGroup}
      blockSelectionStartMode="content_allowed"
    />,
  )

  const surface = container.querySelector('.editor-surface')
  const rows = Array.from(container.querySelectorAll('.editor-row'))
  const handles = screen.getAllByRole('button', { name: '拖动块' })
  if (!(surface instanceof HTMLElement)) {
    throw new Error('Expected editor surface')
  }

  rows.forEach((row, index) => {
    vi.spyOn(row, 'getBoundingClientRect').mockReturnValue({
      left: 0,
      top: 16 + index * 48,
      right: 420,
      bottom: 56 + index * 48,
      width: 420,
      height: 40,
      x: 0,
      y: 16 + index * 48,
      toJSON: () => ({}),
    } as DOMRect)
  })

  pointerDownAt(surface, 180, 18)
  pointerMoveAt(window, 280, 120)
  pointerUpAt(window, 280, 120)

  rows[3].getBoundingClientRect = () =>
    ({ top: 180, bottom: 220, height: 40 } as DOMRect)

  fireEvent.dragStart(handles[0])
  dragOverAt(rows[3], 190)
  fireEvent.drop(rows[3])

  expect(onReorderBlockGroup).toHaveBeenCalledWith(['b1', 'b2'], 'b4', 'before')
  expect(onReorderBlock).not.toHaveBeenCalled()
})

it('keeps single-block drag when the handle belongs to an unselected row', () => {
  const onReorderBlockGroup = vi.fn()
  const onReorderBlock = vi.fn()
  const { container } = render(
    <BlockEditor
      page={page as never}
      allPages={[page as never]}
      onUpdateBlock={vi.fn()}
      onReorderBlock={onReorderBlock}
      onReorderBlockGroup={onReorderBlockGroup}
      blockSelectionStartMode="content_allowed"
    />,
  )

  const surface = container.querySelector('.editor-surface')
  const rows = Array.from(container.querySelectorAll('.editor-row'))
  const handles = screen.getAllByRole('button', { name: '拖动块' })
  if (!(surface instanceof HTMLElement)) {
    throw new Error('Expected editor surface')
  }

  rows.forEach((row, index) => {
    vi.spyOn(row, 'getBoundingClientRect').mockReturnValue({
      left: 0,
      top: 16 + index * 48,
      right: 420,
      bottom: 56 + index * 48,
      width: 420,
      height: 40,
      x: 0,
      y: 16 + index * 48,
      toJSON: () => ({}),
    } as DOMRect)
  })

  pointerDownAt(surface, 180, 18)
  pointerMoveAt(window, 280, 120)
  pointerUpAt(window, 280, 120)

  rows[0].getBoundingClientRect = () =>
    ({ top: 60, bottom: 100, height: 40 } as DOMRect)

  fireEvent.dragStart(handles[2])
  dragOverAt(rows[0], 70)
  fireEvent.drop(rows[0])

  expect(onReorderBlock).toHaveBeenCalledWith('b3', 'b1', 'before')
  expect(onReorderBlockGroup).not.toHaveBeenCalled()
})
```

- [ ] **Step 2: 运行测试，确认它先失败**

Run:

```bash
npm run test -- src/store/createWorkspaceStore.test.ts src/components/editor/BlockEditor.test.tsx
```

Expected:

```text
FAIL  src/store/createWorkspaceStore.test.ts
... reorderBlockGroup is not a function
FAIL  src/components/editor/BlockEditor.test.tsx
... onDeleteBlocks prop does not exist
```

- [ ] **Step 3: 写最小批量动作实现**

在 `src/store/createWorkspaceStore.ts` 里：

1. 引入 `reorderItemGroup`，并给 `WorkspaceState` / `createEmptyState()` 增加：

```ts
deleteBlocks: (pageId: PageId, blockIds: string[]) => Promise<void>
reorderBlockGroup: (
  pageId: PageId,
  activeBlockIds: string[],
  overBlockId: string,
  position?: ReorderPosition,
) => Promise<void>
```

2. 在 `reorderBlocks` 旁边追加 group 版本：

```ts
reorderBlockGroup: async (
  pageId: PageId,
  activeBlockIds: string[],
  overBlockId: string,
  position: ReorderPosition = 'before',
) => {
  const state = get()
  const nextPages = state.pages.map((page) =>
    page.id === pageId
      ? {
          ...page,
          updatedAt: new Date().toISOString(),
          blocks: reorderItemGroup(page.blocks, activeBlockIds, overBlockId, position),
        }
      : page,
  )

  pushUndoSnapshot(state)
  set({ saveStatus: 'saving' })

  try {
    await repository.save(createSnapshotFromState({ ...state, pages: nextPages }))
    set({ boards: state.boards, pages: nextPages, saveStatus: 'saved' })
  } catch {
    set({ saveStatus: 'error' })
    throw new Error('Failed to reorder block group')
  }
},
```

3. 在 `deleteBlock` 前面增加批量删除版本；先移除同步块实例，再统一过滤普通块：

```ts
deleteBlocks: async (pageId: PageId, blockIds: string[]) => {
  const state = get()
  const selectedIdSet = new Set(blockIds)
  let nextSnapshot = createSnapshotFromState(state)

  for (const blockId of blockIds) {
    nextSnapshot = removeSyncedInstanceFromSnapshot(nextSnapshot, pageId, blockId)
  }

  const now = new Date().toISOString()
  nextSnapshot = {
    ...nextSnapshot,
    pages: nextSnapshot.pages.map((page) =>
      page.id === pageId
        ? {
            ...page,
            updatedAt: now,
            blocks: page.blocks.filter((block) => !selectedIdSet.has(block.id)),
          }
        : page,
    ),
  }

  pushUndoSnapshot(state)
  set({
    pages: nextSnapshot.pages,
    syncedBlockGroups: nextSnapshot.syncedBlockGroups ?? [],
    saveStatus: 'saving',
  })

  try {
    await repository.save(nextSnapshot)
    set({
      pages: nextSnapshot.pages,
      syncedBlockGroups: nextSnapshot.syncedBlockGroups ?? [],
      saveStatus: 'saved',
    })
  } catch {
    set({ saveStatus: 'error' })
    throw new Error('Failed to delete blocks')
  }
},
```

在 `src/components/editor/BlockEditor.tsx` 里：

4. 扩 props：

```ts
interface BlockEditorProps {
  ...
  onDeleteBlocks?: (blockIds: string[]) => Promise<void> | void
  onReorderBlockGroup?: (
    activeBlockIds: string[],
    overBlockId: string,
    position: ReorderPosition,
  ) => Promise<void> | void
  ...
}
```

5. 加一个按页面顺序排序后的选中列表，供删除和拖动共用：

```ts
const orderedSelectedBlockIds = page.blocks
  .map((block) => block.id)
  .filter((id) => selectedBlockIds.includes(id))
```

6. 在 `renderBlockRow(...)` 的拖动入口里，让“选中的手柄”走 group drag，“未选中的手柄”继续走单块 drag：

```ts
onDragStart={() => {
  draggingBlockId.current = blockId
  setDraggingVisualBlockId(blockId)
  setDraggingSelectionBlockIds(
    orderedSelectedBlockIds.includes(blockId) && orderedSelectedBlockIds.length > 1
      ? orderedSelectedBlockIds
      : null,
  )
  setDropTarget(null)
}}
onDragEnd={() => {
  setDraggingSelectionBlockIds(null)
  clearDragState()
}}
```

7. 在行 `onDrop` 里先判断 group drag：

```ts
onDrop={(event) => {
  event.preventDefault()

  if (draggingSelectionBlockIds && draggingSelectionBlockIds.length > 0) {
    const position =
      dropTarget?.blockId === blockId
        ? dropTarget.position
        : getDropPosition(event.currentTarget, event.clientY)
    onReorderBlockGroup?.(draggingSelectionBlockIds, blockId, position)
    setDraggingSelectionBlockIds(null)
    clearBlockSelection()
    clearDragState()
    return
  }

  if (draggingBlockId.current && draggingBlockId.current !== blockId) {
    const position =
      dropTarget?.blockId === blockId
        ? dropTarget.position
        : getDropPosition(event.currentTarget, event.clientY)
    onReorderBlock?.(draggingBlockId.current, blockId, position)
  }
  clearDragState()
}}
```

8. 在 surface 的 `onKeyDownCapture` 里加批量删除，并保留合理焦点：

```ts
function focusAfterBatchDelete(blockIds: string[]) {
  const firstIndex = page.blocks.findIndex((block) => block.id === blockIds[0])
  const previousBlockId = firstIndex > 0 ? page.blocks[firstIndex - 1]?.id : null

  if (previousBlockId) {
    requestBlockFocus(previousBlockId, 'delete_target')
    return
  }

  window.setTimeout(() => {
    focusTrailingInsertTarget()
  }, 0)
}
```

```tsx
onKeyDownCapture={(event) => {
  if (event.key === 'Escape' && selectedBlockIds.length > 0) {
    event.preventDefault()
    clearBlockSelection()
    return
  }

  if (
    orderedSelectedBlockIds.length > 0 &&
    !event.nativeEvent.isComposing &&
    (event.key === 'Backspace' || event.key === 'Delete')
  ) {
    event.preventDefault()
    const deletingIds = orderedSelectedBlockIds
    clearBlockSelection()
    void Promise.resolve(onDeleteBlocks?.(deletingIds)).then(() => {
      focusAfterBatchDelete(deletingIds)
    })
  }
}}
```

在 `src/app/App.tsx` 里：

9. 给 `PageRouteProps`、`PageRoute(...)`、`BlockEditor` 调用链都补上两个新回调，并把 store action 传进去：

```ts
onDeleteBlocks: (pageId: string, blockIds: string[]) => Promise<void>
onReorderBlockGroup: (
  pageId: string,
  activeBlockIds: string[],
  overBlockId: string,
  position: ReorderPosition,
) => Promise<void>
```

```tsx
<BlockEditor
  ...
  blockSelectionStartMode={workspaceSettings.blockSelectionStartMode}
  onDeleteBlocks={(blockIds) => onDeleteBlocks(page.id, blockIds)}
  onReorderBlockGroup={(activeBlockIds, overBlockId, position) =>
    onReorderBlockGroup(page.id, activeBlockIds, overBlockId, position)
  }
  ...
/>
```

- [ ] **Step 4: 再跑测试，确认通过**

Run:

```bash
npm run test -- src/utils/reorder.test.ts src/store/createWorkspaceStore.test.ts src/components/settings/SettingsCenter.test.tsx src/components/editor/BlockEditor.test.tsx src/styles/editorMultiSelectLayout.test.ts
```

Expected:

```text
PASS  5 files passed
```

- [ ] **Step 5: 提交这一小步**

```bash
git add src/store/createWorkspaceStore.ts src/store/createWorkspaceStore.test.ts src/components/editor/BlockEditor.tsx src/components/editor/BlockEditor.test.tsx src/app/App.tsx
git commit -m "feat: add block multi-select batch actions"
```

---

### Task 6: 更新变更记录并完成验证

**Files:**
- Modify: `docs/updates.md`

- [ ] **Step 1: 更新变更记录**

在 `docs/updates.md` 新增一条：

```md
## 2026-07-09 编辑器多选块 v1
提交：未提交

简要描述：

正文编辑器新增了多选块第一版，支持框选、批量删除、左侧手柄整组拖动，以及一个控制框选起点范围的设置项。

详细描述：

- 新增正文块框选能力，支持从安全区或正文区域开始，具体由设置项控制。
- 多选后支持 `Delete / Backspace` 一次删除整组选中块。
- 多选后支持从左侧手柄发起整组拖动，保持原顺序并复用现有落点指示。
- 设置中心新增“框选起点”设置，工作区会记住用户选择。

验证情况：

- 已通过 `npm run test -- src/utils/reorder.test.ts src/store/createWorkspaceStore.test.ts src/components/settings/SettingsCenter.test.tsx src/components/editor/BlockEditor.test.tsx src/styles/editorMultiSelectLayout.test.ts`
- 已通过 `npm run build`
```

- [ ] **Step 2: 运行最终验证**

Run:

```bash
npm run test -- src/utils/reorder.test.ts src/store/createWorkspaceStore.test.ts src/components/settings/SettingsCenter.test.tsx src/components/editor/BlockEditor.test.tsx src/styles/editorMultiSelectLayout.test.ts
```

Expected:

```text
PASS  5 files passed
```

- [ ] **Step 3: 跑构建**

Run:

```bash
npm run build
```

Expected:

```text
vite build completed successfully
```

- [ ] **Step 4: 最后看一眼 diff**

Run:

```bash
git diff --stat
```

Expected:

```text
Only the planned editor, store, settings, style, util, and docs files are listed
```

- [ ] **Step 5: 提交文档**

```bash
git add docs/updates.md
git commit -m "docs: record block multi-select update"
```
