import { render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MINDMAP_STORAGE_KEY } from './mindmapModel'

function getScopedStorageKey(mindmapId: string) {
  return `${MINDMAP_STORAGE_KEY}:${mindmapId}`
}

describe('MindmapFrame', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  it('primes the fixed storage key on mount', async () => {
    const { MindmapFrame } = await import('./MindmapFrame')
    const snapshot = { title: 'Strategy map', nodes: {} }

    render(
      <MindmapFrame
        mindmapId="mindmap-1"
        snapshot={snapshot}
        onSnapshotChange={() => undefined}
      />,
    )

    expect(window.localStorage.getItem(getScopedStorageKey('mindmap-1'))).toBe(
      JSON.stringify(snapshot),
    )
  })

  it('forwards storage updates through the snapshot callback', async () => {
    const { MindmapFrame } = await import('./MindmapFrame')
    const snapshot = { title: 'Strategy map', nodes: {} }
    const nextSnapshot = { title: 'Updated map', nodes: { root: { id: 'root' } } }
    const onSnapshotChange = vi.fn()

    render(
      <MindmapFrame
        mindmapId="mindmap-1"
        snapshot={snapshot}
        onSnapshotChange={onSnapshotChange}
      />,
    )

    window.dispatchEvent(
      new StorageEvent('storage', {
        key: getScopedStorageKey('mindmap-1'),
        newValue: JSON.stringify(nextSnapshot),
        storageArea: window.localStorage,
      }),
    )

    expect(onSnapshotChange).toHaveBeenCalledWith(nextSnapshot)
  })

  it('flushes the latest storage value before unload', async () => {
    const { MindmapFrame } = await import('./MindmapFrame')
    const snapshot = { title: 'Strategy map', nodes: {} }
    const nextSnapshot = { title: 'Flushed map', nodes: { root: { id: 'root' } } }
    const onSnapshotChange = vi.fn()

    render(
      <MindmapFrame
        mindmapId="mindmap-1"
        snapshot={snapshot}
        onSnapshotChange={onSnapshotChange}
      />,
    )

    window.localStorage.setItem(getScopedStorageKey('mindmap-1'), JSON.stringify(nextSnapshot))
    window.dispatchEvent(new Event('beforeunload'))

    expect(onSnapshotChange).toHaveBeenCalledWith(nextSnapshot)
  })

  it('flushes the previous mindmap before priming the next one', async () => {
    const { MindmapFrame } = await import('./MindmapFrame')
    const snapshotA = { title: 'Mindmap A', nodes: {} }
    const latestSnapshotA = { title: 'Mindmap A latest', nodes: { root: { id: 'root' } } }
    const snapshotB = { title: 'Mindmap B', nodes: {} }
    const seenStorageValues: Array<string | null> = []
    const onSnapshotChange = vi.fn((nextSnapshot: unknown) => {
      seenStorageValues.push(window.localStorage.getItem(getScopedStorageKey('mindmap-a')))
      return nextSnapshot
    })
    const { rerender } = render(
      <MindmapFrame
        mindmapId="mindmap-a"
        snapshot={snapshotA}
        onSnapshotChange={onSnapshotChange}
      />,
    )

    window.localStorage.setItem(getScopedStorageKey('mindmap-a'), JSON.stringify(latestSnapshotA))

    rerender(
      <MindmapFrame
        mindmapId="mindmap-b"
        snapshot={snapshotB}
        onSnapshotChange={onSnapshotChange}
      />,
    )

    await waitFor(() => {
      expect(onSnapshotChange).toHaveBeenCalledWith(latestSnapshotA)
    })
    expect(seenStorageValues[0]).toBe(JSON.stringify(latestSnapshotA))
    expect(window.localStorage.getItem(getScopedStorageKey('mindmap-b'))).toBe(
      JSON.stringify(snapshotB),
    )
  })

  it('rebuilds the iframe when the host pushes a new snapshot for the same mindmap', async () => {
    const { MindmapFrame } = await import('./MindmapFrame')
    const snapshotA = { title: 'Mindmap A', nodes: {} }
    const snapshotB = { title: 'Mindmap A external update', nodes: { root: { id: 'root' } } }
    const { rerender } = render(
      <MindmapFrame
        mindmapId="mindmap-a"
        snapshot={snapshotA}
        onSnapshotChange={() => undefined}
      />,
    )
    const firstFrame = screen.getByTitle('Mindmap')

    rerender(
      <MindmapFrame
        mindmapId="mindmap-a"
        snapshot={snapshotB}
        onSnapshotChange={() => undefined}
      />,
    )

    await waitFor(() => {
      expect(window.localStorage.getItem(getScopedStorageKey('mindmap-a'))).toBe(
        JSON.stringify(snapshotB),
      )
      expect(screen.getByTitle('Mindmap')).not.toBe(firstFrame)
    })
  })

  it('ignores storage updates from a different scoped key', async () => {
    const { MindmapFrame } = await import('./MindmapFrame')
    const snapshot = { title: 'Strategy map', nodes: {} }
    const otherSnapshot = { title: 'Other map', nodes: { root: { id: 'other' } } }
    const onSnapshotChange = vi.fn()

    render(
      <MindmapFrame
        mindmapId="mindmap-1"
        snapshot={snapshot}
        onSnapshotChange={onSnapshotChange}
      />,
    )

    window.dispatchEvent(
      new StorageEvent('storage', {
        key: getScopedStorageKey('mindmap-2'),
        newValue: JSON.stringify(otherSnapshot),
        storageArea: window.localStorage,
      }),
    )

    expect(onSnapshotChange).not.toHaveBeenCalled()
  })

  it('passes the scoped key to the iframe host page', async () => {
    const { MindmapFrame } = await import('./MindmapFrame')
    const snapshot = { title: 'Strategy map', nodes: {} }

    render(
      <MindmapFrame
        mindmapId="mindmap-1"
        snapshot={snapshot}
        onSnapshotChange={() => undefined}
      />,
    )

    expect(screen.getByTitle('Mindmap')).toHaveAttribute(
      'src',
      `/mindmap-web/index.html?storageKey=${encodeURIComponent(getScopedStorageKey('mindmap-1'))}`,
    )
  })
})
