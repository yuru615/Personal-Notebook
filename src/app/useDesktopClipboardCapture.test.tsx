import { act, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { BlockRecord } from '../domain/types'
import { useDesktopClipboardCapture } from './useDesktopClipboardCapture'

const desktopLifecycle = vi.hoisted(() => {
  let confirmHandler: (() => Promise<void> | void) | null = null
  let focusHandler: ((focused: boolean) => Promise<void> | void) | null = null

  return {
    setDesktopClipboardCaptureEnabled: vi.fn(async () => undefined),
    takeConfirmedDesktopClipboardCapture: vi.fn(async () => null),
    suppressDesktopClipboardCapture: vi.fn(async () => undefined),
    showDesktopClipboardCaptureFailureNotification: vi.fn(async () => true),
    registerDesktopClipboardCaptureConfirm: vi.fn(async (handler: () => Promise<void> | void) => {
      confirmHandler = handler
      return () => {
        if (confirmHandler === handler) {
          confirmHandler = null
        }
      }
    }),
    registerDesktopWindowFocusChanged: vi.fn(
      async (handler: (focused: boolean) => Promise<void> | void) => {
        focusHandler = handler
        return () => {
          if (focusHandler === handler) {
            focusHandler = null
          }
        }
      },
    ),
    emitConfirm: async () => {
      await confirmHandler?.()
    },
    emitFocusChanged: async (focused: boolean) => {
      await focusHandler?.(focused)
    },
    resetHandlers: () => {
      confirmHandler = null
      focusHandler = null
    },
  }
})

const assets = vi.hoisted(() => ({
  writeAssetBytes: vi.fn(async () => ({
    id: 'asset_clipboard_image',
    sha256: 'sha',
    name: 'clipboard.png',
    mimeType: 'image/png',
    byteSize: 4,
    relativePath: 'clip/board.png',
    createdAt: '2026-07-08T00:00:00.000Z',
  })),
  importImageAssetFromPath: vi.fn(async () => ({
    id: 'asset_local_image',
    sha256: 'sha-local',
    name: 'photo.png',
    mimeType: 'image/png',
    byteSize: 10,
    relativePath: 'ph/oto.png',
    createdAt: '2026-07-08T00:00:00.000Z',
  })),
}))

vi.mock('../lib/desktopLifecycle', () => ({
  setDesktopClipboardCaptureEnabled: desktopLifecycle.setDesktopClipboardCaptureEnabled,
  takeConfirmedDesktopClipboardCapture: desktopLifecycle.takeConfirmedDesktopClipboardCapture,
  suppressDesktopClipboardCapture: desktopLifecycle.suppressDesktopClipboardCapture,
  showDesktopClipboardCaptureFailureNotification:
    desktopLifecycle.showDesktopClipboardCaptureFailureNotification,
  registerDesktopClipboardCaptureConfirm: desktopLifecycle.registerDesktopClipboardCaptureConfirm,
  registerDesktopWindowFocusChanged: desktopLifecycle.registerDesktopWindowFocusChanged,
}))

vi.mock('../lib/assets', () => ({
  writeAssetBytes: assets.writeAssetBytes,
  importImageAssetFromPath: assets.importImageAssetFromPath,
}))

function HookHarness({
  isBootstrapped = true,
  clipboardCaptureMode = 'prompt_to_inbox' as const,
  appendClipboardCaptureToInbox = vi.fn(async () => undefined),
  suppressionWindowMs = 1000,
  confirmPollIntervalMs = 400,
}: {
  isBootstrapped?: boolean
  clipboardCaptureMode?: 'off' | 'prompt_to_inbox'
  appendClipboardCaptureToInbox?: (blocks: BlockRecord[], capturedAt?: string) => Promise<void>
  suppressionWindowMs?: number
  confirmPollIntervalMs?: number
}) {
  useDesktopClipboardCapture({
    isBootstrapped,
    clipboardCaptureMode,
    appendClipboardCaptureToInbox,
    suppressionWindowMs,
    confirmPollIntervalMs,
  })
  return null
}

describe('useDesktopClipboardCapture', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.clearAllMocks()
    desktopLifecycle.resetHandlers()
    Object.defineProperty(globalThis, '__TAURI_INTERNALS__', {
      configurable: true,
      value: {},
    })
  })

  afterEach(() => {
    vi.useRealTimers()
    Reflect.deleteProperty(globalThis, '__TAURI_INTERNALS__')
  })

  it('enables native clipboard capture only when the mode is active', async () => {
    render(<HookHarness clipboardCaptureMode='off' />)

    expect(desktopLifecycle.setDesktopClipboardCaptureEnabled).toHaveBeenCalledWith(false)
  })

  it('suppresses native clipboard capture after an in-app copy event', async () => {
    render(<HookHarness suppressionWindowMs={1200} />)
    document.dispatchEvent(new Event('copy', { bubbles: true }))

    expect(desktopLifecycle.suppressDesktopClipboardCapture).toHaveBeenCalledWith(1200)
  })

  it('saves confirmed text blocks into the inbox', async () => {
    const appendClipboardCaptureToInbox = vi.fn(async () => undefined)
    desktopLifecycle.takeConfirmedDesktopClipboardCapture.mockResolvedValueOnce({
      candidate: {
        kind: 'text',
        text: 'first\n\nsecond',
      },
      capturedAt: '2026-07-09T00:00:00.000Z',
    })

    render(<HookHarness appendClipboardCaptureToInbox={appendClipboardCaptureToInbox} />)

    await act(async () => {
      await desktopLifecycle.emitConfirm()
    })

    expect(appendClipboardCaptureToInbox).toHaveBeenCalledTimes(1)
    expect(appendClipboardCaptureToInbox).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ type: 'paragraph', text: 'first' }),
        expect.objectContaining({ type: 'paragraph', text: 'second' }),
      ]),
      '2026-07-09T00:00:00.000Z',
    )
  })

  it('consumes a confirmed capture when the window regains focus', async () => {
    const appendClipboardCaptureToInbox = vi.fn(async () => undefined)
    desktopLifecycle.takeConfirmedDesktopClipboardCapture.mockResolvedValueOnce({
      candidate: {
        kind: 'text',
        text: 'focus fallback text',
      },
      capturedAt: '2026-07-09T00:00:00.000Z',
    })

    render(<HookHarness appendClipboardCaptureToInbox={appendClipboardCaptureToInbox} />)

    await act(async () => {
      await desktopLifecycle.emitFocusChanged(true)
    })

    expect(appendClipboardCaptureToInbox).toHaveBeenCalledWith(
      [expect.objectContaining({ type: 'paragraph', text: 'focus fallback text' })],
      '2026-07-09T00:00:00.000Z',
    )
  })

  it('polls for confirmed captures so a lost click event still reaches the inbox', async () => {
    const appendClipboardCaptureToInbox = vi.fn(async () => undefined)
    desktopLifecycle.takeConfirmedDesktopClipboardCapture
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        candidate: {
          kind: 'text',
          text: 'polled fallback text',
        },
        capturedAt: '2026-07-09T00:00:00.000Z',
      })

    render(
      <HookHarness
        appendClipboardCaptureToInbox={appendClipboardCaptureToInbox}
        confirmPollIntervalMs={300}
      />,
    )

    await act(async () => {
      await vi.advanceTimersByTimeAsync(300)
    })

    expect(appendClipboardCaptureToInbox).toHaveBeenCalledWith(
      [expect.objectContaining({ type: 'paragraph', text: 'polled fallback text' })],
      '2026-07-09T00:00:00.000Z',
    )
  })

  it('writes clipboard bitmap bytes as an image block after confirmation', async () => {
    const appendClipboardCaptureToInbox = vi.fn(async () => undefined)
    desktopLifecycle.takeConfirmedDesktopClipboardCapture.mockResolvedValueOnce({
      candidate: {
        kind: 'image_bytes',
        bytes: new Uint8Array([137, 80, 78, 71]),
      },
      capturedAt: '2026-07-09T00:00:00.000Z',
    })

    render(<HookHarness appendClipboardCaptureToInbox={appendClipboardCaptureToInbox} />)

    await act(async () => {
      await desktopLifecycle.emitConfirm()
    })

    expect(assets.writeAssetBytes).toHaveBeenCalledTimes(1)
    expect(appendClipboardCaptureToInbox).toHaveBeenCalledWith(
      [
        expect.objectContaining({
          type: 'image',
          assetId: 'asset_clipboard_image',
          name: 'clipboard.png',
          mimeType: 'image/png',
        }),
      ],
      '2026-07-09T00:00:00.000Z',
    )
  })

  it('imports a copied local image path as an image block after confirmation', async () => {
    const appendClipboardCaptureToInbox = vi.fn(async () => undefined)
    desktopLifecycle.takeConfirmedDesktopClipboardCapture.mockResolvedValueOnce({
      candidate: {
        kind: 'image_file',
        path: 'C:/tmp/photo.png',
      },
      capturedAt: '2026-07-09T00:00:00.000Z',
    })

    render(<HookHarness appendClipboardCaptureToInbox={appendClipboardCaptureToInbox} />)

    await act(async () => {
      await desktopLifecycle.emitConfirm()
    })

    expect(assets.importImageAssetFromPath).toHaveBeenCalledWith('C:/tmp/photo.png')
    expect(appendClipboardCaptureToInbox).toHaveBeenCalledWith(
      [
        expect.objectContaining({
          type: 'image',
          assetId: 'asset_local_image',
          name: 'photo.png',
          mimeType: 'image/png',
        }),
      ],
      '2026-07-09T00:00:00.000Z',
    )
  })

  it('shows a failure notification instead of writing a broken block when image import fails', async () => {
    const appendClipboardCaptureToInbox = vi.fn(async () => undefined)
    assets.importImageAssetFromPath.mockRejectedValueOnce(new Error('boom'))
    desktopLifecycle.takeConfirmedDesktopClipboardCapture.mockResolvedValueOnce({
      candidate: {
        kind: 'image_file',
        path: 'C:/tmp/photo.png',
      },
      capturedAt: '2026-07-09T00:00:00.000Z',
    })

    render(<HookHarness appendClipboardCaptureToInbox={appendClipboardCaptureToInbox} />)

    await act(async () => {
      await desktopLifecycle.emitConfirm()
    })

    expect(desktopLifecycle.showDesktopClipboardCaptureFailureNotification).toHaveBeenCalledTimes(1)
    expect(appendClipboardCaptureToInbox).not.toHaveBeenCalled()
  })
})
