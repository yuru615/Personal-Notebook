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
})
