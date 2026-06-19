import { describe, expect, it } from 'vitest'
import type { WorkspaceSnapshot } from '../domain/types'
import type { WorkspaceRepository } from '../lib/workspaceRepository'
import { createMemoryRepository } from '../test/memoryRepository'
import { createWorkspaceStore } from './createWorkspaceStore'

describe('createWorkspaceStore', () => {
  it('seeds the workspace on first load', async () => {
    const repository = createMemoryRepository()
    const store = createWorkspaceStore(repository)

    await store.getState().bootstrap()

    expect(store.getState().boards).toEqual([])
    expect(store.getState().mindmaps).toEqual([])
    expect(store.getState().pages).toHaveLength(1)
    expect(store.getState().pages[0].title).toBe('快速开始')
    expect(store.getState().currentPageId).toBe(store.getState().pages[0].id)
    expect(store.getState().settings.lastOpenedPageId).toBe(store.getState().pages[0].id)
  })

  it('creates a child page and links it to the parent', async () => {
    const repository = createMemoryRepository()
    const store = createWorkspaceStore(repository)

    await store.getState().bootstrap()
    const parentId = store.getState().pages[0].id

    const childPage = await store.getState().createPage(parentId)

    expect(childPage.parentId).toBe(parentId)
    expect(childPage.title).toBe('未命名')
  })

  it('updates the current page and persists last opened page', async () => {
    const repository = createMemoryRepository()
    const store = createWorkspaceStore(repository)

    await store.getState().bootstrap()
    const createdPage = await store.getState().createPage()
    const firstPageId = store.getState().pages[0].id

    await store.getState().setCurrentPage(firstPageId)

    expect(store.getState().currentPageId).toBe(firstPageId)
    expect(store.getState().settings.lastOpenedPageId).toBe(firstPageId)

    const snapshot = await repository.load()
    expect(snapshot?.settings.lastOpenedPageId).toBe(firstPageId)
    expect(createdPage.id).not.toBe(firstPageId)
  })

  it('updates page display settings and persists them', async () => {
    const repository = createMemoryRepository()
    const store = createWorkspaceStore(repository)

    await store.getState().bootstrap()
    const pageId = store.getState().pages[0].id

    await store.getState().setPageFullWidth(pageId, true)
    await store.getState().setPageSmallText(pageId, true)
    await store.getState().setPageFontFamily(pageId, 'serif')
    await store.getState().setPageIcon(pageId, '📚')
    await store.getState().setPageCover(pageId, 'ocean')
    await store.getState().setPageOutlineVisible(pageId, false)

    expect(store.getState().pages[0]).toMatchObject({
      id: pageId,
      icon: '📚',
      cover: 'ocean',
      isFullWidth: true,
      isSmallText: true,
      fontFamily: 'serif',
      showOutline: false,
    })

    const snapshot = await repository.load()
    expect(snapshot?.pages[0]).toMatchObject({
      id: pageId,
      icon: '📚',
      cover: 'ocean',
      isFullWidth: true,
      isSmallText: true,
      fontFamily: 'serif',
      showOutline: false,
    })
  })

  it('renames and deletes a child page branch', async () => {
    const repository = createMemoryRepository()
    const store = createWorkspaceStore(repository)

    await store.getState().bootstrap()
    const rootId = store.getState().pages[0].id
    const childPage = await store.getState().createPage(rootId)

    await store.getState().renamePage(childPage.id, '需求池')
    expect(store.getState().pages.find((page) => page.id === childPage.id)?.title).toBe('需求池')

    await store.getState().deletePage(childPage.id)
    expect(store.getState().pages.find((page) => page.id === childPage.id)).toBeUndefined()
  })

  it('updates a paragraph block and persists the change', async () => {
    const repository = createMemoryRepository()
    const store = createWorkspaceStore(repository)

    await store.getState().bootstrap()
    const page = store.getState().pages[0]
    const paragraphBlock = page.blocks.find((block) => block.type === 'paragraph')

    if (!paragraphBlock || paragraphBlock.type !== 'paragraph') {
      throw new Error('Expected seed paragraph block')
    }

    await store
      .getState()
      .updateBlock(page.id, paragraphBlock.id, { ...paragraphBlock, text: '更新后的正文' })

    const nextPage = store.getState().pages.find((item) => item.id === page.id)
    const nextParagraph = nextPage?.blocks.find((block) => block.id === paragraphBlock.id)

    expect(nextParagraph).toMatchObject({
      id: paragraphBlock.id,
      type: 'paragraph',
      text: '更新后的正文',
    })

    const snapshot = await repository.load()
    const persistedPage = snapshot?.pages.find((item) => item.id === page.id)
    const persistedParagraph = persistedPage?.blocks.find((block) => block.id === paragraphBlock.id)

    expect(persistedParagraph).toMatchObject({
      id: paragraphBlock.id,
      type: 'paragraph',
      text: '更新后的正文',
    })
  })

  it('inserts todo and child-page blocks', async () => {
    const repository = createMemoryRepository()
    const store = createWorkspaceStore(repository)

    await store.getState().bootstrap()
    const parentPage = store.getState().pages[0]

    await store.getState().insertBlock(parentPage.id, 'todo')
    await store.getState().insertBlock(parentPage.id, 'child_page')

    const nextParentPage = store.getState().pages.find((page) => page.id === parentPage.id)
    const todoBlocks = nextParentPage?.blocks.filter((block) => block.type === 'todo') ?? []
    const insertedTodoBlock = todoBlocks.find(
      (block) => block.type === 'todo' && block.text === '' && block.checked === false,
    )
    const childPageBlock = nextParentPage?.blocks.find((block) => block.type === 'child_page')
    const childPage =
      childPageBlock?.type === 'child_page'
        ? store.getState().pages.find((page) => page.id === childPageBlock.pageId)
        : undefined

    expect(insertedTodoBlock).toMatchObject({
      type: 'todo',
      text: '',
      checked: false,
    })
    expect(childPageBlock?.type).toBe('child_page')
    expect(childPage?.parentId).toBe(parentPage.id)
    expect(childPage?.title).toBe('未命名')
  })

  it('inserts a paragraph block with initial text', async () => {
    const repository = createMemoryRepository()
    const store = createWorkspaceStore(repository)

    await store.getState().bootstrap()
    const pageId = store.getState().pages[0].id

    await store.getState().insertParagraphBlock(pageId, 'First line')

    const insertedBlock = store.getState().pages[0].blocks.at(-1)
    expect(insertedBlock).toMatchObject({
      type: 'paragraph',
      text: 'First line',
    })

    const snapshot = await repository.load()
    expect(snapshot?.pages[0].blocks.at(-1)).toMatchObject({
      type: 'paragraph',
      text: 'First line',
    })
  })

  it('inserts a block after an existing block', async () => {
    const repository = createMemoryRepository()
    const store = createWorkspaceStore(repository)

    await store.getState().bootstrap()
    const pageId = store.getState().pages[0].id
    const firstBlockId = store.getState().pages[0].blocks[0].id

    const insertedBlock = await store.getState().insertBlockAfter(pageId, firstBlockId, 'paragraph')

    expect(insertedBlock).toMatchObject({
      type: 'paragraph',
      text: '',
    })
    expect(store.getState().pages[0].blocks[1].id).toBe(insertedBlock?.id)

    const snapshot = await repository.load()
    expect(snapshot?.pages[0].blocks[1].id).toBe(insertedBlock?.id)
  })

  it('merges a text block into the previous text block', async () => {
    const repository = createMemoryRepository()
    const store = createWorkspaceStore(repository)

    await store.getState().bootstrap()
    const pageId = store.getState().pages[0].id

    await store.getState().insertParagraphBlock(pageId, 'Second line')

    const blocks = store.getState().pages[0].blocks
    const previousBlock = blocks[blocks.length - 2]
    const currentBlock = blocks[blocks.length - 1]
    const previousText = 'text' in previousBlock ? previousBlock.text : ''

    const targetBlockId = await store.getState().mergeBlockWithPrevious(pageId, currentBlock.id)

    expect(targetBlockId).toBe(previousBlock.id)
    expect(store.getState().pages[0].blocks).toHaveLength(blocks.length - 1)
    expect(store.getState().pages[0].blocks.at(-1)).toMatchObject({
      id: previousBlock.id,
      text: `${previousText}Second line`,
    })
  })

  it('reorders blocks inside a page', async () => {
    const repository = createMemoryRepository()
    const store = createWorkspaceStore(repository)

    await store.getState().bootstrap()
    const pageId = store.getState().pages[0].id

    await store.getState().insertBlock(pageId, 'paragraph')
    await store.getState().insertBlock(pageId, 'todo')

    const [first, second] = store.getState().pages[0].blocks.slice(-2)
    await store.getState().reorderBlocks(pageId, second.id, first.id)

    const reordered = store.getState().pages[0].blocks.slice(-2)
    expect(reordered[0].id).toBe(second.id)
    expect(reordered[1].id).toBe(first.id)
  })

  it('reorders blocks before a lower target when requested', async () => {
    const repository = createMemoryRepository()
    const store = createWorkspaceStore(repository)

    await store.getState().bootstrap()
    const pageId = store.getState().pages[0].id

    await store.getState().insertBlock(pageId, 'paragraph')
    await store.getState().insertBlock(pageId, 'todo')
    await store.getState().insertBlock(pageId, 'code')

    const [first, second, third] = store.getState().pages[0].blocks.slice(-3)
    await store.getState().reorderBlocks(pageId, first.id, third.id, 'before')

    const reordered = store.getState().pages[0].blocks.slice(-3)
    expect(reordered.map((block) => block.id)).toEqual([second.id, first.id, third.id])
  })

  it('turns a paragraph block into a todo block', async () => {
    const repository = createMemoryRepository()
    const store = createWorkspaceStore(repository)

    await store.getState().bootstrap()
    const pageId = store.getState().pages[0].id
    const blockId = store.getState().pages[0].blocks[0].id

    await store.getState().turnBlockInto(pageId, blockId, 'todo')

    const changed = store.getState().pages[0].blocks[0]
    expect(changed.type).toBe('todo')
  })

  it('expands legacy multi-item list blocks into separate list blocks on bootstrap', async () => {
    const repository = createMemoryRepository({
      boards: [],
      mindmaps: [],
      pages: [
        {
          id: 'page-legacy',
          parentId: null,
          title: 'Legacy',
          icon: null,
          cover: null,
          blocks: [
            {
              id: 'block-list',
              type: 'bulleted_list',
              items: ['第一项', '第二项', '第三项'],
            },
          ],
          createdAt: '2026-06-17T00:00:00.000Z',
          updatedAt: '2026-06-17T00:00:00.000Z',
        },
      ],
      settings: {
        lastOpenedPageId: 'page-legacy',
      },
    })
    const store = createWorkspaceStore(repository)

    await store.getState().bootstrap()

    expect(store.getState().pages[0].blocks).toMatchObject([
      { id: 'block-list', type: 'bulleted_list', items: ['第一项'] },
      { type: 'bulleted_list', items: ['第二项'] },
      { type: 'bulleted_list', items: ['第三项'] },
    ])
  })

  it('preserves text style when turning a text block into another text block', async () => {
    const repository = createMemoryRepository()
    const store = createWorkspaceStore(repository)

    await store.getState().bootstrap()
    const pageId = store.getState().pages[0].id
    const block = store.getState().pages[0].blocks[0]

    if (block.type !== 'paragraph') {
      throw new Error('Expected seed paragraph block')
    }

    await store.getState().updateBlock(pageId, block.id, {
      ...block,
      textColor: 'blue',
      backgroundColor: 'yellow',
      textAlign: 'center',
    })

    await store.getState().turnBlockInto(pageId, block.id, 'heading_2')

    expect(store.getState().pages[0].blocks[0]).toMatchObject({
      id: block.id,
      type: 'heading_2',
      textColor: 'blue',
      backgroundColor: 'yellow',
      textAlign: 'center',
    })
  })

  it('preserves rich text when turning a text block into another text block', async () => {
    const repository = createMemoryRepository()
    const store = createWorkspaceStore(repository)

    await store.getState().bootstrap()
    const pageId = store.getState().pages[0].id
    const block = store.getState().pages[0].blocks[0]

    if (block.type !== 'paragraph') {
      throw new Error('Expected seed paragraph block')
    }

    await store.getState().updateBlock(pageId, block.id, {
      ...block,
      text: '重点内容',
      richText: [
        { text: '重点', bold: true },
        { text: '内容' },
      ],
    })

    await store.getState().turnBlockInto(pageId, block.id, 'heading_2')

    expect(store.getState().pages[0].blocks[0]).toMatchObject({
      id: block.id,
      type: 'heading_2',
      text: '重点内容',
      richText: [
        { text: '重点', bold: true },
        { text: '内容' },
      ],
    })
  })

  it('keeps rich text when merging text blocks', async () => {
    const repository = createMemoryRepository()
    const store = createWorkspaceStore(repository)

    await store.getState().bootstrap()
    const pageId = store.getState().pages[0].id
    const firstBlock = store.getState().pages[0].blocks[0]
    const secondBlock = await store.getState().insertBlockAfter(pageId, firstBlock.id, 'paragraph')

    if (!secondBlock || firstBlock.type !== 'paragraph' || secondBlock.type !== 'paragraph') {
      throw new Error('Expected paragraph blocks')
    }

    await store.getState().updateBlock(pageId, firstBlock.id, {
      ...firstBlock,
      text: '第一段',
      richText: [{ text: '第一段', bold: true }],
    })
    await store.getState().updateBlock(pageId, secondBlock.id, {
      ...secondBlock,
      text: '第二段',
      richText: [{ text: '第二段', italic: true }],
    })

    await store.getState().mergeBlockWithPrevious(pageId, secondBlock.id)

    expect(store.getState().pages[0].blocks[0]).toMatchObject({
      id: firstBlock.id,
      type: 'paragraph',
      text: '第一段第二段',
      richText: [
        { text: '第一段', bold: true },
        { text: '第二段', italic: true },
      ],
    })
  })

  it('exports a JSON backup with workspace data', async () => {
    const repository = createMemoryRepository()
    const store = createWorkspaceStore(repository)

    await store.getState().bootstrap()
    await store.getState().insertBlock(store.getState().pages[0].id, 'whiteboard')
    await store.getState().insertBlock(store.getState().pages[0].id, 'mindmap')
    const payload = JSON.parse(await store.getState().exportJson())

    expect(payload).toMatchObject({
      version: 1,
      boards: store.getState().boards,
      mindmaps: store.getState().mindmaps,
      settings: {
        lastOpenedPageId: store.getState().currentPageId,
      },
    })
    expect(payload.pages).toHaveLength(store.getState().pages.length)
    expect(payload.mindmaps[0].layoutMode).toBe('balanced')
    expect(typeof payload.exportedAt).toBe('string')
  })

  it('exports the latest mindmap layout mode after layout changes', async () => {
    const repository = createMemoryRepository()
    const store = createWorkspaceStore(repository)

    await store.getState().bootstrap()
    await store.getState().insertBlock(store.getState().pages[0].id, 'mindmap')

    const mindmapId = store.getState().mindmaps[0].id
    await store.getState().setMindmapLayoutMode(mindmapId, 'outline')

    const payload = JSON.parse(await store.getState().exportJson())
    expect(payload.mindmaps[0].layoutMode).toBe('outline')
  })

  it('creates a board record when inserting a whiteboard block', async () => {
    const repository = createMemoryRepository()
    const store = createWorkspaceStore(repository)

    await store.getState().bootstrap()
    const pageId = store.getState().pages[0].id

    await store.getState().insertBlock(pageId, 'whiteboard')

    const whiteboardBlock = store.getState().pages[0].blocks.at(-1)

    expect(whiteboardBlock).toMatchObject({
      type: 'whiteboard',
      boardId: store.getState().boards[0].id,
    })
    expect(store.getState().boards).toHaveLength(1)

    const snapshot = await repository.load()
    expect(snapshot?.boards).toHaveLength(1)
    expect(snapshot?.pages[0].blocks.at(-1)).toMatchObject({
      type: 'whiteboard',
      boardId: snapshot?.boards[0].id,
    })
  })

  it('creates a mindmap record when inserting a mindmap block', async () => {
    const repository = createMemoryRepository()
    const store = createWorkspaceStore(repository)

    await store.getState().bootstrap()
    const pageId = store.getState().pages[0].id

    await store.getState().insertBlock(pageId, 'mindmap')

    const mindmapBlock = store.getState().pages[0].blocks.at(-1)

    expect(mindmapBlock).toMatchObject({
      type: 'mindmap',
      mindmapId: store.getState().mindmaps[0].id,
    })
    expect(store.getState().mindmaps).toHaveLength(1)
    expect(store.getState().mindmaps[0].rootNodeId).toBeTruthy()

    const snapshot = await repository.load()
    expect(snapshot?.mindmaps).toHaveLength(1)
    expect(snapshot?.pages[0].blocks.at(-1)).toMatchObject({
      type: 'mindmap',
      mindmapId: snapshot?.mindmaps[0].id,
    })
  })

  it('normalizes legacy mindmaps without a layout mode when bootstrapping', async () => {
    const repository = createMemoryRepository({
      boards: [],
      mindmaps: [
        {
          id: 'mindmap-legacy',
          title: 'Legacy Mindmap',
          rootNodeId: 'node-root',
          nodes: {
            'node-root': {
              id: 'node-root',
              parentId: null,
              text: 'Root',
              order: 0,
            },
          },
          viewport: {
            x: 0,
            y: 0,
            zoom: 1,
          },
          createdAt: '2026-06-18T00:00:00.000Z',
          updatedAt: '2026-06-18T00:00:00.000Z',
        },
      ] as unknown as WorkspaceSnapshot['mindmaps'],
      pages: [
        {
          id: 'page-home',
          parentId: null,
          title: 'Home',
          icon: null,
          cover: null,
          blocks: [
            {
              id: 'block-mindmap',
              type: 'mindmap',
              mindmapId: 'mindmap-legacy',
            },
          ],
          createdAt: '2026-06-18T00:00:00.000Z',
          updatedAt: '2026-06-18T00:00:00.000Z',
        },
      ],
      settings: {
        lastOpenedPageId: 'page-home',
      },
    })
    const store = createWorkspaceStore(repository)

    await store.getState().bootstrap()

    expect(store.getState().mindmaps[0].layoutMode).toBe('balanced')

    const snapshot = await repository.load()
    expect(snapshot?.mindmaps[0].layoutMode).toBe('balanced')
  })

  it('normalizes imported legacy mindmaps without a layout mode and persists the normalized snapshot', async () => {
    const repository = createMemoryRepository()
    const store = createWorkspaceStore(repository)
    const now = '2026-06-20T00:00:00.000Z'

    await store.getState().bootstrap()

    await store.getState().importJson({
      version: 1,
      exportedAt: now,
      boards: [],
      mindmaps: [
        {
          id: 'mindmap-imported-legacy',
          title: 'Imported Legacy Mindmap',
          rootNodeId: 'node-root',
          nodes: {
            'node-root': {
              id: 'node-root',
              parentId: null,
              text: 'Root',
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
          id: 'page-imported-mindmap',
          parentId: null,
          title: 'Imported Mindmap',
          icon: null,
          cover: null,
          blocks: [
            {
              id: 'block-imported-mindmap',
              type: 'mindmap',
              mindmapId: 'mindmap-imported-legacy',
            },
          ],
          createdAt: now,
          updatedAt: now,
        },
      ],
      settings: {
        lastOpenedPageId: 'page-imported-mindmap',
      },
    })

    expect(store.getState().mindmaps[0].layoutMode).toBe('balanced')

    const snapshot = await repository.load()
    expect(snapshot?.mindmaps[0].layoutMode).toBe('balanced')
  })

  it('adds a child node to a mindmap', async () => {
    const repository = createMemoryRepository()
    const store = createWorkspaceStore(repository)

    await store.getState().bootstrap()
    const pageId = store.getState().pages[0].id
    await store.getState().insertBlock(pageId, 'mindmap')

    const mindmap = store.getState().mindmaps[0]
    await store.getState().addMindmapChildNode(mindmap.id, mindmap.rootNodeId)

    const nextMindmap = store.getState().mindmaps[0]
    expect(Object.keys(nextMindmap.nodes)).toHaveLength(2)
    expect(
      Object.values(nextMindmap.nodes).find((node) => node.parentId === mindmap.rootNodeId),
    ).toMatchObject({
      text: '新节点',
    })
  })

  it('renames a mindmap and persists the new title', async () => {
    const repository = createMemoryRepository()
    const store = createWorkspaceStore(repository)

    await store.getState().bootstrap()
    const pageId = store.getState().pages[0].id
    await store.getState().insertBlock(pageId, 'mindmap')

    const mindmapId = store.getState().mindmaps[0].id
    await store.getState().renameMindmap(mindmapId, '产品调研导图')

    expect(store.getState().mindmaps[0]).toMatchObject({
      id: mindmapId,
      title: '产品调研导图',
    })

    const snapshot = await repository.load()
    expect(snapshot?.mindmaps[0]).toMatchObject({
      id: mindmapId,
      title: '产品调研导图',
    })
  })

  it('renames a mindmap node and persists the new text', async () => {
    const repository = createMemoryRepository()
    const store = createWorkspaceStore(repository)

    await store.getState().bootstrap()
    const pageId = store.getState().pages[0].id
    await store.getState().insertBlock(pageId, 'mindmap')

    const mindmap = store.getState().mindmaps[0]
    await store.getState().renameMindmapNode(mindmap.id, mindmap.rootNodeId, '用户洞察')

    expect(store.getState().mindmaps[0].nodes[mindmap.rootNodeId]).toMatchObject({
      id: mindmap.rootNodeId,
      text: '用户洞察',
    })

    const snapshot = await repository.load()
    expect(snapshot?.mindmaps[0].nodes[mindmap.rootNodeId]).toMatchObject({
      id: mindmap.rootNodeId,
      text: '用户洞察',
    })
  })

  it('does not persist no-op mindmap layout changes', async () => {
    const initialSnapshot: WorkspaceSnapshot = {
      boards: [],
      mindmaps: [
        {
          id: 'mindmap-existing',
          title: 'Existing Mindmap',
          rootNodeId: 'node-root',
          layoutMode: 'balanced',
          nodes: {
            'node-root': {
              id: 'node-root',
              parentId: null,
              text: 'Root',
              order: 0,
            },
          },
          viewport: {
            x: 0,
            y: 0,
            zoom: 1,
          },
          createdAt: '2026-06-18T00:00:00.000Z',
          updatedAt: '2026-06-18T00:00:00.000Z',
        },
      ],
      pages: [
        {
          id: 'page-home',
          parentId: null,
          title: 'Home',
          icon: null,
          cover: null,
          blocks: [
            {
              id: 'block-mindmap',
              type: 'mindmap',
              mindmapId: 'mindmap-existing',
            },
          ],
          createdAt: '2026-06-18T00:00:00.000Z',
          updatedAt: '2026-06-18T00:00:00.000Z',
        },
      ],
      settings: {
        lastOpenedPageId: 'page-home',
      },
    }
    let snapshot = structuredClone(initialSnapshot)
    let persistCount = 0
    const repository: WorkspaceRepository = {
      async load() {
        return structuredClone(snapshot)
      },
      async save(nextSnapshot) {
        persistCount += 1
        snapshot = structuredClone(nextSnapshot)
      },
      async replace(nextSnapshot) {
        persistCount += 1
        snapshot = structuredClone(nextSnapshot)
      },
    }
    const store = createWorkspaceStore(repository)

    await store.getState().bootstrap()
    await store.getState().setMindmapLayoutMode('missing-mindmap', 'right')
    await store.getState().setMindmapLayoutMode('mindmap-existing', 'balanced')

    expect(persistCount).toBe(0)
    expect(store.getState().mindmaps[0]).toEqual(initialSnapshot.mindmaps[0])
  })

  it('does not persist no-op mindmap collapsed toggles', async () => {
    const initialSnapshot: WorkspaceSnapshot = {
      boards: [],
      mindmaps: [
        {
          id: 'mindmap-existing',
          title: 'Existing Mindmap',
          rootNodeId: 'node-root',
          layoutMode: 'balanced',
          nodes: {
            'node-root': {
              id: 'node-root',
              parentId: null,
              text: 'Root',
              order: 0,
            },
            'node-child': {
              id: 'node-child',
              parentId: 'node-root',
              text: 'Child',
              order: 0,
            },
          },
          viewport: {
            x: 0,
            y: 0,
            zoom: 1,
          },
          createdAt: '2026-06-18T00:00:00.000Z',
          updatedAt: '2026-06-18T00:00:00.000Z',
        },
      ],
      pages: [
        {
          id: 'page-home',
          parentId: null,
          title: 'Home',
          icon: null,
          cover: null,
          blocks: [
            {
              id: 'block-mindmap',
              type: 'mindmap',
              mindmapId: 'mindmap-existing',
            },
          ],
          createdAt: '2026-06-18T00:00:00.000Z',
          updatedAt: '2026-06-18T00:00:00.000Z',
        },
      ],
      settings: {
        lastOpenedPageId: 'page-home',
      },
    }
    let snapshot = structuredClone(initialSnapshot)
    let persistCount = 0
    const repository: WorkspaceRepository = {
      async load() {
        return structuredClone(snapshot)
      },
      async save(nextSnapshot) {
        persistCount += 1
        snapshot = structuredClone(nextSnapshot)
      },
      async replace(nextSnapshot) {
        persistCount += 1
        snapshot = structuredClone(nextSnapshot)
      },
    }
    const store = createWorkspaceStore(repository)

    await store.getState().bootstrap()
    await store.getState().toggleMindmapNodeCollapsed('missing-mindmap', 'node-child')
    await store.getState().toggleMindmapNodeCollapsed('mindmap-existing', 'node-root')
    await store.getState().toggleMindmapNodeCollapsed('mindmap-existing', 'missing-node')

    expect(persistCount).toBe(0)
    expect(store.getState().mindmaps[0]).toEqual(initialSnapshot.mindmaps[0])
  })

  it('adds a sibling node to a non-root node and persists it', async () => {
    const repository = createMemoryRepository()
    const store = createWorkspaceStore(repository)

    await store.getState().bootstrap()
    const pageId = store.getState().pages[0].id
    await store.getState().insertBlock(pageId, 'mindmap')

    const initialMindmap = store.getState().mindmaps[0]
    await store.getState().addMindmapChildNode(initialMindmap.id, initialMindmap.rootNodeId)

    const childNode = Object.values(store.getState().mindmaps[0].nodes).find(
      (node) => node.parentId === initialMindmap.rootNodeId,
    )

    if (!childNode) {
      throw new Error('Expected child node')
    }

    await store.getState().addMindmapSiblingNode(initialMindmap.id, childNode.id)

    const siblingNodes = Object.values(store.getState().mindmaps[0].nodes)
      .filter((node) => node.parentId === initialMindmap.rootNodeId)
      .sort((left, right) => left.order - right.order)

    expect(siblingNodes).toHaveLength(2)
    expect(siblingNodes[1]).toMatchObject({
      text: '新节点',
      order: 1,
    })

    const snapshot = await repository.load()
    expect(
      Object.values(snapshot?.mindmaps[0].nodes ?? {}).filter(
        (node) => node.parentId === initialMindmap.rootNodeId,
      ),
    ).toHaveLength(2)
  })

  it('deletes a non-root node from a mindmap and persists the result', async () => {
    const repository = createMemoryRepository()
    const store = createWorkspaceStore(repository)

    await store.getState().bootstrap()
    const pageId = store.getState().pages[0].id
    await store.getState().insertBlock(pageId, 'mindmap')

    const initialMindmap = store.getState().mindmaps[0]
    await store.getState().addMindmapChildNode(initialMindmap.id, initialMindmap.rootNodeId)
    const childNode = Object.values(store.getState().mindmaps[0].nodes).find(
      (node) => node.parentId === initialMindmap.rootNodeId,
    )

    if (!childNode) {
      throw new Error('Expected child node')
    }

    await store.getState().deleteMindmapNode(initialMindmap.id, childNode.id)

    expect(Object.keys(store.getState().mindmaps[0].nodes)).toEqual([initialMindmap.rootNodeId])

    const snapshot = await repository.load()
    expect(Object.keys(snapshot?.mindmaps[0].nodes ?? {})).toEqual([initialMindmap.rootNodeId])
  })

  it('preserves earlier mindmap edits when multiple mindmap updates run back to back', async () => {
    const repository = createMemoryRepository()
    const store = createWorkspaceStore(repository)

    await store.getState().bootstrap()
    const pageId = store.getState().pages[0].id
    await store.getState().insertBlock(pageId, 'mindmap')

    const mindmap = store.getState().mindmaps[0]
    const renameTitlePromise = store.getState().renameMindmap(mindmap.id, '竞品拆解导图')
    const renameNodePromise = store.getState().renameMindmapNode(
      mindmap.id,
      mindmap.rootNodeId,
      '研究主题',
    )

    await Promise.all([renameTitlePromise, renameNodePromise])

    expect(store.getState().mindmaps[0]).toMatchObject({
      id: mindmap.id,
      title: '竞品拆解导图',
    })
    expect(store.getState().mindmaps[0].nodes[mindmap.rootNodeId]).toMatchObject({
      text: '研究主题',
    })

    const snapshot = await repository.load()
    expect(snapshot?.mindmaps[0]).toMatchObject({
      id: mindmap.id,
      title: '竞品拆解导图',
    })
    expect(snapshot?.mindmaps[0].nodes[mindmap.rootNodeId]).toMatchObject({
      text: '研究主题',
    })
  })

  it('renames a board and persists the new title', async () => {
    const repository = createMemoryRepository()
    const store = createWorkspaceStore(repository)

    await store.getState().bootstrap()
    const pageId = store.getState().pages[0].id
    await store.getState().insertBlock(pageId, 'whiteboard')

    const boardId = store.getState().boards[0].id
    await store.getState().renameBoard(boardId, '流程图')

    expect(store.getState().boards[0]).toMatchObject({
      id: boardId,
      title: '流程图',
    })

    const snapshot = await repository.load()
    expect(snapshot?.boards[0]).toMatchObject({
      id: boardId,
      title: '流程图',
    })
  })

  it('preserves earlier board edits when multiple board updates run back to back', async () => {
    const repository = createMemoryRepository()
    const store = createWorkspaceStore(repository)

    await store.getState().bootstrap()
    const pageId = store.getState().pages[0].id
    await store.getState().insertBlock(pageId, 'whiteboard')

    const board = store.getState().boards[0]
    const renameBoardPromise = store.getState().renameBoard(board.id, '流程草图')
    const updateSnapshotPromise = store.getState().updateBoardSnapshot(board.id, {
      version: 1,
      elements: [
        {
          id: 'element-1',
          type: 'rect',
          x: 96,
          y: 96,
          width: 220,
          height: 132,
          rotation: 0,
          strokeColor: 'default',
          fillColor: 'default',
        },
      ],
      viewport: { x: 0, y: 0, zoom: 1 },
    })

    await Promise.all([renameBoardPromise, updateSnapshotPromise])

    expect(store.getState().boards[0]).toMatchObject({
      id: board.id,
      title: '流程草图',
      snapshot: {
        version: 1,
        elements: [
          {
            id: 'element-1',
            type: 'rect',
          },
        ],
      },
    })

    const snapshot = await repository.load()
    expect(snapshot?.boards[0]).toMatchObject({
      id: board.id,
      title: '流程草图',
      snapshot: {
        version: 1,
        elements: [
          {
            id: 'element-1',
            type: 'rect',
          },
        ],
      },
    })
  })

  it('imports a JSON backup and updates the current page', async () => {
    const repository = createMemoryRepository()
    const store = createWorkspaceStore(repository)
    const now = '2026-06-15T00:00:00.000Z'

    await store.getState().bootstrap()

    await store.getState().importJson({
      version: 1,
      exportedAt: now,
      boards: [],
      mindmaps: [],
      pages: [
        {
          id: 'page-imported',
          parentId: null,
          title: '导入后的页面',
          icon: '📥',
          cover: null,
          blocks: [
            {
              id: 'block-imported',
              type: 'paragraph',
              text: '这是导入内容。',
            },
          ],
          createdAt: now,
          updatedAt: now,
        },
      ],
      settings: {
        lastOpenedPageId: 'page-imported',
      },
    })

    expect(store.getState().pages).toHaveLength(1)
    expect(store.getState().pages[0].title).toBe('导入后的页面')
    expect(store.getState().currentPageId).toBe('page-imported')
    expect(store.getState().saveStatus).toBe('saved')

    const snapshot = await repository.load()
    expect(snapshot).toMatchObject({
      settings: {
        lastOpenedPageId: 'page-imported',
      },
    })
  })

  it('undoes the last workspace mutation', async () => {
    const repository = createMemoryRepository()
    const store = createWorkspaceStore(repository)

    await store.getState().bootstrap()
    const pageId = store.getState().pages[0].id
    const initialBlockCount = store.getState().pages[0].blocks.length

    await store.getState().insertBlock(pageId, 'todo')
    expect(store.getState().pages[0].blocks).toHaveLength(initialBlockCount + 1)

    await store.getState().undo()

    expect(store.getState().pages[0].blocks).toHaveLength(initialBlockCount)

    const snapshot = await repository.load()
    expect(snapshot?.pages[0].blocks).toHaveLength(initialBlockCount)
  })
})
