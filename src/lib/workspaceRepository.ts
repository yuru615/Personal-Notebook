import { createSeedWorkspace } from '../domain/seed'
import type { WorkspaceSnapshot } from '../domain/types'
import { createTauriStorageClient, type WorkspaceStorageClient } from './storageClient'

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

interface CreateStorageWorkspaceRepositoryOptions {
  client?: WorkspaceStorageClient
}

export function createStorageWorkspaceRepository({
  client = createTauriStorageClient(),
}: CreateStorageWorkspaceRepositoryOptions = {}): WorkspaceRepository {
  let writeQueue: Promise<void> = Promise.resolve()

  function queueWrite(task: () => Promise<void>) {
    const queuedTask = writeQueue.then(task, task)
    writeQueue = queuedTask.catch(() => undefined)
    return queuedTask
  }

  return {
    async load() {
      await writeQueue
      return client.exportWorkspaceBackup()
    },

    async save(snapshot) {
      return queueWrite(async () => {
        const persistedSnapshot = await client.exportWorkspaceBackup()
        const nextSnapshot = {
          ...snapshot,
          dataTables: snapshot.dataTables ?? persistedSnapshot?.dataTables ?? [],
          mindmaps: snapshot.mindmaps ?? persistedSnapshot?.mindmaps ?? [],
        }

        if (persistedSnapshot && canSaveIncrementally(persistedSnapshot, nextSnapshot)) {
          const savedIncrementally = await saveChangedRecords(client, persistedSnapshot, nextSnapshot)
          if (savedIncrementally) {
            return
          }
        }

        await client.replaceWorkspaceBackup(nextSnapshot)
      })
    },

    async replace(snapshot) {
      return queueWrite(async () => {
        await client.replaceWorkspaceBackup(snapshot)
      })
    },
  }
}

async function saveChangedRecords(
  client: WorkspaceStorageClient,
  previous: RequiredWorkspaceSnapshot,
  next: RequiredWorkspaceSnapshot,
): Promise<boolean> {
  const changedPages = changedRecords(previous.pages, next.pages)
  const changedBoards = changedRecords(previous.boards, next.boards)
  const changedDataTables = changedRecords(previous.dataTables, next.dataTables)
  const changedMindmaps = changedRecords(previous.mindmaps, next.mindmaps)
  const changeCount =
    changedPages.length +
    changedBoards.length +
    changedDataTables.length +
    changedMindmaps.length

  if (changeCount === 0) {
    return true
  }

  if (changeCount > 1) {
    return false
  }

  if (changedPages[0]) {
    await client.savePage(changedPages[0])
    return true
  }

  if (changedBoards[0]) {
    await client.saveBoard(changedBoards[0])
    return true
  }

  if (changedDataTables[0]) {
    await client.saveDataTable(changedDataTables[0])
    return true
  }

  if (changedMindmaps[0]) {
    await client.saveMindmap(changedMindmaps[0])
  }

  return true
}

function canSaveIncrementally(
  previous: WorkspaceSnapshot,
  next: RequiredWorkspaceSnapshot,
): previous is RequiredWorkspaceSnapshot {
  return (
    Array.isArray(previous.dataTables) &&
    Array.isArray(previous.mindmaps) &&
    sameRecordOrder(previous.pages, next.pages) &&
    sameRecordOrder(previous.boards, next.boards) &&
    sameRecordOrder(previous.dataTables, next.dataTables) &&
    sameRecordOrder(previous.mindmaps, next.mindmaps) &&
    JSON.stringify(previous.settings) === JSON.stringify(next.settings)
  )
}

function changedRecords<T extends { id: string }>(previous: T[], next: T[]) {
  const previousById = new Map(previous.map((record) => [record.id, record]))
  return next.filter((record) => JSON.stringify(previousById.get(record.id)) !== JSON.stringify(record))
}

function sameRecordOrder(left: { id: string }[], right: { id: string }[]) {
  return (
    left.length === right.length &&
    left.every((record, index) => record.id === right[index]?.id)
  )
}

type RequiredWorkspaceSnapshot = Required<WorkspaceSnapshot>
