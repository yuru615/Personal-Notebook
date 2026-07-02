export interface FileAccessFilter {
  name: string
  extensions: string[]
}

export interface OpenTextFileOptions {
  filters: FileAccessFilter[]
}

export interface OpenBinaryFileOptions {
  filters: FileAccessFilter[]
}

export interface OpenLocalFilePathOptions {
  filters: FileAccessFilter[]
}

export interface SaveTextFileOptions {
  defaultPath: string
  contents: string
  filters: FileAccessFilter[]
}

export interface SaveBinaryFileOptions {
  defaultPath: string
  contents: Blob | Uint8Array
  filters: FileAccessFilter[]
}

export interface PickSaveFilePathOptions {
  defaultPath: string
  filters: FileAccessFilter[]
}

export interface OpenedTextFile {
  name: string
  contents: string
}

export interface OpenedBinaryFile {
  name: string
  contents: Uint8Array
  file?: File
}

export interface OpenedLocalFilePath {
  name: string
  path: string
}

type TauriPath = string | string[] | null

export function isDesktopRuntime() {
  return Boolean(
    Reflect.get(globalThis, '__TAURI_INTERNALS__') || Reflect.get(globalThis, 'isTauri'),
  )
}

export async function saveTextFile(options: SaveTextFileOptions) {
  if (isDesktopRuntime()) {
    const path = await pickSavePath(options.defaultPath, options.filters)

    if (!path) {
      return
    }

    const { writeTextFile } = await import('@tauri-apps/plugin-fs')
    await writeTextFile(path, options.contents)
    return
  }

  downloadBlob(
    new Blob([options.contents], { type: 'application/json;charset=utf-8' }),
    options.defaultPath,
  )
}

export async function saveBinaryFile(options: SaveBinaryFileOptions) {
  if (isDesktopRuntime()) {
    const path = await pickSaveFilePath(options)

    if (!path) {
      return
    }

    const { writeFile } = await import('@tauri-apps/plugin-fs')
    await writeFile(path, await toUint8Array(options.contents))
    return
  }

  downloadBlob(
    options.contents instanceof Blob
      ? options.contents
      : new Blob([toOwnedArrayBuffer(options.contents)]),
    options.defaultPath,
  )
}

export async function pickSaveFilePath(options: PickSaveFilePathOptions) {
  if (!isDesktopRuntime()) {
    return null
  }

  return pickSavePath(options.defaultPath, options.filters)
}

export async function openTextFile(options: OpenTextFileOptions) {
  if (isDesktopRuntime()) {
    const path = await pickOpenPath(options.filters)

    if (!path) {
      return null
    }

    const { readTextFile } = await import('@tauri-apps/plugin-fs')
    return {
      name: fileNameFromPath(path),
      contents: await readTextFile(path),
    }
  }

  const file = await pickBrowserFile(options.filters)

  if (!file) {
    return null
  }

  return {
    name: file.name,
    contents: await file.text(),
  }
}

export async function openBinaryFile(options: OpenBinaryFileOptions) {
  if (isDesktopRuntime()) {
    const path = await pickOpenPath(options.filters)

    if (!path) {
      return null
    }

    const { readFile } = await import('@tauri-apps/plugin-fs')
    return {
      name: fileNameFromPath(path),
      contents: await readFile(path),
    }
  }

  const file = await pickBrowserFile(options.filters)

  if (!file) {
    return null
  }

  return {
    name: file.name,
    contents: new Uint8Array(await file.arrayBuffer()),
    file,
  }
}

export async function openLocalFilePath(options: OpenLocalFilePathOptions) {
  if (!isDesktopRuntime()) {
    return null
  }

  const path = await pickOpenPath(options.filters)

  if (!path) {
    return null
  }

  return {
    name: fileNameFromPath(path),
    path,
  }
}

async function pickSavePath(defaultPath: string, filters: FileAccessFilter[]) {
  const { save } = await import('@tauri-apps/plugin-dialog')
  return normalizeTauriPath(await save({ defaultPath, filters }))
}

async function pickOpenPath(filters: FileAccessFilter[]) {
  const { open } = await import('@tauri-apps/plugin-dialog')
  return normalizeTauriPath(await open({ multiple: false, directory: false, filters }))
}

function normalizeTauriPath(path: TauriPath) {
  if (Array.isArray(path)) {
    return path[0] ?? null
  }

  return path
}

function fileNameFromPath(path: string) {
  return path.split(/[\\/]/).pop() || path
}

function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = fileName
  anchor.click()
  window.setTimeout(() => {
    URL.revokeObjectURL(url)
  }, 0)
}

function pickBrowserFile(filters: FileAccessFilter[]) {
  return new Promise<File | null>((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = filters
      .flatMap((filter) => filter.extensions.map((extension) => `.${extension}`))
      .join(',')

    input.addEventListener(
      'change',
      () => {
        resolve(input.files?.[0] ?? null)
      },
      { once: true },
    )

    input.click()
  })
}

async function toUint8Array(contents: Blob | Uint8Array) {
  if (contents instanceof Uint8Array) {
    return contents
  }

  return new Uint8Array(await contents.arrayBuffer())
}

export function openedBinaryFileToFile(openedFile: OpenedBinaryFile, type: string) {
  return (
    openedFile.file ??
    new File([toOwnedArrayBuffer(openedFile.contents)], openedFile.name, { type })
  )
}

function toOwnedArrayBuffer(bytes: Uint8Array) {
  const copy = new Uint8Array(bytes.byteLength)
  copy.set(bytes)
  return copy.buffer
}
