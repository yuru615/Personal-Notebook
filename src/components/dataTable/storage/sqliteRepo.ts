import {
  ensurePersonalNotebookSchema,
  getPersonalNotebookDatabase,
  type PersonalNotebookDatabase,
} from "../../../lib/sqliteDatabase";
import type { AppState } from "../domain/types";

export const APP_KEY = "singleton";

interface RecordJsonRow {
  record_json: string;
}

interface CreateSqliteAppStateRepositoryOptions {
  loadDatabase?: () => Promise<PersonalNotebookDatabase>;
}

export function createSqliteAppStateRepository({
  loadDatabase = getPersonalNotebookDatabase,
}: CreateSqliteAppStateRepositoryOptions = {}) {
  async function getReadyDatabase() {
    const database = await loadDatabase();
    await ensurePersonalNotebookSchema(database);
    return database;
  }

  return {
    async loadAppState() {
      const database = await getReadyDatabase();
      const rows = await database.select<RecordJsonRow[]>(
        "SELECT record_json FROM standalone_data_table_state WHERE id = $1",
        [APP_KEY],
      );

      if (!rows[0]) {
        return undefined;
      }

      return JSON.parse(rows[0].record_json) as AppState;
    },

    async saveAppState(state: AppState) {
      const database = await getReadyDatabase();
      await database.execute(
        `INSERT INTO standalone_data_table_state (id, record_json)
          VALUES ($1, $2)
          ON CONFLICT(id) DO UPDATE SET record_json = excluded.record_json`,
        [APP_KEY, JSON.stringify(state)],
      );
    },

    async clearAppState() {
      const database = await getReadyDatabase();
      await database.execute("DELETE FROM standalone_data_table_state WHERE id = $1", [
        APP_KEY,
      ]);
    },
  };
}

const defaultRepository = createSqliteAppStateRepository();

export async function loadAppState() {
  return defaultRepository.loadAppState();
}

export async function saveAppState(state: AppState) {
  await defaultRepository.saveAppState(state);
}

export async function clearAppState() {
  await defaultRepository.clearAppState();
}
