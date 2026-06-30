import { invoke, isTauri } from '@tauri-apps/api/core'
import { listen, type UnlistenFn } from '@tauri-apps/api/event'
import { getCurrentWindow } from '@tauri-apps/api/window'

export const DESKTOP_QUIT_REQUESTED_EVENT = 'personal-notebook://quit-requested'
export const QUIT_AFTER_PENDING_SAVES_COMMAND = 'quit_app_after_pending_saves'

type FlushPendingSaves = () => Promise<void>

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
