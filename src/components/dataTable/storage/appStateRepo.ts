import type { AppState } from "../domain/types";

const STORAGE_KEY = "personal-notebook.standalone-data-table-state.v1";

export interface AppStateRepository {
  loadAppState(): Promise<AppState | undefined>;
  saveAppState(state: AppState): Promise<void>;
  clearAppState(): Promise<void>;
}

export function createMemoryAppStateRepository(
  initialState?: AppState,
): AppStateRepository {
  let state = initialState ? structuredClone(initialState) : undefined;

  return {
    async loadAppState() {
      return state ? structuredClone(state) : undefined;
    },

    async saveAppState(nextState) {
      state = structuredClone(nextState);
    },

    async clearAppState() {
      state = undefined;
    },
  };
}

export function createBrowserAppStateRepository(): AppStateRepository {
  return {
    async loadAppState() {
      const rawState = window.localStorage.getItem(STORAGE_KEY);

      if (!rawState) {
        return undefined;
      }

      return JSON.parse(rawState) as AppState;
    },

    async saveAppState(state) {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    },

    async clearAppState() {
      window.localStorage.removeItem(STORAGE_KEY);
    },
  };
}

const defaultRepository = createBrowserAppStateRepository();

export async function loadAppState() {
  return defaultRepository.loadAppState();
}

export async function saveAppState(state: AppState) {
  await defaultRepository.saveAppState(state);
}

export async function clearAppState() {
  await defaultRepository.clearAppState();
}
