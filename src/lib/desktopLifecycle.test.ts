import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  DESKTOP_TRAY_NEW_NOTE_EVENT,
  DESKTOP_TRAY_OPEN_INBOX_EVENT,
  DESKTOP_QUIT_REQUESTED_EVENT,
  QUIT_AFTER_PENDING_SAVES_COMMAND,
  registerDesktopPendingSaveFlush,
  registerDesktopTrayActions,
} from './desktopLifecycle'

const mocks = vi.hoisted(() => ({
  isTauri: vi.fn(() => true),
  invoke: vi.fn(async () => undefined),
  hide: vi.fn(async () => undefined),
  listen: vi.fn(),
  onCloseRequested: vi.fn(),
}))

vi.mock('@tauri-apps/api/core', () => ({
  isTauri: mocks.isTauri,
  invoke: mocks.invoke,
}))

vi.mock('@tauri-apps/api/window', () => ({
  getCurrentWindow: () => ({
    hide: mocks.hide,
    onCloseRequested: mocks.onCloseRequested,
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
    mocks.listen.mockResolvedValue(() => undefined)
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

  it('does not register desktop lifecycle hooks outside Tauri', async () => {
    mocks.isTauri.mockReturnValue(false)

    await registerDesktopPendingSaveFlush(async () => undefined)

    expect(mocks.onCloseRequested).not.toHaveBeenCalled()
    expect(mocks.listen).not.toHaveBeenCalled()
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
