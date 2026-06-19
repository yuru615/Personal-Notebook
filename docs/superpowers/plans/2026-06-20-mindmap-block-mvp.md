# Mindmap Block MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first usable structured mindmap block with three automatic layout modes, stable local persistence, Chinese UI, and Notion-like block/page integration.

**Architecture:** Keep mindmap data as independent `MindmapRecord` assets referenced by document blocks via `mindmapId`. Reuse the existing `CanvasEntryCard`, `StructuredCanvasPage`, routing, preview, and store patterns, but keep the mindmap editor as a React structured tree editor rather than reusing the whiteboard legacy iframe or freeform object model.

**Tech Stack:** React 19, TypeScript, Zustand vanilla store, Vite, Vitest, Testing Library, local IndexedDB repository already used by the app.

---

## File Structure

- Modify `src/domain/types.ts`: add `MindmapLayoutMode` and require `layoutMode` on `MindmapRecord`.
- Modify `src/utils/blockFactory.ts`: create mindmaps with default `layoutMode: 'balanced'`.
- Modify `src/components/mindmap/mindmapModel.ts`: add layout mode normalization, layout mode update, collapse toggle, and insertion helpers needed by keyboard interactions.
- Modify `src/components/mindmap/mindmapLayout.ts`: replace the current one-level layout with a tree-aware layout that supports `balanced`, `right`, and `outline`.
- Modify `src/components/mindmap/mindmapPreview.ts`: generate previews that reflect the current layout mode.
- Modify `src/components/mindmap/MindmapCanvas.tsx`: add selected node state, keyboard handling, node menu controls, collapse/expand, and layout mode UI hooks.
- Modify `src/components/mindmap/MindmapPage.tsx`: accept toolbar actions and keep page chrome consistent with whiteboard/shared canvas pages.
- Modify `src/app/App.tsx`: pass new callbacks from store to `MindmapCanvas`, add layout mode/collapse operations to `MindmapRoute`, and hide sidebar on mindmap routes if visual parity with whiteboard is desired during implementation.
- Modify `src/store/createWorkspaceStore.ts`: add `setMindmapLayoutMode` and `toggleMindmapNodeCollapsed`, normalize imported/loaded old mindmaps.
- Modify `src/components/editor/SlashMenu.tsx`: fix mojibake Chinese label/description for mindmap.
- Modify `src/styles/index.css`: polish mindmap toolbar, canvas, nodes, selected state, and layout controls.
- Tests:
  - `src/components/mindmap/mindmapModel.test.ts`
  - `src/components/mindmap/mindmapLayout.test.ts`
  - `src/components/mindmap/MindmapCanvas.test.tsx`
  - `src/components/mindmap/mindmapPreview.test.ts`
  - `src/store/createWorkspaceStore.test.ts`
  - `src/app/App.test.tsx`

---

### Task 1: Data Model, Defaults, And Store Surface

**Files:**
- Modify: `src/domain/types.ts`
- Modify: `src/utils/blockFactory.ts`
- Modify: `src/components/mindmap/mindmapModel.ts`
- Modify: `src/store/createWorkspaceStore.ts`
- Test: `src/components/mindmap/mindmapModel.test.ts`
- Test: `src/store/createWorkspaceStore.test.ts`

- [ ] **Step 1: Write failing model tests for layout mode and collapse**

Add these tests to `src/components/mindmap/mindmapModel.test.ts`:

```ts
import {
  addMindmapChildNode,
  createEmptyMindmapRecord,
  renameMindmap,
  renameMindmapNode,
  setMindmapLayoutMode,
  toggleMindmapNodeCollapsed,
} from './mindmapModel'

it('creates an empty mindmap with balanced layout mode', () => {
  const mindmap = createEmptyMindmapRecord('2026-06-20T00:00:00.000Z')

  expect(mindmap.layoutMode).toBe('balanced')
})

it('changes the layout mode without touching nodes', () => {
  const mindmap = createEmptyMindmapRecord('2026-06-20T00:00:00.000Z')

  const next = setMindmapLayoutMode(mindmap, 'outline', '2026-06-20T00:10:00.000Z')

  expect(next.layoutMode).toBe('outline')
  expect(next.nodes).toEqual(mindmap.nodes)
  expect(next.updatedAt).toBe('2026-06-20T00:10:00.000Z')
})

it('toggles collapsed state for a non-root node', () => {
  const base = createEmptyMindmapRecord('2026-06-20T00:00:00.000Z')
  const withChild = addMindmapChildNode(base, base.rootNodeId, '2026-06-20T00:01:00.000Z')
  const child = Object.values(withChild.nodes).find((node) => node.parentId === withChild.rootNodeId)

  if (!child) {
    throw new Error('Expected child node')
  }

  const collapsed = toggleMindmapNodeCollapsed(withChild, child.id, '2026-06-20T00:02:00.000Z')
  const expanded = toggleMindmapNodeCollapsed(collapsed, child.id, '2026-06-20T00:03:00.000Z')

  expect(collapsed.nodes[child.id].collapsed).toBe(true)
  expect(expanded.nodes[child.id].collapsed).toBe(false)
})
```

- [ ] **Step 2: Run model tests and confirm failure**

Run:

```powershell
npm test -- src/components/mindmap/mindmapModel.test.ts
```

Expected: FAIL because `layoutMode`, `setMindmapLayoutMode`, and `toggleMindmapNodeCollapsed` are missing.

- [ ] **Step 3: Add the layout type**

Update `src/domain/types.ts`:

```ts
export type MindmapLayoutMode = 'balanced' | 'right' | 'outline'

export interface MindmapRecord {
  id: MindmapId
  title: string
  rootNodeId: string
  nodes: Record<string, MindmapNode>
  layoutMode: MindmapLayoutMode
  viewport: {
    x: number
    y: number
    zoom: number
  }
  createdAt: string
  updatedAt: string
}
```

- [ ] **Step 4: Add defaults and model operations**

Update imports and functions in `src/components/mindmap/mindmapModel.ts`:

```ts
import type { MindmapLayoutMode, MindmapNode, MindmapRecord } from '../../domain/types'

const DEFAULT_LAYOUT_MODE: MindmapLayoutMode = 'balanced'

export function createEmptyMindmapRecord(now = new Date().toISOString()): MindmapRecord {
  const rootNodeId = createId('mindmap_node')

  return {
    id: createId('mindmap'),
    title: UNTITLED_MINDMAP_TITLE,
    rootNodeId,
    nodes: {
      [rootNodeId]: {
        id: rootNodeId,
        parentId: null,
        text: DEFAULT_ROOT_NODE_TEXT,
        order: 0,
      },
    },
    layoutMode: DEFAULT_LAYOUT_MODE,
    viewport: {
      x: 0,
      y: 0,
      zoom: 1,
    },
    createdAt: now,
    updatedAt: now,
  }
}

export function normalizeMindmapRecord(mindmap: MindmapRecord): MindmapRecord {
  return {
    ...mindmap,
    layoutMode: isMindmapLayoutMode(mindmap.layoutMode) ? mindmap.layoutMode : DEFAULT_LAYOUT_MODE,
  }
}

export function setMindmapLayoutMode(
  mindmap: MindmapRecord,
  layoutMode: MindmapLayoutMode,
  now = new Date().toISOString(),
): MindmapRecord {
  return {
    ...mindmap,
    layoutMode,
    updatedAt: now,
  }
}

export function toggleMindmapNodeCollapsed(
  mindmap: MindmapRecord,
  nodeId: string,
  now = new Date().toISOString(),
): MindmapRecord {
  const node = mindmap.nodes[nodeId]

  if (!node || nodeId === mindmap.rootNodeId) {
    return mindmap
  }

  return {
    ...mindmap,
    nodes: {
      ...mindmap.nodes,
      [nodeId]: {
        ...node,
        collapsed: !node.collapsed,
      },
    },
    updatedAt: now,
  }
}

function isMindmapLayoutMode(value: unknown): value is MindmapLayoutMode {
  return value === 'balanced' || value === 'right' || value === 'outline'
}
```

- [ ] **Step 5: Add the default in block factory**

Update `src/utils/blockFactory.ts` inside `createMindmapRecord`:

```ts
    layoutMode: 'balanced',
    viewport: {
      x: 0,
      y: 0,
      zoom: 1,
    },
```

- [ ] **Step 6: Add store methods**

Update imports in `src/store/createWorkspaceStore.ts`:

```ts
  normalizeMindmapRecord,
  setMindmapLayoutMode as updateMindmapLayoutMode,
  toggleMindmapNodeCollapsed as updateMindmapNodeCollapsed,
```

Update type imports:

```ts
  MindmapLayoutMode,
```

Add to `WorkspaceState`:

```ts
  setMindmapLayoutMode: (mindmapId: string, layoutMode: MindmapLayoutMode) => Promise<void>
  toggleMindmapNodeCollapsed: (mindmapId: string, nodeId: string) => Promise<void>
```

Add empty-state stubs:

```ts
    setMindmapLayoutMode: async () => {
      throw new Error('not implemented')
    },
    toggleMindmapNodeCollapsed: async () => {
      throw new Error('not implemented')
    },
```

Normalize mindmaps inside `normalizeWorkspaceSnapshot`:

```ts
  const mindmaps = rawMindmaps.map(normalizeMindmapRecord)
```

Add store implementations near other mindmap methods:

```ts
    setMindmapLayoutMode: async (mindmapId: string, layoutMode: MindmapLayoutMode) => {
      const state = get()
      const nextMindmaps = state.mindmaps.map((mindmap) =>
        mindmap.id === mindmapId ? updateMindmapLayoutMode(mindmap, layoutMode) : mindmap,
      )

      pushUndoSnapshot(state)
      try {
        await persistNonPageAssets(state, { mindmaps: nextMindmaps })
      } catch {
        throw new Error('Failed to change mindmap layout mode')
      }
    },

    toggleMindmapNodeCollapsed: async (mindmapId: string, nodeId: string) => {
      const state = get()
      const nextMindmaps = state.mindmaps.map((mindmap) =>
        mindmap.id === mindmapId ? updateMindmapNodeCollapsed(mindmap, nodeId) : mindmap,
      )

      pushUndoSnapshot(state)
      try {
        await persistNonPageAssets(state, { mindmaps: nextMindmaps })
      } catch {
        throw new Error('Failed to toggle mindmap node')
      }
    },
```

- [ ] **Step 7: Run focused tests**

Run:

```powershell
npm test -- src/components/mindmap/mindmapModel.test.ts src/store/createWorkspaceStore.test.ts
```

Expected: PASS or only failures that point to missing test updates for new store methods.

- [ ] **Step 8: Commit**

```powershell
git add -- src/domain/types.ts src/utils/blockFactory.ts src/components/mindmap/mindmapModel.ts src/components/mindmap/mindmapModel.test.ts src/store/createWorkspaceStore.ts src/store/createWorkspaceStore.test.ts
git commit -m "feat: add mindmap layout mode model"
```

---

### Task 2: Tree-Aware Layout Modes

**Files:**
- Modify: `src/components/mindmap/mindmapLayout.ts`
- Test: `src/components/mindmap/mindmapLayout.test.ts`

- [ ] **Step 1: Replace layout tests with three-mode coverage**

Add tests to `src/components/mindmap/mindmapLayout.test.ts`:

```ts
it('builds a balanced layout with root children split across both sides', () => {
  const base = createEmptyMindmapRecord('2026-06-20T00:00:00.000Z')
  const first = addMindmapChildNode(base, base.rootNodeId, '2026-06-20T00:01:00.000Z')
  const second = addMindmapChildNode(first, first.rootNodeId, '2026-06-20T00:02:00.000Z')

  const layout = buildMindmapLayout({ ...second, layoutMode: 'balanced' })
  const children = layout.nodes.filter((node) => node.parentId === second.rootNodeId)

  expect(children.some((node) => node.x < layout.root.x)).toBe(true)
  expect(children.some((node) => node.x > layout.root.x)).toBe(true)
})

it('builds a right layout with descendants to the right of the root', () => {
  const base = createEmptyMindmapRecord('2026-06-20T00:00:00.000Z')
  const mindmap = addMindmapChildNode(base, base.rootNodeId, '2026-06-20T00:01:00.000Z')

  const layout = buildMindmapLayout({ ...mindmap, layoutMode: 'right' })
  const child = layout.nodes.find((node) => node.parentId === mindmap.rootNodeId)

  expect(child?.x).toBeGreaterThan(layout.root.x)
})

it('builds an outline layout with descendants below the root', () => {
  const base = createEmptyMindmapRecord('2026-06-20T00:00:00.000Z')
  const mindmap = addMindmapChildNode(base, base.rootNodeId, '2026-06-20T00:01:00.000Z')

  const layout = buildMindmapLayout({ ...mindmap, layoutMode: 'outline' })
  const child = layout.nodes.find((node) => node.parentId === mindmap.rootNodeId)

  expect(child?.y).toBeGreaterThan(layout.root.y)
})

it('does not lay out collapsed descendants', () => {
  const base = createEmptyMindmapRecord('2026-06-20T00:00:00.000Z')
  const withChild = addMindmapChildNode(base, base.rootNodeId, '2026-06-20T00:01:00.000Z')
  const child = Object.values(withChild.nodes).find((node) => node.parentId === withChild.rootNodeId)

  if (!child) {
    throw new Error('Expected child node')
  }

  const withGrandchild = addMindmapChildNode(withChild, child.id, '2026-06-20T00:02:00.000Z')
  const collapsed = {
    ...withGrandchild,
    nodes: {
      ...withGrandchild.nodes,
      [child.id]: {
        ...withGrandchild.nodes[child.id],
        collapsed: true,
      },
    },
  }

  const layout = buildMindmapLayout(collapsed)

  expect(layout.nodes).toHaveLength(2)
})
```

- [ ] **Step 2: Run layout tests and confirm failure**

```powershell
npm test -- src/components/mindmap/mindmapLayout.test.ts
```

Expected: FAIL because the current layout only supports root plus direct children and returns no `root`.

- [ ] **Step 3: Implement a simple tree layout**

Replace `src/components/mindmap/mindmapLayout.ts` with a focused implementation:

```ts
import type { MindmapLayoutMode, MindmapRecord } from '../../domain/types'

export interface MindmapLayoutNode {
  id: string
  parentId: string | null
  text: string
  x: number
  y: number
  depth: number
  collapsed: boolean
}

export interface MindmapLayoutEdge {
  id: string
  fromId: string
  toId: string
  x1: number
  y1: number
  x2: number
  y2: number
}

export interface MindmapLayout {
  nodes: MindmapLayoutNode[]
  edges: MindmapLayoutEdge[]
  root: MindmapLayoutNode
  width: number
  height: number
}

const NODE_WIDTH = 168
const LEVEL_GAP = 220
const ROW_GAP = 72
const ROOT_X = 480
const ROOT_Y = 280

export function buildMindmapLayout(mindmap: MindmapRecord): MindmapLayout {
  const mode = mindmap.layoutMode ?? 'balanced'
  const rootRecord = mindmap.nodes[mindmap.rootNodeId]

  if (!rootRecord) {
    const root = makeNode(mindmap.rootNodeId, null, '中心主题', ROOT_X, ROOT_Y, 0, false)
    return { nodes: [root], edges: [], root, width: 960, height: 560 }
  }

  const childrenByParent = groupVisibleChildren(mindmap)
  const nodes =
    mode === 'outline'
      ? buildOutlineNodes(mindmap, childrenByParent)
      : mode === 'right'
        ? buildRightNodes(mindmap, childrenByParent)
        : buildBalancedNodes(mindmap, childrenByParent)
  const edges = buildEdges(nodes)
  const root = nodes.find((node) => node.id === mindmap.rootNodeId) ?? nodes[0]
  const bounds = buildBounds(nodes)

  return {
    nodes,
    edges,
    root,
    width: Math.max(960, bounds.width),
    height: Math.max(560, bounds.height),
  }
}

function groupVisibleChildren(mindmap: MindmapRecord) {
  const childrenByParent = new Map<string, string[]>()

  Object.values(mindmap.nodes)
    .filter((node) => node.parentId !== null)
    .sort((left, right) => left.order - right.order)
    .forEach((node) => {
      const parent = mindmap.nodes[node.parentId ?? '']
      if (!parent || parent.collapsed) {
        return
      }

      childrenByParent.set(parent.id, [...(childrenByParent.get(parent.id) ?? []), node.id])
    })

  return childrenByParent
}

function buildBalancedNodes(mindmap: MindmapRecord, childrenByParent: Map<string, string[]>) {
  const root = mindmap.nodes[mindmap.rootNodeId]
  const result = [makeNode(root.id, null, root.text, ROOT_X, ROOT_Y, 0, Boolean(root.collapsed))]
  const rootChildren = childrenByParent.get(root.id) ?? []
  const left = rootChildren.filter((_, index) => index % 2 === 1)
  const right = rootChildren.filter((_, index) => index % 2 === 0)

  appendSide(result, mindmap, childrenByParent, left, -1)
  appendSide(result, mindmap, childrenByParent, right, 1)

  return result
}

function appendSide(
  result: MindmapLayoutNode[],
  mindmap: MindmapRecord,
  childrenByParent: Map<string, string[]>,
  nodeIds: string[],
  direction: -1 | 1,
) {
  let row = 0
  const queue = nodeIds.map((nodeId) => ({ nodeId, depth: 1 }))

  while (queue.length > 0) {
    const current = queue.shift()
    if (!current) {
      continue
    }

    const source = mindmap.nodes[current.nodeId]
    result.push(
      makeNode(
        source.id,
        source.parentId,
        source.text,
        ROOT_X + direction * current.depth * LEVEL_GAP,
        ROOT_Y + (row - (nodeIds.length - 1) / 2) * ROW_GAP,
        current.depth,
        Boolean(source.collapsed),
      ),
    )
    row += 1

    for (const childId of childrenByParent.get(source.id) ?? []) {
      queue.push({ nodeId: childId, depth: current.depth + 1 })
    }
  }
}

function buildRightNodes(mindmap: MindmapRecord, childrenByParent: Map<string, string[]>) {
  const root = mindmap.nodes[mindmap.rootNodeId]
  const result = [makeNode(root.id, null, root.text, 160, ROOT_Y, 0, Boolean(root.collapsed))]
  appendDepthFirst(result, mindmap, childrenByParent, root.id, 1, { row: 0 }, 160, 120)
  return result
}

function buildOutlineNodes(mindmap: MindmapRecord, childrenByParent: Map<string, string[]>) {
  const root = mindmap.nodes[mindmap.rootNodeId]
  const result = [makeNode(root.id, null, root.text, 120, 96, 0, Boolean(root.collapsed))]
  appendDepthFirst(result, mindmap, childrenByParent, root.id, 1, { row: 1 }, 120, 96)
  return result
}

function appendDepthFirst(
  result: MindmapLayoutNode[],
  mindmap: MindmapRecord,
  childrenByParent: Map<string, string[]>,
  parentId: string,
  depth: number,
  cursor: { row: number },
  startX: number,
  startY: number,
) {
  for (const childId of childrenByParent.get(parentId) ?? []) {
    const source = mindmap.nodes[childId]
    result.push(
      makeNode(
        source.id,
        source.parentId,
        source.text,
        startX + depth * LEVEL_GAP,
        startY + cursor.row * ROW_GAP,
        depth,
        Boolean(source.collapsed),
      ),
    )
    cursor.row += 1
    appendDepthFirst(result, mindmap, childrenByParent, childId, depth + 1, cursor, startX, startY)
  }
}

function makeNode(
  id: string,
  parentId: string | null,
  text: string,
  x: number,
  y: number,
  depth: number,
  collapsed: boolean,
): MindmapLayoutNode {
  return { id, parentId, text, x, y, depth, collapsed }
}

function buildEdges(nodes: MindmapLayoutNode[]): MindmapLayoutEdge[] {
  return nodes
    .filter((node) => node.parentId !== null)
    .map((node) => {
      const parent = nodes.find((candidate) => candidate.id === node.parentId)

      return {
        id: `${node.parentId}-${node.id}`,
        fromId: node.parentId ?? '',
        toId: node.id,
        x1: parent ? parent.x : node.x,
        y1: parent ? parent.y : node.y,
        x2: node.x,
        y2: node.y,
      }
    })
}

function buildBounds(nodes: MindmapLayoutNode[]) {
  const maxX = Math.max(...nodes.map((node) => node.x + NODE_WIDTH), 960)
  const maxY = Math.max(...nodes.map((node) => node.y + ROW_GAP), 560)
  return { width: maxX + 160, height: maxY + 160 }
}
```

- [ ] **Step 4: Run layout tests**

```powershell
npm test -- src/components/mindmap/mindmapLayout.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add -- src/components/mindmap/mindmapLayout.ts src/components/mindmap/mindmapLayout.test.ts
git commit -m "feat: add mindmap layout modes"
```

---

### Task 3: Canvas Editing Interactions

**Files:**
- Modify: `src/components/mindmap/MindmapCanvas.tsx`
- Modify: `src/app/App.tsx`
- Test: `src/components/mindmap/MindmapCanvas.test.tsx`

- [ ] **Step 1: Add failing tests for keyboard and layout UI**

Add to `src/components/mindmap/MindmapCanvas.test.tsx`:

```ts
it('adds a sibling with Enter and a child with Tab from the selected node', () => {
  const mindmap = createEmptyMindmapRecord('2026-06-20T00:00:00.000Z')
  const onAddSiblingNode = vi.fn()
  const onAddChildNode = vi.fn()

  render(
    <MindmapCanvas
      mindmap={mindmap}
      onRenameNode={() => undefined}
      onAddChildNode={onAddChildNode}
      onAddSiblingNode={onAddSiblingNode}
      onDeleteNode={() => undefined}
      onToggleNodeCollapsed={() => undefined}
      onChangeLayoutMode={() => undefined}
    />,
  )

  const textbox = screen.getByRole('textbox')
  fireEvent.keyDown(textbox, { key: 'Enter' })
  fireEvent.keyDown(textbox, { key: 'Tab' })

  expect(onAddSiblingNode).toHaveBeenCalledWith(mindmap.rootNodeId)
  expect(onAddChildNode).toHaveBeenCalledWith(mindmap.rootNodeId)
})

it('changes layout mode from the toolbar', async () => {
  const user = userEvent.setup()
  const mindmap = createEmptyMindmapRecord('2026-06-20T00:00:00.000Z')
  const onChangeLayoutMode = vi.fn()

  render(
    <MindmapCanvas
      mindmap={mindmap}
      onRenameNode={() => undefined}
      onAddChildNode={() => undefined}
      onAddSiblingNode={() => undefined}
      onDeleteNode={() => undefined}
      onToggleNodeCollapsed={() => undefined}
      onChangeLayoutMode={onChangeLayoutMode}
    />,
  )

  await user.click(screen.getByRole('button', { name: '大纲导图' }))

  expect(onChangeLayoutMode).toHaveBeenCalledWith('outline')
})
```

- [ ] **Step 2: Run canvas tests and confirm failure**

```powershell
npm test -- src/components/mindmap/MindmapCanvas.test.tsx
```

Expected: FAIL because new props and toolbar do not exist.

- [ ] **Step 3: Update canvas props and toolbar**

Update `src/components/mindmap/MindmapCanvas.tsx`:

```ts
import { useState } from 'react'
import type { MindmapLayoutMode, MindmapRecord } from '../../domain/types'
import { buildMindmapLayout } from './mindmapLayout'

interface MindmapCanvasProps {
  mindmap: MindmapRecord
  onRenameNode: (nodeId: string, text: string) => void
  onAddChildNode: (nodeId: string) => void
  onAddSiblingNode: (nodeId: string) => void
  onDeleteNode: (nodeId: string) => void
  onToggleNodeCollapsed: (nodeId: string) => void
  onChangeLayoutMode: (layoutMode: MindmapLayoutMode) => void
}

const layoutOptions: Array<{ value: MindmapLayoutMode; label: string }> = [
  { value: 'balanced', label: '左右导图' },
  { value: 'right', label: '右侧导图' },
  { value: 'outline', label: '大纲导图' },
]
```

Inside the component render, use:

```tsx
  const [selectedNodeId, setSelectedNodeId] = useState(mindmap.rootNodeId)
  const layout = buildMindmapLayout(mindmap)

  return (
    <div className="mindmap-workspace">
      <div className="mindmap-toolbar" aria-label="思维导图工具栏">
        <div className="mindmap-layout-switcher" role="group" aria-label="布局模式">
          {layoutOptions.map((option) => (
            <button
              key={option.value}
              type="button"
              className={mindmap.layoutMode === option.value ? 'mindmap-toolbar-button-active' : 'mindmap-toolbar-button'}
              onClick={() => onChangeLayoutMode(option.value)}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>
      <div className="mindmap-canvas">
        <svg
          className="mindmap-canvas-svg"
          width={layout.width}
          height={layout.height}
          viewBox={`0 0 ${layout.width} ${layout.height}`}
          aria-label="思维导图画布"
        >
          {layout.edges.map((edge) => (
            <path
              key={edge.id}
              d={`M ${edge.x1} ${edge.y1} C ${(edge.x1 + edge.x2) / 2} ${edge.y1}, ${(edge.x1 + edge.x2) / 2} ${edge.y2}, ${edge.x2} ${edge.y2}`}
              className="mindmap-edge"
            />
          ))}
        </svg>
        <div className="mindmap-node-layer" style={{ width: layout.width, height: layout.height }}>
          {layout.nodes.map((node) => (
            <div
              key={node.id}
              className={node.id === selectedNodeId ? 'mindmap-node-card mindmap-node-card-selected' : 'mindmap-node-card'}
              style={{ left: `${node.x}px`, top: `${node.y}px` }}
              onMouseDown={() => setSelectedNodeId(node.id)}
            >
              <input
                aria-label={`节点 ${node.id}`}
                value={node.text}
                onChange={(event) => onRenameNode(node.id, event.target.value)}
                onFocus={() => setSelectedNodeId(node.id)}
                onKeyDown={(event) => {
                  if (event.nativeEvent.isComposing) {
                    return
                  }
                  if (event.key === 'Enter') {
                    event.preventDefault()
                    onAddSiblingNode(node.id)
                  }
                  if (event.key === 'Tab') {
                    event.preventDefault()
                    onAddChildNode(node.id)
                  }
                  if (event.key === 'Delete') {
                    event.preventDefault()
                    onDeleteNode(node.id)
                  }
                }}
              />
              <div className="mindmap-node-actions">
                <button type="button" onClick={() => onAddChildNode(node.id)}>子级</button>
                <button type="button" onClick={() => onAddSiblingNode(node.id)}>同级</button>
                {node.id !== mindmap.rootNodeId ? (
                  <button type="button" onClick={() => onToggleNodeCollapsed(node.id)}>
                    {node.collapsed ? '展开' : '折叠'}
                  </button>
                ) : null}
                {node.id !== mindmap.rootNodeId ? (
                  <button type="button" onClick={() => onDeleteNode(node.id)}>删除</button>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
```

- [ ] **Step 4: Wire callbacks in `src/app/App.tsx`**

Add props to `AppRoutesProps`, `AppRoutes`, and `MindmapRouteProps`:

```ts
  onToggleMindmapNodeCollapsed: (mindmapId: string, nodeId: string) => Promise<void>
  onSetMindmapLayoutMode: (mindmapId: string, layoutMode: MindmapLayoutMode) => Promise<void>
```

Pass store methods from `App`:

```tsx
      onToggleMindmapNodeCollapsed={(mindmapId, nodeId) =>
        store.getState().toggleMindmapNodeCollapsed(mindmapId, nodeId)
      }
      onSetMindmapLayoutMode={(mindmapId, layoutMode) =>
        store.getState().setMindmapLayoutMode(mindmapId, layoutMode)
      }
```

Pass to `MindmapCanvas`:

```tsx
          onToggleNodeCollapsed={(nodeId) => {
            void onToggleMindmapNodeCollapsed(mindmap.id, nodeId)
          }}
          onChangeLayoutMode={(layoutMode) => {
            void onSetMindmapLayoutMode(mindmap.id, layoutMode)
          }}
```

- [ ] **Step 5: Run canvas and app tests**

```powershell
npm test -- src/components/mindmap/MindmapCanvas.test.tsx src/app/App.test.tsx
```

Expected: PASS after updating any existing tests that instantiate `MindmapCanvas` with the old prop set.

- [ ] **Step 6: Commit**

```powershell
git add -- src/components/mindmap/MindmapCanvas.tsx src/components/mindmap/MindmapCanvas.test.tsx src/app/App.tsx src/app/App.test.tsx
git commit -m "feat: add mindmap canvas interactions"
```

---

### Task 4: Preview, Chinese Copy, And Visual Polish

**Files:**
- Modify: `src/components/mindmap/mindmapPreview.ts`
- Modify: `src/components/editor/SlashMenu.tsx`
- Modify: `src/styles/index.css`
- Test: `src/components/mindmap/mindmapPreview.test.ts`

- [ ] **Step 1: Add preview tests for layout-specific output**

Create or update `src/components/mindmap/mindmapPreview.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { createEmptyMindmapRecord } from './mindmapModel'
import { buildMindmapPreviewSvgDataUrl } from './mindmapPreview'

describe('mindmapPreview', () => {
  it('includes the root text and layout mode in the generated preview', () => {
    const mindmap = createEmptyMindmapRecord('2026-06-20T00:00:00.000Z')
    const preview = decodeURIComponent(buildMindmapPreviewSvgDataUrl({ ...mindmap, layoutMode: 'outline' }))

    expect(preview).toContain('中心主题')
    expect(preview).toContain('data-layout="outline"')
  })
})
```

- [ ] **Step 2: Run preview test and confirm failure**

```powershell
npm test -- src/components/mindmap/mindmapPreview.test.ts
```

Expected: FAIL because preview SVG does not include `data-layout`.

- [ ] **Step 3: Update preview SVG**

In `src/components/mindmap/mindmapPreview.ts`, include the layout mode:

```ts
  const layoutMode = mindmap.layoutMode ?? 'balanced'

  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="320" height="180" viewBox="0 0 320 180" fill="none" data-layout="${layoutMode}">
      ...
    </svg>
  `.trim()
```

Keep the SVG compact; do not implement a second full layout algorithm here. The preview only needs to signal the content type and mode.

- [ ] **Step 4: Fix the slash menu copy**

Update `src/components/editor/SlashMenu.tsx`:

```ts
  {
    type: 'mindmap',
    label: '思维导图',
    description: '插入一个可点击进入的思维导图入口',
    icon: '◎',
    group: 'page_data',
  },
```

- [ ] **Step 5: Add Notion-like mindmap styles**

Append or replace the mindmap CSS block in `src/styles/index.css` with restrained styling:

```css
.mindmap-workspace {
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  gap: 10px;
  min-height: calc(100vh - 188px);
}

.mindmap-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 36px;
}

.mindmap-layout-switcher {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  padding: 3px;
  border: 1px solid #e8e6e3;
  border-radius: 8px;
  background: #ffffff;
}

.mindmap-toolbar-button,
.mindmap-toolbar-button-active {
  border: 0;
  min-height: 28px;
  padding: 0 10px;
  border-radius: 6px;
  background: transparent;
  color: #787774;
  font-size: 13px;
  cursor: pointer;
}

.mindmap-toolbar-button-active {
  background: #f1f1ef;
  color: #37352f;
  font-weight: 600;
}

.mindmap-canvas {
  position: relative;
  min-height: calc(100vh - 234px);
  overflow: auto;
  border: 1px solid #e8e6e3;
  border-radius: 8px;
  background:
    linear-gradient(#f7f6f3 1px, transparent 1px),
    linear-gradient(90deg, #f7f6f3 1px, transparent 1px),
    #ffffff;
  background-size: 24px 24px;
}

.mindmap-edge {
  fill: none;
  stroke: #c7c2ba;
  stroke-width: 2;
  stroke-linecap: round;
}

.mindmap-node-card {
  position: absolute;
  transform: translate(-50%, -50%);
  display: grid;
  gap: 8px;
  width: 168px;
  min-height: 72px;
  padding: 10px;
  border: 1px solid #e4e1dc;
  border-radius: 8px;
  background: #ffffff;
  box-shadow: 0 8px 22px rgba(15, 23, 42, 0.06);
}

.mindmap-node-card-selected {
  border-color: #2383e2;
  box-shadow: 0 0 0 2px rgba(35, 131, 226, 0.14), 0 8px 22px rgba(15, 23, 42, 0.06);
}
```

- [ ] **Step 6: Run focused tests**

```powershell
npm test -- src/components/mindmap/mindmapPreview.test.ts src/components/editor/BlockEditor.test.tsx
```

Expected: PASS.

- [ ] **Step 7: Commit**

```powershell
git add -- src/components/mindmap/mindmapPreview.ts src/components/mindmap/mindmapPreview.test.ts src/components/editor/SlashMenu.tsx src/styles/index.css
git commit -m "feat: polish mindmap entry and preview"
```

---

### Task 5: Persistence, Import Compatibility, And Backup Coverage

**Files:**
- Modify: `src/store/createWorkspaceStore.ts`
- Test: `src/store/createWorkspaceStore.test.ts`
- Test: `src/domain/markdown.test.ts` only if markdown export should mention mindmaps in this iteration.

- [ ] **Step 1: Add store tests for legacy mindmap normalization**

In `src/store/createWorkspaceStore.test.ts`, add a test that imports a workspace/mindmap without `layoutMode`:

```ts
it('normalizes imported mindmaps without layout mode', async () => {
  const repository = createMemoryWorkspaceRepository({
    boards: [],
    mindmaps: [
      {
        id: 'mindmap_legacy',
        title: '旧导图',
        rootNodeId: 'mindmap_node_root',
        nodes: {
          mindmap_node_root: {
            id: 'mindmap_node_root',
            parentId: null,
            text: '中心主题',
            order: 0,
          },
        },
        viewport: { x: 0, y: 0, zoom: 1 },
        createdAt: '2026-06-19T00:00:00.000Z',
        updatedAt: '2026-06-19T00:00:00.000Z',
      } as never,
    ],
    pages: [],
    settings: { lastOpenedPageId: null },
  })
  const store = createWorkspaceStore(repository)

  await store.getState().bootstrap()

  expect(store.getState().mindmaps[0].layoutMode).toBe('balanced')
})
```

Use the existing repository helper names from the test file; if the helper has a different name, adapt the test to the local helper rather than creating a new test harness.

- [ ] **Step 2: Run store tests and confirm behavior**

```powershell
npm test -- src/store/createWorkspaceStore.test.ts
```

Expected: PASS if Task 1 normalization was correctly wired; otherwise FAIL and fix `normalizeWorkspaceSnapshot`.

- [ ] **Step 3: Ensure backup includes mindmap layout mode**

In `src/store/createWorkspaceStore.test.ts`, add or update a backup/export assertion:

```ts
const backup = JSON.parse(store.getState().exportBackupJson())
expect(backup.mindmaps[0].layoutMode).toBe('balanced')
```

- [ ] **Step 4: Run store tests**

```powershell
npm test -- src/store/createWorkspaceStore.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add -- src/store/createWorkspaceStore.ts src/store/createWorkspaceStore.test.ts
git commit -m "test: cover mindmap persistence compatibility"
```

---

### Task 6: Browser Verification And Final Build

**Files:**
- No planned source edits unless verification finds bugs.

- [ ] **Step 1: Run all mindmap-focused tests**

```powershell
npm test -- src/components/mindmap/mindmapModel.test.ts src/components/mindmap/mindmapLayout.test.ts src/components/mindmap/MindmapCanvas.test.tsx src/components/mindmap/mindmapPreview.test.ts src/store/createWorkspaceStore.test.ts src/app/App.test.tsx
```

Expected: PASS.

- [ ] **Step 2: Run production build**

```powershell
npm run build
```

Expected: PASS with TypeScript and Vite build output.

- [ ] **Step 3: Start or reuse the dev server**

If no server is running on `56260`, run:

```powershell
npm run dev -- --host 127.0.0.1 --port 56260
```

Expected: app opens at `http://127.0.0.1:56260/`.

- [ ] **Step 4: Verify in browser**

Manual browser flow:

1. Open a document page.
2. Insert a block from slash menu: `思维导图`.
3. Confirm the page block shows a mindmap card with Chinese copy.
4. Click the card and enter the mindmap page.
5. Rename the mindmap title.
6. Edit the root node text.
7. Press `Tab` to create a child node.
8. Press `Enter` on the child node to create a sibling.
9. Switch among `左右导图`, `右侧导图`, and `大纲导图`.
10. Collapse and expand a branch.
11. Return to the page, reopen the card, and confirm content/layout state persisted.

- [ ] **Step 5: Fix only bugs found by verification**

If verification reveals a bug, write a focused failing test for that bug first, then fix the smallest relevant file. Do not refactor whiteboard or general editor code during this task.

- [ ] **Step 6: Commit verification fixes if any**

```powershell
git add -- <changed-files>
git commit -m "fix: stabilize mindmap mvp verification"
```

---

## Self-Review

- Spec coverage:
  - Independent `mindmap` asset storage is already in repo and covered by Task 1/5.
  - Three layout modes are covered by Task 2/3.
  - Keyboard editing is covered by Task 3.
  - Fold/unfold is covered by Task 1/3.
  - Chinese command menu copy is covered by Task 4.
  - Preview and backup compatibility are covered by Task 4/5.
  - Browser verification is covered by Task 6.
- Scope control:
  - No freeform drag positioning.
  - No whiteboard legacy iframe reuse.
  - No export PNG/SVG or outline import/export in MVP.
- Type consistency:
  - `MindmapLayoutMode` values are `balanced`, `right`, and `outline`.
  - Store methods are `setMindmapLayoutMode` and `toggleMindmapNodeCollapsed`.
  - Canvas props use `onChangeLayoutMode` and `onToggleNodeCollapsed`.
