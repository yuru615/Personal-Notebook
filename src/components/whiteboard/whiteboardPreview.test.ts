import { describe, expect, it } from 'vitest'
import { buildWhiteboardPreviewSvgDataUrl, summarizeWhiteboardSnapshot } from './whiteboardPreview'
import type { WhiteboardSnapshot } from './whiteboardModel'

const snapshot: WhiteboardSnapshot = {
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
      text: '流程',
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
      text: '说明',
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

describe('whiteboardPreview', () => {
  it('summarizes snapshot content', () => {
    expect(summarizeWhiteboardSnapshot(snapshot)).toEqual({
      elementCount: 3,
      isEmpty: false,
    })
  })

  it('builds an svg preview data url for non-empty legacy boards', () => {
    const preview = buildWhiteboardPreviewSvgDataUrl(snapshot)

    expect(preview?.startsWith('data:image/svg+xml;charset=utf-8,')).toBe(true)
    expect(decodeURIComponent(preview ?? '')).toContain('<svg')
    expect(decodeURIComponent(preview ?? '')).toContain('流程')
  })

  it('returns null for empty boards', () => {
    expect(buildWhiteboardPreviewSvgDataUrl(createEmptySnapshot())).toBeNull()
  })
})

function createEmptySnapshot(): WhiteboardSnapshot {
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
