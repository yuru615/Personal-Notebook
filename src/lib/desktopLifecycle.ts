import { invoke, isTauri } from '@tauri-apps/api/core'
import { listen, type UnlistenFn } from '@tauri-apps/api/event'
import { getCurrentWindow } from '@tauri-apps/api/window'

export const DESKTOP_QUIT_REQUESTED_EVENT = 'zhixi://quit-requested'
export const DESKTOP_TRAY_NEW_NOTE_EVENT = 'zhixi://tray-new-note'
export const DESKTOP_TRAY_OPEN_INBOX_EVENT = 'zhixi://tray-open-inbox'
export const QUIT_AFTER_PENDING_SAVES_COMMAND = 'quit_app_after_pending_saves'

type FlushPendingSaves = () => Promise<void>

interface DesktopTrayHandlers {
  onNewNote: () => Promise<void> | void
  onOpenInbox: () => Promise<void> | void
}

export async function registerDesktopPendingSaveFlush(
  flushPendingSaves: FlushPendingSaves,
): Promise<UnlistenFn> {
  if (!isTauri()) {
    return () => undefined
  }

  const currentWindow = getCurrentWindow()
  const unlistenClose = await currentWindow.onCloseRequested(async (event) => {
    event.preventDefault()

    try {
      await flushPendingSaves()
      await currentWindow.hide()
    } catch {
      // Keep the app alive if the final save failed; the store has already marked saveStatus.
    }
  })
  const unlistenQuit = await listen(DESKTOP_QUIT_REQUESTED_EVENT, async () => {
    try {
      await flushPendingSaves()
      await invoke(QUIT_AFTER_PENDING_SAVES_COMMAND)
    } catch {
      // Do not exit while pending data failed to reach storage.
    }
  })

  return () => {
    unlistenClose()
    unlistenQuit()
  }
}

export async function registerDesktopTrayActions({
  onNewNote,
  onOpenInbox,
}: DesktopTrayHandlers): Promise<UnlistenFn> {
  if (!isTauri()) {
    return () => undefined
  }

  const unlistenNewNote = await listen(DESKTOP_TRAY_NEW_NOTE_EVENT, async () => {
    await onNewNote()
  })
  const unlistenOpenInbox = await listen(DESKTOP_TRAY_OPEN_INBOX_EVENT, async () => {
    await onOpenInbox()
  })

  return () => {
    unlistenNewNote()
    unlistenOpenInbox()
  }
}
