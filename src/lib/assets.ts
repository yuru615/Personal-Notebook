import { convertFileSrc } from '@tauri-apps/api/core'
import { isDesktopRuntime, openBinaryFile, openLocalFilePath } from './fileAccess'
import {
  createTauriStorageClient,
  type AssetMeta,
  type WorkspaceArchiveProgressHandler,
} from './storageClient'

const storageClient = createTauriStorageClient()
const BROWSER_ASSET_STORAGE_PREFIX = 'zhiqi.asset.'

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
    case 'docx':
      return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    case 'pdf':
      return 'application/pdf'
    case 'md':
    case 'markdown':
    case 'txt':
      return 'text/plain'
    case 'zip':
      return 'application/zip'
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

export async function importImageAssetFromPath(path: string): Promise<AssetMeta | null> {
  if (!isDesktopRuntime()) {
    return null
  }

  const mimeType = guessMimeType(path)

  if (!mimeType.startsWith('image/')) {
    return null
  }

  return storageClient.importAssetFile({
    path,
    mimeType,
  })
}

export function importFileAssetFromPath(path: string): Promise<AssetMeta> {
  if (!isDesktopRuntime()) {
    throw new Error('本机路径导入仅支持桌面端')
  }

  return storageClient.importAssetFile({
    path,
    mimeType: guessMimeType(path),
  })
}

export async function importMarkdownImageAsset(
  markdownPath: string | undefined,
  source: string,
): Promise<AssetMeta | null> {
  const imagePath = resolveMarkdownRelativePath(markdownPath, source)

  if (!imagePath) {
    return null
  }

  try {
    return await importImageAssetFromPath(imagePath)
  } catch {
    return null
  }
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

export async function readAssetBytesFromUrl(assetId: string): Promise<Uint8Array> {
  const response = await fetch(await getAssetUrl(assetId))

  if (!response.ok) {
    throw new Error(`无法读取文件资源（${response.status}）`)
  }

  return new Uint8Array(await response.arrayBuffer())
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

function resolveMarkdownRelativePath(markdownPath: string | undefined, source: string) {
  const normalizedSource = source.trim()

  if (
    !markdownPath ||
    !normalizedSource ||
    /^(?:[a-z][a-z0-9+.-]*:|[\\/])\/\//i.test(normalizedSource) ||
    /^[\\/]/.test(normalizedSource) ||
    /^[a-z]:[\\/]/i.test(normalizedSource)
  ) {
    return null
  }

  const separator = markdownPath.includes('\\') ? '\\' : '/'
  const pathParts = markdownPath.split(/[\\/]+/).slice(0, -1)

  for (const part of normalizedSource.split(/[\\/]+/)) {
    if (!part || part === '.') {
      continue
    }

    if (part === '..') {
      if (pathParts.length > 1) {
        pathParts.pop()
      }
      continue
    }

    pathParts.push(part)
  }

  return pathParts.join(separator)
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
