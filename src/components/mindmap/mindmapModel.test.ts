import { describe, expect, it } from 'vitest'
import {
  addMindmapChildNode,
  addMindmapSiblingNode,
  createEmptyMindmapRecord,
  deleteMindmapNode,
  renameMindmap,
  renameMindmapNode,
} from './mindmapModel'

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

  it('renames the mindmap title with a fallback value', () => {
    const mindmap = createEmptyMindmapRecord('2026-06-18T00:00:00.000Z')

    const next = renameMindmap(mindmap, '  ', '2026-06-18T00:10:00.000Z')

    expect(next.title).toBe('未命名思维导图')
  })

  it('renames a node without touching other nodes', () => {
    const mindmap = createEmptyMindmapRecord('2026-06-18T00:00:00.000Z')

    const next = renameMindmapNode(
      mindmap,
      mindmap.rootNodeId,
      '产品研究',
      '2026-06-18T00:10:00.000Z',
    )

    expect(next.nodes[mindmap.rootNodeId]).toMatchObject({
      id: mindmap.rootNodeId,
      text: '产品研究',
    })
  })

  it('adds a sibling node next to a non-root node', () => {
    const base = createEmptyMindmapRecord('2026-06-18T00:00:00.000Z')
    const mindmap = addMindmapChildNode(base, base.rootNodeId, '2026-06-18T00:05:00.000Z')
    const childNode = Object.values(mindmap.nodes).find((node) => node.parentId === mindmap.rootNodeId)

    if (!childNode) {
      throw new Error('Expected child node')
    }

    const next = addMindmapSiblingNode(mindmap, childNode.id, '2026-06-18T00:10:00.000Z')
    const siblings = Object.values(next.nodes)
      .filter((node) => node.parentId === mindmap.rootNodeId)
      .sort((left, right) => left.order - right.order)

    expect(siblings).toHaveLength(2)
    expect(siblings[1]).toMatchObject({
      text: '新节点',
      order: 1,
    })
  })

  it('deletes a non-root node and its descendants', () => {
    const base = createEmptyMindmapRecord('2026-06-18T00:00:00.000Z')
    const withChild = addMindmapChildNode(base, base.rootNodeId, '2026-06-18T00:05:00.000Z')
    const childNode = Object.values(withChild.nodes).find((node) => node.parentId === withChild.rootNodeId)

    if (!childNode) {
      throw new Error('Expected child node')
    }

    const withGrandchild = addMindmapChildNode(withChild, childNode.id, '2026-06-18T00:08:00.000Z')
    const next = deleteMindmapNode(withGrandchild, childNode.id, '2026-06-18T00:10:00.000Z')

    expect(Object.keys(next.nodes)).toEqual([base.rootNodeId])
  })
})
