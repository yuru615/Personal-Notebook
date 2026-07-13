import { normalizeWorkspaceSnapshot } from '../domain/pageProperties'
import { createSeedWorkspace } from '../domain/seed'
import { reconcileSyncedBlockGroups } from '../domain/syncedBlocks'
import type { SyncedBlockGroupRecord, WorkspaceSnapshot } from '../domain/types'
import { createId } from '../utils/id'
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

const BROWSER_WORKSPACE_STORAGE_KEY = 'zhiqi.workspace.snapshot.v1'
const ORPHAN_SYNCED_BLOCK_RECOVERY_PAGE_TITLE = '同步块恢复'

function normalizeRepositorySnapshot(snapshot: WorkspaceSnapshot): WorkspaceSnapshot {
  const normalized = normalizeWorkspaceSnapshot(snapshot)
  const syncedBlockGroups: SyncedBlockGroupRecord[] = Array.isArray(
    (normalized as WorkspaceSnapshot & { syncedBlockGroups?: SyncedBlockGroupRecord[] }).syncedBlockGroups,
  )
    ? (normalized.syncedBlockGroups ?? [])
    : []
  const repairedSnapshot = recoverOrphanSyncedBlockGroups({
    ...normalized,
    syncedBlockGroups,
  })

  return {
    ...repairedSnapshot,
    syncedBlockGroups: reconcileSyncedBlockGroups(
      repairedSnapshot.pages,
      repairedSnapshot.syncedBlockGroups ?? [],
    ),
  }
}

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
      const snapshot = await client.exportWorkspaceBackup()
      if (!snapshot) {
        return null
      }

      const normalizedSnapshot = normalizeRepositorySnapshot(snapshot)
      if (JSON.stringify(snapshot) !== JSON.stringify(normalizedSnapshot)) {
        await client.replaceWorkspaceBackup(normalizedSnapshot)
      }

      return normalizedSnapshot
    },

    async save(snapshot) {
      return queueWrite(async () => {
        const persistedSnapshot = await client.exportWorkspaceBackup()
        const nextSnapshot = {
          ...snapshot,
          dataTables: snapshot.dataTables ?? persistedSnapshot?.dataTables ?? [],
          mindmaps: snapshot.mindmaps ?? persistedSnapshot?.mindmaps ?? [],
          syncedBlockGroups:
            snapshot.syncedBlockGroups ?? persistedSnapshot?.syncedBlockGroups ?? [],
          pageProperties: snapshot.pageProperties ?? persistedSnapshot?.pageProperties ?? [],
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
      if (!value) {
        return null
      }

      const snapshot = JSON.parse(value) as WorkspaceSnapshot
      const normalizedSnapshot = normalizeRepositorySnapshot(snapshot)
      if (JSON.stringify(snapshot) !== JSON.stringify(normalizedSnapshot)) {
        window.localStorage.setItem(
          BROWSER_WORKSPACE_STORAGE_KEY,
          JSON.stringify(normalizedSnapshot),
        )
      }

      return normalizedSnapshot
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
  const pagePropertiesChanged =
    JSON.stringify(previous.pageProperties) !== JSON.stringify(next.pageProperties)
  const changedPages = changedRecords(previous.pages, next.pages)
  const changedBoards = changedRecords(previous.boards, next.boards)
  const changedDataTables = changedRecords(previous.dataTables, next.dataTables)
  const changedMindmaps = changedRecords(previous.mindmaps, next.mindmaps)
  const syncedGroupsChanged =
    JSON.stringify(previous.syncedBlockGroups) !== JSON.stringify(next.syncedBlockGroups)
  const changeCount =
    (pagePropertiesChanged ? 1 : 0) +
    (syncedGroupsChanged ? 1 : 0) +
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

  if (pagePropertiesChanged) {
    return false
  }

  if (syncedGroupsChanged) {
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
    Array.isArray(previous.syncedBlockGroups) &&
    Array.isArray(previous.pageProperties) &&
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

function recoverOrphanSyncedBlockGroups(snapshot: WorkspaceSnapshot): WorkspaceSnapshot {
  const syncedBlockGroups = snapshot.syncedBlockGroups ?? []
  if (syncedBlockGroups.length === 0) {
    return snapshot
  }

  const referencedGroupIds = new Set(
    snapshot.pages.flatMap((page) =>
      page.blocks.flatMap((block) =>
        block.type === 'synced_block' ? [block.groupId] : [],
      ),
    ),
  )
  const orphanGroups = syncedBlockGroups.filter((group) => !referencedGroupIds.has(group.id))

  if (orphanGroups.length === 0 || referencedGroupIds.size > 0) {
    return snapshot
  }

  const now = new Date().toISOString()
  const recoveredInstanceIds = new Map<string, string>()
  const recoveryPage = {
    id: createId('page'),
    parentId: null,
    title: ORPHAN_SYNCED_BLOCK_RECOVERY_PAGE_TITLE,
    icon: null,
    cover: null,
    properties: {},
    isFullWidth: false,
    isSmallText: false,
    fontFamily: 'default' as const,
    showOutline: true,
    blocks: orphanGroups.map((group) => {
      const instanceId = createId('instance')
      recoveredInstanceIds.set(group.id, instanceId)
      return {
        id: createId('block'),
        type: 'synced_block' as const,
        groupId: group.id,
        instanceId,
        mode: 'sync' as const,
      }
    }),
    createdAt: now,
    updatedAt: now,
  }

  return {
    ...snapshot,
    pages: [...snapshot.pages, recoveryPage],
    syncedBlockGroups: syncedBlockGroups.map((group) => {
      const recoveredInstanceId = recoveredInstanceIds.get(group.id)
      return recoveredInstanceId
        ? {
            ...group,
            primaryInstanceId: recoveredInstanceId,
            updatedAt: now,
          }
        : group
    }),
  }
}
