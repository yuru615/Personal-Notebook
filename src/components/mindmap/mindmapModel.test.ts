import { describe, expect, it } from 'vitest'
import {
  DEFAULT_MINDMAP_TITLE,
  MINDMAP_THEME_IDS,
  MINDMAP_STORAGE_KEY,
  createEmptyMindmapSnapshot,
  extractMindmapTitle,
  pickRandomMindmapTheme,
  prepareMindmapSnapshotForHost,
} from './mindmapModel'

describe('mindmapModel', () => {
  it('exports the storage key', () => {
    expect(MINDMAP_STORAGE_KEY).toBe('mindmap-web.document.v1')
  })

  it('creates the default empty snapshot', () => {
    const snapshot = createEmptyMindmapSnapshot({ themeId: 'classic' })

    expect(snapshot).toMatchObject({
      id: 'doc-root',
      title: DEFAULT_MINDMAP_TITLE,
      structure: 'mindmap',
      themeId: 'classic',
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

  it('picks a built-in theme from the random seed', () => {
    expect(pickRandomMindmapTheme(() => 0)).toBe('classic')
    expect(pickRandomMindmapTheme(() => 0.26)).toBe('mint')
    expect(pickRandomMindmapTheme(() => 0.74)).toBe('dusk')
    expect(pickRandomMindmapTheme(() => 0.99)).toBe('sunset')
  })

  it('creates mindmaps with one of the supported themes', () => {
    const snapshot = createEmptyMindmapSnapshot()

    expect(MINDMAP_THEME_IDS).toContain(snapshot.themeId)
  })

  it('centers a pristine snapshot for the hosted iframe viewport', () => {
    const snapshot = createEmptyMindmapSnapshot({ themeId: 'mint' })
    const centered = prepareMindmapSnapshotForHost(snapshot, { width: 1200, height: 800 }) as {
      viewport: { x: number; y: number; scale: number }
    }

    expect(centered.viewport).toEqual({
      x: 426,
      y: 258,
      scale: 1,
    })
  })

  it('returns a valid title from a snapshot', () => {
    expect(extractMindmapTitle({ title: '产品规划' })).toBe('产品规划')
  })

  it('falls back to the default title for blank or null titles', () => {
    expect(extractMindmapTitle({ title: '   ' })).toBe(DEFAULT_MINDMAP_TITLE)
    expect(extractMindmapTitle({ title: null })).toBe(DEFAULT_MINDMAP_TITLE)
  })
})
