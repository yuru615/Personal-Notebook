import { createStore } from 'zustand/vanilla'
import { createId } from '../utils/id'
import { createSeedWorkspace } from '../domain/seed'
import type { BlockRecord, PageId, PageRecord, SaveStatus, WorkspaceSettings } from '../domain/types'
import { ensureSnapshot, type WorkspaceRepository } from '../lib/workspaceRepository'
import { deletePageBranch } from '../utils/pageTree'

export interface WorkspaceState {
  pages: PageRecord[]
  settings: WorkspaceSettings
  currentPageId: PageId | null
  saveStatus: SaveStatus
  bootstrap: () => Promise<void>
  createPage: (parentId?: PageId) => Promise<PageRecord>
  setCurrentPage: (pageId: PageId) => Promise<void>
  renamePage: (pageId: PageId, title: string) => Promise<void>
  deletePage: (pageId: PageId) => Promise<void>
  updateBlock: (pageId: PageId, blockId: string, nextBlock: BlockRecord) => Promise<void>
}

function createEmptyState(): WorkspaceState {
  return {
    pages: [],
    settings: {
      lastOpenedPageId: null,
    },
    currentPageId: null,
    saveStatus: 'idle',
    bootstrap: async () => undefined,
    createPage: async () => {
      throw new Error('not implemented')
    },
    setCurrentPage: async () => {
      throw new Error('not implemented')
    },
    renamePage: async () => {
      throw new Error('not implemented')
    },
    deletePage: async () => {
      throw new Error('not implemented')
    },
    updateBlock: async () => {
      throw new Error('not implemented')
    },
  }
}

function createPageRecord(parentId?: PageId): PageRecord {
  const now = new Date().toISOString()

  return {
    id: createId('page'),
    parentId: parentId ?? null,
    title: '未命名',
    icon: null,
    cover: null,
    blocks: [],
    createdAt: now,
    updatedAt: now,
  }
}

export function createWorkspaceStore(repository: WorkspaceRepository) {
  return createStore<WorkspaceState>()((set, get) => ({
    ...createEmptyState(),

    bootstrap: async () => {
      const snapshot = await ensureSnapshot(repository, createSeedWorkspace())
      const currentPageId = snapshot.settings.lastOpenedPageId ?? snapshot.pages[0]?.id ?? null

      set({
        pages: snapshot.pages,
        settings: snapshot.settings,
        currentPageId,
        saveStatus: 'saved',
      })
    },

    createPage: async (parentId?: PageId) => {
      const page = createPageRecord(parentId)
      const state = get()
      const nextSettings: WorkspaceSettings = {
        lastOpenedPageId: page.id,
      }
      const nextSnapshot = {
        pages: [...state.pages, page],
        settings: nextSettings,
      }

      set({ saveStatus: 'saving' })

      try {
        await repository.save(nextSnapshot)
        set({
          pages: nextSnapshot.pages,
          settings: nextSettings,
          currentPageId: page.id,
          saveStatus: 'saved',
        })
      } catch {
        set({ saveStatus: 'error' })
        throw new Error('Failed to create page')
      }

      return page
    },

    setCurrentPage: async (pageId: PageId) => {
      const state = get()
      const pageExists = state.pages.some((page) => page.id === pageId)

      if (!pageExists) {
        throw new Error('Page not found')
      }

      if (state.currentPageId === pageId && state.settings.lastOpenedPageId === pageId) {
        return
      }

      const nextSettings: WorkspaceSettings = {
        lastOpenedPageId: pageId,
      }
      const nextSnapshot = {
        pages: state.pages,
        settings: nextSettings,
      }

      set({ saveStatus: 'saving' })

      try {
        await repository.save(nextSnapshot)
        set({
          currentPageId: pageId,
          settings: nextSettings,
          saveStatus: 'saved',
        })
      } catch {
        set({ saveStatus: 'error' })
        throw new Error('Failed to switch page')
      }
    },

    renamePage: async (pageId: PageId, title: string) => {
      const state = get()
      const nextTitle = title.trim() || '未命名'
      const nextPages = state.pages.map((page) =>
        page.id === pageId
          ? {
              ...page,
              title: nextTitle,
              updatedAt: new Date().toISOString(),
            }
          : page,
      )
      const nextSnapshot = {
        pages: nextPages,
        settings: state.settings,
      }

      set({ saveStatus: 'saving' })

      try {
        await repository.save(nextSnapshot)
        set({
          pages: nextPages,
          saveStatus: 'saved',
        })
      } catch {
        set({ saveStatus: 'error' })
        throw new Error('Failed to rename page')
      }
    },

    deletePage: async (pageId: PageId) => {
      const state = get()
      const nextPages = deletePageBranch(state.pages, pageId)
      const currentPageDeleted =
        state.currentPageId !== null && !nextPages.some((page) => page.id === state.currentPageId)
      const nextCurrentPageId = currentPageDeleted
        ? (nextPages[0]?.id ?? null)
        : state.currentPageId
      const nextSettings: WorkspaceSettings = {
        lastOpenedPageId: nextCurrentPageId,
      }
      const nextSnapshot = {
        pages: nextPages,
        settings: nextSettings,
      }

      set({ saveStatus: 'saving' })

      try {
        await repository.save(nextSnapshot)
        set({
          pages: nextPages,
          currentPageId: nextCurrentPageId,
          settings: nextSettings,
          saveStatus: 'saved',
        })
      } catch {
        set({ saveStatus: 'error' })
        throw new Error('Failed to delete page')
      }
    },

    updateBlock: async (pageId: PageId, blockId: string, nextBlock: BlockRecord) => {
      const state = get()
      const nextPages = state.pages.map((page) =>
        page.id === pageId
          ? {
              ...page,
              updatedAt: new Date().toISOString(),
              blocks: page.blocks.map((block) => (block.id === blockId ? nextBlock : block)),
            }
          : page,
      )
      const nextSnapshot = {
        pages: nextPages,
        settings: state.settings,
      }

      set({ saveStatus: 'saving' })

      try {
        await repository.save(nextSnapshot)
        set({
          pages: nextPages,
          saveStatus: 'saved',
        })
      } catch {
        set({ saveStatus: 'error' })
        throw new Error('Failed to update block')
      }
    },
  }))
}
