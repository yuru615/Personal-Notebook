import { describe, expect, it } from 'vitest'
import { createEmptyMindmapSnapshot, normalizeMindmapSnapshot } from './mindmapModel'

describe('mindmapModel', () => {
  it('creates an empty mindmap snapshot', () => {
    expect(createEmptyMindmapSnapshot()).toMatchObject({
      camera: { x: 0, y: 0, scale: 1 },
      color: '#17202a',
      lineMode: 'straight',
      shapes: [],
      strokes: [],
      connections: [],
      notes: [],
      texts: [],
      images: [],
    })
  })

  it('normalizes unknown values to an empty mindmap snapshot', () => {
    expect(normalizeMindmapSnapshot(null)).toEqual(createEmptyMindmapSnapshot())
  })
})
