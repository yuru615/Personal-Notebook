import { invoke, isTauri } from '@tauri-apps/api/core'

export async function openAssetFile(assetId: string) {
  if (!assetId || !isTauri()) {
    return
  }

  await invoke('open_asset_file', { assetId })
}
