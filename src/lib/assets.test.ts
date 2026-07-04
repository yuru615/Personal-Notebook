import { afterEach, describe, expect, it, vi } from 'vitest'

const invoke = vi.fn()

vi.mock('@tauri-apps/api/core', () => ({
  convertFileSrc: (path: string) => `asset://${path}`,
  invoke,
}))

vi.mock('@tauri-apps/plugin-dialog', () => ({
  open: vi.fn(),
  save: vi.fn(),
}))

vi.mock('@tauri-apps/plugin-fs', () => ({
  readFile: vi.fn(),
  readTextFile: vi.fn(),
  writeFile: vi.fn(),
  writeTextFile: vi.fn(),
}))

describe('asset helpers', () => {
  afterEach(() => {
    vi.clearAllMocks()
    vi.restoreAllMocks()
    window.localStorage.clear()
    Reflect.deleteProperty(globalThis, '__TAURI_INTERNALS__')
  })

  it('imports selected media by local path in desktop runtime', async () => {
    Object.defineProperty(globalThis, '__TAURI_INTERNALS__', {
      configurable: true,
      value: {},
    })

    const dialog = await import('@tauri-apps/plugin-dialog')
    const fs = await import('@tauri-apps/plugin-fs')
    vi.mocked(dialog.open).mockResolvedValue('/tmp/media/clip.mp4')
    invoke.mockResolvedValue({
      id: 'asset_video',
      sha256: 'sha',
      name: 'clip.mp4',
      mimeType: 'video/mp4',
      byteSize: 10,
      relativePath: 'sh/sha.mp4',
      createdAt: '2026-07-02T00:00:00.000Z',
    })

    const { selectAndImportAsset } = await import('./assets')

    await expect(selectAndImportAsset('video')).resolves.toMatchObject({
      id: 'asset_video',
    })
    expect(dialog.open).toHaveBeenCalledWith({
      multiple: false,
      directory: false,
      filters: [{ name: 'Video', extensions: ['mp4', 'webm', 'mov', 'm4v'] }],
    })
    expect(fs.readFile).not.toHaveBeenCalled()
    expect(invoke).toHaveBeenCalledWith('import_asset_file', {
      input: {
        path: '/tmp/media/clip.mp4',
        mimeType: 'video/mp4',
      },
    })
  })

  it('stores browser preview assets without Tauri', async () => {
    const { getAssetUrl, readAsset, writeAssetBytes } = await import('./assets')

    const asset = await writeAssetBytes({
      name: 'photo.png',
      mimeType: 'image/png',
      bytes: new Uint8Array([1, 2, 3]),
    })

    await expect(getAssetUrl(asset.id)).resolves.toBe('data:image/png;base64,AQID')
    await expect(readAsset(asset.id)).resolves.toEqual(new Uint8Array([1, 2, 3]))
    expect(invoke).not.toHaveBeenCalled()
  })
})
