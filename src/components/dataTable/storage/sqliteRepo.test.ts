import { describe, expect, it } from 'vitest'
import { createSqliteTestDatabase } from '../../../test/sqliteTestDatabase'
import { createDefaultAppState } from '../domain/factory'
import { createSqliteAppStateRepository } from './sqliteRepo'

function createRepository() {
  const database = createSqliteTestDatabase()
  return createSqliteAppStateRepository({ loadDatabase: async () => database })
}

describe('createSqliteAppStateRepository', () => {
  it('returns undefined when standalone data table state is empty', async () => {
    const repository = createRepository()

    await expect(repository.loadAppState()).resolves.toBeUndefined()
  })

  it('saves and loads standalone data table state', async () => {
    const repository = createRepository()
    const state = createDefaultAppState()

    await repository.saveAppState(state)

    await expect(repository.loadAppState()).resolves.toEqual(state)
  })

  it('clears standalone data table state', async () => {
    const repository = createRepository()

    await repository.saveAppState(createDefaultAppState())
    await repository.clearAppState()

    await expect(repository.loadAppState()).resolves.toBeUndefined()
  })
})
