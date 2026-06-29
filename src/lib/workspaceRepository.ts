import { createSeedWorkspace } from '../domain/seed'
import type {
  BoardRecord,
  DataTableRecord,
  MindmapRecord,
  PageRecord,
  WorkspaceSettings,
  WorkspaceSnapshot,
} from '../domain/types'
import {
  ensurePersonalNotebookSchema,
  getPersonalNotebookDatabase,
  type PersonalNotebookDatabase,
} from './sqliteDatabase'

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

interface CreateSqliteWorkspaceRepositoryOptions {
  loadDatabase?: () => Promise<PersonalNotebookDatabase>
}

interface RecordJsonRow {
  record_json: string
}

const SETTINGS_ID = 'workspace'

export function createSqliteWorkspaceRepository({
  loadDatabase = getPersonalNotebookDatabase,
}: CreateSqliteWorkspaceRepositoryOptions = {}): WorkspaceRepository {
  let writeQueue: Promise<void> = Promise.resolve()

  async function getReadyDatabase() {
    const database = await loadDatabase()
    await ensurePersonalNotebookSchema(database)
    return database
  }

  async function loadSnapshot(database: PersonalNotebookDatabase) {
    const settingsRows = await database.select<RecordJsonRow[]>(
      'SELECT record_json FROM settings WHERE id = $1',
      [SETTINGS_ID],
    )

    if (!settingsRows[0]) {
      return null
    }

    return {
      boards: await loadRecords<BoardRecord>(database, 'boards'),
      dataTables: await loadRecords<DataTableRecord>(database, 'data_tables'),
      mindmaps: await loadRecords<MindmapRecord>(database, 'mindmaps'),
      pages: await loadRecords<PageRecord>(database, 'pages'),
      settings: parseRecord<WorkspaceSettings>(settingsRows[0]),
    }
  }

  async function replaceSnapshot(
    database: PersonalNotebookDatabase,
    snapshot: WorkspaceSnapshot,
  ) {
    await database.execute('BEGIN IMMEDIATE')

    try {
      await database.execute('DELETE FROM boards')
      await database.execute('DELETE FROM data_tables')
      await database.execute('DELETE FROM mindmaps')
      await database.execute('DELETE FROM pages')
      await database.execute('DELETE FROM settings')

      await insertBoards(database, snapshot.boards)
      await insertDataTables(database, snapshot.dataTables ?? [])
      await insertMindmaps(database, snapshot.mindmaps ?? [])
      await insertPages(database, snapshot.pages)
      await database.execute('INSERT INTO settings (id, record_json) VALUES ($1, $2)', [
        SETTINGS_ID,
        JSON.stringify(snapshot.settings),
      ])

      await database.execute('COMMIT')
    } catch (error) {
      await database.execute('ROLLBACK').catch(() => undefined)
      throw error
    }
  }

  function queueWrite(task: () => Promise<void>) {
    const queuedTask = writeQueue.then(task, task)
    writeQueue = queuedTask.catch(() => undefined)
    return queuedTask
  }

  return {
    async load() {
      await writeQueue
      const database = await getReadyDatabase()
      return loadSnapshot(database)
    },

    async save(snapshot) {
      return queueWrite(async () => {
        const database = await getReadyDatabase()
        const currentSnapshot = await loadSnapshot(database)

        await replaceSnapshot(database, {
          ...snapshot,
          dataTables: snapshot.dataTables ?? currentSnapshot?.dataTables ?? [],
          mindmaps: snapshot.mindmaps ?? currentSnapshot?.mindmaps ?? [],
        })
      })
    },

    async replace(snapshot) {
      return queueWrite(async () => {
        const database = await getReadyDatabase()
        await replaceSnapshot(database, snapshot)
      })
    },
  }
}

async function loadRecords<T>(database: PersonalNotebookDatabase, tableName: string) {
  const rows = await database.select<RecordJsonRow[]>(
    `SELECT record_json FROM ${tableName} ORDER BY position ASC`,
  )
  return rows.map((row) => parseRecord<T>(row))
}

function parseRecord<T>(row: RecordJsonRow) {
  return JSON.parse(row.record_json) as T
}

async function insertBoards(database: PersonalNotebookDatabase, boards: BoardRecord[]) {
  for (const [position, board] of boards.entries()) {
    await database.execute(
      'INSERT INTO boards (id, updated_at, position, record_json) VALUES ($1, $2, $3, $4)',
      [board.id, board.updatedAt, position, JSON.stringify(board)],
    )
  }
}

async function insertDataTables(
  database: PersonalNotebookDatabase,
  dataTables: DataTableRecord[],
) {
  for (const [position, dataTable] of dataTables.entries()) {
    await database.execute(
      'INSERT INTO data_tables (id, updated_at, position, record_json) VALUES ($1, $2, $3, $4)',
      [dataTable.id, dataTable.updatedAt, position, JSON.stringify(dataTable)],
    )
  }
}

async function insertMindmaps(database: PersonalNotebookDatabase, mindmaps: MindmapRecord[]) {
  for (const [position, mindmap] of mindmaps.entries()) {
    await database.execute(
      'INSERT INTO mindmaps (id, updated_at, position, record_json) VALUES ($1, $2, $3, $4)',
      [mindmap.id, mindmap.updatedAt, position, JSON.stringify(mindmap)],
    )
  }
}

async function insertPages(database: PersonalNotebookDatabase, pages: PageRecord[]) {
  for (const [position, page] of pages.entries()) {
    await database.execute(
      `INSERT INTO pages
        (id, parent_id, updated_at, position, record_json)
        VALUES ($1, $2, $3, $4, $5)`,
      [page.id, page.parentId, page.updatedAt, position, JSON.stringify(page)],
    )
  }
}
