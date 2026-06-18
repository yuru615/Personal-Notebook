import type { MindmapRecord } from '../../domain/types'
import { createId } from '../../utils/id'

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
        text: '新节点',
        order: siblingCount,
      },
    },
    updatedAt: now,
  }
}
