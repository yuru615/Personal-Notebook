import { beforeEach, describe, expect, it } from 'vitest'
import { createSeedWorkspace } from '../domain/seed'
import { db } from './db'
import { createDexieWorkspaceRepository, ensureSnapshot } from './workspaceRepository'
import type { WorkspaceSnapshot } from '../domain/types'

function createSnapshot(): WorkspaceSnapshot {
  const now = '2026-06-14T00:00:00.000Z'

  return {
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
})
