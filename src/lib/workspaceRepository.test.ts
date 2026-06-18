import { beforeEach, describe, expect, it } from 'vitest'
import { createSeedWorkspace } from '../domain/seed'
import { db } from './db'
import { createDexieWorkspaceRepository, ensureSnapshot } from './workspaceRepository'
import type { WorkspaceSnapshot } from '../domain/types'

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
    mindmaps: [
      {
        id: 'mindmap_1',
        title: '产品调研',
        rootNodeId: 'mindmap_node_1',
        nodes: {
          mindmap_node_1: {
            id: 'mindmap_node_1',
            parentId: null,
            text: '中心主题',
            order: 0,
          },
        },
        viewport: {
          x: 0,
          y: 0,
          zoom: 1,
        },
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

describe('createDexieWorkspaceRepository', () => {
  beforeEach(async () => {
    await db.pages.clear()
    await db.boards.clear()
    await db.mindmaps.clear()
    await db.settings.clear()
  })

  it('seeds empty storage through the bootstrap helper', async () => {
    const repository = createDexieWorkspaceRepository()
    const seed = createSeedWorkspace()

    expect(await repository.load()).toBeNull()

    const snapshot = await ensureSnapshot(repository, seed)

    expect(snapshot).toEqual(seed)
    expect(await repository.load()).toEqual(seed)
  })

  it('preserves an explicitly empty persisted workspace', async () => {
    const repository = createDexieWorkspaceRepository()
    const emptySnapshot: WorkspaceSnapshot = {
      boards: [],
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

  it('round-trips save and load with lastOpenedPageId', async () => {
    const repository = createDexieWorkspaceRepository()
    const snapshot = createSnapshot()

    await repository.save(snapshot)

    expect(await repository.load()).toEqual(snapshot)
  })

  it('replaces stored data', async () => {
    const repository = createDexieWorkspaceRepository()
    const original = createSnapshot()
    const next: WorkspaceSnapshot = {
      ...original,
      settings: {
        lastOpenedPageId: null,
      },
      pages: [
        {
          ...original.pages[0],
          title: 'Updated',
        },
      ],
    }

    await repository.save(original)
    await repository.replace(next)

    expect(await repository.load()).toEqual(next)
  })

  it('loads legacy persisted data without boards as an empty boards array', async () => {
    const repository = createDexieWorkspaceRepository()
    const now = '2026-06-14T00:00:00.000Z'

    await db.pages.put({
      id: 'page_legacy',
      parentId: null,
      title: 'Legacy',
      icon: null,
      cover: null,
      blocks: [{ id: 'block_legacy', type: 'paragraph', text: 'legacy' }],
      createdAt: now,
      updatedAt: now,
    })
    await db.settings.put({
      id: 'workspace',
      lastOpenedPageId: 'page_legacy',
    })

    await expect(repository.load()).resolves.toEqual({
      boards: [],
      mindmaps: [],
      pages: [
        {
          id: 'page_legacy',
          parentId: null,
          title: 'Legacy',
          icon: null,
          cover: null,
          blocks: [{ id: 'block_legacy', type: 'paragraph', text: 'legacy' }],
          createdAt: now,
          updatedAt: now,
        },
      ],
      settings: {
        lastOpenedPageId: 'page_legacy',
      },
    })
  })

  it('loads legacy persisted data without mindmaps as an empty mindmaps array', async () => {
    const repository = createDexieWorkspaceRepository()
    const now = '2026-06-18T00:00:00.000Z'

    await db.pages.put({
      id: 'page_legacy_mindmap',
      parentId: null,
      title: 'Legacy mindmap page',
      icon: null,
      cover: null,
      blocks: [{ id: 'block_legacy_mindmap', type: 'paragraph', text: 'legacy mindmap' }],
      createdAt: now,
      updatedAt: now,
    })
    await db.settings.put({
      id: 'workspace',
      lastOpenedPageId: 'page_legacy_mindmap',
    })

    const snapshot = await repository.load()

    expect(snapshot).not.toBeNull()
    expect(snapshot?.mindmaps).toEqual([])
  })
})
