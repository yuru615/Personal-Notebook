import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { MindmapRecord } from '../../domain/types'
import {
  buildLegacyMindmapSrcDoc,
  LEGACY_MINDMAP_DOCUMENT_VERSION,
} from './mindmapDocument'
import {
  isMindmapSnapshot,
  normalizeMindmapSnapshot,
  type MindmapSnapshot,
} from './mindmapModel'

interface MindmapHostWindow extends Window {
  __FLOWBOARD_HOST_FLUSH__?: () => unknown
  __FLOWBOARD_DOCUMENT_VERSION__?: string
}

interface MindmapCanvasProps {
  mindmap: MindmapRecord
  onChange: (snapshot: MindmapSnapshot) => void
}

export function MindmapCanvas({ mindmap, onChange }: MindmapCanvasProps) {
  const documentVersion = LEGACY_MINDMAP_DOCUMENT_VERSION
  const frameRef = useRef<HTMLIFrameElement | null>(null)
  const frameWindowRef = useRef<MindmapHostWindow | null>(null)
  const onChangeRef = useRef(onChange)
  const initialSnapshotRef = useRef(normalizeMindmapSnapshot(mindmap.snapshot))
  const initialUpdatedAtRef = useRef(mindmap.updatedAt)
  const outboundSnapshotRef = useRef(JSON.stringify(initialSnapshotRef.current))
  const appliedSnapshotRef = useRef(JSON.stringify(initialSnapshotRef.current))
  const [frameRevision, setFrameRevision] = useState(0)
  const [isFrameLoaded, setIsFrameLoaded] = useState(false)
  const normalizedSnapshot = useMemo(
    () => normalizeMindmapSnapshot(mindmap.snapshot),
    [mindmap.snapshot],
  )
  const serializedSnapshot = useMemo(() => JSON.stringify(normalizedSnapshot), [normalizedSnapshot])
  const srcDoc = useMemo(
    () =>
      buildLegacyMindmapSrcDoc(
        mindmap.id,
        initialSnapshotRef.current,
        initialUpdatedAtRef.current,
      ),
    [documentVersion, mindmap.id],
  )

  useLayoutEffect(() => {
    onChangeRef.current = onChange
  }, [onChange])

  useLayoutEffect(() => {
    function handleMessage(event: MessageEvent) {
      const data = event.data as {
        source?: string
        type?: string
        mindmapId?: string
        snapshot?: unknown
      }

      if (
        data?.source !== 'mindmap-bridge' ||
        data.type !== 'mindmap-save' ||
        data.mindmapId !== mindmap.id ||
        !isMindmapSnapshot(data.snapshot)
      ) {
        return
      }

      const nextSnapshot = normalizeMindmapSnapshot(data.snapshot)
      const nextSerializedSnapshot = JSON.stringify(nextSnapshot)

      if (
        nextSerializedSnapshot === serializedSnapshot ||
        nextSerializedSnapshot === outboundSnapshotRef.current ||
        nextSerializedSnapshot === appliedSnapshotRef.current
      ) {
        return
      }

      outboundSnapshotRef.current = nextSerializedSnapshot
      appliedSnapshotRef.current = nextSerializedSnapshot
      onChangeRef.current(nextSnapshot)
    }

    window.addEventListener('message', handleMessage)
    return () => {
      window.removeEventListener('message', handleMessage)
    }
  }, [mindmap.id, serializedSnapshot])

  useLayoutEffect(() => {
    return () => {
      const flushSnapshot = frameWindowRef.current?.__FLOWBOARD_HOST_FLUSH__
      if (!flushSnapshot) {
        return
      }

      const nextRawSnapshot = flushSnapshot()
      if (!isMindmapSnapshot(nextRawSnapshot)) {
        return
      }

      const nextSnapshot = normalizeMindmapSnapshot(nextRawSnapshot)
      const nextSerializedSnapshot = JSON.stringify(nextSnapshot)
      if (
        nextSerializedSnapshot === outboundSnapshotRef.current ||
        nextSerializedSnapshot === appliedSnapshotRef.current
      ) {
        return
      }

      outboundSnapshotRef.current = nextSerializedSnapshot
      appliedSnapshotRef.current = nextSerializedSnapshot
      onChangeRef.current(nextSnapshot)
    }
  }, [])

  useEffect(() => {
    if (!isFrameLoaded) {
      return
    }

    if (
      serializedSnapshot === appliedSnapshotRef.current ||
      serializedSnapshot === outboundSnapshotRef.current
    ) {
      return
    }

    frameRef.current?.contentWindow?.postMessage(
      {
        source: 'mindmap-host',
        type: 'mindmap-replace',
        mindmapId: mindmap.id,
        snapshot: normalizedSnapshot,
        updatedAt: mindmap.updatedAt,
      },
      '*',
    )
    appliedSnapshotRef.current = serializedSnapshot
  }, [isFrameLoaded, mindmap.id, mindmap.updatedAt, normalizedSnapshot, serializedSnapshot])

  useEffect(() => {
    if (!isFrameLoaded) {
      return
    }

    const activeFrameWindow =
      (frameRef.current?.contentWindow as MindmapHostWindow | null) ?? frameWindowRef.current
    if (activeFrameWindow?.__FLOWBOARD_DOCUMENT_VERSION__ === documentVersion) {
      return
    }

    frameWindowRef.current = null
    setIsFrameLoaded(false)
    setFrameRevision((value) => value + 1)
  }, [documentVersion, isFrameLoaded])

  return (
    <div className="mindmap-canvas">
      <iframe
        key={`${mindmap.id}:${documentVersion}:${frameRevision}`}
        ref={frameRef}
        title="思维导图编辑器"
        className="mindmap-frame"
        data-flowboard-document-version={documentVersion}
        srcDoc={srcDoc}
        onLoad={() => {
          frameWindowRef.current = frameRef.current?.contentWindow as MindmapHostWindow | null
          setIsFrameLoaded(true)
        }}
      />
    </div>
  )
}
