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
