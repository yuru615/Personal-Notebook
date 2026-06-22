import Dexie, { type Table } from 'dexie'
import type { BoardRecord, PageRecord, WorkspaceSettings } from '../domain/types'

export type WorkspaceSettingsRow = WorkspaceSettings & {
  id: string
}

class WorkspaceDatabase extends Dexie {
  boards!: Table<BoardRecord, string>
  pages!: Table<PageRecord, string>
  settings!: Table<WorkspaceSettingsRow, string>

  constructor() {
    super('notion-web')

    this.version(1).stores({
      pages: 'id, parentId, updatedAt',
      settings: 'id',
    })

    this.version(2).stores({
      boards: 'id',
      pages: 'id, parentId, updatedAt',
      settings: 'id',
    })

    this.version(6).stores({
      boards: 'id',
      pages: 'id, parentId, updatedAt',
      settings: 'id',
    })
  }
}

export const db = new WorkspaceDatabase()
