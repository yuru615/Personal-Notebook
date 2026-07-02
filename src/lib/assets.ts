import { convertFileSrc } from '@tauri-apps/api/core'
import { isDesktopRuntime, openBinaryFile, openLocalFilePath } from './fileAccess'
import {
  createTauriStorageClient,
  type AssetMeta,
  type WorkspaceArchiveProgressHandler,
} from './storageClient'

const storageClient = createTauriStorageClient()

export type MediaAssetKind = 'image' | 'video' | 'audio'

const mediaFilters: Record<MediaAssetKind, { name: string; extensions: string[] }[]> = {
  image: [{ name: 'Image', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'] }],
  video: [{ name: 'Video', extensions: ['mp4', 'webm', 'mov', 'm4v'] }],
  audio: [{ name: 'Audio', extensions: ['mp3', 'wav', 'ogg', 'm4a'] }],
}

export function guessMimeType(name: string, fallback = 'application/octet-stream') {
  const extension = name.split('.').pop()?.toLowerCase()

  switch (extension) {
    case 'png':
      return 'image/png'
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg'
    case 'gif':
      return 'image/gif'
    case 'webp':
      return 'image/webp'
    case 'svg':
      return 'image/svg+xml'
    case 'mp4':
      return 'video/mp4'
    case 'webm':
      return 'video/webm'
    case 'mov':
      return 'video/quicktime'
    case 'mp3':
      return 'audio/mpeg'
    case 'wav':
      return 'audio/wav'
    case 'ogg':
      return 'audio/ogg'
    case 'm4a':
      return 'audio/mp4'
    default:
      return fallback
  }
}

export async function writeFileAsset(file: File): Promise<AssetMeta> {
  return storageClient.writeAsset({
    name: file.name,
    mimeType: file.type || guessMimeType(file.name),
    bytes: new Uint8Array(await file.arrayBuffer()),
  })
}

export async function selectAndImportAsset(kind: MediaAssetKind): Promise<AssetMeta | null> {
  const filters = mediaFilters[kind]

  if (isDesktopRuntime()) {
    const file = await openLocalFilePath({ filters })

    if (!file) {
      return null
    }

    return storageClient.importAssetFile({
      path: file.path,
      mimeType: guessMimeType(file.name),
    })
  }

  const file = await openBinaryFile({ filters })

  if (!file) {
    return null
  }

  return storageClient.writeAsset({
    name: file.name,
    mimeType: file.file?.type || guessMimeType(file.name),
    bytes: file.contents,
  })
}

export function writeAssetBytes(input: {
  name: string
  mimeType: string
  bytes: Uint8Array
}) {
  return storageClient.writeAsset(input)
}

export function readAsset(assetId: string) {
  return storageClient.readAsset(assetId)
}

export async function getAssetUrl(assetId: string): Promise<string> {
  return convertFileSrc(await storageClient.getAssetFilePath(assetId))
}

export function exportPagePackage(pageId: string) {
  return storageClient.exportPagePackage(pageId)
}

export function exportPagePackageToPath(
  pageId: string,
  path: string,
  onProgress?: WorkspaceArchiveProgressHandler,
) {
  return storageClient.exportPagePackageToPath(pageId, path, onProgress)
}

export function importPagePackage(bytes: Uint8Array) {
  return storageClient.importPagePackage(bytes)
}

export function importPagePackageFromPath(
  path: string,
  onProgress?: WorkspaceArchiveProgressHandler,
) {
  return storageClient.importPagePackageFromPath(path, onProgress)
}
