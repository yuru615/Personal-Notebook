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
})
