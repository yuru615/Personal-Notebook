import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { MindmapRecord } from '../../domain/types'
import { MindmapCanvas } from './MindmapCanvas'
import { LEGACY_MINDMAP_DOCUMENT_VERSION } from './mindmapDocument'
import type { MindmapSnapshot } from './mindmapModel'

function createSnapshot(): MindmapSnapshot {
  return {
    camera: { x: 36, y: 48, scale: 0.75 },
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

function createMindmap(
  snapshot: MindmapSnapshot,
  updatedAt = '2026-06-17T00:00:00.000Z',
): MindmapRecord {
  return {
    id: 'mindmap-1',
    title: '思维导图',
    snapshot,
    createdAt: '2026-06-17T00:00:00.000Z',
    updatedAt,
  }
}

describe('MindmapCanvas', () => {
  it('renders the forked mindmap runtime in an iframe document', () => {
    render(<MindmapCanvas mindmap={createMindmap(createSnapshot())} onChange={() => undefined} />)

    const frame = screen.getByTitle('思维导图编辑器')
    expect(frame).toBeInTheDocument()
    expect(frame).toHaveAttribute('srcdoc')
    expect(frame).toHaveAttribute(
      'data-flowboard-document-version',
      LEGACY_MINDMAP_DOCUMENT_VERSION,
    )
    expect(frame.getAttribute('srcdoc')).toContain('mindmap-host')
    expect(frame.getAttribute('srcdoc')).toContain(LEGACY_MINDMAP_DOCUMENT_VERSION)
    expect(frame.getAttribute('srcdoc')).toContain('Legacy note')
  })

  it('forwards save messages from the iframe runtime to the parent store', () => {
    const onChange = vi.fn()
    const nextSnapshot: MindmapSnapshot = {
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

    render(<MindmapCanvas mindmap={createMindmap(createSnapshot())} onChange={onChange} />)

    act(() => {
      window.dispatchEvent(
        new MessageEvent('message', {
          data: {
            source: 'mindmap-bridge',
            type: 'mindmap-save',
            mindmapId: 'mindmap-1',
            snapshot: nextSnapshot,
          },
        }),
      )
    })

    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange).toHaveBeenCalledWith(nextSnapshot)
  })

  it('ignores duplicate save payloads', () => {
    const onChange = vi.fn()

    render(<MindmapCanvas mindmap={createMindmap(createSnapshot())} onChange={onChange} />)

    act(() => {
      window.dispatchEvent(
        new MessageEvent('message', {
          data: {
            source: 'mindmap-bridge',
            type: 'mindmap-save',
            mindmapId: 'mindmap-1',
            snapshot: createSnapshot(),
          },
        }),
      )
    })

    expect(onChange).not.toHaveBeenCalled()
  })

  it('posts replacement snapshots into the iframe when props change', () => {
    const onChange = vi.fn()
    const initialMindmap = createMindmap(createSnapshot())
    const nextSnapshot: MindmapSnapshot = {
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

    const { rerender } = render(<MindmapCanvas mindmap={initialMindmap} onChange={onChange} />)

    const frame = screen.getByTitle('思维导图编辑器') as HTMLIFrameElement
    const postMessage = vi.fn()
    Object.defineProperty(frame, 'contentWindow', {
      value: {
        __FLOWBOARD_DOCUMENT_VERSION__: LEGACY_MINDMAP_DOCUMENT_VERSION,
        postMessage,
      },
      configurable: true,
    })

    fireEvent.load(frame)

    rerender(
      <MindmapCanvas
        mindmap={createMindmap(nextSnapshot, '2026-06-17T00:00:01.000Z')}
        onChange={onChange}
      />,
    )

    expect(postMessage).toHaveBeenCalledTimes(1)
    expect(postMessage).toHaveBeenCalledWith(
      {
        source: 'mindmap-host',
        type: 'mindmap-replace',
        mindmapId: 'mindmap-1',
        snapshot: nextSnapshot,
        updatedAt: '2026-06-17T00:00:01.000Z',
      },
      '*',
    )
  })

  it('keeps the iframe document stable when the same mindmap saves new content', () => {
    const { container, rerender } = render(
      <MindmapCanvas
        mindmap={createMindmap(createSnapshot(), '2026-06-17T00:00:00.000Z')}
        onChange={() => undefined}
      />,
    )

    const nextSnapshot: MindmapSnapshot = {
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

    const initialSrcDoc = container.querySelector('iframe')?.getAttribute('srcdoc')

    rerender(
      <MindmapCanvas
        mindmap={createMindmap(nextSnapshot, '2026-06-17T00:00:01.000Z')}
        onChange={() => undefined}
      />,
    )

    expect(container.querySelector('iframe')?.getAttribute('srcdoc')).toBe(initialSrcDoc)
  })

  it('rebuilds the iframe when the loaded document version is stale', async () => {
    const { container } = render(
      <MindmapCanvas mindmap={createMindmap(createSnapshot())} onChange={() => undefined} />,
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
})
