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

const ROOT_X = 420
const ROOT_Y = 220
const RIGHT_SPACING_X = 200
const BALANCED_SPACING_X = 200
const OUTLINE_INDENT_X = 48
const NODE_SPACING_Y = 96
const OUTLINE_ROW_HEIGHT = 72
const MIN_WIDTH = 960
const MIN_HEIGHT = 540

export function buildMindmapLayout(mindmap: MindmapRecord): MindmapLayout {
  const root = mindmap.nodes[mindmap.rootNodeId]
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
  mode: Exclude<MindmapLayoutMode, 'outline' | 'balanced'>,
): MindmapLayout {
  const rootLayoutNode = createLayoutNode(root, {
    x: ROOT_X,
    y: ROOT_Y,
    depth: 0,
  })
  const nodes = [rootLayoutNode]
  let visibleNodeIndex = 0

  walkVisibleChildren(root.id, childrenByParentId, (node, depth) => {
    nodes.push(
      createLayoutNode(node, {
        x: ROOT_X + depth * RIGHT_SPACING_X,
        y: 140 + visibleNodeIndex * NODE_SPACING_Y,
        depth,
        side: mode,
      }),
    )
    visibleNodeIndex += 1
  })

  return createLayout(rootLayoutNode, nodes)
}

function buildBalancedLayout(root: MindmapNode, childrenByParentId: Map<string, MindmapNode[]>): MindmapLayout {
  const rootLayoutNode = createLayoutNode(root, {
    x: ROOT_X,
    y: ROOT_Y,
    depth: 0,
  })
  const nodes = [rootLayoutNode]
  const rootChildren = childrenByParentId.get(root.id) ?? []
  const leftNodes: Array<{ node: MindmapNode; depth: number }> = []
  const rightNodes: Array<{ node: MindmapNode; depth: number }> = []

  rootChildren.forEach((child, index) => {
    const side = child.side ?? (index % 2 === 0 ? 'left' : 'right')
    const bucket = side === 'left' ? leftNodes : rightNodes
    bucket.push({ node: child, depth: 1 })
    collectVisibleDescendants(child, childrenByParentId, 2, bucket)
  })

  appendBalancedSideNodes(nodes, leftNodes, 'left')
  appendBalancedSideNodes(nodes, rightNodes, 'right')

  return createLayout(rootLayoutNode, nodes)
}

function appendBalancedSideNodes(
  nodes: MindmapLayoutNode[],
  sideNodes: Array<{ node: MindmapNode; depth: number }>,
  side: 'left' | 'right',
) {
  const topY = ROOT_Y - ((sideNodes.length - 1) * NODE_SPACING_Y) / 2
  const direction = side === 'left' ? -1 : 1

  sideNodes.forEach(({ node, depth }, index) => {
    nodes.push(
      createLayoutNode(node, {
        x: ROOT_X + direction * depth * BALANCED_SPACING_X,
        y: topY + index * NODE_SPACING_Y,
        depth,
        side,
      }),
    )
  })
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

function collectVisibleDescendants(
  parent: MindmapNode,
  childrenByParentId: Map<string, MindmapNode[]>,
  depth: number,
  result: Array<{ node: MindmapNode; depth: number }>,
) {
  if (parent.collapsed) {
    return
  }

  const children = childrenByParentId.get(parent.id) ?? []

  children.forEach((child) => {
    result.push({ node: child, depth })
    collectVisibleDescendants(child, childrenByParentId, depth + 1, result)
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
  return {
    nodes,
    edges: nodes
      .filter((node) => node.parentId !== null)
      .map((node) => ({
        id: `${node.parentId}-${node.id}`,
        from: node.parentId!,
        to: node.id,
      })),
    root,
    width: Math.max(MIN_WIDTH, Math.max(...nodes.map((node) => node.x)) + RIGHT_SPACING_X),
    height: Math.max(MIN_HEIGHT, Math.max(...nodes.map((node) => node.y)) + NODE_SPACING_Y),
  }
}
