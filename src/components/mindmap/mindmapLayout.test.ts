import { describe, expect, it } from 'vitest'
import { buildMindmapLayout } from './mindmapLayout'
import { createEmptyMindmapRecord, addMindmapChildNode } from './mindmapModel'

describe('mindmapLayout', () => {
  it('places the root node and child nodes into a simple right-side tree', () => {
    const rootMindmap = createEmptyMindmapRecord('2026-06-18T00:00:00.000Z')
    const mindmap = addMindmapChildNode(rootMindmap, rootMindmap.rootNodeId, '2026-06-18T00:05:00.000Z')

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
})
