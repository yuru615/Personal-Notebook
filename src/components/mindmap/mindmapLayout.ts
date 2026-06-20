import type { MindmapLayoutMode, MindmapNode, MindmapRecord } from '../../domain/types'

interface MindmapLayoutNode {
  id: string
  parentId: string | null
  text: string
  x: number
  y: number
  depth: number
  side?: 'left' | 'right'
}

interface MindmapLayoutEdge {
  id: string
  from: string
  to: string
}

interface MindmapLayout {
  nodes: MindmapLayoutNode[]
  edges: MindmapLayoutEdge[]
  root: MindmapLayoutNode
  width: number
  height: number
}

interface MindmapSubtreeLayout {
  height: number
  nodes: MindmapLayoutNode[]
}

const ROOT_X = 420
const ROOT_Y = 220
const RIGHT_SPACING_X = 200
const BALANCED_SPACING_X = 200
const OUTLINE_INDENT_X = 48
const NODE_SPACING_Y = 96
const BRANCH_GAP_Y = 36
const OUTLINE_ROW_HEIGHT = 72
const MIN_WIDTH = 960
const MIN_HEIGHT = 540
const LAYOUT_PADDING = 40
const NODE_HALF_WIDTH = 96
const NODE_HALF_HEIGHT = 56

export function buildMindmapLayout(mindmap: MindmapRecord): MindmapLayout {
  const root = mindmap.nodes[mindmap.rootNodeId] ?? createFallbackRootNode(mindmap.rootNodeId)
  const childrenByParentId = buildChildrenByParentId(mindmap.nodes)

  if (mindmap.layoutMode === 'outline') {
    return buildOutlineLayout(root, childrenByParentId)
  }

  if (mindmap.layoutMode === 'right') {
    return buildDirectionalLayout(root, childrenByParentId, 'right')
  }

  return buildBalancedLayout(root, childrenByParentId)
}

function buildChildrenByParentId(nodes: MindmapRecord['nodes']) {
  const childrenByParentId = new Map<string, MindmapNode[]>()

  Object.values(nodes).forEach((node) => {
    if (node.parentId === null) {
      return
    }

    const siblings = childrenByParentId.get(node.parentId) ?? []
    siblings.push(node)
    childrenByParentId.set(node.parentId, siblings)
  })

  childrenByParentId.forEach((siblings) => {
    siblings.sort((left, right) => left.order - right.order)
  })

  return childrenByParentId
}

function buildDirectionalLayout(
  root: MindmapNode,
  childrenByParentId: Map<string, MindmapNode[]>,
  side: Exclude<MindmapLayoutMode, 'outline' | 'balanced'>,
): MindmapLayout {
  const childLayouts = getVisibleChildren(root, childrenByParentId).map((child) =>
    layoutSubtree(child, childrenByParentId, 1, side, 0, RIGHT_SPACING_X),
  )
  const contentHeight = Math.max(measureStackHeight(childLayouts), NODE_SPACING_Y)
  const rootY = Math.max(ROOT_Y, contentHeight / 2)
  const rootLayoutNode = createLayoutNode(root, {
    x: ROOT_X,
    y: rootY,
    depth: 0,
  })
  const nodes = [
    rootLayoutNode,
    ...stackSubtreeLayouts(childLayouts, rootY).flatMap((layout) => layout.nodes),
  ]

  return createLayout(rootLayoutNode, nodes)
}

function buildBalancedLayout(root: MindmapNode, childrenByParentId: Map<string, MindmapNode[]>): MindmapLayout {
  const rootChildren = childrenByParentId.get(root.id) ?? []
  const leftLayouts: MindmapSubtreeLayout[] = []
  const rightLayouts: MindmapSubtreeLayout[] = []

  rootChildren.forEach((child, index) => {
    const side = child.side ?? (index % 2 === 0 ? 'left' : 'right')
    const subtreeLayout = layoutSubtree(
      child,
      childrenByParentId,
      1,
      side,
      0,
      BALANCED_SPACING_X,
    )

    if (side === 'left') {
      leftLayouts.push(subtreeLayout)
      return
    }

    rightLayouts.push(subtreeLayout)
  })

  const contentHeight = Math.max(
    measureStackHeight(leftLayouts),
    measureStackHeight(rightLayouts),
    NODE_SPACING_Y,
  )
  const rootY = Math.max(ROOT_Y, contentHeight / 2)
  const rootLayoutNode = createLayoutNode(root, {
    x: ROOT_X,
    y: rootY,
    depth: 0,
  })
  const nodes = [
    rootLayoutNode,
    ...stackSubtreeLayouts(leftLayouts, rootY).flatMap((layout) => layout.nodes),
    ...stackSubtreeLayouts(rightLayouts, rootY).flatMap((layout) => layout.nodes),
  ]

  return createLayout(rootLayoutNode, nodes)
}

function buildOutlineLayout(root: MindmapNode, childrenByParentId: Map<string, MindmapNode[]>): MindmapLayout {
  const rootLayoutNode = createLayoutNode(root, {
    x: 120,
    y: 80,
    depth: 0,
  })
  const nodes = [rootLayoutNode]
  let row = 1

  walkVisibleChildren(root.id, childrenByParentId, (node, depth) => {
    nodes.push(
      createLayoutNode(node, {
        x: 120 + depth * OUTLINE_INDENT_X,
        y: 80 + row * OUTLINE_ROW_HEIGHT,
        depth,
      }),
    )
    row += 1
  })

  return createLayout(rootLayoutNode, nodes)
}

function walkVisibleChildren(
  parentId: string,
  childrenByParentId: Map<string, MindmapNode[]>,
  visit: (node: MindmapNode, depth: number) => void,
  depth = 1,
) {
  const children = childrenByParentId.get(parentId) ?? []

  children.forEach((child) => {
    visit(child, depth)

    if (!child.collapsed) {
      walkVisibleChildren(child.id, childrenByParentId, visit, depth + 1)
    }
  })
}

function layoutSubtree(
  node: MindmapNode,
  childrenByParentId: Map<string, MindmapNode[]>,
  depth: number,
  side: 'left' | 'right',
  topY: number,
  spacingX: number,
): MindmapSubtreeLayout {
  const childLayouts = getVisibleChildren(node, childrenByParentId).map((child) =>
    layoutSubtree(child, childrenByParentId, depth + 1, side, 0, spacingX),
  )
  const height = Math.max(NODE_SPACING_Y, measureStackHeight(childLayouts))
  const centerY = topY + height / 2
  const direction = side === 'left' ? -1 : 1

  return {
    height,
    nodes: [
      createLayoutNode(node, {
        x: ROOT_X + direction * depth * spacingX,
        y: centerY,
        depth,
        side,
      }),
      ...stackSubtreeLayouts(childLayouts, centerY).flatMap((layout) => layout.nodes),
    ],
  }
}

function getVisibleChildren(
  parent: MindmapNode,
  childrenByParentId: Map<string, MindmapNode[]>,
) {
  if (parent.collapsed) {
    return []
  }

  return childrenByParentId.get(parent.id) ?? []
}

function measureStackHeight(layouts: MindmapSubtreeLayout[]) {
  if (layouts.length === 0) {
    return 0
  }

  return layouts.reduce((total, layout) => total + layout.height, 0) + BRANCH_GAP_Y * (layouts.length - 1)
}

function stackSubtreeLayouts(layouts: MindmapSubtreeLayout[], centerY: number) {
  const totalHeight = measureStackHeight(layouts)
  let cursorY = centerY - totalHeight / 2

  return layouts.map((layout) => {
    const offsetY = cursorY
    cursorY += layout.height + BRANCH_GAP_Y

    return {
      ...layout,
      nodes: layout.nodes.map((node) => ({
        ...node,
        y: node.y + offsetY,
      })),
    }
  })
}

function createLayoutNode(
  node: MindmapNode,
  position: { x: number; y: number; depth: number; side?: 'left' | 'right' },
): MindmapLayoutNode {
  return {
    id: node.id,
    parentId: node.parentId,
    text: node.text,
    x: position.x,
    y: position.y,
    depth: position.depth,
    side: position.side,
  }
}

function createLayout(root: MindmapLayoutNode, nodes: MindmapLayoutNode[]): MindmapLayout {
  const normalized = normalizeLayoutBounds(nodes)
  const normalizedRoot = normalized.nodes.find((node) => node.id === root.id) ?? normalized.nodes[0]

  return {
    nodes: normalized.nodes,
    edges: normalized.nodes
      .filter((node) => node.parentId !== null)
      .map((node) => ({
        id: `${node.parentId}-${node.id}`,
        from: node.parentId!,
        to: node.id,
      })),
    root: normalizedRoot,
    width: normalized.width,
    height: normalized.height,
  }
}

function createFallbackRootNode(rootNodeId: string): MindmapNode {
  return {
    id: rootNodeId,
    parentId: null,
    text: '',
    order: 0,
  }
}

function normalizeLayoutBounds(nodes: MindmapLayoutNode[]) {
  const minX = Math.min(...nodes.map((node) => node.x))
  const minY = Math.min(...nodes.map((node) => node.y))
  const minCenterX = NODE_HALF_WIDTH + LAYOUT_PADDING
  const minCenterY = NODE_HALF_HEIGHT + LAYOUT_PADDING
  const shiftX = minX < minCenterX ? minCenterX - minX : 0
  const shiftY = minY < minCenterY ? minCenterY - minY : 0
  const normalizedNodes = nodes.map((node) => ({
    ...node,
    x: node.x + shiftX,
    y: node.y + shiftY,
  }))
  const maxX = Math.max(...normalizedNodes.map((node) => node.x))
  const maxY = Math.max(...normalizedNodes.map((node) => node.y))

  return {
    nodes: normalizedNodes,
    width: Math.max(MIN_WIDTH, maxX + NODE_HALF_WIDTH + LAYOUT_PADDING),
    height: Math.max(MIN_HEIGHT, maxY + NODE_HALF_HEIGHT + LAYOUT_PADDING),
  }
}
