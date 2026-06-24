import { render } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MINDMAP_STORAGE_KEY } from './mindmapModel'

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

    expect(window.localStorage.getItem(MINDMAP_STORAGE_KEY)).toBe(JSON.stringify(snapshot))
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
        key: MINDMAP_STORAGE_KEY,
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

    window.localStorage.setItem(MINDMAP_STORAGE_KEY, JSON.stringify(nextSnapshot))
    window.dispatchEvent(new Event('beforeunload'))

    expect(onSnapshotChange).toHaveBeenCalledWith(nextSnapshot)
  })
})
