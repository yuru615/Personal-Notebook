import { createStore } from 'zustand/vanilla'
import { createId } from '../utils/id'
import { createSeedWorkspace } from '../domain/seed'
import type {
  BlockRecord,
  BlockType,
  PageId,
  PageRecord,
  SaveStatus,
  WorkspaceBackup,
  WorkspaceSnapshot,
  WorkspaceSettings,
} from '../domain/types'
import { ensureSnapshot, type WorkspaceRepository } from '../lib/workspaceRepository'
import { deletePageBranch } from '../utils/pageTree'
import { createBlock } from '../utils/blockFactory'
import { reorderItems } from '../utils/reorder'

const UNTITLED_PAGE_TITLE = '未命名'
const BACKUP_VERSION = 1

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
  insertBlock: (pageId: PageId, type: BlockType) => Promise<void>
  reorderPages: (activePageId: PageId, overPageId: PageId) => Promise<void>
  reorderBlocks: (pageId: PageId, activeBlockId: string, overBlockId: string) => Promise<void>
  deleteBlock: (pageId: PageId, blockId: string) => Promise<void>
  duplicateBlock: (pageId: PageId, blockId: string) => Promise<void>
  turnBlockInto: (pageId: PageId, blockId: string, type: BlockType) => Promise<void>
  exportJson: () => Promise<string>
  importJson: (payload: unknown) => Promise<void>
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
    insertBlock: async () => {
      throw new Error('not implemented')
    },
    reorderPages: async () => {
      throw new Error('not implemented')
    },
    reorderBlocks: async () => {
      throw new Error('not implemented')
    },
    deleteBlock: async () => {
      throw new Error('not implemented')
    },
    duplicateBlock: async () => {
      throw new Error('not implemented')
    },
    turnBlockInto: async () => {
      throw new Error('not implemented')
    },
    exportJson: async () => {
      throw new Error('not implemented')
    },
    importJson: async () => {
      throw new Error('not implemented')
    },
  }
}

function createPageRecord(parentId?: PageId): PageRecord {
  const now = new Date().toISOString()

  return {
    id: createId('page'),
    parentId: parentId ?? null,
    title: UNTITLED_PAGE_TITLE,
    icon: null,
    cover: null,
    blocks: [],
    createdAt: now,
    updatedAt: now,
  }
}

function createSettings(lastOpenedPageId: PageId | null): WorkspaceSettings {
  return {
    lastOpenedPageId,
  }
}

function resolveCurrentPageId(snapshot: Pick<WorkspaceSnapshot, 'pages' | 'settings'>): PageId | null {
  const preferredPageId = snapshot.settings.lastOpenedPageId

  if (preferredPageId && snapshot.pages.some((page) => page.id === preferredPageId)) {
    return preferredPageId
  }

  return snapshot.pages[0]?.id ?? null
}

function createBackupPayload(snapshot: WorkspaceSnapshot): WorkspaceBackup {
  return {
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    pages: snapshot.pages,
    settings: snapshot.settings,
  }
}

function normalizeImportedSnapshot(payload: unknown): WorkspaceSnapshot {
  if (!payload || typeof payload !== 'object') {
    throw new Error('Invalid workspace payload')
  }

  const candidate = payload as {
    pages?: unknown
    settings?: {
      lastOpenedPageId?: unknown
    }
  }

  if (!Array.isArray(candidate.pages)) {
    throw new Error('Invalid workspace pages')
  }

  if (!candidate.settings) {
    throw new Error('Invalid workspace settings')
  }

  const { lastOpenedPageId } = candidate.settings

  if (lastOpenedPageId !== null && typeof lastOpenedPageId !== 'string') {
    throw new Error('Invalid workspace settings')
  }

  return {
    pages: structuredClone(candidate.pages as PageRecord[]),
    settings: createSettings(lastOpenedPageId ?? null),
  }
}

export function createWorkspaceStore(repository: WorkspaceRepository) {
  return createStore<WorkspaceState>()((set, get) => ({
    ...createEmptyState(),

    bootstrap: async () => {
      const snapshot = await ensureSnapshot(repository, createSeedWorkspace())
      const currentPageId = resolveCurrentPageId(snapshot)

      set({
        pages: snapshot.pages,
        settings: createSettings(currentPageId),
        currentPageId,
        saveStatus: 'saved',
      })
    },

    createPage: async (parentId?: PageId) => {
      const page = createPageRecord(parentId)
      const state = get()
      const nextSettings = createSettings(page.id)
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

      const nextSettings = createSettings(pageId)
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
      const nextTitle = title.trim() || UNTITLED_PAGE_TITLE
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
      const nextSettings = createSettings(nextCurrentPageId)
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

    insertBlock: async (pageId: PageId, type: BlockType) => {
      const state = get()
      const now = new Date().toISOString()
      let childPage: PageRecord | null = null

      const nextPages = state.pages.map((page) => {
        if (page.id !== pageId) {
          return page
        }

        if (type === 'child_page') {
          const childId = createId('page')
          const childPageBlock: BlockRecord = {
            id: createId('block'),
            type: 'child_page',
            pageId: childId,
          }
          childPage = {
            id: childId,
            title: UNTITLED_PAGE_TITLE,
            parentId: pageId,
            icon: null,
            cover: null,
            blocks: [],
            createdAt: now,
            updatedAt: now,
          }

          return {
            ...page,
            updatedAt: now,
            blocks: [...page.blocks, childPageBlock],
          }
        }

        return {
          ...page,
          updatedAt: now,
          blocks: [...page.blocks, createBlock(type)],
        }
      })

      const snapshotPages = childPage ? [...nextPages, childPage] : nextPages
      const nextSnapshot = {
        pages: snapshotPages,
        settings: state.settings,
      }

      set({ saveStatus: 'saving' })

      try {
        await repository.save(nextSnapshot)
        set({
          pages: snapshotPages,
          saveStatus: 'saved',
        })
      } catch {
        set({ saveStatus: 'error' })
        throw new Error('Failed to insert block')
      }
    },

    reorderPages: async (activePageId: PageId, overPageId: PageId) => {
      const state = get()
      const activePage = state.pages.find((page) => page.id === activePageId)
      const overPage = state.pages.find((page) => page.id === overPageId)

      if (!activePage || !overPage || activePage.parentId !== overPage.parentId) {
        return
      }

      const siblings = state.pages.filter((page) => page.parentId === activePage.parentId)
      const reorderedSiblings = reorderItems(siblings, activePageId, overPageId)
      let siblingIndex = 0
      const nextPages = state.pages.map((page) =>
        page.parentId === activePage.parentId ? reorderedSiblings[siblingIndex++] : page,
      )

      set({ saveStatus: 'saving' })

      try {
        await repository.save({ pages: nextPages, settings: state.settings })
        set({ pages: nextPages, saveStatus: 'saved' })
      } catch {
        set({ saveStatus: 'error' })
        throw new Error('Failed to reorder pages')
      }
    },

    reorderBlocks: async (pageId: PageId, activeBlockId: string, overBlockId: string) => {
      const state = get()
      const nextPages = state.pages.map((page) =>
        page.id === pageId
          ? {
              ...page,
              updatedAt: new Date().toISOString(),
              blocks: reorderItems(page.blocks, activeBlockId, overBlockId),
            }
          : page,
      )

      set({ saveStatus: 'saving' })

      try {
        await repository.save({ pages: nextPages, settings: state.settings })
        set({ pages: nextPages, saveStatus: 'saved' })
      } catch {
        set({ saveStatus: 'error' })
        throw new Error('Failed to reorder blocks')
      }
    },

    deleteBlock: async (pageId: PageId, blockId: string) => {
      const state = get()
      const nextPages = state.pages.map((page) =>
        page.id === pageId
          ? {
              ...page,
              updatedAt: new Date().toISOString(),
              blocks: page.blocks.filter((block) => block.id !== blockId),
            }
          : page,
      )

      set({ saveStatus: 'saving' })

      try {
        await repository.save({ pages: nextPages, settings: state.settings })
        set({ pages: nextPages, saveStatus: 'saved' })
      } catch {
        set({ saveStatus: 'error' })
        throw new Error('Failed to delete block')
      }
    },

    duplicateBlock: async (pageId: PageId, blockId: string) => {
      const state = get()
      const nextPages = state.pages.map((page) => {
        if (page.id !== pageId) {
          return page
        }

        const index = page.blocks.findIndex((block) => block.id === blockId)
        const source = page.blocks[index]

        if (!source) {
          return page
        }

        const clone = { ...structuredClone(source), id: createId('block') }
        const blocks = [...page.blocks]
        blocks.splice(index + 1, 0, clone)

        return {
          ...page,
          updatedAt: new Date().toISOString(),
          blocks,
        }
      })

      set({ saveStatus: 'saving' })

      try {
        await repository.save({ pages: nextPages, settings: state.settings })
        set({ pages: nextPages, saveStatus: 'saved' })
      } catch {
        set({ saveStatus: 'error' })
        throw new Error('Failed to duplicate block')
      }
    },

    turnBlockInto: async (pageId: PageId, blockId: string, type: BlockType) => {
      const state = get()
      const nextPages = state.pages.map((page) => {
        if (page.id !== pageId) {
          return page
        }

        return {
          ...page,
          updatedAt: new Date().toISOString(),
          blocks: page.blocks.map((block) => {
            if (block.id !== blockId) {
              return block
            }

            const fresh = createBlock(type)
            return { ...fresh, id: block.id }
          }),
        }
      })

      set({ saveStatus: 'saving' })

      try {
        await repository.save({ pages: nextPages, settings: state.settings })
        set({ pages: nextPages, saveStatus: 'saved' })
      } catch {
        set({ saveStatus: 'error' })
        throw new Error('Failed to turn block into another type')
      }
    },

    exportJson: async () => {
      const state = get()

      return JSON.stringify(
        createBackupPayload({
          pages: state.pages,
          settings: state.settings,
        }),
        null,
        2,
      )
    },

    importJson: async (payload: unknown) => {
      const snapshot = normalizeImportedSnapshot(payload)
      const currentPageId = resolveCurrentPageId(snapshot)
      const nextSnapshot = {
        pages: snapshot.pages,
        settings: createSettings(currentPageId),
      }

      set({ saveStatus: 'saving' })

      try {
        await repository.replace(nextSnapshot)
        set({
          pages: nextSnapshot.pages,
          settings: nextSnapshot.settings,
          currentPageId,
          saveStatus: 'saved',
        })
      } catch {
        set({ saveStatus: 'error' })
        throw new Error('Failed to import workspace')
      }
    },
  }))
}
