import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import type { SearchResult } from '../domain/search'
import type {
  BoardRecord,
  DataTableRecord,
  MindmapRecord,
  PageRecord,
  WorkspaceSnapshot,
} from '../domain/types'

export interface WriteAssetInput {
  name: string
  mimeType: string
  bytes: Uint8Array
}

export interface ImportAssetFileInput {
  path: string
  mimeType: string
}

export interface AssetMeta {
  id: string
  sha256: string
  name: string
  mimeType: string
  byteSize: number
  relativePath: string
  createdAt: string
}

export interface PagePackageImportResult {
  rootPageId: string
}

export const WORKSPACE_ARCHIVE_PROGRESS_EVENT = 'zhixi://workspace-archive-progress'

export type WorkspaceArchiveOperation = 'export' | 'import'
export type WorkspaceArchiveProgressPhase =
  | 'preparing'
  | 'writingMetadata'
  | 'processingAsset'
  | 'finalizing'
  | 'complete'

export interface WorkspaceArchiveProgress {
  taskId: string
  operation: WorkspaceArchiveOperation
  phase: WorkspaceArchiveProgressPhase
  current: number
  total: number
  bytesProcessed: number
  bytesTotal: number
  itemName?: string
}

export type WorkspaceArchiveProgressHandler = (progress: WorkspaceArchiveProgress) => void

export interface WorkspaceStorageClient {
  exportWorkspaceBackup(): Promise<WorkspaceSnapshot | null>
  replaceWorkspaceBackup(snapshot: WorkspaceSnapshot): Promise<void>
  exportPagePackageToPath(
    pageId: string,
    path: string,
    onProgress?: WorkspaceArchiveProgressHandler,
  ): Promise<void>
  exportPagePackage(pageId: string): Promise<Uint8Array>
  importPagePackage(bytes: Uint8Array): Promise<PagePackageImportResult>
  importPagePackageFromPath(
    path: string,
    onProgress?: WorkspaceArchiveProgressHandler,
  ): Promise<PagePackageImportResult>
  savePage(page: PageRecord): Promise<void>
  saveBoard(board: BoardRecord): Promise<void>
  saveDataTable(dataTable: DataTableRecord): Promise<void>
  saveMindmap(mindmap: MindmapRecord): Promise<void>
  writeAsset(input: WriteAssetInput): Promise<AssetMeta>
  importAssetFile(input: ImportAssetFileInput): Promise<AssetMeta>
  readAsset(assetId: string): Promise<Uint8Array>
  getAssetFilePath(assetId: string): Promise<string>
  cleanupOrphanAssets(): Promise<number>
  searchWorkspace(query: string, limit?: number): Promise<SearchResult[]>
}

export function createTauriStorageClient(): WorkspaceStorageClient {
  return {
    exportWorkspaceBackup() {
      return invoke<WorkspaceSnapshot | null>('export_workspace_backup')
    },

    replaceWorkspaceBackup(snapshot) {
      return invoke<void>('replace_workspace_backup', { payload: snapshot })
    },

    exportPagePackageToPath(pageId, path, onProgress) {
      return invokeArchiveCommandWithProgress(
        'export_page_package_to_path',
        { pageId, path },
        onProgress,
      )
    },

    async exportPagePackage(pageId) {
      return normalizeByteArray(await invoke<Uint8Array | number[]>('export_page_package', { pageId }))
    },

    importPagePackage(bytes) {
      return invoke<PagePackageImportResult>('import_page_package', { bytes })
    },

    importPagePackageFromPath(path, onProgress) {
      return invokeArchiveCommandWithProgress<PagePackageImportResult>(
        'import_page_package_from_path',
        { path },
        onProgress,
      )
    },

    async savePage(page) {
      await invoke('save_page', { page })
    },

    async saveBoard(board) {
      await invoke('save_board', { board })
    },

    async saveDataTable(dataTable) {
      await invoke('save_data_table_metadata', { dataTable })
    },

    async saveMindmap(mindmap) {
      await invoke('save_mindmap', { mindmap })
    },

    writeAsset(input) {
      return invoke<AssetMeta>('write_asset', { input })
    },

    importAssetFile(input) {
      return invoke<AssetMeta>('import_asset_file', { input })
    },

    async readAsset(assetId) {
      return normalizeByteArray(await invoke<Uint8Array | number[]>('read_asset', { assetId }))
    },

    getAssetFilePath(assetId) {
      return invoke<string>('get_asset_file_path', { assetId })
    },

    cleanupOrphanAssets() {
      return invoke<number>('cleanup_orphan_assets')
    },

    searchWorkspace(query, limit = 30) {
      return invoke<SearchResult[]>('search_workspace', { query, limit })
    },
  }
}

function normalizeByteArray(bytes: Uint8Array | number[]) {
  return bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)
}

async function invokeArchiveCommandWithProgress<T = void>(
  command: string,
  args: Record<string, unknown>,
  onProgress?: WorkspaceArchiveProgressHandler,
): Promise<T> {
  if (!onProgress) {
    return invoke<T>(command, args)
  }

  const taskId = createArchiveTaskId()
  const unlisten = await listen<WorkspaceArchiveProgress>(
    WORKSPACE_ARCHIVE_PROGRESS_EVENT,
    (event) => {
      if (event.payload.taskId === taskId) {
        onProgress(event.payload)
      }
    },
  )

  try {
    return await invoke<T>(command, { ...args, taskId })
  } finally {
    unlisten()
  }
}

function createArchiveTaskId() {
  if (globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID()
  }

  return `archive_${Date.now()}_${Math.random().toString(36).slice(2)}`
}

const defaultStorageClient = createTauriStorageClient()

export function searchWorkspace(query: string, limit?: number) {
  return defaultStorageClient.searchWorkspace(query, limit)
}
