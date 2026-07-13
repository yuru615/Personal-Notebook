import { invoke, isTauri } from '@tauri-apps/api/core'
import { listen, type UnlistenFn } from '@tauri-apps/api/event'
import { getCurrentWindow } from '@tauri-apps/api/window'

export const DESKTOP_QUIT_REQUESTED_EVENT = 'zhiqi://quit-requested'
export const DESKTOP_TRAY_NEW_NOTE_EVENT = 'zhiqi://tray-new-note'
export const DESKTOP_TRAY_OPEN_INBOX_EVENT = 'zhiqi://tray-open-inbox'
export const CLIPBOARD_CAPTURE_CONFIRM_EVENT = 'zhiqi://clipboard-capture-confirm'
export const QUIT_AFTER_PENDING_SAVES_COMMAND = 'quit_app_after_pending_saves'
export const READ_CLIPBOARD_CANDIDATE_COMMAND = 'read_clipboard_candidate'
export const SHOW_CLIPBOARD_CAPTURE_NOTIFICATION_COMMAND = 'show_clipboard_capture_notification'
export const SHOW_CLIPBOARD_CAPTURE_FAILURE_NOTIFICATION_COMMAND =
  'show_clipboard_capture_failure_notification'
export const SET_CLIPBOARD_CAPTURE_ENABLED_COMMAND = 'set_clipboard_capture_enabled'
export const TAKE_CONFIRMED_CLIPBOARD_CAPTURE_COMMAND = 'take_confirmed_clipboard_capture'
export const SUPPRESS_CLIPBOARD_CAPTURE_COMMAND = 'suppress_clipboard_capture'

const INLINE_CLIPBOARD_PROMPT_TEST_ID = 'clipboard-capture-inline-prompt'

const clipboardCaptureConfirmTarget = new EventTarget()

type FlushPendingSaves = () => Promise<void>
type CloseAction = 'hide_to_tray' | 'quit'

interface DesktopClipboardTextCandidate {
  kind: 'text'
  text: string
  html?: string | null
}

interface DesktopClipboardImageBytesCandidate {
  kind: 'image_bytes'
  bytes: Uint8Array
}

interface DesktopClipboardImageFileCandidate {
  kind: 'image_file'
  path: string
}

type DesktopClipboardCandidateWire =
  | DesktopClipboardTextCandidate
  | {
      kind: 'image_bytes'
      bytes: Uint8Array | number[]
    }
  | DesktopClipboardImageFileCandidate

export type DesktopClipboardCandidate =
  | DesktopClipboardTextCandidate
  | DesktopClipboardImageBytesCandidate
  | DesktopClipboardImageFileCandidate

interface DesktopClipboardCaptureNotificationPayload {
  title: string
  body: string
  confirmLabel: string
}

interface DesktopClipboardCaptureFailureNotificationPayload {
  title: string
  body: string
}

interface ConfirmedDesktopClipboardCapture {
  candidate: DesktopClipboardCandidate
  capturedAt: string
}

interface DesktopTrayHandlers {
  onNewNote: () => Promise<void> | void
  onOpenInbox: () => Promise<void> | void
}

export async function registerDesktopWindowFocusChanged(
  onFocusChanged: (focused: boolean) => Promise<void> | void,
): Promise<UnlistenFn> {
  if (!isTauri()) {
    return () => undefined
  }

  return getCurrentWindow().onFocusChanged(async ({ payload }) => {
    await onFocusChanged(payload)
  })
}

export async function registerDesktopPendingSaveFlush(
  flushPendingSaves: FlushPendingSaves,
  getCloseAction: () => CloseAction = () => 'hide_to_tray',
): Promise<UnlistenFn> {
  if (!isTauri()) {
    return () => undefined
  }

  const currentWindow = getCurrentWindow()
  const unlistenClose = await currentWindow.onCloseRequested(async (event) => {
    event.preventDefault()

    try {
      await flushPendingSaves()
      if (getCloseAction() === 'quit') {
        await invoke(QUIT_AFTER_PENDING_SAVES_COMMAND)
        return
      }
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

export async function setDesktopClipboardCaptureEnabled(enabled: boolean) {
  if (!isTauri()) {
    return
  }

  await invoke(SET_CLIPBOARD_CAPTURE_ENABLED_COMMAND, { enabled })
}

export async function takeConfirmedDesktopClipboardCapture(): Promise<ConfirmedDesktopClipboardCapture | null> {
  if (!isTauri()) {
    return null
  }

  const capture = await invoke<ConfirmedDesktopClipboardCapture | null>(
    TAKE_CONFIRMED_CLIPBOARD_CAPTURE_COMMAND,
  )
  if (!capture || capture.candidate.kind !== 'image_bytes') {
    return capture
  }

  return {
    ...capture,
    candidate: {
      kind: 'image_bytes',
      bytes:
        capture.candidate.bytes instanceof Uint8Array
          ? capture.candidate.bytes
          : new Uint8Array(capture.candidate.bytes),
    },
  }
}

export async function suppressDesktopClipboardCapture(durationMs: number) {
  if (!isTauri()) {
    return
  }

  await invoke(SUPPRESS_CLIPBOARD_CAPTURE_COMMAND, { durationMs })
}

export async function readDesktopClipboardCandidate(): Promise<DesktopClipboardCandidate | null> {
  if (!isTauri()) {
    return null
  }

  const candidate = await invoke<DesktopClipboardCandidateWire | null>(
    READ_CLIPBOARD_CANDIDATE_COMMAND,
  )
  if (!candidate || candidate.kind !== 'image_bytes') {
    return candidate
  }

  return {
    kind: 'image_bytes',
    bytes:
      candidate.bytes instanceof Uint8Array ? candidate.bytes : new Uint8Array(candidate.bytes),
  }
}

export async function showDesktopClipboardCaptureNotification(
  payload: DesktopClipboardCaptureNotificationPayload,
) {
  if (!isTauri()) {
    return false
  }

  try {
    await invoke(SHOW_CLIPBOARD_CAPTURE_NOTIFICATION_COMMAND, { payload })
    return true
  } catch {
    // Fall back to the web notification path inside desktop development builds.
  }

  const notification = await createDesktopNotification({
    title: payload.title,
    body: `${payload.body}\n${payload.confirmLabel}`,
    tag: CLIPBOARD_CAPTURE_CONFIRM_EVENT,
    requireInteraction: true,
  })

  if (!notification) {
    showInlineClipboardPrompt(payload)
    return true
  }

  notification.onclick = () => {
    clipboardCaptureConfirmTarget.dispatchEvent(new Event(CLIPBOARD_CAPTURE_CONFIRM_EVENT))
    notification.close()
  }

  return true
}

export async function showDesktopClipboardCaptureFailureNotification(
  payload: DesktopClipboardCaptureFailureNotificationPayload,
) {
  if (!isTauri()) {
    return false
  }

  try {
    await invoke(SHOW_CLIPBOARD_CAPTURE_FAILURE_NOTIFICATION_COMMAND, { payload })
    return true
  } catch {
    // Fall back to the web notification path inside desktop development builds.
  }

  const notification = await createDesktopNotification({
    title: payload.title,
    body: payload.body,
    tag: SHOW_CLIPBOARD_CAPTURE_FAILURE_NOTIFICATION_COMMAND,
  })

  if (notification) {
    return true
  }

  showInlineClipboardFailurePrompt(payload)
  return true
}

export async function registerDesktopClipboardCaptureConfirm(
  onConfirm: () => Promise<void> | void,
): Promise<UnlistenFn> {
  if (!isTauri()) {
    return () => undefined
  }

  const listener = async () => {
    await onConfirm()
  }

  clipboardCaptureConfirmTarget.addEventListener(CLIPBOARD_CAPTURE_CONFIRM_EVENT, listener)
  const unlistenDesktopConfirm = await listen(CLIPBOARD_CAPTURE_CONFIRM_EVENT, listener)

  return () => {
    clipboardCaptureConfirmTarget.removeEventListener(CLIPBOARD_CAPTURE_CONFIRM_EVENT, listener)
    unlistenDesktopConfirm()
  }
}

async function createDesktopNotification(options: NotificationOptions & { title: string }) {
  if (typeof Notification === 'undefined') {
    return null
  }

  if (Notification.permission === 'default') {
    const permission = await Notification.requestPermission()
    if (permission !== 'granted') {
      return null
    }
  } else if (Notification.permission !== 'granted') {
    return null
  }

  return new Notification(options.title, options)
}

function showInlineClipboardPrompt(payload: DesktopClipboardCaptureNotificationPayload) {
  const prompt = createInlineClipboardPromptShell()
  prompt.innerHTML = ''

  const title = document.createElement('div')
  title.textContent = payload.title
  title.style.fontSize = '13px'
  title.style.fontWeight = '600'
  title.style.color = '#111827'

  const body = document.createElement('div')
  body.textContent = payload.body
  body.style.fontSize = '13px'
  body.style.lineHeight = '1.5'
  body.style.color = '#4b5563'

  const actions = document.createElement('div')
  actions.style.display = 'flex'
  actions.style.justifyContent = 'flex-end'
  actions.style.gap = '8px'

  const dismissButton = document.createElement('button')
  dismissButton.type = 'button'
  dismissButton.textContent = 'Close'
  applyInlinePromptButtonStyle(dismissButton, false)
  dismissButton.onclick = () => {
    prompt.remove()
  }

  const confirmButton = document.createElement('button')
  confirmButton.type = 'button'
  confirmButton.textContent = payload.confirmLabel
  applyInlinePromptButtonStyle(confirmButton, true)
  confirmButton.onclick = () => {
    clipboardCaptureConfirmTarget.dispatchEvent(new Event(CLIPBOARD_CAPTURE_CONFIRM_EVENT))
    prompt.remove()
  }

  actions.append(dismissButton, confirmButton)
  prompt.append(title, body, actions)
}

function showInlineClipboardFailurePrompt(payload: DesktopClipboardCaptureFailureNotificationPayload) {
  const prompt = createInlineClipboardPromptShell()
  prompt.innerHTML = ''

  const title = document.createElement('div')
  title.textContent = payload.title
  title.style.fontSize = '13px'
  title.style.fontWeight = '600'
  title.style.color = '#991b1b'

  const body = document.createElement('div')
  body.textContent = payload.body
  body.style.fontSize = '13px'
  body.style.lineHeight = '1.5'
  body.style.color = '#7f1d1d'

  const closeButton = document.createElement('button')
  closeButton.type = 'button'
  closeButton.textContent = 'OK'
  applyInlinePromptButtonStyle(closeButton, true)
  closeButton.style.alignSelf = 'flex-end'
  closeButton.onclick = () => {
    prompt.remove()
  }

  prompt.append(title, body, closeButton)
}

function createInlineClipboardPromptShell() {
  const existing = document.querySelector(`[data-testid="${INLINE_CLIPBOARD_PROMPT_TEST_ID}"]`)
  existing?.remove()

  const prompt = document.createElement('div')
  prompt.dataset.testid = INLINE_CLIPBOARD_PROMPT_TEST_ID
  prompt.style.position = 'fixed'
  prompt.style.right = '16px'
  prompt.style.bottom = '16px'
  prompt.style.zIndex = '2147483647'
  prompt.style.width = 'min(360px, calc(100vw - 32px))'
  prompt.style.maxWidth = 'calc(100vw - 32px)'
  prompt.style.display = 'flex'
  prompt.style.flexDirection = 'column'
  prompt.style.gap = '10px'
  prompt.style.padding = '14px'
  prompt.style.borderRadius = '12px'
  prompt.style.background = 'rgba(255,255,255,0.98)'
  prompt.style.border = '1px solid rgba(15, 23, 42, 0.08)'
  prompt.style.boxShadow = '0 16px 40px rgba(15, 23, 42, 0.16)'
  prompt.style.backdropFilter = 'blur(10px)'

  document.body.appendChild(prompt)
  return prompt
}

function applyInlinePromptButtonStyle(button: HTMLButtonElement, primary: boolean) {
  button.style.border = 'none'
  button.style.borderRadius = '10px'
  button.style.padding = '8px 12px'
  button.style.fontSize = '12px'
  button.style.fontWeight = '600'
  button.style.cursor = 'pointer'
  button.style.transition = 'background 120ms ease'

  if (primary) {
    button.style.background = '#111827'
    button.style.color = '#ffffff'
    return
  }

  button.style.background = '#f3f4f6'
  button.style.color = '#374151'
}
