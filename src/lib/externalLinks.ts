import { invoke, isTauri } from '@tauri-apps/api/core'

export async function openExternalLink(url: string) {
  if (isTauri()) {
    await invoke('open_external_url', { url })
    return
  }

  window.open(url, '_blank', 'noopener,noreferrer')
}
