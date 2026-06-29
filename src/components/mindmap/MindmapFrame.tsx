import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { MINDMAP_STORAGE_KEY, prepareMindmapSnapshotForHost } from './mindmapModel'

interface MindmapFrameProps {
  mindmapId: string
  snapshot: unknown
  onSnapshotChange: (snapshot: unknown) => void | Promise<void>
}

export function MindmapFrame({ mindmapId, snapshot, onSnapshotChange }: MindmapFrameProps) {
  const scopedStorageKey = `${MINDMAP_STORAGE_KEY}:${mindmapId}`
  const hostedSnapshot = useMemo(
    () =>
      prepareMindmapSnapshotForHost(snapshot, {
        width: typeof window === 'undefined' ? 0 : window.innerWidth,
        height: typeof window === 'undefined' ? 0 : window.innerHeight,
      }),
    [snapshot],
  )
  const [iframeVersion, setIframeVersion] = useState(0)
  const [primedScopedStorageKey, setPrimedScopedStorageKey] = useState<string | null>(null)
  const snapshotRef = useRef(hostedSnapshot)
  const onSnapshotChangeRef = useRef(onSnapshotChange)
  const mindmapIdRef = useRef(mindmapId)
  const snapshotKeyRef = useRef(JSON.stringify(hostedSnapshot))
  const lastIframeSnapshotKeyRef = useRef<string | null>(null)

  snapshotRef.current = hostedSnapshot
  onSnapshotChangeRef.current = onSnapshotChange

  const writeSnapshotToStorage = useCallback((nextSnapshot: unknown) => {
    const nextSnapshotKey = JSON.stringify(nextSnapshot)
    snapshotKeyRef.current = nextSnapshotKey
    window.localStorage.setItem(scopedStorageKey, nextSnapshotKey)
  }, [scopedStorageKey])

  useLayoutEffect(() => {
    writeSnapshotToStorage(snapshotRef.current)
    setPrimedScopedStorageKey(scopedStorageKey)
  }, [scopedStorageKey, writeSnapshotToStorage])

  useEffect(() => {
    mindmapIdRef.current = mindmapId
    writeSnapshotToStorage(snapshotRef.current)

    function readStoredSnapshot() {
      const rawValue = window.localStorage.getItem(scopedStorageKey)
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
      if (event.key !== scopedStorageKey || event.newValue === null) {
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
  }, [mindmapId, scopedStorageKey, writeSnapshotToStorage])

  useEffect(() => {
    const nextSnapshotKey = JSON.stringify(hostedSnapshot)
    const mindmapChanged = mindmapIdRef.current !== mindmapId
    const snapshotChanged = snapshotKeyRef.current !== nextSnapshotKey

    snapshotRef.current = hostedSnapshot

    if (mindmapChanged) {
      mindmapIdRef.current = mindmapId
      writeSnapshotToStorage(hostedSnapshot)
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

    window.localStorage.setItem(scopedStorageKey, nextSnapshotKey)
    setIframeVersion((value) => value + 1)
  }, [hostedSnapshot, mindmapId, scopedStorageKey, writeSnapshotToStorage])

  if (primedScopedStorageKey !== scopedStorageKey) {
    return null
  }

  return (
    <iframe
      key={`${mindmapId}:${iframeVersion}`}
      title="Mindmap"
      src={`/mindmap-web/index.html?storageKey=${encodeURIComponent(scopedStorageKey)}`}
      className="mindmap-route-surface"
      data-mindmap-id={mindmapId}
      style={{ width: '100%', height: '100%', border: 0 }}
    />
  )
}
