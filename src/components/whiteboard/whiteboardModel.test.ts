import { describe, expect, it } from 'vitest'
import {
  createEmptyBoardSnapshot,
  isWhiteboardSnapshot,
  type WhiteboardSnapshot,
} from './whiteboardModel'

describe('whiteboardModel', () => {
  it('creates an empty legacy whiteboard snapshot', () => {
    expect(createEmptyBoardSnapshot()).toEqual({
      camera: {
        x: 0,
        y: 0,
        scale: 1,
      },
      color: '#17202a',
      strokeSize: 6,
      textFontFamily: 'Inter, Segoe UI, sans-serif',
      textFontSize: 24,
      lineMode: 'curve',
      lineStartMarker: 'none',
      lineEndMarker: 'none',
      shapeType: 'rect',
      shapes: [],
      strokes: [],
      connections: [],
      notes: [],
      texts: [],
      images: [],
    })
  })

  it('recognizes a valid legacy whiteboard snapshot', () => {
    const snapshot: WhiteboardSnapshot = {
      ...createEmptyBoardSnapshot(),
      notes: [
        {
          id: 'note-1',
          x: 24,
          y: 32,
          w: 220,
          h: 140,
          text: '便签',
          color: '#ffe681',
          z: 1,
        },
      ],
      connections: [
        {
          id: 'connection-1',
          from: 'note-1',
          to: 'text-1',
          fromSide: 'e',
          fromMarker: 'diamond',
          toMarker: 'bar',
          mode: 'straight',
          color: '#17202a',
          size: 3,
        },
      ],
      texts: [
        {
          id: 'text-1',
          x: 340,
          y: 54,
          w: 160,
          h: 48,
          text: '说明',
          color: '#17202a',
          fontFamily: 'Inter, Segoe UI, sans-serif',
          fontSize: 24,
          fontWeight: '400',
          fontStyle: 'normal',
          autoSize: true,
          z: 2,
        },
      ],
    }

    expect(isWhiteboardSnapshot(snapshot)).toBe(true)
  })

  it('rejects malformed snapshots', () => {
    expect(isWhiteboardSnapshot(null)).toBe(false)
    expect(isWhiteboardSnapshot({})).toBe(false)
    expect(
      isWhiteboardSnapshot({
        camera: { x: 0, y: 0, scale: 1 },
        notes: [],
      }),
    ).toBe(false)
  })
})
