import { afterEach, describe, expect, it, vi } from 'vitest'
import { openExternalLink } from './externalLinks'

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
  isTauri: vi.fn(() => false),
}))

describe('openExternalLink', () => {
  afterEach(async () => {
    vi.restoreAllMocks()
    const tauriApi = await import('@tauri-apps/api/core')
    vi.mocked(tauriApi.isTauri).mockReturnValue(false)
  })

  it('opens links through a Tauri command in the desktop app', async () => {
    const tauriApi = await import('@tauri-apps/api/core')
    vi.mocked(tauriApi.isTauri).mockReturnValue(true)

    await openExternalLink('https://example.com')

    expect(tauriApi.invoke).toHaveBeenCalledWith('open_external_url', {
      url: 'https://example.com',
    })
  })

  it('falls back to a new browser tab outside Tauri', async () => {
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null)

    await openExternalLink('https://example.com')

    expect(openSpy).toHaveBeenCalledWith('https://example.com', '_blank', 'noopener,noreferrer')
  })
})
