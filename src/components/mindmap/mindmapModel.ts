import type { MindmapNode, MindmapRecord } from '../../domain/types'
import { createId } from '../../utils/id'

const UNTITLED_MINDMAP_TITLE = '未命名思维导图'
const DEFAULT_ROOT_NODE_TEXT = '中心主题'
const DEFAULT_CHILD_NODE_TEXT = '新节点'

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
    viewport: {
      x: 0,
      y: 0,
      zoom: 1,
    },
    createdAt: now,
    updatedAt: now,
  }
}

export function addMindmapChildNode(
  mindmap: MindmapRecord,
  parentId: string,
  now = new Date().toISOString(),
): MindmapRecord {
  const siblingCount = Object.values(mindmap.nodes).filter((node) => node.parentId === parentId).length
  const nodeId = createId('mindmap_node')

  return {
    ...mindmap,
    nodes: {
      ...mindmap.nodes,
      [nodeId]: {
        id: nodeId,
        parentId,
        text: DEFAULT_CHILD_NODE_TEXT,
        order: siblingCount,
      },
    },
    updatedAt: now,
  }
}

export function renameMindmap(
  mindmap: MindmapRecord,
  title: string,
  now = new Date().toISOString(),
): MindmapRecord {
  return {
    ...mindmap,
    title: title.trim() || UNTITLED_MINDMAP_TITLE,
    updatedAt: now,
  }
}

export function renameMindmapNode(
  mindmap: MindmapRecord,
  nodeId: string,
  text: string,
  now = new Date().toISOString(),
): MindmapRecord {
  const node = mindmap.nodes[nodeId]

  if (!node) {
    return mindmap
  }

  return {
    ...mindmap,
    nodes: {
      ...mindmap.nodes,
      [nodeId]: {
        ...node,
        text,
      },
    },
    updatedAt: now,
  }
}

export function addMindmapSiblingNode(
  mindmap: MindmapRecord,
  nodeId: string,
  now = new Date().toISOString(),
): MindmapRecord {
  const node = mindmap.nodes[nodeId]

  if (!node || node.parentId === null) {
    return mindmap
  }

  return addMindmapChildNode(mindmap, node.parentId, now)
}

export function deleteMindmapNode(
  mindmap: MindmapRecord,
  nodeId: string,
  now = new Date().toISOString(),
): MindmapRecord {
  if (nodeId === mindmap.rootNodeId || !mindmap.nodes[nodeId]) {
    return mindmap
  }

  const removedNodeIds = collectDescendantNodeIds(mindmap.nodes, nodeId)
  const nextNodes = Object.fromEntries(
    Object.entries(mindmap.nodes).filter(([id]) => !removedNodeIds.has(id)),
  )

  reindexMindmapSiblings(nextNodes)

  return {
    ...mindmap,
    nodes: nextNodes,
    updatedAt: now,
  }
}

function collectDescendantNodeIds(nodes: Record<string, MindmapNode>, rootId: string) {
  const removedNodeIds = new Set<string>()
  const queue = [rootId]

  while (queue.length > 0) {
    const currentId = queue.shift()

    if (!currentId || removedNodeIds.has(currentId)) {
      continue
    }

    removedNodeIds.add(currentId)

    Object.values(nodes).forEach((node) => {
      if (node.parentId === currentId) {
        queue.push(node.id)
      }
    })
  }

  return removedNodeIds
}

function reindexMindmapSiblings(nodes: Record<string, MindmapNode>) {
  const parentIds = new Set(
    Object.values(nodes)
      .map((node) => node.parentId)
      .filter((parentId): parentId is string => parentId !== null),
  )

  parentIds.forEach((parentId) => {
    const siblings = Object.values(nodes)
      .filter((node) => node.parentId === parentId)
      .sort((left, right) => left.order - right.order)

    siblings.forEach((node, index) => {
      nodes[node.id] = {
        ...nodes[node.id],
        order: index,
      }
    })
  })
}
