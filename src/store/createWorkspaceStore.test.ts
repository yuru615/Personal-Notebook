import { describe, expect, it } from 'vitest'
import { createDefaultAppState } from '../components/dataTable/domain/factory'
import { createMemoryRepository } from '../test/memoryRepository'
import { createWorkspaceStore } from './createWorkspaceStore'
import type { WorkspaceSnapshot } from '../domain/types'

function createWorkspace(): WorkspaceSnapshot {
  const now = '2026-06-22T00:00:00.000Z'

  return {
    boards: [],
    dataTables: [],
    mindmaps: [],
    pages: [
      {
        id: 'page_1',
        parentId: null,
        title: '数据页',
        icon: null,
        cover: null,
        blocks: [],
        createdAt: now,
        updatedAt: now,
      },
    ],
    settings: {
      lastOpenedPageId: 'page_1',
    },
  }
}

describe('createWorkspaceStore data tables', () => {
  it('creates a data table asset when inserting a data table block', async () => {
    const repository = createMemoryRepository(createWorkspace())
    const store = createWorkspaceStore(repository)

    await store.getState().bootstrap()
    const block = await store.getState().insertBlock('page_1', 'data_table')

    expect(block).toMatchObject({
      type: 'data_table',
      databaseId: expect.stringMatching(/^database_/),
    })
    expect(store.getState().dataTables).toHaveLength(1)
    expect(store.getState().dataTables[0]).toMatchObject({
      id: (block as { databaseId: string }).databaseId,
      title: '项目数据库',
    })
  })

  it('creates an inline data table block from the inline command type', async () => {
    const repository = createMemoryRepository(createWorkspace())
    const store = createWorkspaceStore(repository)

    await store.getState().bootstrap()
    const block = await store.getState().insertBlock('page_1', 'data_table_inline')

    expect(block).toMatchObject({
      type: 'data_table',
      displayMode: 'inline',
      databaseId: expect.stringMatching(/^database_/),
    })
    expect(store.getState().dataTables).toHaveLength(1)
  })

  it('cleans up data tables that are no longer referenced by page blocks', async () => {
    const workspace = createWorkspace()
    workspace.dataTables = [
      {
        id: 'database_live',
        title: '仍在使用',
        snapshot: { version: 1 },
        createdAt: '2026-06-22T00:00:00.000Z',
        updatedAt: '2026-06-22T00:00:00.000Z',
      },
      {
        id: 'database_orphan',
        title: '孤立数据',
        snapshot: { version: 1 },
        createdAt: '2026-06-22T00:00:00.000Z',
        updatedAt: '2026-06-22T00:00:00.000Z',
      },
    ]
    workspace.pages[0].blocks = [
      {
        id: 'block_database',
        type: 'data_table',
        databaseId: 'database_live',
      },
    ]
    const repository = createMemoryRepository(workspace)
    const store = createWorkspaceStore(repository)

    await store.getState().bootstrap()
    await store.getState().cleanupOrphanDataTables()

    expect(store.getState().dataTables.map((dataTable) => dataTable.id)).toEqual([
      'database_live',
    ])
  })

  it('exports and imports data table blocks with their snapshots', async () => {
    const workspace = createWorkspace()
    workspace.pages[0].blocks = [
      {
        id: 'block_database',
        type: 'data_table',
        databaseId: 'database_live',
      },
    ]
    workspace.dataTables = [
      {
        id: 'database_live',
        title: 'Roadmap Database',
        snapshot: {
          version: 1,
          records: {
            record_launch: {
              id: 'record_launch',
              title: 'Launch Checklist',
              values: {},
              createdAt: '2026-06-22T00:00:00.000Z',
              updatedAt: '2026-06-22T00:00:00.000Z',
            },
          },
        },
        createdAt: '2026-06-22T00:00:00.000Z',
        updatedAt: '2026-06-22T00:00:00.000Z',
      },
    ]
    const sourceStore = createWorkspaceStore(createMemoryRepository(workspace))
    await sourceStore.getState().bootstrap()

    const payload = JSON.parse(await sourceStore.getState().exportJson()) as unknown
    const targetStore = createWorkspaceStore(createMemoryRepository(createWorkspace()))
    await targetStore.getState().bootstrap()
    await targetStore.getState().importJson(payload)

    expect(targetStore.getState().pages[0].blocks).toMatchObject([
      {
        type: 'data_table',
        databaseId: 'database_live',
      },
    ])
    expect(targetStore.getState().dataTables).toMatchObject([
      {
        id: 'database_live',
        title: 'Roadmap Database',
        snapshot: {
          records: {
            record_launch: {
              title: 'Launch Checklist',
            },
          },
        },
      },
    ])
    expect(targetStore.getState().currentPageId).toBe('page_1')
  })

  it('renames a data table and keeps the internal database name in sync', async () => {
    const workspace = createWorkspace()
    const snapshot = createDefaultAppState()
    snapshot.database.name = 'Old Database'
    workspace.dataTables = [
      {
        id: snapshot.database.id,
        title: 'Old Database',
        snapshot,
        createdAt: '2026-06-22T00:00:00.000Z',
        updatedAt: '2026-06-22T00:00:00.000Z',
      },
    ]
    const store = createWorkspaceStore(createMemoryRepository(workspace))

    await store.getState().bootstrap()
    await store.getState().renameDataTable(snapshot.database.id, 'Client Database')

    const dataTable = store.getState().dataTables[0]
    expect(dataTable.title).toBe('Client Database')
    expect((dataTable.snapshot as ReturnType<typeof createDefaultAppState>).database.name).toBe(
      'Client Database',
    )
  })

  it('updates data table icon and cover independently from the source page', async () => {
    const workspace = createWorkspace()
    const snapshot = createDefaultAppState()
    workspace.dataTables = [
      {
        id: snapshot.database.id,
        title: 'Project Database',
        icon: null,
        cover: null,
        snapshot,
        createdAt: '2026-06-22T00:00:00.000Z',
        updatedAt: '2026-06-22T00:00:00.000Z',
      },
    ]
    const store = createWorkspaceStore(createMemoryRepository(workspace))

    await store.getState().bootstrap()
    await store.getState().setDataTableIcon(snapshot.database.id, '📊')
    await store.getState().setDataTableCover(snapshot.database.id, 'ocean')

    expect(store.getState().dataTables[0]).toMatchObject({
      icon: '📊',
      cover: 'ocean',
    })
    expect(store.getState().pages[0]).toMatchObject({
      icon: null,
      cover: null,
    })
  })
})

describe('createWorkspaceStore mindmaps', () => {
  it('creates a mindmap asset when inserting a mindmap block', async () => {
    const repository = createMemoryRepository(createWorkspace())
    const store = createWorkspaceStore(repository)

    await store.getState().bootstrap()
    const block = await store.getState().insertBlock('page_1', 'mindmap')
    const state = store.getState()

    expect(block).toMatchObject({
      type: 'mindmap',
      mindmapId: expect.stringMatching(/^mindmap_/),
    })
    expect(state.pages[0]?.blocks).toMatchObject([
      {
        type: 'mindmap',
        mindmapId: (block as { mindmapId: string }).mindmapId,
      },
    ])
    expect(state.mindmaps).toHaveLength(1)
    expect(state.mindmaps[0]?.id).toBe((block as { mindmapId: string }).mindmapId)
  })

  it('duplicates a mindmap block by cloning the underlying record', async () => {
    const repository = createMemoryRepository(createWorkspace())
    const store = createWorkspaceStore(repository)

    await store.getState().bootstrap()
    const block = await store.getState().insertBlock('page_1', 'mindmap')
    await store.getState().duplicateBlock('page_1', (block as { id: string }).id)

    const state = store.getState()
    expect(state.pages[0]?.blocks).toHaveLength(2)
    expect(state.mindmaps).toHaveLength(2)
    expect(state.pages[0]?.blocks[1]).toMatchObject({
      type: 'mindmap',
      mindmapId: state.mindmaps[1]?.id,
    })
    expect(state.mindmaps[1]?.id).not.toBe((block as { mindmapId: string }).mindmapId)
    expect(state.mindmaps[1]?.snapshot).toEqual(state.mindmaps[0]?.snapshot)
    expect(state.mindmaps[1]?.title).toContain('副本')
  })

  it('includes mindmaps in exported workspace json', async () => {
    const repository = createMemoryRepository(createWorkspace())
    const store = createWorkspaceStore(repository)

    await store.getState().bootstrap()
    await store.getState().insertBlock('page_1', 'mindmap')

    const payload = JSON.parse(await store.getState().exportJson()) as { mindmaps?: unknown[] }

    expect(payload.mindmaps).toHaveLength(1)
  })

  it('restores a missing mindmap record with the same id', async () => {
    const repository = createMemoryRepository(createWorkspace())
    const store = createWorkspaceStore(repository)

    await store.getState().bootstrap()
    const block = await store.getState().insertBlock('page_1', 'mindmap')
    const mindmapId = (block as { mindmapId: string }).mindmapId

    store.setState((state) => ({
      ...state,
      mindmaps: [],
    }))

    const restored = await store.getState().restoreMissingMindmapReference('page_1', mindmapId)

    expect(restored).toMatchObject({ id: mindmapId })
    expect(store.getState().mindmaps).toHaveLength(1)
    expect(store.getState().mindmaps[0]?.id).toBe(mindmapId)
  })
})
