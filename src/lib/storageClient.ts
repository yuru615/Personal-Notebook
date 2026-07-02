import { invoke } from '@tauri-apps/api/core'
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

export interface WorkspaceStorageClient {
  exportWorkspaceBackup(): Promise<WorkspaceSnapshot | null>
  replaceWorkspaceBackup(snapshot: WorkspaceSnapshot): Promise<void>
  exportWorkspaceArchive(): Promise<Uint8Array>
  importWorkspaceArchive(bytes: Uint8Array): Promise<void>
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

    async exportWorkspaceArchive() {
      return normalizeByteArray(await invoke<Uint8Array | number[]>('export_workspace_archive'))
    },

    importWorkspaceArchive(bytes) {
      return invoke<void>('import_workspace_archive', { bytes })
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

const defaultStorageClient = createTauriStorageClient()

export function searchWorkspace(query: string, limit?: number) {
  return defaultStorageClient.searchWorkspace(query, limit)
}
