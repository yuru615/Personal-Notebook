import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  CLIPBOARD_CAPTURE_CONFIRM_EVENT,
  DESKTOP_TRAY_NEW_NOTE_EVENT,
  DESKTOP_TRAY_OPEN_INBOX_EVENT,
  DESKTOP_QUIT_REQUESTED_EVENT,
  QUIT_AFTER_PENDING_SAVES_COMMAND,
  readDesktopClipboardCandidate,
  registerDesktopClipboardCaptureConfirm,
  registerDesktopPendingSaveFlush,
  registerDesktopTrayActions,
  registerDesktopWindowFocusChanged,
  setDesktopClipboardCaptureEnabled,
  showDesktopClipboardCaptureFailureNotification,
  showDesktopClipboardCaptureNotification,
  suppressDesktopClipboardCapture,
  takeConfirmedDesktopClipboardCapture,
} from './desktopLifecycle'

const mocks = vi.hoisted(() => ({
  isTauri: vi.fn(() => true),
  invoke: vi.fn(async () => undefined),
  hide: vi.fn(async () => undefined),
  listen: vi.fn(),
  onCloseRequested: vi.fn(),
  onFocusChanged: vi.fn(),
}))

class MockNotification {
  static permission: NotificationPermission = 'granted'
  static requestPermission = vi.fn(async () => MockNotification.permission)
  static instances: MockNotification[] = []

  onclick: ((event: Event) => void) | null = null
  closed = false

  constructor(
    readonly title: string,
    readonly options?: NotificationOptions,
  ) {
    MockNotification.instances.push(this)
  }

  close() {
    this.closed = true
  }
}

vi.mock('@tauri-apps/api/core', () => ({
  isTauri: mocks.isTauri,
  invoke: mocks.invoke,
}))

vi.mock('@tauri-apps/api/window', () => ({
  getCurrentWindow: () => ({
    hide: mocks.hide,
    onCloseRequested: mocks.onCloseRequested,
    onFocusChanged: mocks.onFocusChanged,
  }),
}))

vi.mock('@tauri-apps/api/event', () => ({
  listen: mocks.listen,
}))

describe('desktopLifecycle', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.isTauri.mockReturnValue(true)
    mocks.invoke.mockResolvedValue(undefined)
    mocks.hide.mockResolvedValue(undefined)
    mocks.onCloseRequested.mockResolvedValue(() => undefined)
    mocks.onFocusChanged.mockResolvedValue(() => undefined)
    mocks.listen.mockResolvedValue(() => undefined)
    MockNotification.permission = 'granted'
    MockNotification.instances = []
    MockNotification.requestPermission.mockImplementation(async () => {
      MockNotification.permission = 'granted'
      return 'granted'
    })
    vi.stubGlobal('Notification', MockNotification as unknown as typeof Notification)
  })

  it('waits for pending saves before hiding a Tauri window close request', async () => {
    const calls: string[] = []
    const flushPendingSaves = vi.fn(async () => {
      calls.push('flush')
    })
    let closeHandler: ((event: { preventDefault: () => void }) => Promise<void>) | null = null
    mocks.onCloseRequested.mockImplementation(async (handler) => {
      closeHandler = handler
      return () => undefined
    })
    mocks.hide.mockImplementation(async () => {
      calls.push('hide')
    })

    await registerDesktopPendingSaveFlush(flushPendingSaves)

    const preventDefault = vi.fn()
    await closeHandler?.({ preventDefault })

    expect(preventDefault).toHaveBeenCalledTimes(1)
    expect(flushPendingSaves).toHaveBeenCalledTimes(1)
    expect(mocks.hide).toHaveBeenCalledTimes(1)
    expect(calls).toEqual(['flush', 'hide'])
  })

  it('waits for pending saves before exiting from the Tauri quit event', async () => {
    const calls: string[] = []
    const flushPendingSaves = vi.fn(async () => {
      calls.push('flush')
    })
    let quitHandler: (() => Promise<void>) | null = null
    mocks.listen.mockImplementation(async (event, handler) => {
      if (event === DESKTOP_QUIT_REQUESTED_EVENT) {
        quitHandler = handler
      }
      return () => undefined
    })
    mocks.invoke.mockImplementation(async () => {
      calls.push('exit')
    })

    await registerDesktopPendingSaveFlush(flushPendingSaves)

    await quitHandler?.()

    expect(mocks.listen).toHaveBeenCalledWith(DESKTOP_QUIT_REQUESTED_EVENT, expect.any(Function))
    expect(flushPendingSaves).toHaveBeenCalledTimes(1)
    expect(mocks.invoke).toHaveBeenCalledWith(QUIT_AFTER_PENDING_SAVES_COMMAND)
    expect(calls).toEqual(['flush', 'exit'])
  })

  it('quits after flushing pending saves when close action is quit', async () => {
    let closeHandler: ((event: { preventDefault: () => void }) => Promise<void>) | null = null

    mocks.onCloseRequested.mockImplementation(async (handler) => {
      closeHandler = handler
      return () => undefined
    })

    await registerDesktopPendingSaveFlush(
      async () => undefined,
      () => 'quit',
    )

    await closeHandler?.({ preventDefault: () => undefined })

    expect(mocks.invoke).toHaveBeenCalledWith(QUIT_AFTER_PENDING_SAVES_COMMAND)
    expect(mocks.hide).not.toHaveBeenCalled()
  })

  it('does not register desktop lifecycle hooks outside Tauri', async () => {
    mocks.isTauri.mockReturnValue(false)

    await registerDesktopPendingSaveFlush(async () => undefined)

    expect(mocks.onCloseRequested).not.toHaveBeenCalled()
    expect(mocks.listen).not.toHaveBeenCalled()
  })

  it('normalizes numeric image bytes into Uint8Array', async () => {
    mocks.invoke.mockResolvedValue({
      kind: 'image_bytes',
      bytes: [137, 80, 78, 71],
    })

    const candidate = await readDesktopClipboardCandidate()

    expect(mocks.invoke).toHaveBeenCalledWith('read_clipboard_candidate')
    expect(candidate).toEqual({
      kind: 'image_bytes',
      bytes: new Uint8Array([137, 80, 78, 71]),
    })
    expect(candidate?.kind === 'image_bytes' && candidate.bytes).toBeInstanceOf(Uint8Array)
  })

  it('registers and unregisters the clipboard confirm desktop event', async () => {
    const onConfirm = vi.fn()
    let backendConfirmHandler: (() => Promise<void>) | null = null

    mocks.listen.mockImplementation(async (event, handler) => {
      if (event === CLIPBOARD_CAPTURE_CONFIRM_EVENT) {
        backendConfirmHandler = handler
      }
      return () => undefined
    })

    const stop = await registerDesktopClipboardCaptureConfirm(onConfirm)
    await backendConfirmHandler?.()
    stop()

    expect(onConfirm).toHaveBeenCalledTimes(1)
  })

  it('registers and unregisters desktop window focus change events', async () => {
    const onFocusChanged = vi.fn()
    let focusHandler: ((event: { payload: boolean }) => Promise<void>) | null = null

    mocks.onFocusChanged.mockImplementation(async (handler) => {
      focusHandler = handler
      return () => undefined
    })

    const stop = await registerDesktopWindowFocusChanged(onFocusChanged)
    await focusHandler?.({ payload: true })
    stop()

    expect(onFocusChanged).toHaveBeenCalledTimes(1)
    expect(onFocusChanged).toHaveBeenCalledWith(true)
  })

  it('passes plain text and optional html payload through the clipboard candidate wrapper', async () => {
    mocks.invoke.mockResolvedValue({
      kind: 'text',
      text: 'plain text',
      html: '<p>plain text</p>',
    })

    await expect(readDesktopClipboardCandidate()).resolves.toEqual({
      kind: 'text',
      text: 'plain text',
      html: '<p>plain text</p>',
    })
  })

  it('forwards clipboard capture enabled changes to the desktop layer', async () => {
    await setDesktopClipboardCaptureEnabled(true)
    await suppressDesktopClipboardCapture(1200)

    expect(mocks.invoke).toHaveBeenNthCalledWith(1, 'set_clipboard_capture_enabled', {
      enabled: true,
    })
    expect(mocks.invoke).toHaveBeenNthCalledWith(2, 'suppress_clipboard_capture', {
      durationMs: 1200,
    })
  })

  it('normalizes confirmed image capture bytes into Uint8Array', async () => {
    mocks.invoke.mockResolvedValueOnce({
      candidate: {
        kind: 'image_bytes',
        bytes: [137, 80, 78, 71],
      },
      capturedAt: '2026-07-09T00:00:00.000Z',
    })

    await expect(takeConfirmedDesktopClipboardCapture()).resolves.toEqual({
      candidate: {
        kind: 'image_bytes',
        bytes: new Uint8Array([137, 80, 78, 71]),
      },
      capturedAt: '2026-07-09T00:00:00.000Z',
    })
  })

  it('delegates clipboard capture notifications to the native desktop layer first', async () => {
    await showDesktopClipboardCaptureNotification({
      title: 'Clipboard captured',
      body: 'Add this to inbox?',
      confirmLabel: 'Add',
    })
    await showDesktopClipboardCaptureFailureNotification({
      title: 'Clipboard failed',
      body: 'Try again',
    })

    expect(mocks.invoke).toHaveBeenNthCalledWith(1, 'show_clipboard_capture_notification', {
      payload: {
        title: 'Clipboard captured',
        body: 'Add this to inbox?',
        confirmLabel: 'Add',
      },
    })
    expect(mocks.invoke).toHaveBeenNthCalledWith(
      2,
      'show_clipboard_capture_failure_notification',
      {
        payload: {
          title: 'Clipboard failed',
          body: 'Try again',
        },
      },
    )
    expect(MockNotification.instances).toHaveLength(0)
  })

  it('falls back to the Notification API when the native desktop notification call fails', async () => {
    mocks.invoke.mockRejectedValueOnce(new Error('native notification failed'))
    mocks.invoke.mockRejectedValueOnce(new Error('native notification failed'))
    MockNotification.permission = 'default'
    MockNotification.requestPermission.mockImplementation(async () => {
      MockNotification.permission = 'granted'
      return 'granted'
    })

    await showDesktopClipboardCaptureNotification({
      title: 'Clipboard captured',
      body: 'Add this to inbox?',
      confirmLabel: 'Add',
    })
    await showDesktopClipboardCaptureFailureNotification({
      title: 'Clipboard failed',
      body: 'Try again',
    })

    expect(MockNotification.requestPermission).toHaveBeenCalledTimes(1)
    expect(MockNotification.instances).toHaveLength(2)
    expect(MockNotification.instances[0]).toMatchObject({
      title: 'Clipboard captured',
      options: expect.objectContaining({
        body: expect.stringContaining('Add this to inbox?'),
      }),
    })
    expect(MockNotification.instances[0]?.options?.body).toContain('Add')
    expect(MockNotification.instances[1]).toMatchObject({
      title: 'Clipboard failed',
      options: expect.objectContaining({
        body: 'Try again',
      }),
    })
    expect(mocks.invoke).toHaveBeenCalledTimes(2)
  })

  it('falls back to an inline prompt when desktop notifications are denied', async () => {
    mocks.invoke.mockRejectedValueOnce(new Error('native notification failed'))
    MockNotification.permission = 'denied'
    const onConfirm = vi.fn()

    const stop = await registerDesktopClipboardCaptureConfirm(onConfirm)
    const shown = await showDesktopClipboardCaptureNotification({
      title: 'Clipboard captured',
      body: 'Add this to inbox?',
      confirmLabel: 'Add',
    })

    expect(shown).toBe(true)

    const fallback = document.querySelector(
      '[data-testid="clipboard-capture-inline-prompt"]',
    ) as HTMLDivElement | null
    expect(fallback).not.toBeNull()
    expect(fallback?.textContent).toContain('Clipboard captured')
    expect(fallback?.textContent).toContain('Add this to inbox?')
    expect(fallback?.textContent).toContain('Add')

    const confirmButton = fallback?.querySelector('button:last-of-type') as HTMLButtonElement | null
    confirmButton?.click()

    expect(onConfirm).toHaveBeenCalledTimes(1)
    expect(document.querySelector('[data-testid="clipboard-capture-inline-prompt"]')).toBeNull()
    expect(MockNotification.instances).toHaveLength(0)

    stop()
  })

  it('wires the tray new-note event to the provided handler', async () => {
    const onNewNote = vi.fn(async () => undefined)
    const onOpenInbox = vi.fn(async () => undefined)
    let newNoteHandler: (() => Promise<void>) | null = null

    mocks.listen.mockImplementation(async (event, handler) => {
      if (event === DESKTOP_TRAY_NEW_NOTE_EVENT) {
        newNoteHandler = handler
      }
      return () => undefined
    })

    await registerDesktopTrayActions({ onNewNote, onOpenInbox })
    await newNoteHandler?.()

    expect(onNewNote).toHaveBeenCalledTimes(1)
  })

  it('wires the tray open-inbox event to the provided handler', async () => {
    const onNewNote = vi.fn(async () => undefined)
    const onOpenInbox = vi.fn(async () => undefined)
    let openInboxHandler: (() => Promise<void>) | null = null

    mocks.listen.mockImplementation(async (event, handler) => {
      if (event === DESKTOP_TRAY_OPEN_INBOX_EVENT) {
        openInboxHandler = handler
      }
      return () => undefined
    })

    await registerDesktopTrayActions({ onNewNote, onOpenInbox })
    await openInboxHandler?.()

    expect(onOpenInbox).toHaveBeenCalledTimes(1)
  })
})
