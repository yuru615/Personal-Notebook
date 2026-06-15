import { createStore } from 'zustand/vanilla'
import { createId } from '../utils/id'
import { createSeedWorkspace } from '../domain/seed'
import type { PageId, PageRecord, SaveStatus, WorkspaceSettings } from '../domain/types'
import { ensureSnapshot, type WorkspaceRepository } from '../lib/workspaceRepository'

export interface WorkspaceState {
  pages: PageRecord[]
  settings: WorkspaceSettings
  currentPageId: PageId | null
  saveStatus: SaveStatus
  bootstrap: () => Promise<void>
  createPage: (parentId?: PageId) => Promise<PageRecord>
  setCurrentPage: (pageId: PageId) => Promise<void>
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
  }))
}
