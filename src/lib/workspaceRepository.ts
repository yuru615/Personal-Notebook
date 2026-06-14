import { db, type WorkspaceSettingsRow } from './db'
import { createSeedWorkspace } from '../domain/seed'
import type { WorkspaceSnapshot } from '../domain/types'

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

function toSettingsRow(snapshot: WorkspaceSnapshot): WorkspaceSettingsRow {
  return {
    id: SETTINGS_ID,
    lastOpenedPageId: snapshot.settings.lastOpenedPageId,
  }
}

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

      return {
        pages,
        settings: {
          lastOpenedPageId: settings.lastOpenedPageId,
        },
      }
    },

    async save(snapshot) {
      await this.replace(snapshot)
    },

    async replace(snapshot) {
      await db.transaction('rw', db.pages, db.settings, async () => {
        await db.pages.clear()
        await db.settings.clear()
        await db.pages.bulkPut(snapshot.pages)
        await db.settings.put(toSettingsRow(snapshot))
      })
    },
  }
}
