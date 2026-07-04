import { createSeedWorkspace } from '../domain/seed'
import type { WorkspaceSnapshot } from '../domain/types'
import { isDesktopRuntime } from './fileAccess'
import { createTauriStorageClient, type WorkspaceStorageClient } from './storageClient'

export interface WorkspaceRepository {
  load(): Promise<WorkspaceSnapshot | null>
  save(snapshot: WorkspaceSnapshot): Promise<void>
  replace(snapshot: WorkspaceSnapshot): Promise<void>
  cleanupOrphanAssets(): Promise<number>
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

const BROWSER_WORKSPACE_STORAGE_KEY = 'zhixi.workspace.snapshot.v1'

export function createStorageWorkspaceRepository({
  client,
}: CreateStorageWorkspaceRepositoryOptions = {}): WorkspaceRepository {
  if (!client && !isDesktopRuntime()) {
    return createBrowserWorkspaceRepository()
  }

  client ??= createTauriStorageClient()
  let writeQueue: Promise<void> = Promise.resolve()

  function queueWrite<T>(task: () => Promise<T>) {
    const queuedTask = writeQueue.then(task, task)
    writeQueue = queuedTask.then(() => undefined, () => undefined)
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

    async cleanupOrphanAssets() {
      return queueWrite(() => client.cleanupOrphanAssets())
    },
  }
}

function createBrowserWorkspaceRepository(): WorkspaceRepository {
  return {
    async load() {
      const value = window.localStorage.getItem(BROWSER_WORKSPACE_STORAGE_KEY)
      return value ? (JSON.parse(value) as WorkspaceSnapshot) : null
    },

    async save(snapshot) {
      window.localStorage.setItem(BROWSER_WORKSPACE_STORAGE_KEY, JSON.stringify(snapshot))
    },

    async replace(snapshot) {
      window.localStorage.setItem(BROWSER_WORKSPACE_STORAGE_KEY, JSON.stringify(snapshot))
    },

    async cleanupOrphanAssets() {
      return 0
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
