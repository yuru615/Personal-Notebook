import Dexie, { type Table } from 'dexie'
import type { BoardRecord, DataTableRecord, MindmapRecord, PageRecord, WorkspaceSettings } from '../domain/types'

export type WorkspaceSettingsRow = WorkspaceSettings & {
  id: string
}

class WorkspaceDatabase extends Dexie {
  boards!: Table<BoardRecord, string>
  dataTables!: Table<DataTableRecord, string>
  mindmaps!: Table<MindmapRecord, string>
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

    this.version(7).stores({
      boards: 'id',
      dataTables: 'id',
      pages: 'id, parentId, updatedAt',
      settings: 'id',
    })

    this.version(8).stores({
      boards: 'id',
      dataTables: 'id',
      mindmaps: 'id',
      pages: 'id, parentId, updatedAt',
      settings: 'id',
    })
  }
}

export const db = new WorkspaceDatabase()
