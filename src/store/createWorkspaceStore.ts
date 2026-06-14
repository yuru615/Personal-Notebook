import { createStore } from 'zustand/vanilla'
import { createId } from '../utils/id'
import { createSeedWorkspace } from '../domain/seed'
import type {
  PageId,
  PageRecord,
  SaveStatus,
  WorkspaceSnapshot,
} from '../domain/types'
import { ensureSnapshot, type WorkspaceRepository } from '../lib/workspaceRepository'

export interface WorkspaceState extends WorkspaceSnapshot {
  saveStatus: SaveStatus
  bootstrap: () => Promise<void>
  createPage: (parentId?: PageId) => Promise<PageRecord>
}

function createEmptyState(): WorkspaceSnapshot {
  return {
    pages: [],
    settings: {
      workspaceName: '',
      createdAt: '',
      updatedAt: '',
    },
    currentPageId: null,
  }
}

function createPageRecord(parentId?: PageId): PageRecord {
  const now = new Date().toISOString()

  return {
    id: createId('page'),
    parentId: parentId ?? null,
    title: '未命名',
    blocks: [],
    createdAt: now,
    updatedAt: now,
  }
}

export function createWorkspaceStore(repository: WorkspaceRepository) {
  return createStore<WorkspaceState>()((set, get) => ({
    ...createEmptyState(),
    saveStatus: 'idle',

    bootstrap: async () => {
      const snapshot = await ensureSnapshot(repository, createSeedWorkspace())

      set({
        pages: snapshot.pages,
        settings: snapshot.settings,
        currentPageId: snapshot.currentPageId,
        saveStatus: 'saved',
      })
    },

    createPage: async (parentId?: PageId) => {
      const page = createPageRecord(parentId)
      const state = get()
      const nextSnapshot: WorkspaceSnapshot = {
        pages: [...state.pages, page],
        settings: state.settings,
        currentPageId: page.id,
      }

      set({ saveStatus: 'saving' })

      try {
        await repository.save(nextSnapshot)
        set({
          pages: nextSnapshot.pages,
          settings: nextSnapshot.settings,
          currentPageId: nextSnapshot.currentPageId,
          saveStatus: 'saved',
        })
      } catch {
        set({ saveStatus: 'error' })
        throw new Error('Failed to create page')
      }

      return page
    },
  }))
}
