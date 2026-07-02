import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { WorkspaceSnapshot } from '../domain/types'

const invoke = vi.fn()

vi.mock('@tauri-apps/api/core', () => ({
  invoke,
}))

describe('createTauriStorageClient', () => {
  beforeEach(() => {
    invoke.mockReset()
  })

  it('exports and replaces workspace backups through typed Tauri commands', async () => {
    const { createTauriStorageClient } = await import('./storageClient')
    const snapshot: WorkspaceSnapshot = {
      boards: [],
      dataTables: [],
      mindmaps: [],
      pages: [],
      settings: {
        lastOpenedPageId: null,
      },
    }
    invoke.mockResolvedValueOnce(snapshot).mockResolvedValueOnce(undefined)

    const client = createTauriStorageClient()

    await expect(client.exportWorkspaceBackup()).resolves.toEqual(snapshot)
    await client.replaceWorkspaceBackup(snapshot)
    await client.savePage({
      id: 'page_1',
      parentId: null,
      title: 'Home',
      icon: null,
      cover: null,
      blocks: [],
      createdAt: '2026-06-30T00:00:00.000Z',
      updatedAt: '2026-06-30T00:00:00.000Z',
    })

    expect(invoke).toHaveBeenNthCalledWith(1, 'export_workspace_backup')
    expect(invoke).toHaveBeenNthCalledWith(2, 'replace_workspace_backup', { payload: snapshot })
    expect(invoke).toHaveBeenNthCalledWith(3, 'save_page', {
      page: {
        id: 'page_1',
        parentId: null,
        title: 'Home',
        icon: null,
        cover: null,
        blocks: [],
        createdAt: '2026-06-30T00:00:00.000Z',
        updatedAt: '2026-06-30T00:00:00.000Z',
      },
    })
  })

  it('searches through the backend search command with a bounded limit', async () => {
    const { createTauriStorageClient } = await import('./storageClient')
    invoke.mockResolvedValueOnce([
      {
        kind: 'page',
        pageId: 'page_1',
        title: 'Home',
        icon: null,
        excerpt: 'Home',
      },
    ])

    const client = createTauriStorageClient()

    await expect(client.searchWorkspace('home', 12)).resolves.toMatchObject([
      { kind: 'page', pageId: 'page_1' },
    ])
    expect(invoke).toHaveBeenCalledWith('search_workspace', { query: 'home', limit: 12 })
  })

  it('writes assets and resolves asset file paths through typed Tauri commands', async () => {
    const { createTauriStorageClient } = await import('./storageClient')
    invoke
      .mockResolvedValueOnce({
        id: 'asset_abc',
        sha256: 'abc',
        name: 'clip.mp4',
        mimeType: 'video/mp4',
        byteSize: 3,
        relativePath: 'ab/abc.mp4',
        createdAt: 'unix-ms:1',
      })
      .mockResolvedValueOnce('/app/assets/ab/abc.mp4')

    const client = createTauriStorageClient()
    const bytes = new Uint8Array([1, 2, 3])

    await expect(
      client.writeAsset({
        name: 'clip.mp4',
        mimeType: 'video/mp4',
        bytes,
      }),
    ).resolves.toMatchObject({ id: 'asset_abc' })
    await expect(client.getAssetFilePath('asset_abc')).resolves.toBe('/app/assets/ab/abc.mp4')

    expect(invoke).toHaveBeenNthCalledWith(1, 'write_asset', {
      input: {
        name: 'clip.mp4',
        mimeType: 'video/mp4',
        bytes,
      },
    })
    expect(invoke).toHaveBeenNthCalledWith(2, 'get_asset_file_path', {
      assetId: 'asset_abc',
    })
  })

  it('exports and imports complete workspace archive bytes', async () => {
    const { createTauriStorageClient } = await import('./storageClient')
    const bytes = new Uint8Array([80, 75, 3, 4])
    invoke.mockResolvedValueOnce(bytes).mockResolvedValueOnce(undefined)

    const client = createTauriStorageClient()

    await expect(client.exportWorkspaceArchive()).resolves.toBe(bytes)
    await client.importWorkspaceArchive(bytes)

    expect(invoke).toHaveBeenNthCalledWith(1, 'export_workspace_archive')
    expect(invoke).toHaveBeenNthCalledWith(2, 'import_workspace_archive', { bytes })
  })

  it('normalizes archive bytes returned from Tauri into a Uint8Array', async () => {
    const { createTauriStorageClient } = await import('./storageClient')
    invoke.mockResolvedValueOnce([80, 75, 3, 4])

    const client = createTauriStorageClient()
    const bytes = await client.exportWorkspaceArchive()

    expect(bytes).toBeInstanceOf(Uint8Array)
    expect([...bytes]).toEqual([80, 75, 3, 4])
  })

  it('normalizes asset bytes returned from Tauri into a Uint8Array', async () => {
    const { createTauriStorageClient } = await import('./storageClient')
    invoke.mockResolvedValueOnce([1, 2, 3])

    const client = createTauriStorageClient()
    const bytes = await client.readAsset('asset_abc')

    expect(bytes).toBeInstanceOf(Uint8Array)
    expect([...bytes]).toEqual([1, 2, 3])
    expect(invoke).toHaveBeenCalledWith('read_asset', { assetId: 'asset_abc' })
  })
})
