import { useEffect, useRef, useState } from 'react'
import { MINDMAP_STORAGE_KEY } from './mindmapModel'

interface MindmapFrameProps {
  mindmapId: string
  snapshot: unknown
  onSnapshotChange: (snapshot: unknown) => void | Promise<void>
}

export function MindmapFrame({ mindmapId, snapshot, onSnapshotChange }: MindmapFrameProps) {
  const [iframeVersion, setIframeVersion] = useState(0)
  const snapshotRef = useRef(snapshot)
  const onSnapshotChangeRef = useRef(onSnapshotChange)
  const mindmapIdRef = useRef(mindmapId)
  const snapshotKeyRef = useRef(JSON.stringify(snapshot))
  const lastIframeSnapshotKeyRef = useRef<string | null>(null)

  snapshotRef.current = snapshot
  onSnapshotChangeRef.current = onSnapshotChange

  function writeSnapshotToStorage(nextSnapshot: unknown) {
    const nextSnapshotKey = JSON.stringify(nextSnapshot)
    snapshotKeyRef.current = nextSnapshotKey
    window.localStorage.setItem(MINDMAP_STORAGE_KEY, nextSnapshotKey)
  }

  useEffect(() => {
    mindmapIdRef.current = mindmapId
    writeSnapshotToStorage(snapshotRef.current)

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
      const nextSnapshot = readStoredSnapshot()
      lastIframeSnapshotKeyRef.current = JSON.stringify(nextSnapshot)
      void onSnapshotChangeRef.current(nextSnapshot)
    }

    function handleStorage(event: StorageEvent) {
      if (event.key !== MINDMAP_STORAGE_KEY || event.newValue === null) {
        return
      }

      try {
        lastIframeSnapshotKeyRef.current = event.newValue
        void onSnapshotChangeRef.current(JSON.parse(event.newValue) as unknown)
      } catch {
        lastIframeSnapshotKeyRef.current = snapshotKeyRef.current
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
  }, [mindmapId])

  useEffect(() => {
    const nextSnapshotKey = JSON.stringify(snapshot)
    const mindmapChanged = mindmapIdRef.current !== mindmapId
    const snapshotChanged = snapshotKeyRef.current !== nextSnapshotKey

    snapshotRef.current = snapshot

    if (mindmapChanged) {
      mindmapIdRef.current = mindmapId
      writeSnapshotToStorage(snapshot)
      lastIframeSnapshotKeyRef.current = null
      return
    }

    if (!snapshotChanged) {
      return
    }

    snapshotKeyRef.current = nextSnapshotKey

    if (lastIframeSnapshotKeyRef.current === nextSnapshotKey) {
      lastIframeSnapshotKeyRef.current = null
      return
    }

    window.localStorage.setItem(MINDMAP_STORAGE_KEY, nextSnapshotKey)
    setIframeVersion((value) => value + 1)
  }, [mindmapId, snapshot])

  return (
    <iframe
      key={`${mindmapId}:${iframeVersion}`}
      title="Mindmap"
      src="/mindmap-web/index.html"
      className="mindmap-route-surface"
      data-mindmap-id={mindmapId}
      style={{ width: '100%', minHeight: '100vh', border: 0 }}
    />
  )
}
