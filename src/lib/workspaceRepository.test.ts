import { describe, expect, it } from 'vitest'
import { createSeedWorkspace } from '../domain/seed'
import type { DataTableRecord, MindmapRecord, WorkspaceSnapshot } from '../domain/types'
import { createSqliteTestDatabase } from '../test/sqliteTestDatabase'
import { createSqliteWorkspaceRepository, ensureSnapshot } from './workspaceRepository'

function createRepository() {
  const database = createSqliteTestDatabase()
  return createSqliteWorkspaceRepository({ loadDatabase: async () => database })
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
    pages: [
      {
        id: 'page_1',
        parentId: null,
        title: 'Quick note',
        icon: '📝',
        cover: 'cover-1',
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

describe('createSqliteWorkspaceRepository', () => {
  it('seeds empty storage through the bootstrap helper', async () => {
    const repository = createRepository()
    const seed = createSeedWorkspace()

    expect(await repository.load()).toBeNull()

    const snapshot = await ensureSnapshot(repository, seed)

    expect(snapshot).toEqual(seed)
    expect(await repository.load()).toEqual(seed)
  })

  it('preserves an explicitly empty persisted workspace', async () => {
    const repository = createRepository()
    const emptySnapshot: WorkspaceSnapshot = {
      boards: [],
      dataTables: [],
      mindmaps: [],
      pages: [],
      settings: {
        lastOpenedPageId: null,
      },
    }

    expect(await repository.load()).toBeNull()

    await repository.save(emptySnapshot)

    expect(await repository.load()).toEqual(emptySnapshot)
  })

  it('replaces stored data and removes records that no longer exist', async () => {
    const repository = createRepository()
    const original = createSnapshot()
    const next: WorkspaceSnapshot = {
      boards: [],
      dataTables: [],
      mindmaps: [],
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

    expect(await repository.load()).toEqual(next)
  })

  it('preserves page order when data is loaded back from SQLite', async () => {
    const repository = createRepository()
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

  it('preserves persisted data tables and mindmaps when saving a legacy snapshot', async () => {
    const repository = createRepository()
    const snapshot = createSnapshot()
    const persistedDataTable = snapshot.dataTables?.[0] as DataTableRecord
    const persistedMindmap = snapshot.mindmaps?.[0] as MindmapRecord

    await repository.replace(snapshot)

    const nextSnapshot: WorkspaceSnapshot = {
      boards: snapshot.boards,
      dataTables: undefined,
      mindmaps: undefined,
      pages: snapshot.pages,
      settings: {
        lastOpenedPageId: null,
      },
    }

    await repository.save(nextSnapshot)

    await expect(repository.load()).resolves.toEqual({
      ...nextSnapshot,
      dataTables: [persistedDataTable],
      mindmaps: [persistedMindmap],
    })
  })
})
