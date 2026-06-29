import Database from '@tauri-apps/plugin-sql'

export const PERSONAL_NOTEBOOK_DATABASE = 'sqlite:personal-notebook.db'

export interface SqliteQueryResult {
  rowsAffected: number
  lastInsertId?: number
}

export interface PersonalNotebookDatabase {
  execute(query: string, bindValues?: unknown[]): Promise<SqliteQueryResult>
  select<T>(query: string, bindValues?: unknown[]): Promise<T>
}

let databasePromise: Promise<PersonalNotebookDatabase> | null = null
const schemaPromises = new WeakMap<PersonalNotebookDatabase, Promise<void>>()

export async function getPersonalNotebookDatabase() {
  if (!databasePromise) {
    databasePromise = Database.load(PERSONAL_NOTEBOOK_DATABASE)
  }

  const database = await databasePromise
  await ensurePersonalNotebookSchema(database)
  return database
}

export async function ensurePersonalNotebookSchema(database: PersonalNotebookDatabase) {
  let schemaPromise = schemaPromises.get(database)

  if (!schemaPromise) {
    schemaPromise = createSchema(database)
    schemaPromises.set(database, schemaPromise)
  }

  return schemaPromise
}

export function resetPersonalNotebookDatabaseForTests() {
  databasePromise = null
}

async function createSchema(database: PersonalNotebookDatabase) {
  await database.execute(`
    CREATE TABLE IF NOT EXISTS pages (
      id TEXT PRIMARY KEY NOT NULL,
      parent_id TEXT,
      updated_at TEXT NOT NULL,
      position INTEGER NOT NULL,
      record_json TEXT NOT NULL
    )
  `)
  await database.execute(`
    CREATE TABLE IF NOT EXISTS boards (
      id TEXT PRIMARY KEY NOT NULL,
      updated_at TEXT NOT NULL,
      position INTEGER NOT NULL,
      record_json TEXT NOT NULL
    )
  `)
  await database.execute(`
    CREATE TABLE IF NOT EXISTS data_tables (
      id TEXT PRIMARY KEY NOT NULL,
      updated_at TEXT NOT NULL,
      position INTEGER NOT NULL,
      record_json TEXT NOT NULL
    )
  `)
  await database.execute(`
    CREATE TABLE IF NOT EXISTS mindmaps (
      id TEXT PRIMARY KEY NOT NULL,
      updated_at TEXT NOT NULL,
      position INTEGER NOT NULL,
      record_json TEXT NOT NULL
    )
  `)
  await database.execute(`
    CREATE TABLE IF NOT EXISTS settings (
      id TEXT PRIMARY KEY NOT NULL,
      record_json TEXT NOT NULL
    )
  `)
  await database.execute(`
    CREATE TABLE IF NOT EXISTS standalone_data_table_state (
      id TEXT PRIMARY KEY NOT NULL,
      record_json TEXT NOT NULL
    )
  `)
}
