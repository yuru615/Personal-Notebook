import { db } from './db'
import { createSeedWorkspace } from '../domain/seed'
import type { WorkspaceSnapshot } from '../domain/types'
import type { WorkspaceSettingsRow } from './db'

export interface WorkspaceRepository {
  load(): Promise<WorkspaceSnapshot | null>
  save(snapshot: WorkspaceSnapshot): Promise<void>
  replace(snapshot: WorkspaceSnapshot): Promise<void>
}

export async function ensureSnapshot(
  repository: WorkspaceRepository,
  fallback: WorkspaceSnapshot = createSeedWorkspace(),
): Promise<WorkspaceSnapshot> {
  const snapshot = await repository.load()

  if (snapshot) {
    return snapshot
  }

  await repository.replace(fallback)
  return fallback
}

const SETTINGS_ID = 'workspace'

export function createDexieWorkspaceRepository(): WorkspaceRepository {
  return {
    async load() {
      const [pages, settings] = await Promise.all([
        db.pages.toArray(),
        db.settings.get(SETTINGS_ID),
      ])

      if (!settings || pages.length === 0) {
        return null
      }

      const { id: _id, currentPageId, ...rest } = settings

      return {
        pages,
        settings: rest,
        currentPageId,
      }
    },

    async save(snapshot) {
      await this.replace(snapshot)
    },

    async replace(snapshot) {
      const settingsRow: WorkspaceSettingsRow = {
        id: SETTINGS_ID,
        currentPageId: snapshot.currentPageId,
        ...snapshot.settings,
      }

      await db.transaction('rw', db.pages, db.settings, async () => {
        await db.pages.clear()
        await db.settings.clear()
        await db.pages.bulkPut(snapshot.pages)
        await db.settings.put(settingsRow)
      })
    },
  }
}
