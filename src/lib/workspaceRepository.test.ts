import { describe, expect, it } from 'vitest'
import { normalizeWorkspaceSnapshot as normalizePagePropertiesWorkspaceSnapshot } from '../domain/pageProperties'
import { createSeedWorkspace } from '../domain/seed'
import type { DataTableRecord, MindmapRecord, WorkspaceSnapshot } from '../domain/types'
import type { WorkspaceStorageClient } from './storageClient'
import { createStorageWorkspaceRepository, ensureSnapshot } from './workspaceRepository'

function createRepository() {
  let snapshot: WorkspaceSnapshot | null = null
  const calls: string[] = []
  const boardSaveExpectedUpdatedAts: Array<string | undefined> = []
  const replaceExpectedBoardUpdatedAts: Array<Record<string, string> | undefined> = []
  const client: WorkspaceStorageClient = {
    async exportWorkspaceBackup() {
      return snapshot ? structuredClone(snapshot) : null
    },
    async replaceWorkspaceBackup(nextSnapshot, expectedBoardUpdatedAts) {
      calls.push('replaceWorkspaceBackup')
      replaceExpectedBoardUpdatedAts.push(expectedBoardUpdatedAts)
      snapshot = structuredClone(nextSnapshot)
    },
    async exportPagePackageToPath() {
      return undefined
    },
    async exportPagePackage() {
      return new Uint8Array()
    },
    async importPagePackage() {
      return { rootPageId: 'page_imported' }
    },
    async importPagePackageFromPath() {
      return { rootPageId: 'page_imported' }
    },
    async savePage(page) {
      calls.push(`savePage:${page.id}`)
      if (!snapshot) {
        return
      }
      snapshot = {
        ...snapshot,
        pages: snapshot.pages.map((currentPage) =>
          currentPage.id === page.id ? structuredClone(page) : currentPage,
        ),
      }
    },
    async saveBoard(board, expectedUpdatedAt) {
      calls.push(`saveBoard:${board.id}`)
      boardSaveExpectedUpdatedAts.push(expectedUpdatedAt)
    },
    async saveDataTable(dataTable) {
      calls.push(`saveDataTable:${dataTable.id}`)
    },
    async saveMindmap(mindmap) {
      calls.push(`saveMindmap:${mindmap.id}`)
    },
    async writeAsset() {
      throw new Error('not implemented')
    },
    async importAssetFile() {
      throw new Error('not implemented')
    },
    async readAsset() {
      return new Uint8Array()
    },
    async getAssetFilePath() {
      return ''
    },
    async cleanupOrphanAssets() {
      calls.push('cleanupOrphanAssets')
      return 0
    },
    async searchWorkspace() {
      return []
    },
  }

  return {
    calls,
    boardSaveExpectedUpdatedAts,
    replaceExpectedBoardUpdatedAts,
    setSnapshot(nextSnapshot: WorkspaceSnapshot | null) {
      snapshot = nextSnapshot ? structuredClone(nextSnapshot) : null
    },
    repository: createStorageWorkspaceRepository({ client }),
  }
}

function createSnapshot(): WorkspaceSnapshot {
  const now = '2026-06-14T00:00:00.000Z'

  return {
    boards: [
      {
        id: 'board_1',
        title: '流程草图',
        snapshot: {
          version: 1,
          elements: [],
          viewport: { x: 0, y: 0, zoom: 1 },
        },
        createdAt: now,
        updatedAt: now,
      },
    ],
    dataTables: [
      {
        id: 'database_1',
        title: '项目库',
        icon: null,
        cover: null,
        snapshot: { records: [] },
        createdAt: now,
        updatedAt: now,
      },
    ],
    mindmaps: [
      {
        id: 'mindmap_1',
        title: '产品规划',
        snapshot: { id: 'doc-root', title: '产品规划' },
        createdAt: now,
        updatedAt: now,
      },
    ],
    pageProperties: [],
    syncedBlockGroups: [],
    pages: [
      {
        id: 'page_1',
        parentId: null,
        title: 'Quick note',
        icon: '📝',
        cover: 'cover-1',
        properties: {},
        blocks: [
          { id: 'block_1', type: 'paragraph', text: 'hello' },
          { id: 'block_2', type: 'todo', text: 'task', checked: true },
          { id: 'block_3', type: 'bulleted_list', items: ['one', 'two'] },
          { id: 'block_4', type: 'numbered_list', items: ['first', 'second'] },
          { id: 'block_5', type: 'child_page', pageId: 'page_child' },
          { id: 'block_6', type: 'code', language: 'ts', text: 'const answer = 42' },
          { id: 'block_7', type: 'table', rows: [['A', 'B']] },
        ],
        createdAt: now,
        updatedAt: now,
      },
    ],
    settings: {
      lastOpenedPageId: 'page_1',
    },
  }
}

function normalizeExpectedSnapshot(snapshot: WorkspaceSnapshot): WorkspaceSnapshot {
  return {
    ...normalizePagePropertiesWorkspaceSnapshot(snapshot),
    syncedBlockGroups: snapshot.syncedBlockGroups ?? [],
  }
}

describe('createStorageWorkspaceRepository', () => {
  it('uses browser local storage when Tauri is unavailable', async () => {
    Reflect.deleteProperty(globalThis, '__TAURI_INTERNALS__')
    window.localStorage.removeItem('zhiqi.workspace.snapshot.v1')
    const repository = createStorageWorkspaceRepository()
    const seed = createSeedWorkspace()

    await expect(ensureSnapshot(repository, seed)).resolves.toEqual(seed)

    const nextSnapshot: WorkspaceSnapshot = {
      ...seed,
      pages: [
        {
          ...seed.pages[0],
          title: 'Browser preview',
        },
      ],
    }
    await repository.save(nextSnapshot)

    expect(JSON.parse(window.localStorage.getItem('zhiqi.workspace.snapshot.v1') ?? 'null')).toEqual(
      nextSnapshot,
    )
    await expect(repository.load()).resolves.toEqual(normalizeExpectedSnapshot(nextSnapshot))
  })

  it('seeds empty storage through the bootstrap helper', async () => {
    const { repository } = createRepository()
    const seed = createSeedWorkspace()

    expect(await repository.load()).toBeNull()

    const snapshot = await ensureSnapshot(repository, seed)

    expect(snapshot).toEqual(seed)
    expect(await repository.load()).toEqual(normalizeExpectedSnapshot(seed))
  })

  it('preserves an explicitly empty persisted workspace', async () => {
    const { repository } = createRepository()
    const emptySnapshot: WorkspaceSnapshot = {
      boards: [],
      dataTables: [],
      mindmaps: [],
      pageProperties: [],
      pages: [],
      settings: {
        lastOpenedPageId: null,
      },
    }

    expect(await repository.load()).toBeNull()

    await repository.save(emptySnapshot)

    expect(await repository.load()).toEqual(normalizeExpectedSnapshot(emptySnapshot))
  })

  it('replaces stored data and removes records that no longer exist', async () => {
    const { repository } = createRepository()
    const original = createSnapshot()
    const next: WorkspaceSnapshot = {
      boards: [],
      dataTables: [],
      mindmaps: [],
      pageProperties: [],
      pages: [
        {
          ...original.pages[0],
          title: 'Updated',
        },
      ],
      settings: {
        lastOpenedPageId: null,
      },
    }

    await repository.save(original)
    await repository.replace(next)

    expect(await repository.load()).toEqual(normalizeExpectedSnapshot(next))
  })

  it('preserves page order when data is loaded back from SQLite', async () => {
    const { repository } = createRepository()
    const snapshot = createSnapshot()
    const nextPage = {
      ...snapshot.pages[0],
      id: 'page_2',
      title: 'Second page',
    }

    await repository.replace({
      ...snapshot,
      pages: [nextPage, snapshot.pages[0]],
    })

    expect((await repository.load())?.pages.map((page) => page.id)).toEqual([
      'page_2',
      'page_1',
    ])
  })

  it('fills missing pageProperties and page property values for legacy snapshots', async () => {
    const { repository } = createRepository()
    const legacySnapshot: WorkspaceSnapshot = {
      ...createSnapshot(),
      pageProperties: undefined,
      pages: [
        {
          ...createSnapshot().pages[0],
          properties: undefined,
        },
      ],
    }

    await repository.replace(legacySnapshot)

    await expect(repository.load()).resolves.toEqual({
      ...legacySnapshot,
      pageProperties: [],
      syncedBlockGroups: [],
      pages: [
        {
          ...legacySnapshot.pages[0],
          properties: {},
        },
      ],
    })
  })

  it('fills missing syncedBlockGroups for legacy snapshots', async () => {
    const { repository } = createRepository()
    const legacySnapshot: WorkspaceSnapshot = {
      ...createSnapshot(),
      syncedBlockGroups: undefined,
    }

    await repository.replace(legacySnapshot)

    await expect(repository.load()).resolves.toEqual({
      ...legacySnapshot,
      syncedBlockGroups: [],
    })
  })

  it('repairs malformed synced groups when loading a snapshot', async () => {
    const { repository } = createRepository()
    const snapshot: WorkspaceSnapshot = {
      ...createSnapshot(),
      syncedBlockGroups: [
        {
          id: 'group_keep',
          blocks: [{ id: 'group_block_1', type: 'paragraph', text: 'Shared keep' }],
          primaryInstanceId: 'instance_missing',
          createdAt: '2026-07-07T00:00:00.000Z',
          updatedAt: '2026-07-07T00:00:00.000Z',
        },
        {
          id: 'group_drop',
          blocks: [{ id: 'group_block_2', type: 'paragraph', text: 'Shared drop' }],
          primaryInstanceId: 'instance_drop',
          createdAt: '2026-07-07T00:00:00.000Z',
          updatedAt: '2026-07-07T00:00:00.000Z',
        },
      ],
      pages: [
        {
          ...createSnapshot().pages[0],
          blocks: [
            {
              id: 'container_1',
              type: 'synced_block',
              groupId: 'group_keep',
              instanceId: 'instance_2',
              mode: 'sync',
            },
          ],
        },
      ],
    }

    await repository.replace(snapshot)

    await expect(repository.load()).resolves.toMatchObject({
      syncedBlockGroups: [
        {
          id: 'group_keep',
          primaryInstanceId: 'instance_2',
        },
      ],
    })
  })

  it('recovers orphan synced groups into a recovery page during load', async () => {
    const { calls, repository } = createRepository()
    const snapshot: WorkspaceSnapshot = {
      ...createSnapshot(),
      syncedBlockGroups: [
        {
          id: 'group_orphan',
          blocks: [{ id: 'group_block_1', type: 'paragraph', text: 'Recovered shared block' }],
          primaryInstanceId: 'instance_missing',
          createdAt: '2026-07-07T00:00:00.000Z',
          updatedAt: '2026-07-07T00:00:00.000Z',
        },
      ],
      pages: [
        {
          ...createSnapshot().pages[0],
          blocks: [{ id: 'block_plain', type: 'paragraph', text: 'Existing page content' }],
        },
      ],
    }

    await repository.replace(snapshot)
    calls.length = 0
    const loaded = await repository.load()
    const recoveryPage = loaded?.pages.find((page) => page.title === '同步块恢复')
    const recoveryBlock = recoveryPage?.blocks[0]

    expect(recoveryBlock).toEqual(
      expect.objectContaining({
        type: 'synced_block',
        groupId: 'group_orphan',
        mode: 'sync',
      }),
    )
    expect(loaded?.syncedBlockGroups).toEqual([
      expect.objectContaining({
        id: 'group_orphan',
        primaryInstanceId: (recoveryBlock as { instanceId: string }).instanceId,
      }),
    ])
    expect(calls).toEqual(['replaceWorkspaceBackup'])
  })

  it('preserves persisted data tables and mindmaps when saving a legacy snapshot', async () => {
    const { repository } = createRepository()
    const snapshot = createSnapshot()
    const persistedDataTable = snapshot.dataTables?.[0] as DataTableRecord
    const persistedMindmap = snapshot.mindmaps?.[0] as MindmapRecord

    await repository.replace(snapshot)

    const nextSnapshot: WorkspaceSnapshot = {
      boards: snapshot.boards,
      dataTables: undefined,
      mindmaps: undefined,
      pageProperties: snapshot.pageProperties,
      pages: snapshot.pages,
      settings: {
        lastOpenedPageId: null,
      },
    }

    await repository.save(nextSnapshot)

    await expect(repository.load()).resolves.toEqual(normalizeExpectedSnapshot({
      ...nextSnapshot,
      dataTables: [persistedDataTable],
      mindmaps: [persistedMindmap],
    }))
  })

  it('persists page property definition changes instead of skipping incremental save', async () => {
    const { calls, repository } = createRepository()
    const original = createSnapshot()
    const next: WorkspaceSnapshot = {
      ...original,
      pageProperties: [
        {
          id: 'prop_status',
          key: 'status',
          name: '状态',
          type: 'select',
          config: {},
          createdAt: '2026-06-15T00:00:00.000Z',
          updatedAt: '2026-06-15T00:00:00.000Z',
        },
      ],
    }

    await repository.replace(original)
    calls.length = 0
    await repository.save(next)

    expect(calls).toEqual(['replaceWorkspaceBackup'])
    await expect(repository.load()).resolves.toEqual(normalizeExpectedSnapshot(next))
  })

  it('falls back to a full replace when only syncedBlockGroups change', async () => {
    const { calls, repository } = createRepository()
    const original: WorkspaceSnapshot = {
      ...createSnapshot(),
      pages: [
        {
          ...createSnapshot().pages[0],
          blocks: [
            {
              id: 'container_1',
              type: 'synced_block',
              groupId: 'group_1',
              instanceId: 'instance_1',
              mode: 'sync',
            },
          ],
        },
      ],
    }
    const next: WorkspaceSnapshot = {
      ...original,
      syncedBlockGroups: [
        {
          id: 'group_1',
          blocks: [{ id: 'block_synced_1', type: 'paragraph', text: 'Shared' }],
          primaryInstanceId: 'instance_1',
          createdAt: '2026-06-15T00:00:00.000Z',
          updatedAt: '2026-06-15T00:00:00.000Z',
        },
      ],
    }

    await repository.replace(original)
    calls.length = 0
    await repository.save(next)

    expect(calls).toEqual(['replaceWorkspaceBackup'])
    await expect(repository.load()).resolves.toEqual(next)
  })

  it('saves a changed page without replacing the whole workspace when ids and settings are stable', async () => {
    const { calls, repository } = createRepository()
    const original = createSnapshot()
    const next: WorkspaceSnapshot = {
      ...original,
      pages: [
        {
          ...original.pages[0],
          blocks: [{ id: 'block_1', type: 'paragraph', text: 'updated' }],
          updatedAt: '2026-06-15T00:00:00.000Z',
        },
      ],
    }

    await repository.replace(original)
    calls.length = 0
    await repository.save(next)

    expect(calls).toEqual(['savePage:page_1'])
    await expect(repository.load()).resolves.toEqual(next)
  })

  it('forwards the expected board version during an incremental board save', async () => {
    const { calls, boardSaveExpectedUpdatedAts, repository } = createRepository()
    const original = createSnapshot()
    const next: WorkspaceSnapshot = {
      ...original,
      boards: [
        {
          ...original.boards[0]!,
          title: 'Updated board',
          updatedAt: '2026-07-13T00:00:00.000Z',
        },
      ],
    }

    await repository.replace(original)
    calls.length = 0
    await repository.save(next, {
      expectedBoardUpdatedAts: {
        board_1: original.boards[0]!.updatedAt,
      },
    })

    expect(calls).toEqual(['saveBoard:board_1'])
    expect(boardSaveExpectedUpdatedAts).toEqual([original.boards[0]!.updatedAt])
  })

  it('forwards expected board versions when multiple changes require a full replace', async () => {
    const { calls, replaceExpectedBoardUpdatedAts, repository } = createRepository()
    const original = createSnapshot()
    const next: WorkspaceSnapshot = {
      ...original,
      boards: [
        {
          ...original.boards[0]!,
          title: 'Updated board',
          updatedAt: '2026-07-13T00:00:00.000Z',
        },
      ],
      pages: [
        {
          ...original.pages[0],
          title: 'Updated page',
        },
      ],
    }
    const expectedBoardUpdatedAts = { board_1: original.boards[0]!.updatedAt }

    await repository.replace(original)
    calls.length = 0
    replaceExpectedBoardUpdatedAts.length = 0
    await repository.save(next, { expectedBoardUpdatedAts })

    expect(calls).toEqual(['replaceWorkspaceBackup'])
    expect(replaceExpectedBoardUpdatedAts).toEqual([expectedBoardUpdatedAts])
  })

  it('derives expected versions for stale boards when a page change falls back to full replace', async () => {
    const { calls, replaceExpectedBoardUpdatedAts, repository, setSnapshot } = createRepository()
    const original = createSnapshot()
    const staleIncoming: WorkspaceSnapshot = {
      ...original,
      pages: [
        {
          ...original.pages[0],
          title: 'Pending page change',
        },
      ],
    }
    const mcpSnapshot: WorkspaceSnapshot = {
      ...original,
      boards: [
        {
          ...original.boards[0]!,
          snapshot: { shapes: [{ id: 'mcp-node' }] },
          updatedAt: '2026-07-13T00:00:00.000Z',
        },
      ],
    }

    await repository.replace(original)
    setSnapshot(mcpSnapshot)
    calls.length = 0
    replaceExpectedBoardUpdatedAts.length = 0
    await repository.save(staleIncoming)

    expect(calls).toEqual(['replaceWorkspaceBackup'])
    expect(replaceExpectedBoardUpdatedAts).toEqual([
      { board_1: original.boards[0]!.updatedAt },
    ])
  })

  it('keeps the MCP revision guard when a stale page save has no changed board', async () => {
    const { calls, replaceExpectedBoardUpdatedAts, repository, setSnapshot } = createRepository()
    const original = createSnapshot()
    const staleIncoming: WorkspaceSnapshot = {
      ...original,
      pages: [{ ...original.pages[0], title: 'Pending page change' }],
    }
    const mcpSnapshot: WorkspaceSnapshot = {
      ...original,
      settings: { ...original.settings, mcpRevision: 1 },
      pages: [
        ...original.pages,
        {
          ...original.pages[0],
          id: 'page_mcp_child',
          parentId: 'page_1',
          title: 'MCP child',
          blocks: [],
        },
      ],
    }

    await repository.replace(original)
    setSnapshot(mcpSnapshot)
    calls.length = 0
    replaceExpectedBoardUpdatedAts.length = 0
    await repository.save(staleIncoming)

    expect(calls).toEqual(['replaceWorkspaceBackup'])
    expect(replaceExpectedBoardUpdatedAts).toEqual([{}])
  })

  it('falls back to a full replace when one save changes multiple record groups', async () => {
    const { calls, repository } = createRepository()
    const original = createSnapshot()
    const next: WorkspaceSnapshot = {
      ...original,
      boards: [
        {
          ...original.boards[0],
          title: 'Updated board',
          updatedAt: '2026-06-15T00:00:00.000Z',
        },
      ],
      pages: [
        {
          ...original.pages[0],
          blocks: [{ id: 'block_1', type: 'paragraph', text: 'updated' }],
          updatedAt: '2026-06-15T00:00:00.000Z',
        },
      ],
    }

    await repository.replace(original)
    calls.length = 0
    await repository.save(next)

    expect(calls).toEqual(['replaceWorkspaceBackup'])
    await expect(repository.load()).resolves.toEqual(next)
  })

  it('delegates orphan asset cleanup to the storage client', async () => {
    const { calls, repository } = createRepository()

    await expect(repository.cleanupOrphanAssets()).resolves.toBe(0)

    expect(calls).toEqual(['cleanupOrphanAssets'])
  })
})
