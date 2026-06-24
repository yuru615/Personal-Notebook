import { describe, expect, it } from 'vitest'
import {
  DEFAULT_MINDMAP_TITLE,
  MINDMAP_STORAGE_KEY,
  createEmptyMindmapSnapshot,
  extractMindmapTitle,
} from './mindmapModel'

describe('mindmapModel', () => {
  it('exports the storage key', () => {
    expect(MINDMAP_STORAGE_KEY).toBe('mindmap-web.document.v1')
  })

  it('creates the default empty snapshot', () => {
    const snapshot = createEmptyMindmapSnapshot()

    expect(snapshot).toMatchObject({
      id: 'doc-root',
      title: DEFAULT_MINDMAP_TITLE,
      structure: 'mindmap',
      rootId: 'node-root',
      viewport: { x: 0, y: 0, scale: 1 },
      nodes: {
        'node-root': {
          id: 'node-root',
          parentId: null,
          childIds: [],
          text: '中心主题',
          collapsed: false,
        },
      },
    })
    expect(typeof snapshot.updatedAt).toBe('string')
  })

  it('returns a valid title from a snapshot', () => {
    expect(extractMindmapTitle({ title: '产品规划' })).toBe('产品规划')
  })

  it('falls back to the default title for blank or null titles', () => {
    expect(extractMindmapTitle({ title: '   ' })).toBe(DEFAULT_MINDMAP_TITLE)
    expect(extractMindmapTitle({ title: null })).toBe(DEFAULT_MINDMAP_TITLE)
  })
})
