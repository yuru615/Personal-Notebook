import { openDB } from "idb";
import type { AppState } from "../domain/types";

export const DB_NAME = "standalone-database";
export const STORE_NAME = "appState";
export const APP_KEY = "singleton";

async function getDb() {
  return openDB(DB_NAME, 1, {
    upgrade(db) {
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    },
  });
}

export async function loadAppState() {
  const db = await getDb();
  return (await db.get(STORE_NAME, APP_KEY)) as AppState | undefined;
}

export async function saveAppState(state: AppState) {
  const db = await getDb();
  await db.put(STORE_NAME, state, APP_KEY);
}

export async function clearAppState() {
  const db = await getDb();
  await db.delete(STORE_NAME, APP_KEY);
}
