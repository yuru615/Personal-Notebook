import { describe, expect, it } from 'vitest'
import { addMindmapChildNode, createEmptyMindmapRecord } from './mindmapModel'

describe('mindmapModel', () => {
  it('creates an empty mindmap with a single root node', () => {
    const mindmap = createEmptyMindmapRecord('2026-06-18T00:00:00.000Z')

    expect(Object.keys(mindmap.nodes)).toHaveLength(1)
    expect(mindmap.nodes[mindmap.rootNodeId]).toMatchObject({
      parentId: null,
      text: '中心主题',
      order: 0,
    })
  })

  it('adds a child node to the requested parent', () => {
    const mindmap = createEmptyMindmapRecord('2026-06-18T00:00:00.000Z')
    const next = addMindmapChildNode(mindmap, mindmap.rootNodeId, '2026-06-18T00:10:00.000Z')

    expect(Object.keys(next.nodes)).toHaveLength(2)
    expect(
      Object.values(next.nodes).find((node) => node.parentId === mindmap.rootNodeId),
    ).toMatchObject({
      text: '新节点',
      order: 0,
    })
  })
})
