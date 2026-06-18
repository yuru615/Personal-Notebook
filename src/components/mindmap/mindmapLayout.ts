import type { MindmapRecord } from '../../domain/types'

interface MindmapLayoutNode {
  id: string
  parentId: string | null
  text: string
  x: number
  y: number
}

export function buildMindmapLayout(mindmap: MindmapRecord): { nodes: MindmapLayoutNode[] } {
  const root = mindmap.nodes[mindmap.rootNodeId]
  const children = Object.values(mindmap.nodes)
    .filter((node) => node.parentId === mindmap.rootNodeId)
    .sort((a, b) => a.order - b.order)

  return {
    nodes: [
      {
        id: root.id,
        parentId: null,
        text: root.text,
        x: 420,
        y: 220,
      },
      ...children.map((node, index) => ({
        id: node.id,
        parentId: node.parentId,
        text: node.text,
        x: 620,
        y: 140 + index * 96,
      })),
    ],
  }
}
