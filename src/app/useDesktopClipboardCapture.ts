import { useEffect } from 'react'
import { buildClipboardTextBlocks } from '../domain/clipboardCapture'
import type { BlockRecord, ClipboardCaptureMode } from '../domain/types'
import { importImageAssetFromPath, writeAssetBytes } from '../lib/assets'
import type { AssetMeta } from '../lib/storageClient'
import type { DesktopClipboardCandidate } from '../lib/desktopLifecycle'
import {
  registerDesktopClipboardCaptureConfirm,
  registerDesktopWindowFocusChanged,
  setDesktopClipboardCaptureEnabled,
  showDesktopClipboardCaptureFailureNotification,
  suppressDesktopClipboardCapture,
  takeConfirmedDesktopClipboardCapture,
} from '../lib/desktopLifecycle'
import { isDesktopRuntime } from '../lib/fileAccess'
import { uiCopy } from '../ui/copy'
import { createBlock } from '../utils/blockFactory'

const DEFAULT_SUPPRESSION_WINDOW_MS = 1200
const DEFAULT_CONFIRM_POLL_INTERVAL_MS = 400

interface ConfirmedClipboardCapture {
  candidate: DesktopClipboardCandidate
  capturedAt: string
}

interface UseDesktopClipboardCaptureOptions {
  isBootstrapped: boolean
  clipboardCaptureMode?: ClipboardCaptureMode
  appendClipboardCaptureToInbox: (blocks: BlockRecord[], capturedAt?: string) => Promise<void>
  suppressionWindowMs?: number
  confirmPollIntervalMs?: number
}

export function useDesktopClipboardCapture({
  isBootstrapped,
  clipboardCaptureMode,
  appendClipboardCaptureToInbox,
  suppressionWindowMs = DEFAULT_SUPPRESSION_WINDOW_MS,
  confirmPollIntervalMs = DEFAULT_CONFIRM_POLL_INTERVAL_MS,
}: UseDesktopClipboardCaptureOptions) {
  const isActive =
    isBootstrapped && clipboardCaptureMode === 'prompt_to_inbox' && isDesktopRuntime()

  useEffect(() => {
    if (!isDesktopRuntime()) {
      return
    }

    void setDesktopClipboardCaptureEnabled(isActive).catch(() => undefined)
  }, [isActive])

  useEffect(() => {
    if (!isActive) {
      return
    }

    let disposed = false
    let isConsuming = false

    const consumePendingCapture = async () => {
      if (disposed || isConsuming) {
        return
      }

      isConsuming = true

      try {
        const pendingCapture = await takeConfirmedDesktopClipboardCapture().catch(() => null)
        if (!pendingCapture) {
          return
        }

        try {
          await appendCandidateToInbox(pendingCapture, appendClipboardCaptureToInbox)
        } catch {
          await showDesktopClipboardCaptureFailureNotification({
            title: uiCopy.clipboardCapture.failureTitle,
            body: uiCopy.clipboardCapture.failureBody,
          })
        }
      } finally {
        isConsuming = false
      }
    }

    const unregisterConfirmPromise = registerDesktopClipboardCaptureConfirm(async () => {
      await consumePendingCapture()
    }).catch(() => () => undefined)

    const unregisterFocusPromise = registerDesktopWindowFocusChanged(async (focused) => {
      if (!focused) {
        return
      }

      await consumePendingCapture()
    }).catch(() => () => undefined)

    const handleCopy = () => {
      void suppressDesktopClipboardCapture(suppressionWindowMs).catch(() => undefined)
    }

    document.addEventListener('copy', handleCopy)
    void consumePendingCapture()
    const pollTimerId = window.setInterval(() => {
      void consumePendingCapture()
    }, confirmPollIntervalMs)

    return () => {
      disposed = true
      document.removeEventListener('copy', handleCopy)
      window.clearInterval(pollTimerId)
      void unregisterConfirmPromise.then((unlisten) => {
        unlisten()
      })
      void unregisterFocusPromise.then((unlisten) => {
        unlisten()
      })
    }
  }, [appendClipboardCaptureToInbox, confirmPollIntervalMs, isActive, suppressionWindowMs])
}

async function appendCandidateToInbox(
  pendingCapture: ConfirmedClipboardCapture,
  appendClipboardCaptureToInbox: (blocks: BlockRecord[], capturedAt?: string) => Promise<void>,
) {
  switch (pendingCapture.candidate.kind) {
    case 'text': {
      const blocks = buildClipboardTextBlocks({
        text: pendingCapture.candidate.text,
        html: pendingCapture.candidate.html,
      })
      if (blocks.length === 0) {
        return
      }

      await appendClipboardCaptureToInbox(blocks, pendingCapture.capturedAt)
      return
    }
    case 'image_bytes': {
      const asset = await writeAssetBytes({
        name: buildClipboardImageName(pendingCapture.capturedAt),
        mimeType: 'image/png',
        bytes: pendingCapture.candidate.bytes,
      })
      await appendClipboardCaptureToInbox(
        [createClipboardImageBlock(asset)],
        pendingCapture.capturedAt,
      )
      return
    }
    case 'image_file': {
      const asset = await importImageAssetFromPath(pendingCapture.candidate.path)
      if (!asset) {
        throw new Error('clipboard image path could not be imported')
      }

      await appendClipboardCaptureToInbox(
        [createClipboardImageBlock(asset)],
        pendingCapture.capturedAt,
      )
    }
  }
}

function createClipboardImageBlock(asset: Pick<AssetMeta, 'id' | 'name' | 'mimeType'>): BlockRecord {
  const block = createBlock('image')
  if (block.type !== 'image') {
    throw new Error('clipboard image block factory returned an unexpected block type')
  }

  return {
    ...block,
    assetId: asset.id,
    name: asset.name,
    mimeType: asset.mimeType,
    alt: asset.name,
  }
}

function buildClipboardImageName(capturedAt: string) {
  return `clipboard-${capturedAt.replace(/[:.]/g, '-').replace('T', '_')}.png`
}
