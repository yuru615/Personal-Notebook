import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { WorkspaceSnapshot } from '../domain/types'

type TauriEventHandler = (event: { payload: unknown }) => void

const eventApi = vi.hoisted(() => ({
  invoke: vi.fn(),
  listen: vi.fn(),
  unlisten: vi.fn(),
  handlers: [] as TauriEventHandler[],
}))

vi.mock('@tauri-apps/api/core', () => ({
  invoke: eventApi.invoke,
}))

vi.mock('@tauri-apps/api/event', () => ({
  listen: eventApi.listen,
}))

describe('createTauriStorageClient', () => {
  beforeEach(() => {
    eventApi.invoke.mockReset()
    eventApi.listen.mockReset()
    eventApi.unlisten.mockReset()
    eventApi.handlers = []
    eventApi.listen.mockImplementation(async (_eventName, handler: TauriEventHandler) => {
      eventApi.handlers.push(handler)
      return eventApi.unlisten
    })
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
    eventApi.invoke.mockResolvedValueOnce(snapshot).mockResolvedValueOnce(undefined)

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

    expect(eventApi.invoke).toHaveBeenNthCalledWith(1, 'export_workspace_backup')
    expect(eventApi.invoke).toHaveBeenNthCalledWith(2, 'replace_workspace_backup', { payload: snapshot })
    expect(eventApi.invoke).toHaveBeenNthCalledWith(3, 'save_page', {
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

  it('loads and saves app settings through dedicated Tauri commands', async () => {
    const { createTauriStorageClient } = await import('./storageClient')
    const appSettings = {
      closeAction: 'hide_to_tray' as const,
    }

    eventApi.invoke.mockResolvedValueOnce(appSettings).mockResolvedValueOnce(undefined)

    const client = createTauriStorageClient()

    await expect(client.loadAppSettings()).resolves.toEqual(appSettings)
    await client.saveAppSettings(appSettings)

    expect(eventApi.invoke).toHaveBeenNthCalledWith(1, 'load_app_settings')
    expect(eventApi.invoke).toHaveBeenNthCalledWith(2, 'save_app_settings', {
      settings: appSettings,
    })
  })

  it('enables and disables the local MCP server through dedicated Tauri commands', async () => {
    const { createTauriStorageClient } = await import('./storageClient')
    const settings = {
      enabled: true,
      port: 38472,
      token: 'test-token',
    }
    eventApi.invoke.mockResolvedValueOnce(settings).mockResolvedValueOnce(undefined)

    const client = createTauriStorageClient()

    await expect(client.enableLocalMcp()).resolves.toEqual(settings)
    await client.disableLocalMcp()

    expect(eventApi.invoke).toHaveBeenNthCalledWith(1, 'enable_local_mcp')
    expect(eventApi.invoke).toHaveBeenNthCalledWith(2, 'disable_local_mcp')
  })

  it('searches through the backend search command with a bounded limit', async () => {
    const { createTauriStorageClient } = await import('./storageClient')
    eventApi.invoke.mockResolvedValueOnce([
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
    expect(eventApi.invoke).toHaveBeenCalledWith('search_workspace', { query: 'home', limit: 12 })
  })

  it('maps richer backend search results with source metadata', async () => {
    const { createTauriStorageClient } = await import('./storageClient')
    eventApi.invoke.mockResolvedValueOnce([
      {
        kind: 'page',
        pageId: 'page_1',
        title: '产品规划',
        icon: '📘',
        excerpt: '产品 / 搜索',
        matchSource: 'property',
        matchKey: 'tags',
        sourceLabel: '标签',
      },
    ])

    const client = createTauriStorageClient()

    await expect(client.searchWorkspace('产品')).resolves.toEqual([
      expect.objectContaining({
        matchSource: 'property',
        matchKey: 'tags',
        sourceLabel: '标签',
      }),
    ])
    expect(eventApi.invoke).toHaveBeenCalledWith('search_workspace', { query: '产品', limit: 30 })
  })

  it('passes through relation hits with block ids from the backend', async () => {
    const { createTauriStorageClient } = await import('./storageClient')
    eventApi.invoke.mockResolvedValueOnce([
      {
        kind: 'page',
        pageId: 'page_source',
        blockId: 'block_relation',
        title: 'Meeting Notes',
        icon: '📝',
        excerpt: 'See Product Plan',
        matchSource: 'page_link',
        sourceLabel: '页面链接',
      },
    ])

    const client = createTauriStorageClient()

    await expect(client.searchWorkspace('Product')).resolves.toEqual([
      expect.objectContaining({
        blockId: 'block_relation',
        matchSource: 'page_link',
        sourceLabel: '页面链接',
      }),
    ])
  })

  it('writes assets and resolves asset file paths through typed Tauri commands', async () => {
    const { createTauriStorageClient } = await import('./storageClient')
    eventApi.invoke
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

    expect(eventApi.invoke).toHaveBeenNthCalledWith(1, 'write_asset', {
      input: {
        name: 'clip.mp4',
        mimeType: 'video/mp4',
        bytes,
      },
    })
    expect(eventApi.invoke).toHaveBeenNthCalledWith(2, 'get_asset_file_path', {
      assetId: 'asset_abc',
    })
  })

  it('exports and imports page packages through typed Tauri commands', async () => {
    const { createTauriStorageClient } = await import('./storageClient')
    const exportedBytes = [80, 75, 3, 4]
    const importedBytes = new Uint8Array([80, 75, 3, 4])
    eventApi.invoke
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(exportedBytes)
      .mockResolvedValueOnce({ rootPageId: 'page_imported' })
      .mockResolvedValueOnce({ rootPageId: 'page_imported_bytes' })

    const client = createTauriStorageClient()

    await client.exportPagePackageToPath('page_source', '/tmp/page.zip')
    const exportedPackage = await client.exportPagePackage('page_source')

    expect(exportedPackage).toBeInstanceOf(Uint8Array)
    expect([...exportedPackage]).toEqual(exportedBytes)
    await expect(client.importPagePackageFromPath('/tmp/page.zip')).resolves.toEqual({
      rootPageId: 'page_imported',
    })
    await expect(client.importPagePackage(importedBytes)).resolves.toEqual({
      rootPageId: 'page_imported_bytes',
    })

    expect(eventApi.invoke).toHaveBeenNthCalledWith(1, 'export_page_package_to_path', {
      pageId: 'page_source',
      path: '/tmp/page.zip',
    })
    expect(eventApi.invoke).toHaveBeenNthCalledWith(2, 'export_page_package', {
      pageId: 'page_source',
    })
    expect(eventApi.invoke).toHaveBeenNthCalledWith(3, 'import_page_package_from_path', {
      path: '/tmp/page.zip',
    })
    expect(eventApi.invoke).toHaveBeenNthCalledWith(4, 'import_page_package', {
      bytes: importedBytes,
    })
  })

  it('subscribes to archive progress for page-package path commands', async () => {
    const { createTauriStorageClient, WORKSPACE_ARCHIVE_PROGRESS_EVENT } = await import('./storageClient')
    const onProgress = vi.fn()

    eventApi.invoke.mockImplementationOnce(async (_command, args) => {
      eventApi.handlers[0]?.({
        payload: {
          taskId: 'other_task',
          operation: 'export',
          phase: 'processingAsset',
          current: 1,
          total: 1,
          bytesProcessed: 16,
          bytesTotal: 16,
          itemName: 'ignored.png',
        },
      })
      eventApi.handlers[0]?.({
        payload: {
          taskId: args.taskId,
          operation: 'export',
          phase: 'processingAsset',
          current: 1,
          total: 1,
          bytesProcessed: 32,
          bytesTotal: 32,
          itemName: 'image.png',
        },
      })
    })

    const client = createTauriStorageClient()

    await client.exportPagePackageToPath('page_source', '/tmp/page.zip', onProgress)

    expect(eventApi.listen).toHaveBeenCalledWith(
      WORKSPACE_ARCHIVE_PROGRESS_EVENT,
      expect.any(Function),
    )
    expect(eventApi.invoke).toHaveBeenCalledWith('export_page_package_to_path', {
      pageId: 'page_source',
      path: '/tmp/page.zip',
      taskId: expect.any(String),
    })
    expect(onProgress).toHaveBeenCalledWith(
      expect.objectContaining({
        taskId: expect.any(String),
        operation: 'export',
        phase: 'processingAsset',
        itemName: 'image.png',
      }),
    )
    expect(onProgress).toHaveBeenCalledTimes(1)
    expect(eventApi.unlisten).toHaveBeenCalledTimes(1)
  })

  it('normalizes page package bytes returned from Tauri into a Uint8Array', async () => {
    const { createTauriStorageClient } = await import('./storageClient')
    eventApi.invoke.mockResolvedValueOnce([80, 75, 3, 4])

    const client = createTauriStorageClient()
    const bytes = await client.exportPagePackage('page_source')

    expect(bytes).toBeInstanceOf(Uint8Array)
    expect([...bytes]).toEqual([80, 75, 3, 4])
    expect(eventApi.invoke).toHaveBeenCalledWith('export_page_package', {
      pageId: 'page_source',
    })
  })

  it('normalizes asset bytes returned from Tauri into a Uint8Array', async () => {
    const { createTauriStorageClient } = await import('./storageClient')
    eventApi.invoke.mockResolvedValueOnce([1, 2, 3])

    const client = createTauriStorageClient()
    const bytes = await client.readAsset('asset_abc')

    expect(bytes).toBeInstanceOf(Uint8Array)
    expect([...bytes]).toEqual([1, 2, 3])
    expect(eventApi.invoke).toHaveBeenCalledWith('read_asset', { assetId: 'asset_abc' })
  })
})
