import { afterEach, describe, expect, it, vi } from 'vitest'
import { openAssetFile } from './assetFiles'

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
  isTauri: vi.fn(() => false),
}))

describe('openAssetFile', () => {
  afterEach(async () => {
    vi.restoreAllMocks()
    const tauriApi = await import('@tauri-apps/api/core')
    vi.mocked(tauriApi.isTauri).mockReturnValue(false)
  })

  it('opens a managed asset through the desktop command', async () => {
    const tauriApi = await import('@tauri-apps/api/core')
    vi.mocked(tauriApi.isTauri).mockReturnValue(true)

    await openAssetFile('asset_abc')

    expect(tauriApi.invoke).toHaveBeenCalledWith('open_asset_file', { assetId: 'asset_abc' })
  })
})
