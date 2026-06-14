import Dexie, { type Table } from 'dexie'
import type { PageRecord, WorkspaceSettings } from '../domain/types'

export type WorkspaceSettingsRow = WorkspaceSettings & {
  id: string
  currentPageId: string | null
}

class WorkspaceDatabase extends Dexie {
  pages!: Table<PageRecord, string>
  settings!: Table<WorkspaceSettingsRow, string>

  constructor() {
    super('notion-web')

    this.version(1).stores({
      pages: 'id, parentId, updatedAt',
      settings: 'id',
    })
  }
}

export const db = new WorkspaceDatabase()
