import { describe, expect, it } from 'vitest'
import { createMemoryRepository } from '../test/memoryRepository'
import { createWorkspaceStore } from './createWorkspaceStore'

describe('createWorkspaceStore', () => {
  it('seeds the workspace on first load', async () => {
    const repository = createMemoryRepository()
    const store = createWorkspaceStore(repository)

    await store.getState().bootstrap()

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
})
