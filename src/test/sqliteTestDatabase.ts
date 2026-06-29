import type {
  PersonalNotebookDatabase,
  SqliteQueryResult,
} from '../lib/sqliteDatabase'

type StoredRow = {
  id: string
  record_json: string
  position?: number
  parent_id?: string | null
  updated_at?: string
}

const RECORD_TABLES = new Set(['boards', 'data_tables', 'mindmaps', 'pages'])

export function createSqliteTestDatabase(): PersonalNotebookDatabase {
  const tables = new Map<string, Map<string, StoredRow>>()

  function getTable(name: string) {
    let table = tables.get(name)

    if (!table) {
      table = new Map()
      tables.set(name, table)
    }

    return table
  }

  function execute(query: string, bindValues: unknown[] = []): Promise<SqliteQueryResult> {
    const sql = normalizeSql(query)
    const createTableMatch = sql.match(/^CREATE TABLE IF NOT EXISTS ([a-z_]+)/)

    if (createTableMatch) {
      getTable(createTableMatch[1])
      return Promise.resolve({ rowsAffected: 0 })
    }

    if (sql === 'BEGIN IMMEDIATE' || sql === 'COMMIT' || sql === 'ROLLBACK') {
      return Promise.resolve({ rowsAffected: 0 })
    }

    const deleteByIdMatch = sql.match(/^DELETE FROM ([a-z_]+) WHERE id = \$1$/)
    if (deleteByIdMatch) {
      const table = getTable(deleteByIdMatch[1])
      const didDelete = table.delete(String(bindValues[0]))
      return Promise.resolve({ rowsAffected: didDelete ? 1 : 0 })
    }

    const deleteTableMatch = sql.match(/^DELETE FROM ([a-z_]+)$/)
    if (deleteTableMatch) {
      const table = getTable(deleteTableMatch[1])
      const rowsAffected = table.size
      table.clear()
      return Promise.resolve({ rowsAffected })
    }

    if (sql.startsWith('INSERT INTO settings ')) {
      getTable('settings').set(String(bindValues[0]), {
        id: String(bindValues[0]),
        record_json: String(bindValues[1]),
      })
      return Promise.resolve({ rowsAffected: 1 })
    }

    if (sql.startsWith('INSERT INTO standalone_data_table_state ')) {
      getTable('standalone_data_table_state').set(String(bindValues[0]), {
        id: String(bindValues[0]),
        record_json: String(bindValues[1]),
      })
      return Promise.resolve({ rowsAffected: 1 })
    }

    if (sql.startsWith('INSERT INTO pages ')) {
      getTable('pages').set(String(bindValues[0]), {
        id: String(bindValues[0]),
        parent_id: bindValues[1] === null ? null : String(bindValues[1]),
        updated_at: String(bindValues[2]),
        position: Number(bindValues[3]),
        record_json: String(bindValues[4]),
      })
      return Promise.resolve({ rowsAffected: 1 })
    }

    const recordInsertMatch = sql.match(/^INSERT INTO ([a-z_]+) /)
    if (recordInsertMatch && RECORD_TABLES.has(recordInsertMatch[1])) {
      getTable(recordInsertMatch[1]).set(String(bindValues[0]), {
        id: String(bindValues[0]),
        updated_at: String(bindValues[1]),
        position: Number(bindValues[2]),
        record_json: String(bindValues[3]),
      })
      return Promise.resolve({ rowsAffected: 1 })
    }

    return Promise.reject(new Error(`Unsupported test SQL: ${sql}`))
  }

  function select<T>(query: string, bindValues: unknown[] = []): Promise<T> {
    const sql = normalizeSql(query)
    const selectByIdMatch = sql.match(
      /^SELECT record_json FROM ([a-z_]+) WHERE id = \$1$/,
    )

    if (selectByIdMatch) {
      const row = getTable(selectByIdMatch[1]).get(String(bindValues[0]))
      return Promise.resolve((row ? [{ record_json: row.record_json }] : []) as T)
    }

    const selectRecordsMatch = sql.match(
      /^SELECT record_json FROM ([a-z_]+) ORDER BY position ASC$/,
    )

    if (selectRecordsMatch) {
      const rows = Array.from(getTable(selectRecordsMatch[1]).values())
        .sort((left, right) => (left.position ?? 0) - (right.position ?? 0))
        .map((row) => ({ record_json: row.record_json }))

      return Promise.resolve(rows as T)
    }

    return Promise.reject(new Error(`Unsupported test SQL: ${sql}`))
  }

  return { execute, select }
}

function normalizeSql(query: string) {
  return query.replace(/\s+/g, ' ').trim()
}
