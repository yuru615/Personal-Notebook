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
      const [boards, dataTables, mindmaps, pages, settings] = await Promise.all([
        db.boards.toArray(),
        db.dataTables.toArray(),
        db.mindmaps.toArray(),
        db.pages.toArray(),
        db.settings.get(SETTINGS_ID),
      ])

      if (!settings) {
        return null
      }

      return {
        boards,
        dataTables,
        mindmaps,
        pages,
        settings: {
          lastOpenedPageId: settings.lastOpenedPageId,
        },
      }
    },

    async save(snapshot) {
      await this.replace({
        ...snapshot,
        dataTables: snapshot.dataTables ?? (await db.dataTables.toArray()),
        mindmaps: snapshot.mindmaps ?? (await db.mindmaps.toArray()),
      })
    },

    async replace(snapshot) {
      await db.transaction('rw', db.boards, db.dataTables, db.mindmaps, db.pages, db.settings, async () => {
        await db.boards.clear()
        await db.dataTables.clear()
        await db.mindmaps.clear()
        await db.pages.clear()
        await db.settings.clear()
        await db.boards.bulkPut(snapshot.boards)
        await db.dataTables.bulkPut(snapshot.dataTables ?? [])
        await db.mindmaps.bulkPut(snapshot.mindmaps ?? [])
        await db.pages.bulkPut(snapshot.pages)
        await db.settings.put(toSettingsRow(snapshot))
      })
    },
  }
}
