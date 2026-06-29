import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  isDesktopRuntime,
  openBinaryFile,
  openTextFile,
  saveBinaryFile,
  saveTextFile,
} from './fileAccess'

vi.mock('@tauri-apps/plugin-dialog', () => ({
  open: vi.fn(),
  save: vi.fn(),
}))

vi.mock('@tauri-apps/plugin-fs', () => ({
  readFile: vi.fn(),
  readTextFile: vi.fn(),
  writeFile: vi.fn(),
  writeTextFile: vi.fn(),
}))

describe('fileAccess', () => {
  afterEach(() => {
    vi.clearAllMocks()
    vi.restoreAllMocks()
    Reflect.deleteProperty(globalThis, '__TAURI_INTERNALS__')
  })

  it('detects the Tauri runtime from the global marker', () => {
    expect(isDesktopRuntime()).toBe(false)

    Object.defineProperty(globalThis, '__TAURI_INTERNALS__', {
      configurable: true,
      value: {},
    })

    expect(isDesktopRuntime()).toBe(true)
  })

  it('writes text files through Tauri when running on desktop', async () => {
    Object.defineProperty(globalThis, '__TAURI_INTERNALS__', {
      configurable: true,
      value: {},
    })

    const dialog = await import('@tauri-apps/plugin-dialog')
    const fs = await import('@tauri-apps/plugin-fs')
    vi.mocked(dialog.save).mockResolvedValue('/tmp/backup.json')

    await saveTextFile({
      defaultPath: 'backup.json',
      contents: '{"pages":[]}',
      filters: [{ name: 'JSON', extensions: ['json'] }],
    })

    expect(dialog.save).toHaveBeenCalledWith({
      defaultPath: 'backup.json',
      filters: [{ name: 'JSON', extensions: ['json'] }],
    })
    expect(fs.writeTextFile).toHaveBeenCalledWith('/tmp/backup.json', '{"pages":[]}')
  })

  it('does not write text files when a Tauri save dialog is cancelled', async () => {
    Object.defineProperty(globalThis, '__TAURI_INTERNALS__', {
      configurable: true,
      value: {},
    })

    const dialog = await import('@tauri-apps/plugin-dialog')
    const fs = await import('@tauri-apps/plugin-fs')
    vi.mocked(dialog.save).mockResolvedValue(null)

    await saveTextFile({
      defaultPath: 'backup.json',
      contents: '{"pages":[]}',
      filters: [{ name: 'JSON', extensions: ['json'] }],
    })

    expect(fs.writeTextFile).not.toHaveBeenCalled()
  })

  it('reads text files through Tauri when running on desktop', async () => {
    Object.defineProperty(globalThis, '__TAURI_INTERNALS__', {
      configurable: true,
      value: {},
    })

    const dialog = await import('@tauri-apps/plugin-dialog')
    const fs = await import('@tauri-apps/plugin-fs')
    vi.mocked(dialog.open).mockResolvedValue('/tmp/backup.json')
    vi.mocked(fs.readTextFile).mockResolvedValue('{"pages":[]}')

    const result = await openTextFile({
      filters: [{ name: 'JSON', extensions: ['json'] }],
    })

    expect(dialog.open).toHaveBeenCalledWith({
      multiple: false,
      directory: false,
      filters: [{ name: 'JSON', extensions: ['json'] }],
    })
    expect(result).toEqual({
      name: 'backup.json',
      contents: '{"pages":[]}',
    })
  })

  it('writes binary files through Tauri when running on desktop', async () => {
    Object.defineProperty(globalThis, '__TAURI_INTERNALS__', {
      configurable: true,
      value: {},
    })

    const dialog = await import('@tauri-apps/plugin-dialog')
    const fs = await import('@tauri-apps/plugin-fs')
    const bytes = new Uint8Array([80, 75, 3, 4])
    vi.mocked(dialog.save).mockResolvedValue('/tmp/page.zip')

    await saveBinaryFile({
      defaultPath: 'page.zip',
      contents: bytes,
      filters: [{ name: 'ZIP', extensions: ['zip'] }],
    })

    expect(fs.writeFile).toHaveBeenCalledWith('/tmp/page.zip', bytes)
  })

  it('reads binary files through Tauri when running on desktop', async () => {
    Object.defineProperty(globalThis, '__TAURI_INTERNALS__', {
      configurable: true,
      value: {},
    })

    const dialog = await import('@tauri-apps/plugin-dialog')
    const fs = await import('@tauri-apps/plugin-fs')
    const bytes = new Uint8Array([80, 75, 3, 4])
    vi.mocked(dialog.open).mockResolvedValue('/tmp/page.zip')
    vi.mocked(fs.readFile).mockResolvedValue(bytes)

    const result = await openBinaryFile({
      filters: [{ name: 'ZIP', extensions: ['zip'] }],
    })

    expect(result).toEqual({
      name: 'page.zip',
      contents: bytes,
    })
  })

  it('downloads text files in the browser runtime', async () => {
    const anchor = document.createElement('a')
    const click = vi.fn()
    const createObjectUrl = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:test')
    const revokeObjectUrl = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined)
    const createElement = vi.spyOn(document, 'createElement').mockImplementation((tagName) => {
      if (tagName === 'a') {
        anchor.click = click
        return anchor
      }

      return document.createElement(tagName)
    })

    await saveTextFile({
      defaultPath: 'backup.json',
      contents: '{"pages":[]}',
      filters: [{ name: 'JSON', extensions: ['json'] }],
    })

    expect(createElement).toHaveBeenCalledWith('a')
    expect(createObjectUrl).toHaveBeenCalled()
    expect(anchor.download).toBe('backup.json')
    expect(anchor.href).toBe('blob:test')
    expect(click).toHaveBeenCalledTimes(1)

    await new Promise((resolve) => window.setTimeout(resolve, 0))
    expect(revokeObjectUrl).toHaveBeenCalledWith('blob:test')
  })

  it('opens text files with an input in the browser runtime', async () => {
    const input = document.createElement('input')
    const file = new File(['{"pages":[]}'], 'backup.json', { type: 'application/json' })
    const originalCreateElement = document.createElement.bind(document)

    vi.spyOn(document, 'createElement').mockImplementation((tagName) => {
      if (tagName === 'input') {
        input.click = () => {
          Object.defineProperty(input, 'files', {
            configurable: true,
            value: [file],
          })
          input.dispatchEvent(new Event('change'))
        }
        return input
      }

      return originalCreateElement(tagName)
    })

    const result = await openTextFile({
      filters: [{ name: 'JSON', extensions: ['json'] }],
    })

    expect(input.type).toBe('file')
    expect(input.accept).toBe('.json')
    expect(result).toEqual({
      name: 'backup.json',
      contents: '{"pages":[]}',
    })
  })
})
