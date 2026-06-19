import { describe, expect, it } from 'vitest'
import type { MindmapRecord } from '../../domain/types'
import { buildMindmapLayout } from './mindmapLayout'
import { createEmptyMindmapRecord, addMindmapChildNode } from './mindmapModel'

describe('mindmapLayout', () => {
  it('places the root node and child nodes into a simple right-side tree', () => {
    const rootMindmap = createEmptyMindmapRecord('2026-06-18T00:00:00.000Z')
    const mindmap = {
      ...addMindmapChildNode(rootMindmap, rootMindmap.rootNodeId, '2026-06-18T00:05:00.000Z'),
      layoutMode: 'right' as const,
    }

    const layout = buildMindmapLayout(mindmap)

    expect(layout.nodes[0]).toMatchObject({
      id: mindmap.rootNodeId,
      x: 420,
      y: 220,
      parentId: null,
    })
    expect(layout.nodes[1]).toMatchObject({
      parentId: mindmap.rootNodeId,
      x: 620,
    })
  })

  it('balances root children across left and right sides', () => {
    const layout = buildMindmapLayout(
      createMindmap({
        layoutMode: 'balanced',
        nodes: [
          node('root', null, 0),
          node('left-child', 'root', 0),
          node('right-child', 'root', 1),
        ],
      }),
    )

    const root = findLayoutNode(layout, 'root')
    const leftChild = findLayoutNode(layout, 'left-child')
    const rightChild = findLayoutNode(layout, 'right-child')

    expect(leftChild.x).toBeLessThan(root.x)
    expect(rightChild.x).toBeGreaterThan(root.x)
  })

  it('places right layout descendants to the right of their parent', () => {
    const layout = buildMindmapLayout(
      createMindmap({
        layoutMode: 'right',
        nodes: [
          node('root', null, 0),
          node('child', 'root', 0),
          node('grandchild', 'child', 0),
        ],
      }),
    )

    const root = findLayoutNode(layout, 'root')
    const child = findLayoutNode(layout, 'child')
    const grandchild = findLayoutNode(layout, 'grandchild')

    expect(child.x).toBeGreaterThan(root.x)
    expect(grandchild.x).toBeGreaterThan(child.x)
  })

  it('places outline descendants below the root and indents by depth', () => {
    const layout = buildMindmapLayout(
      createMindmap({
        layoutMode: 'outline',
        nodes: [
          node('root', null, 0),
          node('child', 'root', 0),
          node('grandchild', 'child', 0),
        ],
      }),
    )

    const root = findLayoutNode(layout, 'root')
    const child = findLayoutNode(layout, 'child')
    const grandchild = findLayoutNode(layout, 'grandchild')

    expect(child.y).toBeGreaterThan(root.y)
    expect(grandchild.y).toBeGreaterThan(child.y)
    expect(child.x).toBeGreaterThan(root.x)
    expect(grandchild.x).toBeGreaterThan(child.x)
  })

  it('omits descendants of collapsed nodes from layout', () => {
    const layout = buildMindmapLayout(
      createMindmap({
        layoutMode: 'right',
        nodes: [
          node('root', null, 0),
          node('collapsed-child', 'root', 0, { collapsed: true }),
          node('hidden-grandchild', 'collapsed-child', 0),
          node('visible-child', 'root', 1),
        ],
      }),
    )

    expect(layout.nodes.map((layoutNode) => layoutNode.id)).toEqual([
      'root',
      'collapsed-child',
      'visible-child',
    ])
  })

  it('returns a fallback root layout when the root node is missing', () => {
    const layout = buildMindmapLayout(
      createMindmap({
        layoutMode: 'right',
        nodes: [],
      }),
    )

    expect(layout.root).toMatchObject({
      id: 'root',
      parentId: null,
      text: '',
    })
    expect(layout.nodes).toEqual([layout.root])
    expect(layout.edges).toEqual([])
  })

  it('keeps balanced left-side deep descendants in positive bounds', () => {
    const layout = buildMindmapLayout(
      createMindmap({
        layoutMode: 'balanced',
        nodes: [
          node('root', null, 0),
          node('left-child', 'root', 0, { side: 'left' }),
          node('left-grandchild', 'left-child', 0),
          node('left-great-grandchild', 'left-grandchild', 0),
        ],
      }),
    )

    const deepestLeftNode = findLayoutNode(layout, 'left-great-grandchild')

    expect(layout.nodes.every((layoutNode) => layoutNode.x > 0)).toBe(true)
    expect(deepestLeftNode.x).toBeGreaterThan(96)
    expect(layout.width).toBeGreaterThan(deepestLeftNode.x + 96)
  })

  it('expands right-side bounds to include node card width', () => {
    const layout = buildMindmapLayout(
      createMindmap({
        layoutMode: 'right',
        nodes: [
          node('root', null, 0),
          node('child', 'root', 0),
          node('grandchild', 'child', 0),
          node('great-grandchild', 'grandchild', 0),
        ],
      }),
    )

    const deepestRightNode = findLayoutNode(layout, 'great-grandchild')

    expect(layout.width).toBeGreaterThan(deepestRightNode.x + 96)
  })

  it('keeps balanced descendants on their explicit root child side', () => {
    const layout = buildMindmapLayout(
      createMindmap({
        layoutMode: 'balanced',
        nodes: [
          node('root', null, 0),
          node('left-child', 'root', 0, { side: 'left' }),
          node('left-grandchild', 'left-child', 0),
          node('right-child', 'root', 1, { side: 'right' }),
          node('right-grandchild', 'right-child', 0),
        ],
      }),
    )

    const root = findLayoutNode(layout, 'root')
    const leftChild = findLayoutNode(layout, 'left-child')
    const leftGrandchild = findLayoutNode(layout, 'left-grandchild')
    const rightChild = findLayoutNode(layout, 'right-child')
    const rightGrandchild = findLayoutNode(layout, 'right-grandchild')

    expect(leftChild.side).toBe('left')
    expect(leftGrandchild.side).toBe('left')
    expect(leftGrandchild.x).toBeLessThan(leftChild.x)
    expect(leftChild.x).toBeLessThan(root.x)
    expect(rightChild.side).toBe('right')
    expect(rightGrandchild.side).toBe('right')
    expect(rightGrandchild.x).toBeGreaterThan(rightChild.x)
    expect(rightChild.x).toBeGreaterThan(root.x)
  })

  it('omits balanced descendants of collapsed nodes from layout', () => {
    const layout = buildMindmapLayout(
      createMindmap({
        layoutMode: 'balanced',
        nodes: [
          node('root', null, 0),
          node('left-child', 'root', 0, { collapsed: true, side: 'left' }),
          node('hidden-grandchild', 'left-child', 0),
          node('right-child', 'root', 1, { side: 'right' }),
        ],
      }),
    )

    expect(layout.nodes.map((layoutNode) => layoutNode.id)).toEqual([
      'root',
      'left-child',
      'right-child',
    ])
  })

  it('creates visible parent-child edges only', () => {
    const layout = buildMindmapLayout(
      createMindmap({
        layoutMode: 'right',
        nodes: [
          node('root', null, 0),
          node('collapsed-child', 'root', 0, { collapsed: true }),
          node('hidden-grandchild', 'collapsed-child', 0),
          node('visible-child', 'root', 1),
          node('visible-grandchild', 'visible-child', 0),
        ],
      }),
    )

    expect(layout.edges).toEqual([
      { id: 'root-collapsed-child', from: 'root', to: 'collapsed-child' },
      { id: 'root-visible-child', from: 'root', to: 'visible-child' },
      { id: 'visible-child-visible-grandchild', from: 'visible-child', to: 'visible-grandchild' },
    ])
  })
})

type MindmapLayoutResult = ReturnType<typeof buildMindmapLayout>
type MindmapNodeInput = MindmapRecord['nodes'][string]

function node(
  id: string,
  parentId: string | null,
  order: number,
  overrides: Partial<MindmapNodeInput> = {},
): MindmapNodeInput {
  return {
    id,
    parentId,
    text: id,
    order,
    ...overrides,
  }
}

function createMindmap({
  layoutMode,
  nodes,
}: {
  layoutMode: MindmapRecord['layoutMode']
  nodes: MindmapNodeInput[]
}): MindmapRecord {
  return {
    id: 'mindmap',
    title: 'Mindmap',
    rootNodeId: 'root',
    layoutMode,
    nodes: Object.fromEntries(nodes.map((item) => [item.id, item])),
    viewport: {
      x: 0,
      y: 0,
      zoom: 1,
    },
    createdAt: '2026-06-18T00:00:00.000Z',
    updatedAt: '2026-06-18T00:00:00.000Z',
  }
}

function findLayoutNode(layout: MindmapLayoutResult, id: string) {
  const layoutNode = layout.nodes.find((item) => item.id === id)

  expect(layoutNode).toBeDefined()

  return layoutNode!
}
