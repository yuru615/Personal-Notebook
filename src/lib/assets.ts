import { convertFileSrc } from '@tauri-apps/api/core'
import { isDesktopRuntime, openBinaryFile, openLocalFilePath } from './fileAccess'
import {
  createTauriStorageClient,
  type AssetMeta,
  type WorkspaceArchiveProgressHandler,
} from './storageClient'

const storageClient = createTauriStorageClient()
const BROWSER_ASSET_STORAGE_PREFIX = 'zhixi.asset.'

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
  if (!isDesktopRuntime()) {
    return writeBrowserAsset({
      name: file.name,
      mimeType: file.type || guessMimeType(file.name),
      bytes: new Uint8Array(await file.arrayBuffer()),
    })
  }

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

  return writeBrowserAsset({
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
  if (!isDesktopRuntime()) {
    return writeBrowserAsset(input)
  }

  return storageClient.writeAsset(input)
}

export function readAsset(assetId: string) {
  if (!isDesktopRuntime()) {
    return readBrowserAsset(assetId)
  }

  return storageClient.readAsset(assetId)
}

export async function getAssetUrl(assetId: string): Promise<string> {
  if (!isDesktopRuntime()) {
    const asset = readBrowserAssetRecord(assetId)
    return `data:${asset.mimeType};base64,${asset.base64}`
  }

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

interface BrowserAssetRecord {
  name: string
  mimeType: string
  base64: string
  createdAt: string
}

async function writeBrowserAsset(input: {
  name: string
  mimeType: string
  bytes: Uint8Array
}): Promise<AssetMeta> {
  const id = createBrowserAssetId()
  const createdAt = new Date().toISOString()
  const record: BrowserAssetRecord = {
    name: input.name,
    mimeType: input.mimeType,
    base64: bytesToBase64(input.bytes),
    createdAt,
  }

  window.localStorage.setItem(`${BROWSER_ASSET_STORAGE_PREFIX}${id}`, JSON.stringify(record))

  return {
    id,
    sha256: id,
    name: input.name,
    mimeType: input.mimeType,
    byteSize: input.bytes.byteLength,
    relativePath: id,
    createdAt,
  }
}

async function readBrowserAsset(assetId: string) {
  return base64ToBytes(readBrowserAssetRecord(assetId).base64)
}

function readBrowserAssetRecord(assetId: string): BrowserAssetRecord {
  const value = window.localStorage.getItem(`${BROWSER_ASSET_STORAGE_PREFIX}${assetId}`)

  if (!value) {
    throw new Error(`Missing browser asset: ${assetId}`)
  }

  return JSON.parse(value) as BrowserAssetRecord
}

function createBrowserAssetId() {
  return `asset_${globalThis.crypto?.randomUUID?.() ?? `${Date.now()}_${Math.random().toString(36).slice(2)}`}`
}

function bytesToBase64(bytes: Uint8Array) {
  let binary = ''
  for (const byte of bytes) {
    binary += String.fromCharCode(byte)
  }
  return btoa(binary)
}

function base64ToBytes(base64: string) {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }
  return bytes
}
