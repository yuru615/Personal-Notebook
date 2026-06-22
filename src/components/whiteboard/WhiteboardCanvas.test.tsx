import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { BoardRecord } from '../../domain/types'
import { WhiteboardCanvas } from './WhiteboardCanvas'
import { LEGACY_WHITEBOARD_DOCUMENT_VERSION } from './legacyWhiteboardDocument'
import type { WhiteboardSnapshot } from './whiteboardModel'

function createSnapshot(): WhiteboardSnapshot {
  return {
    camera: {
      x: 36,
      y: 48,
      scale: 0.75,
    },
    color: '#17202a',
    strokeSize: 8,
    textFontFamily: 'Inter, Segoe UI, sans-serif',
    textFontSize: 24,
    lineMode: 'curve',
    shapeType: 'diamond',
    shapes: [
      {
        id: 'shape-1',
        type: 'diamond',
        x: 320,
        y: 120,
        w: 160,
        h: 120,
        color: '#3b82f6',
        size: 3,
        text: '',
        z: 2,
      },
    ],
    strokes: [
      {
        id: 'stroke-1',
        color: '#ef4444',
        size: 4,
        points: [
          { x: 80, y: 260 },
          { x: 240, y: 324 },
        ],
      },
    ],
    connections: [
      {
        id: 'connection-1',
        from: 'note-1',
        to: 'shape-1',
        fromSide: 'e',
        mode: 'curve',
        color: '#17202a',
        size: 3,
      },
    ],
    notes: [
      {
        id: 'note-1',
        x: 48,
        y: 40,
        w: 220,
        h: 148,
        text: 'Legacy note',
        color: '#ffe681',
        z: 1,
      },
    ],
    texts: [
      {
        id: 'text-1',
        x: 560,
        y: 84,
        w: 180,
        h: 52,
        text: 'Legacy text',
        color: '#17202a',
        fontFamily: 'Inter, Segoe UI, sans-serif',
        fontSize: 24,
        fontWeight: '600',
        fontStyle: 'normal',
        autoSize: false,
        z: 3,
      },
    ],
    images: [
      {
        id: 'image-1',
        x: 560,
        y: 188,
        w: 140,
        h: 100,
        src: 'data:image/png;base64,AA==',
        name: 'legacy.png',
        z: 4,
      },
    ],
  }
}

function createBoard(
  snapshot: WhiteboardSnapshot,
  updatedAt = '2026-06-17T00:00:00.000Z',
): BoardRecord {
  return {
    id: 'board-1',
    title: '白板',
    snapshot,
    createdAt: '2026-06-17T00:00:00.000Z',
    updatedAt,
  }
}

describe('WhiteboardCanvas', () => {
  it('renders the legacy whiteboard in an iframe document', () => {
    render(<WhiteboardCanvas board={createBoard(createSnapshot())} onChange={() => undefined} />)

    const frame = screen.getByTitle('白板编辑器')

    expect(frame).toBeInTheDocument()
    expect(frame).toHaveAttribute('srcdoc')
    expect(frame).toHaveAttribute(
      'data-flowboard-document-version',
      LEGACY_WHITEBOARD_DOCUMENT_VERSION,
    )
    expect(frame.getAttribute('srcdoc')).toContain('flowboard-host')
    expect(frame.getAttribute('srcdoc')).toContain(LEGACY_WHITEBOARD_DOCUMENT_VERSION)
    expect(frame.getAttribute('srcdoc')).toContain('Legacy note')
  })

  it('forwards save messages from the legacy whiteboard to the parent store', () => {
    const onChange = vi.fn()
    const nextSnapshot: WhiteboardSnapshot = {
      ...createSnapshot(),
      notes: [
        {
          id: 'note-1',
          x: 48,
          y: 40,
          w: 260,
          h: 188,
          text: 'Saved note',
          color: '#ffe681',
          z: 1,
        },
      ],
    }

    render(<WhiteboardCanvas board={createBoard(createSnapshot())} onChange={onChange} />)

    act(() => {
      window.dispatchEvent(
        new MessageEvent('message', {
          data: {
            source: 'flowboard-bridge',
            type: 'flowboard-save',
            boardId: 'board-1',
            snapshot: nextSnapshot,
          },
        }),
      )
    })

    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange).toHaveBeenCalledWith(nextSnapshot)
  })

  it('ignores save messages when the snapshot payload did not actually change', () => {
    const onChange = vi.fn()

    render(<WhiteboardCanvas board={createBoard(createSnapshot())} onChange={onChange} />)

    act(() => {
      window.dispatchEvent(
        new MessageEvent('message', {
          data: {
            source: 'flowboard-bridge',
            type: 'flowboard-save',
            boardId: 'board-1',
            snapshot: createSnapshot(),
          },
        }),
      )
    })

    expect(onChange).not.toHaveBeenCalled()
  })

  it('posts replacement snapshots into the iframe when the board prop changes', () => {
    const onChange = vi.fn()
    const initialBoard = createBoard(createSnapshot())
    const nextSnapshot: WhiteboardSnapshot = {
      ...createSnapshot(),
      notes: [
        {
          id: 'note-1',
          x: 96,
          y: 72,
          w: 280,
          h: 188,
          text: 'Replaced note',
          color: '#ffe681',
          z: 1,
        },
      ],
    }

    const { rerender } = render(<WhiteboardCanvas board={initialBoard} onChange={onChange} />)

    const frame = screen.getByTitle('白板编辑器') as HTMLIFrameElement
    const postMessage = vi.fn()
    Object.defineProperty(frame, 'contentWindow', {
      value: {
        __FLOWBOARD_DOCUMENT_VERSION__: LEGACY_WHITEBOARD_DOCUMENT_VERSION,
        postMessage,
      },
      configurable: true,
    })

    fireEvent.load(frame)

    rerender(
      <WhiteboardCanvas
        board={createBoard(nextSnapshot, '2026-06-17T00:00:01.000Z')}
        onChange={onChange}
      />,
    )

    expect(postMessage).toHaveBeenCalledTimes(1)
    expect(postMessage).toHaveBeenCalledWith(
      {
        source: 'flowboard-host',
        type: 'flowboard-replace',
        boardId: 'board-1',
        snapshot: nextSnapshot,
        updatedAt: '2026-06-17T00:00:01.000Z',
      },
      '*',
    )
  })

  it('keeps the iframe document stable when the same board saves new content', () => {
    const onChange = vi.fn()
    const nextSnapshot: WhiteboardSnapshot = {
      ...createSnapshot(),
      notes: [
        {
          id: 'note-1',
          x: 48,
          y: 40,
          w: 260,
          h: 188,
          text: 'Updated note',
          color: '#ffe681',
          z: 1,
        },
      ],
    }

    const { container, rerender } = render(
      <WhiteboardCanvas
        board={createBoard(createSnapshot(), '2026-06-17T00:00:00.000Z')}
        onChange={onChange}
      />,
    )

    const initialSrcDoc = container.querySelector('iframe')?.getAttribute('srcdoc')

    rerender(
      <WhiteboardCanvas
        board={createBoard(nextSnapshot, '2026-06-17T00:00:01.000Z')}
        onChange={onChange}
      />,
    )

    expect(container.querySelector('iframe')?.getAttribute('srcdoc')).toBe(initialSrcDoc)
  })

  it('rebuilds the iframe when the loaded whiteboard document version is stale', async () => {
    const onChange = vi.fn()
    const { container } = render(
      <WhiteboardCanvas board={createBoard(createSnapshot())} onChange={onChange} />,
    )

    const initialFrame = container.querySelector('iframe') as HTMLIFrameElement
    Object.defineProperty(initialFrame, 'contentWindow', {
      value: {
        __FLOWBOARD_DOCUMENT_VERSION__: 'outdated-version',
      },
      configurable: true,
    })

    fireEvent.load(initialFrame)

    await waitFor(() => {
      expect(container.querySelector('iframe')).not.toBe(initialFrame)
    })
  })

  it('flushes the latest iframe snapshot on unmount before the whiteboard is removed', () => {
    const onChange = vi.fn()
    const flushedSnapshot: WhiteboardSnapshot = {
      ...createSnapshot(),
      notes: [
        {
          id: 'note-1',
          x: 48,
          y: 40,
          w: 260,
          h: 188,
          text: 'Flushed note',
          color: '#ffe681',
          z: 1,
        },
      ],
    }

    const { unmount } = render(
      <WhiteboardCanvas board={createBoard(createSnapshot())} onChange={onChange} />,
    )

    const frame = screen.getByTitle('白板编辑器') as HTMLIFrameElement
    Object.defineProperty(frame, 'contentWindow', {
      value: {
        __FLOWBOARD_DOCUMENT_VERSION__: LEGACY_WHITEBOARD_DOCUMENT_VERSION,
        __FLOWBOARD_HOST_FLUSH__: () => flushedSnapshot,
      },
      configurable: true,
    })

    fireEvent.load(frame)
    unmount()

    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange).toHaveBeenCalledWith(flushedSnapshot)
  })

  it('does not flush the iframe snapshot when only the onChange callback identity changes', () => {
    const initialOnChange = vi.fn()
    const nextOnChange = vi.fn()
    const flushedSnapshot: WhiteboardSnapshot = {
      ...createSnapshot(),
      notes: [
        {
          id: 'note-1',
          x: 48,
          y: 40,
          w: 260,
          h: 188,
          text: 'Should only flush on unmount',
          color: '#ffe681',
          z: 1,
        },
      ],
    }

    const { rerender } = render(
      <WhiteboardCanvas board={createBoard(createSnapshot())} onChange={initialOnChange} />,
    )

    const frame = screen.getByTitle('白板编辑器') as HTMLIFrameElement
    Object.defineProperty(frame, 'contentWindow', {
      value: {
        __FLOWBOARD_DOCUMENT_VERSION__: LEGACY_WHITEBOARD_DOCUMENT_VERSION,
        __FLOWBOARD_HOST_FLUSH__: () => flushedSnapshot,
      },
      configurable: true,
    })

    fireEvent.load(frame)

    rerender(<WhiteboardCanvas board={createBoard(createSnapshot())} onChange={nextOnChange} />)

    expect(initialOnChange).not.toHaveBeenCalled()
    expect(nextOnChange).not.toHaveBeenCalled()
  })
})
