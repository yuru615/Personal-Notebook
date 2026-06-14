import type { WorkspaceRepository } from '../lib/workspaceRepository'
import type { WorkspaceSnapshot } from '../domain/types'

export function createMemoryRepository(
  initialSnapshot: WorkspaceSnapshot | null = null,
): WorkspaceRepository {
  let snapshot = initialSnapshot ? structuredClone(initialSnapshot) : null

  return {
    async load() {
      return snapshot ? structuredClone(snapshot) : null
    },

    async save(nextSnapshot) {
      snapshot = structuredClone(nextSnapshot)
    },

    async replace(nextSnapshot) {
      snapshot = structuredClone(nextSnapshot)
    },
  }
}
