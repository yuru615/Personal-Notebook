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

function createLegacyWorkspace(): WorkspaceSnapshot {
  const now = '2026-06-22T00:00:00.000Z'

  return {
    boards: [],
    dataTables: [],
    mindmaps: [],
    syncedBlockGroups: [],
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

function createWorkspace(): WorkspaceSnapshot {
  const workspace = createLegacyWorkspace()
  const now = '2026-06-22T00:00:00.000Z'

  workspace.pages = [
    ...workspace.pages,
    {
      id: 'page_inbox',
      parentId: null,
      title: '\u6536\u4ef6\u7bb1',
      icon: '\u{1F4E5}',
      cover: null,
      blocks: [],
      createdAt: now,
      updatedAt: now,
    },
  ]
  workspace.settings = {
    ...workspace.settings,
    inboxPageId: 'page_inbox',
  }

  return workspace
}

function getInboxPage(workspace: WorkspaceSnapshot) {
  const inboxPageId = workspace.settings.inboxPageId
  const inboxPage =
    inboxPageId !== null && inboxPageId !== undefined
      ? workspace.pages.find((page) => page.id === inboxPageId)
      : null

  if (!inboxPage) {
    throw new Error('Expected workspace inbox page')
  }

  return inboxPage
}

function withInboxPages(workspace: WorkspaceSnapshot, pages: WorkspaceSnapshot['pages']) {
  const inboxPage = getInboxPage(workspace)

  if (pages.some((page) => page.id === inboxPage.id)) {
    return pages
  }

  return [...pages, { ...inboxPage }]
}

function withInboxSettings(workspace: WorkspaceSnapshot, lastOpenedPageId: string | null) {
  return {
    ...workspace.settings,
    lastOpenedPageId,
  }
}

function createSyncedBlockGroups() {
  return [
    {
      id: 'group_1',
      blocks: [{ id: 'group_block_1', type: 'paragraph' as const, text: 'Shared source' }],
      primaryInstanceId: 'instance_1',
      createdAt: '2026-07-02T00:00:00.000Z',
      updatedAt: '2026-07-02T00:00:00.000Z',
    },
  ]
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

function createWorkspaceWithSyncedGroupAsset(blocks: BlockRecord[]): WorkspaceSnapshot {
  const workspace = createWorkspace()
  const now = '2026-07-07T00:00:00.000Z'
  const [templatePage, inboxPage] = workspace.pages

  workspace.syncedBlockGroups = [
    {
      id: 'group_1',
      blocks,
      primaryInstanceId: 'instance_1',
      createdAt: now,
      updatedAt: now,
    },
  ]
  workspace.pages = [
    {
      ...templatePage,
      id: 'page_1',
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
    {
      ...templatePage,
      id: 'page_2',
      blocks: [
        {
          id: 'container_2',
          type: 'synced_block',
          groupId: 'group_1',
          instanceId: 'instance_2',
          mode: 'sync',
        },
      ],
    },
    inboxPage,
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
    })
    expect(counted.getSnapshot()?.pages.find((page) => page.id === 'page_1')).toMatchObject({
      id: 'page_1',
      icon: '🧠',
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

  it("defaults clipboard capture mode to 'off' and persists changes", async () => {
    const workspace = createWorkspace()
    const counted = createCountingRepository({
      ...workspace,
      settings: {
        lastOpenedPageId: 'page_1',
      },
    })
    const store = createWorkspaceStore(counted.repository)

    await store.getState().bootstrap()

    expect(store.getState().settings.clipboardCaptureMode).toBe('off')
    expect(counted.getReplaceCalls()).toBe(1)

    await (store.getState() as any).setClipboardCaptureMode('prompt_to_inbox')

    expect(store.getState().settings.clipboardCaptureMode).toBe('prompt_to_inbox')
    expect(counted.getSnapshot()?.settings).toMatchObject({
      lastOpenedPageId: 'page_1',
      clipboardCaptureMode: 'prompt_to_inbox',
    })
  })

  it('appends clipboard capture blocks into the inbox page', async () => {
    const counted = createCountingRepository(createLegacyWorkspace())
    const store = createWorkspaceStore(counted.repository)

    await store.getState().bootstrap()
    const inboxPageId = store.getState().settings.inboxPageId
    if (!inboxPageId) {
      throw new Error('Expected an inbox page after bootstrap')
    }

    await (store.getState() as any).appendClipboardCaptureToInbox(
      [
        { id: 'block_1', type: 'paragraph', text: '第一段' },
        { id: 'block_2', type: 'todo', text: '第二段', checked: false },
      ],
      '2026-07-07T08:09:00.000Z',
    )

    const inboxPage = store.getState().pages.find((page) => page.id === inboxPageId)

    expect(inboxPage?.blocks).toEqual([
      { id: expect.any(String), type: 'paragraph', text: '剪贴板捕获 · 2026-07-07 08:09' },
      { id: 'block_1', type: 'paragraph', text: '第一段' },
      { id: 'block_2', type: 'todo', text: '第二段', checked: false },
      { id: expect.any(String), type: 'paragraph', text: '' },
    ])
    expect(counted.getSnapshot()?.pages.find((page) => page.id === inboxPageId)?.blocks).toEqual(
      inboxPage?.blocks,
    )
  })

  it('defaults syncedBlockGroups during legacy workspace bootstrap', async () => {
    const counted = createCountingRepository({
      ...createWorkspace(),
      syncedBlockGroups: undefined,
    })
    const store = createWorkspaceStore(counted.repository)

    await store.getState().bootstrap()

    expect(store.getState().syncedBlockGroups).toEqual([])
  })

  it('creates and remembers an inbox page when bootstrapping a legacy workspace', async () => {
    const counted = createCountingRepository(createLegacyWorkspace())
    const store = createWorkspaceStore(counted.repository)

    await store.getState().bootstrap()

    const inboxPageId = store.getState().settings.inboxPageId
    const inboxPage = store.getState().pages.find((page) => page.id === inboxPageId)

    expect(inboxPageId).toBeTruthy()
    expect(inboxPage).toMatchObject({
      parentId: null,
      title: '\u6536\u4ef6\u7bb1',
    })
    expect(store.getState().currentPageId).toBe('page_1')
  })

  it('repairs a broken inboxPageId during bootstrap', async () => {
    const workspace = createLegacyWorkspace()
    workspace.settings = {
      ...workspace.settings,
      inboxPageId: 'page_missing_inbox',
    }

    const counted = createCountingRepository(workspace)
    const store = createWorkspaceStore(counted.repository)

    await store.getState().bootstrap()

    expect(store.getState().settings.inboxPageId).not.toBe('page_missing_inbox')
    expect(
      store.getState().pages.some((page) => page.id === store.getState().settings.inboxPageId),
    ).toBe(true)
  })

  it('reuses an existing inbox page when inboxPageId is missing during bootstrap', async () => {
    const workspace = createWorkspace()
    workspace.settings = {
      lastOpenedPageId: 'page_1',
    }
    const counted = createCountingRepository(workspace)
    const store = createWorkspaceStore(counted.repository)

    await store.getState().bootstrap()

    expect(store.getState().settings.inboxPageId).toBe('page_inbox')
    expect(store.getState().pages).toHaveLength(2)
  })

  it('recreates the inbox page on demand after the current inbox page is deleted', async () => {
    const counted = createCountingRepository(createLegacyWorkspace())
    const store = createWorkspaceStore(counted.repository)

    await store.getState().bootstrap()
    const firstInboxId = store.getState().settings.inboxPageId

    expect(firstInboxId).toBeTruthy()

    await store.getState().deletePage(firstInboxId!)
    const rebuiltInbox = await store.getState().ensureInboxPage()

    expect(rebuiltInbox.title).toBe('\u6536\u4ef6\u7bb1')
    expect(rebuiltInbox.id).not.toBe(firstInboxId)
    expect(store.getState().settings.inboxPageId).toBe(rebuiltInbox.id)
  })

  it('reuses workspace property definitions across pages and persists page values', async () => {
    const counted = createCountingRepository(createWorkspace())
    const store = createWorkspaceStore(counted.repository)

    await store.getState().bootstrap()
    const tagsDefinition = store.getState().pageProperties.find((item) => item.key === 'tags')
    expect(tagsDefinition).toBeTruthy()

    await store.getState().setPagePropertyValue('page_1', tagsDefinition!.id, ['产品', '搜索'])
    await store.getState().createPage()

    const nextPageId = store.getState().pages.at(-1)?.id
    await store.getState().setPagePropertyValue(nextPageId!, tagsDefinition!.id, ['搜索'])

    expect(store.getState().pageProperties.filter((item) => item.key === 'tags')).toHaveLength(1)
    expect(counted.getSnapshot()?.pages[0].properties?.[tagsDefinition!.id]).toEqual([
      '产品',
      '搜索',
    ])
    expect(counted.getSnapshot()?.pages.at(-1)?.properties?.[tagsDefinition!.id]).toEqual(['搜索'])
  })

  it('creates a titled relation target page without changing currentPageId when setCurrent is false', async () => {
    const counted = createCountingRepository(createWorkspace())
    const store = createWorkspaceStore(counted.repository)

    await store.getState().bootstrap()
    const created = await store.getState().createPage(undefined, {
      title: 'Launch Notes',
      setCurrent: false,
    })

    expect(created.title).toBe('Launch Notes')
    expect(store.getState().currentPageId).toBe('page_1')
    expect(counted.getSnapshot()?.pages.at(-1)).toMatchObject({ title: 'Launch Notes' })
  })

  it('renames relation labels everywhere the target page is referenced', async () => {
    const workspace = createWorkspace()
    const [templatePage] = workspace.pages
    const counted = createCountingRepository({
      ...workspace,
      pages: withInboxPages(workspace, [
        {
          ...templatePage,
          id: 'page_target',
          title: 'Old Plan',
        },
        {
          ...templatePage,
          id: 'page_source',
          title: 'Source',
          blocks: [
            {
              id: 'block_relation',
              type: 'paragraph',
              text: 'Old Plan',
              richText: [{ text: 'Old Plan', pageId: 'page_target', relationKind: 'link' }],
            },
          ],
        },
      ]),
      settings: withInboxSettings(workspace, 'page_source'),
    })
    const store = createWorkspaceStore(counted.repository)

    await store.getState().bootstrap()
    await store.getState().renamePage('page_target', 'Renamed Plan')
    const sourcePage = store.getState().pages.find((page) => page.id === 'page_source')

    expect(sourcePage?.blocks[0]).toMatchObject({
      text: 'Renamed Plan',
      richText: [{ text: 'Renamed Plan', pageId: 'page_target', relationKind: 'link' }],
    })
    expect(sourcePage?.updatedAt).not.toBe(templatePage.updatedAt)
  })

  it('keeps overlapping page property edits instead of overwriting earlier values', async () => {
    const counted = createCountingRepository(createWorkspace())
    const store = createWorkspaceStore(counted.repository)

    await store.getState().bootstrap()
    const tagsDefinition = store.getState().pageProperties.find((item) => item.key === 'tags')
    const statusDefinition = store.getState().pageProperties.find((item) => item.key === 'status')

    expect(tagsDefinition).toBeTruthy()
    expect(statusDefinition).toBeTruthy()

    const firstUpdate = store
      .getState()
      .setPagePropertyValue('page_1', tagsDefinition!.id, ['产品', '搜索'])
    const secondUpdate = store
      .getState()
      .setPagePropertyValue('page_1', statusDefinition!.id, '进行中')

    await Promise.all([firstUpdate, secondUpdate])

    expect(store.getState().pages[0]?.properties).toMatchObject({
      [tagsDefinition!.id]: ['产品', '搜索'],
      [statusDefinition!.id]: '进行中',
    })
    expect(counted.getSnapshot()?.pages[0]?.properties).toMatchObject({
      [tagsDefinition!.id]: ['产品', '搜索'],
      [statusDefinition!.id]: '进行中',
    })
  })

  it('keeps a newly created page property option selected when option and value saves overlap', async () => {
    const workspace = createWorkspace()
    let snapshot: WorkspaceSnapshot | null = structuredClone(workspace)
    let saveCount = 0

    const store = createWorkspaceStore({
      async load() {
        return snapshot ? structuredClone(snapshot) : null
      },
      async save(nextSnapshot: WorkspaceSnapshot) {
        saveCount += 1

        if (saveCount === 1) {
          await new Promise((resolve) => setTimeout(resolve, 20))
        }

        snapshot = structuredClone(nextSnapshot)
      },
      async replace(nextSnapshot: WorkspaceSnapshot) {
        snapshot = structuredClone(nextSnapshot)
      },
      async cleanupOrphanAssets() {
        return 0
      },
    })

    await store.getState().bootstrap()
    const statusDefinition = store.getState().pageProperties.find((item) => item.key === 'status')

    expect(statusDefinition).toBeTruthy()

    const updateOptions = store.getState().setPagePropertyOptions(statusDefinition!.id, [
      { id: 'todo', label: 'Todo', color: '#64748b' },
      { id: 'blocked', label: 'Blocked', color: '#475569' },
    ])
    const updateValue = store
      .getState()
      .setPagePropertyValue('page_1', statusDefinition!.id, 'Blocked')

    await Promise.all([updateOptions, updateValue])

    expect(store.getState().pages[0]?.properties).toMatchObject({
      [statusDefinition!.id]: 'Blocked',
    })
    expect(
      store.getState().pageProperties.find((item) => item.id === statusDefinition!.id)?.config.options,
    ).toEqual([
      { id: 'todo', label: 'Todo', color: '#64748b' },
      { id: 'blocked', label: 'Blocked', color: '#2563eb' },
    ])
    expect(snapshot?.pages[0]?.properties).toMatchObject({
      [statusDefinition!.id]: 'Blocked',
    })
  })

  it('removes deleted page property options from existing page values', async () => {
    const counted = createCountingRepository(createWorkspace())
    const store = createWorkspaceStore(counted.repository)

    await store.getState().bootstrap()
    const tagsDefinition = store.getState().pageProperties.find((item) => item.key === 'tags')
    const statusDefinition = store.getState().pageProperties.find((item) => item.key === 'status')

    expect(tagsDefinition).toBeTruthy()
    expect(statusDefinition).toBeTruthy()

    await store.getState().setPagePropertyValue('page_1', tagsDefinition!.id, ['Alpha', 'Ghost'])
    await store.getState().setPagePropertyValue('page_1', statusDefinition!.id, 'Doing')

    await store.getState().setPagePropertyOptions(tagsDefinition!.id, [
      { id: 'alpha', label: 'Alpha', color: '#2563eb' },
    ])
    await store.getState().setPagePropertyOptions(statusDefinition!.id, [
      { id: 'todo', label: 'Todo', color: '#64748b' },
    ])

    expect(store.getState().pages[0]?.properties).toMatchObject({
      [tagsDefinition!.id]: ['Alpha'],
      [statusDefinition!.id]: null,
    })
    expect(counted.getSnapshot()?.pages[0]?.properties).toMatchObject({
      [tagsDefinition!.id]: ['Alpha'],
      [statusDefinition!.id]: null,
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

  it('strips relation metadata when the target page is deleted', async () => {
    const workspace = createWorkspace()
    const [templatePage] = workspace.pages
    const counted = createCountingRepository({
      ...workspace,
      pages: withInboxPages(workspace, [
        {
          ...templatePage,
          id: 'page_target',
          title: 'Product Plan',
        },
        {
          ...templatePage,
          id: 'page_source',
          title: 'Source',
          blocks: [
            {
              id: 'block_relation',
              type: 'paragraph',
              text: 'Product Plan',
              richText: [{ text: 'Product Plan', pageId: 'page_target', relationKind: 'link' }],
            },
          ],
        },
      ]),
      settings: withInboxSettings(workspace, 'page_source'),
    })
    const store = createWorkspaceStore(counted.repository)

    await store.getState().bootstrap()
    await store.getState().deletePage('page_target')
    const sourcePage = store.getState().pages.find((page) => page.id === 'page_source')

    expect(sourcePage?.blocks[0]).toMatchObject({
      text: 'Product Plan',
      richText: [{ text: 'Product Plan' }],
    })
    expect((sourcePage?.blocks[0] as Extract<BlockRecord, { type: 'paragraph' }>).richText?.[0]).not.toHaveProperty(
      'pageId',
    )
    expect(sourcePage?.updatedAt).not.toBe(templatePage.updatedAt)
  })

  it('deletes a page branch and moves the current page to the next available page', async () => {
    const workspace = createWorkspace()
    workspace.pages = withInboxPages(workspace, [
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
    ])
    workspace.settings = withInboxSettings(workspace, 'page_child')
    const counted = createCountingRepository(workspace)
    const store = createWorkspaceStore(counted.repository)

    await store.getState().bootstrap()
    await store.getState().deletePage('page_parent')

    expect(store.getState().pages.filter((page) => page.id !== 'page_inbox').map((page) => page.id)).toEqual([
      'page_next',
    ])
    expect(store.getState().currentPageId).toBe('page_next')
    expect(store.getState().settings.lastOpenedPageId).toBe('page_next')
    expect(
      counted
        .getSnapshot()
        ?.pages.filter((page) => page.id !== 'page_inbox')
        .map((page) => page.id),
    ).toEqual(['page_next'])
  })

  it('preserves syncedBlockGroups when deleting a page branch', async () => {
    const workspace = createWorkspace()
    workspace.syncedBlockGroups = createSyncedBlockGroups()
    workspace.pages = withInboxPages(workspace, [
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
    ])
    workspace.settings = withInboxSettings(workspace, 'page_child')
    const counted = createCountingRepository(workspace)
    const store = createWorkspaceStore(counted.repository)

    await store.getState().bootstrap()
    await store.getState().deletePage('page_parent')

    expect(counted.getSnapshot()?.syncedBlockGroups).toEqual(createSyncedBlockGroups())
  })

  it('remaps duplicated in-branch relation targets to the duplicated page ids', async () => {
    const workspace = createWorkspace()
    workspace.pages = withInboxPages(workspace, [
      {
        ...workspace.pages[0],
        id: 'page_parent',
        title: 'Parent',
        blocks: [{ id: 'block_child_page', type: 'child_page', pageId: 'page_child' }],
      },
      {
        ...workspace.pages[0],
        id: 'page_child',
        parentId: 'page_parent',
        title: 'Child',
        blocks: [
          {
            id: 'block_relation',
            type: 'paragraph',
            text: 'Parent',
            richText: [{ text: 'Parent', pageId: 'page_parent', relationKind: 'link' }],
          },
        ],
      },
    ])

    const store = createWorkspaceStore(createMemoryRepository(workspace))
    await store.getState().bootstrap()
    const duplicatedParent = await store.getState().duplicatePage('page_parent')
    const duplicatedChild = store.getState().pages.find((page) => page.parentId === duplicatedParent?.id)

    expect(duplicatedChild?.blocks[0]).toMatchObject({
      richText: [
        expect.objectContaining({
          pageId: duplicatedParent?.id,
          relationKind: 'link',
        }),
      ],
    })
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
    workspace.pages = withInboxPages(workspace, [
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
    ])
    workspace.settings = withInboxSettings(workspace, 'page_parent')
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
    expect(state.pages.filter((page) => page.id !== 'page_inbox')).toHaveLength(4)
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
    expect(counted.getSnapshot()?.pages.filter((page) => page.id !== 'page_inbox')).toHaveLength(4)
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
    workspace.pages = withInboxPages(workspace, [
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
    ])
    workspace.settings = withInboxSettings(workspace, 'page_delete')
    const counted = createCountingRepository(workspace)
    const store = createWorkspaceStore(counted.repository)

    await store.getState().bootstrap()
    await store.getState().deletePage('page_delete')

    expect(store.getState().pages.filter((page) => page.id !== 'page_inbox').map((page) => page.id)).toEqual([
      'page_keep',
    ])
    expect(store.getState().boards.map((board) => board.id)).toEqual(['board_shared'])
    expect(store.getState().dataTables.map((dataTable) => dataTable.id)).toEqual([
      'database_shared',
    ])
    expect(store.getState().mindmaps.map((mindmap) => mindmap.id)).toEqual(['mindmap_shared'])
    expect(counted.getSnapshot()).toMatchObject({
      boards: [{ id: 'board_shared' }],
      dataTables: [{ id: 'database_shared' }],
      mindmaps: [{ id: 'mindmap_shared' }],
      pages: expect.arrayContaining([expect.objectContaining({ id: 'page_keep' })]),
    })
    expect(counted.getCleanupCalls()).toBe(1)
  })

  it('creates a data table asset when inserting a data table block', async () => {
    const workspace = createWorkspace()
    workspace.syncedBlockGroups = createSyncedBlockGroups()
    const counted = createCountingRepository(workspace)
    const store = createWorkspaceStore(counted.repository)

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
    expect(counted.getSnapshot()?.syncedBlockGroups).toEqual(createSyncedBlockGroups())
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

  it('keeps boards referenced from synced groups during board cleanup', async () => {
    const workspace = createWorkspaceWithSyncedGroupAsset([
      { id: 'group_board', type: 'whiteboard', boardId: 'board_live' },
    ])
    workspace.boards = [
      {
        id: 'board_live',
        title: 'Still linked',
        snapshot: {},
        createdAt: '2026-07-07T00:00:00.000Z',
        updatedAt: '2026-07-07T00:00:00.000Z',
      },
      {
        id: 'board_orphan',
        title: 'Orphan board',
        snapshot: {},
        createdAt: '2026-07-07T00:00:00.000Z',
        updatedAt: '2026-07-07T00:00:00.000Z',
      },
    ]
    const repository = createMemoryRepository(workspace)
    const store = createWorkspaceStore(repository)

    await store.getState().bootstrap()
    await store.getState().cleanupOrphanBoards()

    expect(store.getState().boards.map((board) => board.id)).toEqual(['board_live'])
  })

  it('keeps data tables referenced from synced groups during data table cleanup', async () => {
    const workspace = createWorkspaceWithSyncedGroupAsset([
      { id: 'group_table', type: 'data_table', databaseId: 'database_live' },
    ])
    workspace.dataTables = [
      {
        id: 'database_live',
        title: 'Still linked',
        snapshot: { version: 1 },
        createdAt: '2026-07-07T00:00:00.000Z',
        updatedAt: '2026-07-07T00:00:00.000Z',
      },
      {
        id: 'database_orphan',
        title: 'Orphan data table',
        snapshot: { version: 1 },
        createdAt: '2026-07-07T00:00:00.000Z',
        updatedAt: '2026-07-07T00:00:00.000Z',
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

  it('keeps synced-group resources when deleting a page branch with remaining instances', async () => {
    const workspace = createWorkspaceWithSyncedGroupAsset([
      { id: 'group_board', type: 'whiteboard', boardId: 'board_live' },
      { id: 'group_table', type: 'data_table', databaseId: 'database_live' },
      { id: 'group_mindmap', type: 'mindmap', mindmapId: 'mindmap_live' },
    ])
    const counted = createCountingRepository({
      ...workspace,
      boards: [
        {
          id: 'board_live',
          title: 'Still linked',
          snapshot: {},
          createdAt: '2026-07-07T00:00:00.000Z',
          updatedAt: '2026-07-07T00:00:00.000Z',
        },
      ],
      dataTables: [
        {
          id: 'database_live',
          title: 'Still linked',
          snapshot: { version: 1 },
          createdAt: '2026-07-07T00:00:00.000Z',
          updatedAt: '2026-07-07T00:00:00.000Z',
        },
      ],
      mindmaps: [
        {
          id: 'mindmap_live',
          title: 'Still linked',
          snapshot: {},
          createdAt: '2026-07-07T00:00:00.000Z',
          updatedAt: '2026-07-07T00:00:00.000Z',
        },
      ],
      settings: withInboxSettings(workspace, 'page_1'),
    })
    const store = createWorkspaceStore(counted.repository)

    await store.getState().bootstrap()
    await store.getState().deletePage('page_1')

    expect(store.getState().boards.map((board) => board.id)).toEqual(['board_live'])
    expect(store.getState().dataTables.map((dataTable) => dataTable.id)).toEqual(['database_live'])
    expect(store.getState().mindmaps.map((mindmap) => mindmap.id)).toEqual(['mindmap_live'])
    expect(counted.getSnapshot()).toMatchObject({
      boards: [{ id: 'board_live' }],
      dataTables: [{ id: 'database_live' }],
      mindmaps: [{ id: 'mindmap_live' }],
      syncedBlockGroups: [{ id: 'group_1' }],
      pages: expect.arrayContaining([expect.objectContaining({ id: 'page_2' })]),
    })
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

  function createSyncedBlockGroup() {
    return [
      {
        id: 'group_1',
        blocks: [{ id: 'group_block_1', type: 'paragraph' as const, text: 'Shared source' }],
        primaryInstanceId: 'instance_1',
        createdAt: '2026-07-02T00:00:00.000Z',
        updatedAt: '2026-07-02T00:00:00.000Z',
      },
    ]
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

  it('preserves syncedBlockGroups through the pending block save path', async () => {
    vi.useFakeTimers()
    try {
      const workspace = createWorkspaceWithParagraphBlock()
      workspace.syncedBlockGroups = createSyncedBlockGroup()
      const counted = createCountingRepository(workspace)
      const store = createWorkspaceStore(counted.repository)

      await store.getState().bootstrap()
      const block = store.getState().pages[0].blocks[0] as BlockRecord

      await store.getState().updateBlock('page_1', 'block_1', { ...block, text: 'Kept' })
      await store.getState().flushPendingSaves()

      expect(counted.getSnapshot()?.syncedBlockGroups).toEqual(createSyncedBlockGroup())
    } finally {
      vi.useRealTimers()
    }
  })

  it('ignores stale block updates after a block has been replaced with a synced container', async () => {
    const baseWorkspace = createWorkspace()
    const counted = createCountingRepository({
      ...baseWorkspace,
      pages: withInboxPages(baseWorkspace, [
        {
          ...baseWorkspace.pages[0],
          id: 'page_1',
          title: 'Source page',
          blocks: [{ id: 'block_source', type: 'paragraph', text: 'Existing source note' }],
        },
        {
          ...baseWorkspace.pages[0],
          id: 'page_2',
          title: 'Target page',
          blocks: [{ id: 'block_target', type: 'paragraph', text: '' }],
        },
      ]),
      settings: withInboxSettings(baseWorkspace, 'page_1'),
    } as never)
    const store = createWorkspaceStore(counted.repository)

    await store.getState().bootstrap()
    await store
      .getState()
      .createSyncedBlockFromExistingBlock(
        'page_1',
        'block_source',
        'page_2',
        'block_target',
        'reference',
      )

    await store.getState().updateBlock('page_2', 'block_target', {
      id: 'block_target',
      type: 'paragraph',
      text: '',
    })

    expect(store.getState().pages[1]?.blocks[0]).toEqual(
      expect.objectContaining({
        id: 'block_target',
        type: 'synced_block',
        groupId: store.getState().syncedBlockGroups[0]?.id,
        mode: 'reference',
      }),
    )
    expect(counted.getSnapshot()?.pages[1]?.blocks[0]).toEqual(
      expect.objectContaining({
        id: 'block_target',
        type: 'synced_block',
      }),
    )
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

  it('preserves syncedBlockGroups through non-page asset saves', async () => {
    const workspace = createWorkspace()
    workspace.syncedBlockGroups = createSyncedBlockGroup()
    workspace.dataTables = [
      {
        id: 'database_keep_groups',
        title: '旧数据表',
        icon: null,
        cover: null,
        snapshot: createDefaultAppState(),
        createdAt: '2026-07-02T00:00:00.000Z',
        updatedAt: '2026-07-02T00:00:00.000Z',
      },
    ]
    const counted = createCountingRepository(workspace)
    const store = createWorkspaceStore(counted.repository)

    await store.getState().bootstrap()
    await store.getState().renameDataTable('database_keep_groups', '新数据表')

    expect(counted.getSnapshot()?.syncedBlockGroups).toEqual(createSyncedBlockGroup())
  })
})

describe('createWorkspaceStore synced blocks', () => {
  it('creates a synced group from consecutive blocks and replaces them with one container', async () => {
    const baseWorkspace = createWorkspace()
    const counted = createCountingRepository({
      ...baseWorkspace,
      syncedBlockGroups: [],
      pages: withInboxPages(baseWorkspace, [
        {
          ...baseWorkspace.pages[0],
          blocks: [
            { id: 'block_1', type: 'paragraph', text: 'Alpha' },
            { id: 'block_2', type: 'todo', text: 'Beta', checked: false },
            { id: 'block_3', type: 'paragraph', text: 'Gamma' },
          ],
        },
      ]),
    } as never)
    const store = createWorkspaceStore(counted.repository)

    await store.getState().bootstrap()
    await store.getState().createSyncedBlockFromRange('page_1', 'block_1', 'block_2')

    expect(store.getState().syncedBlockGroups).toHaveLength(1)
    expect(store.getState().syncedBlockGroups[0]?.blocks).toEqual([
      { id: 'block_1', type: 'paragraph', text: 'Alpha' },
      { id: 'block_2', type: 'todo', text: 'Beta', checked: false },
    ])
    expect(store.getState().pages[0]?.blocks).toEqual([
      expect.objectContaining({
        type: 'synced_block',
        groupId: store.getState().syncedBlockGroups[0]?.id,
        mode: 'sync',
      }),
      { id: 'block_3', type: 'paragraph', text: 'Gamma' },
    ])
  })

  it('replaces a block with a synced or reference instance', async () => {
    const now = '2026-07-06T00:00:00.000Z'
    const baseWorkspace = createWorkspace()
    const counted = createCountingRepository({
      ...baseWorkspace,
      syncedBlockGroups: [
        {
          id: 'group_1',
          blocks: [{ id: 'group_block_1', type: 'paragraph', text: 'Shared text' }],
          primaryInstanceId: 'instance_1',
          createdAt: now,
          updatedAt: now,
        },
      ],
      pages: withInboxPages(baseWorkspace, [
        {
          ...baseWorkspace.pages[0],
          blocks: [{ id: 'block_1', type: 'paragraph', text: '' }],
        },
      ]),
    } as never)
    const store = createWorkspaceStore(counted.repository)

    await store.getState().bootstrap()
    const container = await store
      .getState()
      .replaceBlockWithSyncedInstance('page_1', 'block_1', 'group_1', 'reference')

    expect(container).toEqual(
      expect.objectContaining({
        id: 'block_1',
        type: 'synced_block',
        groupId: 'group_1',
        mode: 'reference',
      }),
    )
    expect(store.getState().pages[0]?.blocks[0]).toEqual(
      expect.objectContaining({
        id: 'block_1',
        type: 'synced_block',
        groupId: 'group_1',
        mode: 'reference',
      }),
    )
  })

  it('creates a synced group from an existing block and inserts a reference at the target block', async () => {
    const baseWorkspace = createWorkspace()
    const counted = createCountingRepository({
      ...baseWorkspace,
      pages: withInboxPages(baseWorkspace, [
        {
          ...baseWorkspace.pages[0],
          id: 'page_1',
          title: 'Source page',
          blocks: [
            { id: 'block_source', type: 'paragraph', text: 'Existing source note' },
            { id: 'block_after', type: 'paragraph', text: 'After source' },
          ],
        },
        {
          ...baseWorkspace.pages[0],
          id: 'page_2',
          title: 'Target page',
          blocks: [{ id: 'block_target', type: 'paragraph', text: '' }],
        },
      ]),
      settings: withInboxSettings(baseWorkspace, 'page_1'),
    } as never)
    const store = createWorkspaceStore(counted.repository)

    await store.getState().bootstrap()
    const inserted = await store
      .getState()
      .createSyncedBlockFromExistingBlock(
        'page_1',
        'block_source',
        'page_2',
        'block_target',
        'reference',
      )

    expect(store.getState().syncedBlockGroups).toHaveLength(1)
    expect(store.getState().syncedBlockGroups[0]?.blocks).toEqual([
      { id: 'block_source', type: 'paragraph', text: 'Existing source note' },
    ])
    expect(store.getState().pages[0]?.blocks[0]).toEqual(
      expect.objectContaining({
        id: 'block_source',
        type: 'synced_block',
        groupId: store.getState().syncedBlockGroups[0]?.id,
        mode: 'sync',
      }),
    )
    expect(store.getState().pages[1]?.blocks[0]).toEqual(
      expect.objectContaining({
        id: 'block_target',
        type: 'synced_block',
        groupId: store.getState().syncedBlockGroups[0]?.id,
        mode: 'reference',
      }),
    )
    expect(inserted).toEqual(
      expect.objectContaining({
        id: 'block_target',
        type: 'synced_block',
        groupId: store.getState().syncedBlockGroups[0]?.id,
        mode: 'reference',
      }),
    )
  })

  it('updates shared text from a sync instance and unsyncs a single container into local blocks', async () => {
    const now = '2026-07-06T00:00:00.000Z'
    const baseWorkspace = createWorkspace()
    const counted = createCountingRepository({
      ...baseWorkspace,
      syncedBlockGroups: [
        {
          id: 'group_1',
          blocks: [{ id: 'group_block_1', type: 'paragraph', text: 'Shared text' }],
          primaryInstanceId: 'instance_1',
          createdAt: now,
          updatedAt: now,
        },
      ],
      pages: withInboxPages(baseWorkspace, [
        {
          ...baseWorkspace.pages[0],
          id: 'page_1',
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
        {
          ...baseWorkspace.pages[0],
          id: 'page_2',
          blocks: [
            {
              id: 'container_2',
              type: 'synced_block',
              groupId: 'group_1',
              instanceId: 'instance_2',
              mode: 'reference',
            },
          ],
        },
      ]),
      settings: withInboxSettings(baseWorkspace, 'page_1'),
    } as never)
    const store = createWorkspaceStore(counted.repository)

    await store.getState().bootstrap()
    await store.getState().updateSyncedGroupBlock('group_1', 'group_block_1', {
      id: 'group_block_1',
      type: 'paragraph',
      text: 'Updated shared text',
    })
    await store.getState().flushPendingSaves()

    expect(store.getState().syncedBlockGroups[0]?.blocks[0]).toEqual({
      id: 'group_block_1',
      type: 'paragraph',
      text: 'Updated shared text',
    })

    await store.getState().unsyncBlockInstance('page_1', 'container_1')

    expect(store.getState().pages.find((page) => page.id === 'page_1')?.blocks).toEqual([
      expect.objectContaining({
        type: 'paragraph',
        text: 'Updated shared text',
      }),
    ])
    expect(store.getState().pages.find((page) => page.id === 'page_2')?.blocks).toEqual([
      expect.objectContaining({
        id: 'container_2',
        type: 'synced_block',
        groupId: 'group_1',
      }),
    ])
  })

  it('migrates the primary instance when the current primary container is deleted', async () => {
    const now = '2026-07-06T00:00:00.000Z'
    const baseWorkspace = createWorkspace()
    const counted = createCountingRepository({
      ...baseWorkspace,
      syncedBlockGroups: [
        {
          id: 'group_1',
          blocks: [{ id: 'group_block_1', type: 'paragraph', text: 'Shared text' }],
          primaryInstanceId: 'instance_1',
          createdAt: now,
          updatedAt: now,
        },
      ],
      pages: withInboxPages(baseWorkspace, [
        {
          ...baseWorkspace.pages[0],
          id: 'page_1',
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
        {
          ...baseWorkspace.pages[0],
          id: 'page_2',
          blocks: [
            {
              id: 'container_2',
              type: 'synced_block',
              groupId: 'group_1',
              instanceId: 'instance_2',
              mode: 'sync',
            },
          ],
        },
      ]),
      settings: withInboxSettings(baseWorkspace, 'page_1'),
    } as never)
    const store = createWorkspaceStore(counted.repository)

    await store.getState().bootstrap()
    await store.getState().deleteBlock('page_1', 'container_1')

    expect(store.getState().syncedBlockGroups[0]?.primaryInstanceId).toBe('instance_2')
  })

  it('duplicates a synced container with a fresh instance id', async () => {
    const now = '2026-07-06T00:00:00.000Z'
    const baseWorkspace = createWorkspace()
    const counted = createCountingRepository({
      ...baseWorkspace,
      syncedBlockGroups: [
        {
          id: 'group_1',
          blocks: [{ id: 'group_block_1', type: 'paragraph', text: 'Shared text' }],
          primaryInstanceId: 'instance_1',
          createdAt: now,
          updatedAt: now,
        },
      ],
      pages: withInboxPages(baseWorkspace, [
        {
          ...baseWorkspace.pages[0],
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
      ]),
    } as never)
    const store = createWorkspaceStore(counted.repository)

    await store.getState().bootstrap()
    await store.getState().duplicateBlock('page_1', 'container_1')

    const duplicatedBlocks = store.getState().pages[0]?.blocks as Array<{
      id: string
      type: string
      groupId?: string
      instanceId?: string
    }>

    expect(duplicatedBlocks).toHaveLength(2)
    expect(duplicatedBlocks[0]).toMatchObject({
      id: 'container_1',
      type: 'synced_block',
      groupId: 'group_1',
      instanceId: 'instance_1',
    })
    expect(duplicatedBlocks[1]).toMatchObject({
      type: 'synced_block',
      groupId: 'group_1',
    })
    expect(duplicatedBlocks[1]?.id).not.toBe('container_1')
    expect(duplicatedBlocks[1]?.instanceId).not.toBe('instance_1')
  })

  it('duplicates page synced containers with fresh instance ids', async () => {
    const now = '2026-07-06T00:00:00.000Z'
    const baseWorkspace = createWorkspace()
    const counted = createCountingRepository({
      ...baseWorkspace,
      syncedBlockGroups: [
        {
          id: 'group_1',
          blocks: [{ id: 'group_block_1', type: 'paragraph', text: 'Shared text' }],
          primaryInstanceId: 'instance_1',
          createdAt: now,
          updatedAt: now,
        },
      ],
      pages: withInboxPages(baseWorkspace, [
        {
          ...baseWorkspace.pages[0],
          id: 'page_1',
          title: 'Source',
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
      ]),
      settings: withInboxSettings(baseWorkspace, 'page_1'),
    } as never)
    const store = createWorkspaceStore(counted.repository)

    await store.getState().bootstrap()
    const duplicatedPage = await store.getState().duplicatePage('page_1')

    const duplicatedContainer = duplicatedPage?.blocks[0] as
      | {
          id: string
          type: string
          groupId?: string
          instanceId?: string
        }
      | undefined

    expect(duplicatedContainer).toMatchObject({
      type: 'synced_block',
      groupId: 'group_1',
    })
    expect(duplicatedContainer?.id).not.toBe('container_1')
    expect(duplicatedContainer?.instanceId).not.toBe('instance_1')
    expect(store.getState().pages.find((page) => page.id === 'page_1')?.blocks[0]).toMatchObject({
      id: 'container_1',
      type: 'synced_block',
      groupId: 'group_1',
      instanceId: 'instance_1',
    })
    expect(store.getState().syncedBlockGroups).toEqual([
      expect.objectContaining({
        id: 'group_1',
        primaryInstanceId: 'instance_1',
      }),
    ])
  })

  it('removes synced groups when deleting their last remaining page instance', async () => {
    const now = '2026-07-06T00:00:00.000Z'
    const baseWorkspace = createWorkspace()
    const counted = createCountingRepository({
      ...baseWorkspace,
      syncedBlockGroups: [
        {
          id: 'group_1',
          blocks: [{ id: 'group_block_1', type: 'paragraph', text: 'Shared text' }],
          primaryInstanceId: 'instance_1',
          createdAt: now,
          updatedAt: now,
        },
      ],
      pages: withInboxPages(baseWorkspace, [
        {
          ...baseWorkspace.pages[0],
          id: 'page_1',
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
      ]),
      settings: withInboxSettings(baseWorkspace, 'page_1'),
    } as never)
    const store = createWorkspaceStore(counted.repository)

    await store.getState().bootstrap()
    await store.getState().deletePage('page_1')

    expect(store.getState().syncedBlockGroups).toEqual([])
    expect(counted.getSnapshot()?.syncedBlockGroups).toEqual([])
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
