import { describe, expect, it } from 'vitest'
import { buildMindmapPreviewSvgDataUrl, summarizeMindmapSnapshot } from './mindmapPreview'
import type { MindmapSnapshot } from './mindmapModel'

const snapshot: MindmapSnapshot = {
  camera: {
    x: 0,
    y: 0,
    scale: 1,
  },
  color: '#17202a',
  strokeSize: 6,
  textFontFamily: 'Inter, Segoe UI, sans-serif',
  textFontSize: 24,
  lineMode: 'straight',
  shapeType: 'rect',
  shapes: [
    {
      id: 'shape-1',
      type: 'rect',
      x: 300,
      y: 36,
      w: 180,
      h: 120,
      color: '#3b82f6',
      size: 3,
      text: '',
      z: 2,
    },
  ],
  strokes: [],
  connections: [],
  notes: [
    {
      id: 'note-1',
      x: 24,
      y: 20,
      w: 220,
      h: 150,
      text: '娴佺▼',
      color: '#ffe681',
      z: 1,
    },
  ],
  texts: [
    {
      id: 'text-1',
      x: 54,
      y: 62,
      w: 160,
      h: 48,
      text: '璇存槑',
      color: '#17202a',
      fontFamily: 'Inter, Segoe UI, sans-serif',
      fontSize: 24,
      fontWeight: '400',
      fontStyle: 'normal',
      autoSize: true,
      z: 3,
    },
  ],
  images: [],
}

describe('mindmapPreview', () => {
  it('summarizes snapshot content', () => {
    expect(summarizeMindmapSnapshot(snapshot)).toEqual({
      elementCount: 3,
      isEmpty: false,
    })
  })

  it('builds an svg preview data url for non-empty legacy boards', () => {
    const preview = buildMindmapPreviewSvgDataUrl(snapshot)

    expect(preview?.startsWith('data:image/svg+xml;charset=utf-8,')).toBe(true)
    expect(decodeURIComponent(preview ?? '')).toContain('<svg')
    expect(decodeURIComponent(preview ?? '')).toContain('娴佺▼')
  })

  it('returns null for empty boards', () => {
    expect(buildMindmapPreviewSvgDataUrl(createEmptySnapshot())).toBeNull()
  })
})

function createEmptySnapshot(): MindmapSnapshot {
  return {
    camera: {
      x: 0,
      y: 0,
      scale: 1,
    },
    color: '#17202a',
    strokeSize: 6,
    textFontFamily: 'Inter, Segoe UI, sans-serif',
    textFontSize: 24,
    lineMode: 'straight',
    shapeType: 'rect',
    shapes: [],
    strokes: [],
    connections: [],
    notes: [],
    texts: [],
    images: [],
  }
}
