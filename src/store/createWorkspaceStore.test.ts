import { describe, expect, it, vi } from 'vitest'
import { createDefaultAppState } from '../components/dataTable/domain/factory'
import { createMemoryRepository } from '../test/memoryRepository'
import { createWorkspaceStore } from './createWorkspaceStore'
import type { BlockRecord, WorkspaceSnapshot } from '../domain/types'

function createCountingRepository(initialSnapshot: WorkspaceSnapshot | null = null) {
  let snapshot = initialSnapshot ? structuredClone(initialSnapshot) : null
  let saveCalls = 0
  let replaceCalls = 0
  let cleanupCalls = 0

  return {
    repository: {
      async load() {
        return snapshot ? structuredClone(snapshot) : null
      },
      async save(nextSnapshot: WorkspaceSnapshot) {
        saveCalls += 1
        snapshot = structuredClone(nextSnapshot)
      },
      async replace(nextSnapshot: WorkspaceSnapshot) {
        replaceCalls += 1
        snapshot = structuredClone(nextSnapshot)
      },
      async cleanupOrphanAssets() {
        cleanupCalls += 1
        return 0
      },
    },
    getSnapshot() {
      return snapshot ? structuredClone(snapshot) : null
    },
    getSaveCalls() {
      return saveCalls
    },
    getReplaceCalls() {
      return replaceCalls
    },
    getCleanupCalls() {
      return cleanupCalls
    },
  }
}

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

function createWorkspaceWithLinkedAssets(): WorkspaceSnapshot {
  const workspace = createWorkspace()
  const now = '2026-06-22T00:00:00.000Z'
  workspace.boards = [
    { id: 'board_1', title: 'Board 1', snapshot: {}, createdAt: now, updatedAt: now },
  ]
  workspace.dataTables = [
    {
      id: 'database_1',
      title: 'Database 1',
      snapshot: { version: 1 },
      createdAt: now,
      updatedAt: now,
    },
  ]
  workspace.mindmaps = [
    { id: 'mindmap_1', title: 'Mindmap 1', snapshot: {}, createdAt: now, updatedAt: now },
  ]
  workspace.pages[0].blocks = [
    { id: 'block_board', type: 'whiteboard', boardId: 'board_1' },
    { id: 'block_database', type: 'data_table', databaseId: 'database_1' },
    { id: 'block_mindmap', type: 'mindmap', mindmapId: 'mindmap_1' },
  ]
  return workspace
}

describe('createWorkspaceStore data tables', () => {
  it('preserves linked resources when saving page-only changes', async () => {
    const counted = createCountingRepository(createWorkspaceWithLinkedAssets())
    const store = createWorkspaceStore(counted.repository)

    await store.getState().bootstrap()
    await store.getState().setPageIcon('page_1', '🧠')

    expect(counted.getSnapshot()).toMatchObject({
      boards: [{ id: 'board_1' }],
      dataTables: [{ id: 'database_1' }],
      mindmaps: [{ id: 'mindmap_1' }],
      pages: [{ id: 'page_1', icon: '🧠' }],
    })
  })

  it('defaults the sidebar settings and persists layout and width changes', async () => {
    const workspace = createWorkspace()
    const counted = createCountingRepository({
      ...workspace,
      settings: {
        lastOpenedPageId: 'page_1',
      },
    })
    const store = createWorkspaceStore(counted.repository)

    await store.getState().bootstrap()

    expect(store.getState().settings.sidebarLayout).toBe('compact')
    expect(store.getState().settings.sidebarWidth).toBe(272)
    expect(counted.getReplaceCalls()).toBe(1)

    await store.getState().setSidebarLayout('classic')
    await store.getState().setSidebarWidth(320)

    expect(store.getState().settings).toMatchObject({
      sidebarLayout: 'classic',
      sidebarWidth: 320,
    })
    expect(counted.getSnapshot()?.settings).toMatchObject({
      lastOpenedPageId: 'page_1',
      sidebarLayout: 'classic',
      sidebarWidth: 320,
    })
  })

  it('persists pinned sidebar items for pages and data tables', async () => {
    const workspace = createWorkspace()
    workspace.pages[0].blocks = [
      {
        id: 'block_database',
        type: 'data_table',
        databaseId: 'database_1',
      },
    ]
    workspace.dataTables = [
      {
        id: 'database_1',
        title: '数据库',
        snapshot: { version: 1 },
        createdAt: '2026-06-22T00:00:00.000Z',
        updatedAt: '2026-06-22T00:00:00.000Z',
      },
    ]

    const counted = createCountingRepository(workspace)
    const store = createWorkspaceStore(counted.repository)

    await store.getState().bootstrap()
    await store.getState().togglePinnedSidebarItem({
      kind: 'page',
      pageId: 'page_1',
    })
    await store.getState().togglePinnedSidebarItem({
      kind: 'data_table',
      pageId: 'page_1',
      dataTableId: 'database_1',
    })

    expect(store.getState().settings.pinnedSidebarItems).toEqual([
      { kind: 'page', pageId: 'page_1' },
      { kind: 'data_table', pageId: 'page_1', dataTableId: 'database_1' },
    ])
    expect(counted.getSnapshot()?.settings.pinnedSidebarItems).toEqual([
      { kind: 'page', pageId: 'page_1' },
      { kind: 'data_table', pageId: 'page_1', dataTableId: 'database_1' },
    ])
  })

  it('deletes a page branch and moves the current page to the next available page', async () => {
    const workspace = createWorkspace()
    workspace.pages = [
      {
        ...workspace.pages[0],
        id: 'page_parent',
        title: 'Parent',
      },
      {
        ...workspace.pages[0],
        id: 'page_child',
        parentId: 'page_parent',
        title: 'Child',
      },
      {
        ...workspace.pages[0],
        id: 'page_next',
        title: 'Next',
      },
    ]
    workspace.settings.lastOpenedPageId = 'page_child'
    const counted = createCountingRepository(workspace)
    const store = createWorkspaceStore(counted.repository)

    await store.getState().bootstrap()
    await store.getState().deletePage('page_parent')

    expect(store.getState().pages.map((page) => page.id)).toEqual(['page_next'])
    expect(store.getState().currentPageId).toBe('page_next')
    expect(store.getState().settings.lastOpenedPageId).toBe('page_next')
    expect(counted.getSnapshot()?.pages.map((page) => page.id)).toEqual(['page_next'])
  })

  it('duplicates a page branch and clones linked page resources', async () => {
    const workspace = createWorkspace()
    const now = '2026-06-22T00:00:00.000Z'
    workspace.boards = [
      { id: 'board_1', title: 'Board 1', snapshot: {}, createdAt: now, updatedAt: now },
    ]
    workspace.dataTables = [
      {
        id: 'database_1',
        title: 'Database 1',
        snapshot: { version: 1 },
        createdAt: now,
        updatedAt: now,
      },
    ]
    workspace.mindmaps = [
      { id: 'mindmap_1', title: 'Mindmap 1', snapshot: {}, createdAt: now, updatedAt: now },
    ]
    workspace.pages = [
      {
        ...workspace.pages[0],
        id: 'page_parent',
        title: 'Parent',
        blocks: [
          { id: 'block_child_page', type: 'child_page', pageId: 'page_child' },
          { id: 'block_board', type: 'whiteboard', boardId: 'board_1' },
          { id: 'block_database', type: 'data_table', databaseId: 'database_1' },
          { id: 'block_mindmap', type: 'mindmap', mindmapId: 'mindmap_1' },
        ],
      },
      {
        ...workspace.pages[0],
        id: 'page_child',
        parentId: 'page_parent',
        title: 'Child',
      },
    ]
    workspace.settings.lastOpenedPageId = 'page_parent'
    const counted = createCountingRepository(workspace)
    const store = createWorkspaceStore(counted.repository)

    await store.getState().bootstrap()
    const duplicatedRoot = await store.getState().duplicatePage('page_parent')
    const state = store.getState()
    const duplicatedChild = state.pages.find((page) => page.parentId === duplicatedRoot?.id)

    expect(duplicatedRoot).toMatchObject({
      title: 'Parent 副本',
      parentId: null,
    })
    expect(duplicatedChild).toBeTruthy()
    expect(state.pages).toHaveLength(4)
    expect(state.boards).toHaveLength(2)
    expect(state.dataTables).toHaveLength(2)
    expect(state.mindmaps).toHaveLength(2)

    const duplicatedBlocks = duplicatedRoot?.blocks ?? []
    expect(duplicatedBlocks.find((block) => block.type === 'child_page')).toMatchObject({
      pageId: duplicatedChild?.id,
    })
    expect(duplicatedBlocks.find((block) => block.type === 'whiteboard')).not.toMatchObject({
      boardId: 'board_1',
    })
    expect(duplicatedBlocks.find((block) => block.type === 'data_table')).not.toMatchObject({
      databaseId: 'database_1',
    })
    expect(duplicatedBlocks.find((block) => block.type === 'mindmap')).not.toMatchObject({
      mindmapId: 'mindmap_1',
    })
    expect(counted.getSnapshot()?.pages).toHaveLength(4)
  })

  it('removes orphan page resources on page deletion and keeps resources referenced elsewhere', async () => {
    const workspace = createWorkspace()
    const now = '2026-06-22T00:00:00.000Z'
    workspace.boards = [
      { id: 'board_orphan', title: 'Orphan board', snapshot: {}, createdAt: now, updatedAt: now },
      { id: 'board_shared', title: 'Shared board', snapshot: {}, createdAt: now, updatedAt: now },
    ]
    workspace.dataTables = [
      {
        id: 'database_orphan',
        title: 'Orphan database',
        snapshot: { version: 1 },
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'database_shared',
        title: 'Shared database',
        snapshot: { version: 1 },
        createdAt: now,
        updatedAt: now,
      },
    ]
    workspace.mindmaps = [
      { id: 'mindmap_orphan', title: 'Orphan mindmap', snapshot: {}, createdAt: now, updatedAt: now },
      { id: 'mindmap_shared', title: 'Shared mindmap', snapshot: {}, createdAt: now, updatedAt: now },
    ]
    workspace.pages = [
      {
        ...workspace.pages[0],
        id: 'page_delete',
        title: 'Delete me',
        blocks: [
          { id: 'block_board_orphan', type: 'whiteboard', boardId: 'board_orphan' },
          { id: 'block_board_shared', type: 'whiteboard', boardId: 'board_shared' },
          { id: 'block_database_orphan', type: 'data_table', databaseId: 'database_orphan' },
          { id: 'block_database_shared', type: 'data_table', databaseId: 'database_shared' },
          { id: 'block_mindmap_orphan', type: 'mindmap', mindmapId: 'mindmap_orphan' },
          { id: 'block_mindmap_shared', type: 'mindmap', mindmapId: 'mindmap_shared' },
        ],
      },
      {
        ...workspace.pages[0],
        id: 'page_keep',
        title: 'Keep me',
        blocks: [
          { id: 'block_keep_board', type: 'whiteboard', boardId: 'board_shared' },
          { id: 'block_keep_database', type: 'data_table', databaseId: 'database_shared' },
          { id: 'block_keep_mindmap', type: 'mindmap', mindmapId: 'mindmap_shared' },
        ],
      },
    ]
    workspace.settings.lastOpenedPageId = 'page_delete'
    const counted = createCountingRepository(workspace)
    const store = createWorkspaceStore(counted.repository)

    await store.getState().bootstrap()
    await store.getState().deletePage('page_delete')

    expect(store.getState().pages.map((page) => page.id)).toEqual(['page_keep'])
    expect(store.getState().boards.map((board) => board.id)).toEqual(['board_shared'])
    expect(store.getState().dataTables.map((dataTable) => dataTable.id)).toEqual([
      'database_shared',
    ])
    expect(store.getState().mindmaps.map((mindmap) => mindmap.id)).toEqual(['mindmap_shared'])
    expect(counted.getSnapshot()).toMatchObject({
      boards: [{ id: 'board_shared' }],
      dataTables: [{ id: 'database_shared' }],
      mindmaps: [{ id: 'mindmap_shared' }],
      pages: [{ id: 'page_keep' }],
    })
    expect(counted.getCleanupCalls()).toBe(1)
  })

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

  it('drops legacy data table image data urls during bootstrap normalization', async () => {
    const workspace = createWorkspace()
    const snapshot = createDefaultAppState()
    snapshot.assets = {
      asset_legacy: {
        id: 'asset_legacy',
        kind: 'image',
        name: 'legacy.png',
        mimeType: 'image/png',
        dataUrl: 'data:image/png;base64,AA==',
        createdAt: '2026-06-22T00:00:00.000Z',
      },
    }
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
    const counted = createCountingRepository(workspace)
    const store = createWorkspaceStore(counted.repository)

    await store.getState().bootstrap()

    const normalized = store.getState().dataTables[0]?.snapshot as ReturnType<typeof createDefaultAppState>
    expect(normalized.assets.asset_legacy).toEqual({
      id: 'asset_legacy',
      kind: 'image',
      name: 'legacy.png',
      mimeType: 'image/png',
      createdAt: '2026-06-22T00:00:00.000Z',
    })
    expect(counted.getReplaceCalls()).toBe(1)
  })
})

describe('createWorkspaceStore media blocks', () => {
  it('creates empty media blocks for page images, videos, and audio', async () => {
    const repository = createMemoryRepository(createWorkspace())
    const store = createWorkspaceStore(repository)

    await store.getState().bootstrap()

    await expect(store.getState().insertBlock('page_1', 'image')).resolves.toMatchObject({
      type: 'image',
      assetId: null,
      name: '',
      mimeType: '',
      caption: '',
      alt: '',
    })
    await expect(store.getState().insertBlock('page_1', 'video')).resolves.toMatchObject({
      type: 'video',
      assetId: null,
      name: '',
      mimeType: '',
      caption: '',
    })
    await expect(store.getState().insertBlock('page_1', 'audio')).resolves.toMatchObject({
      type: 'audio',
      assetId: null,
      name: '',
      mimeType: '',
      caption: '',
    })
  })
})

describe('createWorkspaceStore autosave', () => {
  function createWorkspaceWithParagraphBlock() {
    const workspace = createWorkspace()
    workspace.pages[0].blocks = [
      {
        id: 'block_1',
        type: 'paragraph',
        text: 'Initial',
      },
    ]
    return workspace
  }

  it('debounces block persistence while applying the latest block state immediately', async () => {
    vi.useFakeTimers()
    try {
      const counted = createCountingRepository(createWorkspaceWithParagraphBlock())
      const store = createWorkspaceStore(counted.repository)

      await store.getState().bootstrap()
      const block = store.getState().pages[0].blocks[0] as BlockRecord

      await store.getState().updateBlock('page_1', 'block_1', { ...block, text: 'A' })
      await store.getState().updateBlock('page_1', 'block_1', { ...block, text: 'AB' })

      expect(store.getState().pages[0].blocks[0]).toMatchObject({ text: 'AB' })
      expect(store.getState().saveStatus).toBe('saving')
      expect(counted.getSaveCalls()).toBe(0)

      await vi.advanceTimersByTimeAsync(599)
      expect(counted.getSaveCalls()).toBe(0)

      await vi.advanceTimersByTimeAsync(1)
      expect(counted.getSaveCalls()).toBe(1)
      expect(counted.getSnapshot()?.pages[0]?.blocks[0]).toMatchObject({ text: 'AB' })
      expect(store.getState().saveStatus).toBe('saved')
    } finally {
      vi.useRealTimers()
    }
  })

  it('flushes a pending block save without waiting for the debounce delay', async () => {
    vi.useFakeTimers()
    try {
      const counted = createCountingRepository(createWorkspaceWithParagraphBlock())
      const store = createWorkspaceStore(counted.repository)

      await store.getState().bootstrap()
      const block = store.getState().pages[0].blocks[0] as BlockRecord

      await store.getState().updateBlock('page_1', 'block_1', { ...block, text: 'Flushed' })
      await store.getState().flushPendingSaves()

      expect(counted.getSaveCalls()).toBe(1)
      expect(counted.getSnapshot()?.pages[0]?.blocks[0]).toMatchObject({ text: 'Flushed' })
      expect(store.getState().saveStatus).toBe('saved')

      await vi.advanceTimersByTimeAsync(600)
      expect(counted.getSaveCalls()).toBe(1)
    } finally {
      vi.useRealTimers()
    }
  })

  it('waits for in-flight non-page asset saves when flushing pending saves', async () => {
    const workspace = createWorkspace()
    workspace.dataTables = [
      {
        id: 'database_flush',
        title: '旧数据表',
        icon: null,
        cover: null,
        snapshot: createDefaultAppState(),
        createdAt: '2026-07-02T00:00:00.000Z',
        updatedAt: '2026-07-02T00:00:00.000Z',
      },
    ]
    let snapshot: WorkspaceSnapshot | null = structuredClone(workspace)
    let resolveSaveStarted: () => void
    let resolveSave: () => void
    const saveStarted = new Promise<void>((resolve) => {
      resolveSaveStarted = resolve
    })
    const saveDone = new Promise<void>((resolve) => {
      resolveSave = resolve
    })
    const repository = {
      async load() {
        return snapshot ? structuredClone(snapshot) : null
      },
      async save(nextSnapshot: WorkspaceSnapshot) {
        resolveSaveStarted()
        await saveDone
        snapshot = structuredClone(nextSnapshot)
      },
      async replace(nextSnapshot: WorkspaceSnapshot) {
        snapshot = structuredClone(nextSnapshot)
      },
    }
    const store = createWorkspaceStore(repository)

    await store.getState().bootstrap()
    const renameTask = store.getState().renameDataTable('database_flush', '新数据表')
    await saveStarted

    const flushTask = store.getState().flushPendingSaves()

    await expect(
      Promise.race([
        flushTask.then(() => 'flushed'),
        new Promise<'waiting'>((resolve) => {
          setTimeout(() => resolve('waiting'), 0)
        }),
      ]),
    ).resolves.toBe('waiting')

    resolveSave!()
    await renameTask
    await flushTask

    expect(snapshot?.dataTables?.[0]?.title).toBe('新数据表')
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

  it('seeds a new mindmap with a random built-in theme', async () => {
    const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.74)
    const repository = createMemoryRepository(createWorkspace())
    const store = createWorkspaceStore(repository)

    try {
      await store.getState().bootstrap()
      const block = await store.getState().insertBlock('page_1', 'mindmap')
      const snapshot = store
        .getState()
        .mindmaps.find((mindmap) => mindmap.id === (block as { mindmapId: string }).mindmapId)?.snapshot as
        | {
            themeId?: string
            nodes: Record<string, { style?: { branchColor?: string } }>
          }
        | undefined

      expect(snapshot?.themeId).toBe('dusk')
      expect(snapshot?.nodes['node-root']?.style?.branchColor).toBe('#6d5bd0')
    } finally {
      randomSpy.mockRestore()
    }
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

  it('creates a mindmap asset when inserting a mindmap block after another block', async () => {
    const repository = createMemoryRepository(createWorkspace())
    const store = createWorkspaceStore(repository)

    await store.getState().bootstrap()
    await store.getState().insertParagraphBlock('page_1', 'alpha')
    const afterBlockId = store.getState().pages[0]?.blocks[0]?.id
    const block = await store.getState().insertBlockAfter('page_1', afterBlockId!, 'mindmap')
    const state = store.getState()

    expect(block).toMatchObject({
      type: 'mindmap',
      mindmapId: expect.stringMatching(/^mindmap_/),
    })
    expect(state.pages[0]?.blocks[1]).toMatchObject({
      id: (block as { id: string }).id,
      type: 'mindmap',
      mindmapId: (block as { mindmapId: string }).mindmapId,
    })
    expect(state.mindmaps).toHaveLength(1)
  })

  it('turns a block into a mindmap and preserves the block id', async () => {
    const repository = createMemoryRepository(createWorkspace())
    const store = createWorkspaceStore(repository)

    await store.getState().bootstrap()
    await store.getState().insertParagraphBlock('page_1', 'alpha')
    const sourceBlockId = store.getState().pages[0]?.blocks[0]?.id

    await store.getState().turnBlockInto('page_1', sourceBlockId!, 'mindmap')

    const state = store.getState()
    expect(state.pages[0]?.blocks[0]).toMatchObject({
      id: sourceBlockId,
      type: 'mindmap',
      mindmapId: expect.stringMatching(/^mindmap_/),
    })
    expect(state.mindmaps).toHaveLength(1)
    expect(state.mindmaps[0]?.id).toBe(
      (state.pages[0]?.blocks[0] as { mindmapId: string }).mindmapId,
    )
  })

  it('does not persist a mindmap snapshot update when the snapshot is unchanged', async () => {
    const counted = createCountingRepository(createWorkspace())
    const store = createWorkspaceStore(counted.repository)

    await store.getState().bootstrap()
    const block = await store.getState().insertBlock('page_1', 'mindmap')
    const mindmapId = (block as { mindmapId: string }).mindmapId
    const saveCallsBefore = counted.getSaveCalls()
    const snapshotBefore = structuredClone(store.getState().mindmaps[0]?.snapshot)
    const updatedAtBefore = store.getState().mindmaps[0]?.updatedAt

    await store.getState().updateMindmapSnapshot(mindmapId, snapshotBefore)

    expect(counted.getSaveCalls()).toBe(saveCallsBefore)
    expect(store.getState().mindmaps[0]?.updatedAt).toBe(updatedAtBefore)
    expect(counted.getSnapshot()?.mindmaps?.[0]?.snapshot).toEqual(snapshotBefore)
  })

  it('updates a mindmap snapshot and preserves it through undo and redo', async () => {
    const counted = createCountingRepository(createWorkspace())
    const store = createWorkspaceStore(counted.repository)

    await store.getState().bootstrap()
    const block = await store.getState().insertBlock('page_1', 'mindmap')
    const mindmapId = (block as { mindmapId: string }).mindmapId
    const before = store.getState().mindmaps[0]!
    const nextSnapshot = structuredClone(before.snapshot) as {
      title: string
      updatedAt: string
      nodes: Record<string, { text: string }>
    }
    nextSnapshot.title = 'Client Strategy'
    nextSnapshot.updatedAt = '2026-06-23T10:00:00.000Z'
    nextSnapshot.nodes['node-root'] = {
      ...nextSnapshot.nodes['node-root'],
      text: 'Updated Root',
    }

    await store.getState().updateMindmapSnapshot(mindmapId, nextSnapshot)

    const afterUpdate = store.getState().mindmaps[0]!
    expect(counted.getSaveCalls()).toBeGreaterThan(1)
    expect(afterUpdate.title).toBe('Client Strategy')
    expect(afterUpdate.snapshot).toEqual(nextSnapshot)
    expect(afterUpdate.updatedAt).not.toBe(before.updatedAt)

    await store.getState().undo()
    const afterUndo = store.getState().mindmaps[0]!
    expect(afterUndo.title).toBe(before.title)
    expect(afterUndo.snapshot).toEqual(before.snapshot)
    expect(afterUndo.updatedAt).toBe(before.updatedAt)

    await store.getState().redo()
    const afterRedo = store.getState().mindmaps[0]!
    expect(afterRedo.title).toBe('Client Strategy')
    expect(afterRedo.snapshot).toEqual(nextSnapshot)
    expect(afterRedo.updatedAt).toBe(afterUpdate.updatedAt)
  })

  it('preserves mindmaps through undo and redo', async () => {
    const repository = createMemoryRepository(createWorkspace())
    const store = createWorkspaceStore(repository)

    await store.getState().bootstrap()
    const block = await store.getState().insertBlock('page_1', 'mindmap')
    const mindmapId = (block as { mindmapId: string }).mindmapId

    await store.getState().undo()
    expect(store.getState().mindmaps).toHaveLength(0)
    expect(store.getState().pages[0]?.blocks).toHaveLength(0)

    await store.getState().redo()
    expect(store.getState().mindmaps).toHaveLength(1)
    expect(store.getState().mindmaps[0]?.id).toBe(mindmapId)
    expect(store.getState().pages[0]?.blocks[0]).toMatchObject({
      type: 'mindmap',
      mindmapId,
    })
  })
})
