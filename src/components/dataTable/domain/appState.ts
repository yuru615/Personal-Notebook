import { createDefaultAppState } from './factory'
import type { AppState } from './types'

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

export function getDataTableInitialState(snapshot: unknown, title: string): AppState {
  if (isRecord(snapshot) && isRecord(snapshot.database) && isRecord(snapshot.properties) && isRecord(snapshot.records)) {
    return {
      ...snapshot,
      version: 1,
      database: snapshot.database as AppState['database'],
      properties: snapshot.properties as AppState['properties'],
      records: snapshot.records as AppState['records'],
      recordPages: isRecord(snapshot.recordPages) ? (snapshot.recordPages as AppState['recordPages']) : {},
      blocks: isRecord(snapshot.blocks) ? (snapshot.blocks as AppState['blocks']) : {},
      assets: isRecord(snapshot.assets) ? (snapshot.assets as AppState['assets']) : {},
    }
  }

  const fallback = createDefaultAppState()
  fallback.database.name = title
  return fallback
}
