import { useEffect, useRef } from 'react'
import { MINDMAP_STORAGE_KEY } from './mindmapModel'

interface MindmapFrameProps {
  mindmapId: string
  snapshot: unknown
  onSnapshotChange: (snapshot: unknown) => void | Promise<void>
}

export function MindmapFrame({ mindmapId, snapshot, onSnapshotChange }: MindmapFrameProps) {
  const snapshotRef = useRef(snapshot)
  const onSnapshotChangeRef = useRef(onSnapshotChange)

  snapshotRef.current = snapshot
  onSnapshotChangeRef.current = onSnapshotChange

  useEffect(() => {
    window.localStorage.setItem(MINDMAP_STORAGE_KEY, JSON.stringify(snapshot))
  }, [snapshot])

  useEffect(() => {
    function readStoredSnapshot() {
      const rawValue = window.localStorage.getItem(MINDMAP_STORAGE_KEY)
      if (!rawValue) {
        return snapshotRef.current
      }

      try {
        return JSON.parse(rawValue) as unknown
      } catch {
        return snapshotRef.current
      }
    }

    function flushStoredSnapshot() {
      void onSnapshotChangeRef.current(readStoredSnapshot())
    }

    function handleStorage(event: StorageEvent) {
      if (event.key !== MINDMAP_STORAGE_KEY || event.newValue === null) {
        return
      }

      try {
        void onSnapshotChangeRef.current(JSON.parse(event.newValue) as unknown)
      } catch {
        void onSnapshotChangeRef.current(snapshotRef.current)
      }
    }

    window.addEventListener('storage', handleStorage)
    window.addEventListener('beforeunload', flushStoredSnapshot)

    return () => {
      window.removeEventListener('storage', handleStorage)
      window.removeEventListener('beforeunload', flushStoredSnapshot)
      flushStoredSnapshot()
    }
  }, [])

  return (
    <iframe
      key={mindmapId}
      title="Mindmap"
      src="/mindmap-web/index.html"
      className="mindmap-route-surface"
      data-mindmap-id={mindmapId}
      style={{ width: '100%', minHeight: '100vh', border: 0 }}
    />
  )
}
