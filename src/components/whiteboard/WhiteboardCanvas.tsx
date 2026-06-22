import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { BoardRecord } from '../../domain/types'
import {
  buildLegacyWhiteboardSrcDoc,
  LEGACY_WHITEBOARD_DOCUMENT_VERSION,
} from './legacyWhiteboardDocument'
import {
  isWhiteboardSnapshot,
  normalizeWhiteboardSnapshot,
  type WhiteboardSnapshot,
} from './whiteboardModel'

interface WhiteboardHostWindow extends Window {
  __FLOWBOARD_HOST_FLUSH__?: () => unknown
  __FLOWBOARD_DOCUMENT_VERSION__?: string
}

interface WhiteboardCanvasProps {
  board: BoardRecord
  onChange: (snapshot: WhiteboardSnapshot) => void
}

export function WhiteboardCanvas({ board, onChange }: WhiteboardCanvasProps) {
  const whiteboardDocumentVersion = LEGACY_WHITEBOARD_DOCUMENT_VERSION
  const frameRef = useRef<HTMLIFrameElement | null>(null)
  const frameWindowRef = useRef<WhiteboardHostWindow | null>(null)
  const onChangeRef = useRef(onChange)
  const initialSnapshotRef = useRef(normalizeWhiteboardSnapshot(board.snapshot))
  const initialUpdatedAtRef = useRef(board.updatedAt)
  const latestSnapshotRef = useRef(initialSnapshotRef.current)
  const latestUpdatedAtRef = useRef(initialUpdatedAtRef.current)
  const outboundSnapshotRef = useRef(JSON.stringify(initialSnapshotRef.current))
  const appliedSnapshotRef = useRef(JSON.stringify(initialSnapshotRef.current))
  const [frameRevision, setFrameRevision] = useState(0)
  const [isFrameLoaded, setIsFrameLoaded] = useState(false)
  const normalizedSnapshot = useMemo(() => normalizeWhiteboardSnapshot(board.snapshot), [board.snapshot])
  const serializedSnapshot = useMemo(() => JSON.stringify(normalizedSnapshot), [normalizedSnapshot])
  const srcDoc = useMemo(
    () =>
      buildLegacyWhiteboardSrcDoc(
        board.id,
        latestSnapshotRef.current,
        latestUpdatedAtRef.current,
      ),
    // frameRevision intentionally rebuilds the iframe with the latest cached whiteboard payload.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [board.id, frameRevision, whiteboardDocumentVersion],
  )

  useLayoutEffect(() => {
    onChangeRef.current = onChange
  }, [onChange])

  useLayoutEffect(() => {
    latestSnapshotRef.current = normalizedSnapshot
    latestUpdatedAtRef.current = board.updatedAt
  }, [board.updatedAt, normalizedSnapshot])

  useLayoutEffect(() => {
    function handleMessage(event: MessageEvent) {
      const data = event.data as {
        source?: string
        type?: string
        boardId?: string
        snapshot?: unknown
      }

      if (
        data?.source !== 'flowboard-bridge' ||
        data.type !== 'flowboard-save' ||
        data.boardId !== board.id ||
        !isWhiteboardSnapshot(data.snapshot)
      ) {
        return
      }

      const nextSnapshot = normalizeWhiteboardSnapshot(data.snapshot)
      const nextSerializedSnapshot = JSON.stringify(nextSnapshot)
      const isSameAsStore = nextSerializedSnapshot === serializedSnapshot
      const isSameAsOutbound = nextSerializedSnapshot === outboundSnapshotRef.current
      const isSameAsApplied = nextSerializedSnapshot === appliedSnapshotRef.current

      if (
        isSameAsStore ||
        isSameAsOutbound ||
        isSameAsApplied
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
  }, [board.id, serializedSnapshot])

  useLayoutEffect(() => {
    return () => {
      const frameWindow = frameWindowRef.current
      const flushSnapshot = frameWindow?.__FLOWBOARD_HOST_FLUSH__
      if (!flushSnapshot) {
        return
      }

      const nextRawSnapshot = flushSnapshot()
      if (!isWhiteboardSnapshot(nextRawSnapshot)) {
        return
      }

      const nextSnapshot = normalizeWhiteboardSnapshot(nextRawSnapshot)
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
        source: 'flowboard-host',
        type: 'flowboard-replace',
        boardId: board.id,
        snapshot: normalizedSnapshot,
        updatedAt: board.updatedAt,
      },
      '*',
    )
    appliedSnapshotRef.current = serializedSnapshot
  }, [board.id, board.updatedAt, isFrameLoaded, normalizedSnapshot, serializedSnapshot])

  useEffect(() => {
    if (!isFrameLoaded) {
      return
    }

    const activeFrameWindow =
      (frameRef.current?.contentWindow as WhiteboardHostWindow | null) ?? frameWindowRef.current
    const activeVersion = activeFrameWindow?.__FLOWBOARD_DOCUMENT_VERSION__ ?? null

    if (activeVersion === whiteboardDocumentVersion) {
      return
    }

    frameWindowRef.current = null
    setIsFrameLoaded(false)
    setFrameRevision((value) => value + 1)
  }, [isFrameLoaded, whiteboardDocumentVersion])

  return (
    <div className="whiteboard-canvas">
      <iframe
        key={`${board.id}:${whiteboardDocumentVersion}:${frameRevision}`}
        ref={frameRef}
        title="白板编辑器"
        className="whiteboard-frame"
        data-flowboard-document-version={whiteboardDocumentVersion}
        srcDoc={srcDoc}
        onLoad={() => {
          frameWindowRef.current = frameRef.current?.contentWindow as WhiteboardHostWindow | null
          setIsFrameLoaded(true)
        }}
      />
    </div>
  )
}
