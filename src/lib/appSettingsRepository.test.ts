import { beforeEach, describe, expect, it } from 'vitest'
import { createAppSettingsRepository } from './appSettingsRepository'

describe('appSettingsRepository', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  it('returns normalized defaults when browser storage is empty', async () => {
    const repository = createAppSettingsRepository({ isDesktop: false })

    await expect(repository.load()).resolves.toEqual({
      closeAction: 'hide_to_tray',
      accentTheme: 'blue_gray',
    })
  })

  it('persists browser app settings as a standalone document', async () => {
    const repository = createAppSettingsRepository({ isDesktop: false })

    await repository.save({
      closeAction: 'quit',
      accentTheme: 'violet',
      mcp: {
        enabled: true,
        port: 38472,
        token: 'test-token',
      },
    })

    await expect(repository.load()).resolves.toEqual({
      closeAction: 'quit',
      accentTheme: 'violet',
      mcp: {
        enabled: true,
        port: 38472,
        token: 'test-token',
      },
    })
  })
})
