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
      autoBackup: {
        enabled: true,
        intervalMinutes: 15,
        retentionCount: 14,
      },
    })
  })

  it('falls back to automatic backup defaults when persisted interval or retention is invalid', async () => {
    window.localStorage.setItem(
      'zhiqi.app.settings.v1',
      JSON.stringify({
        autoBackup: {
          enabled: false,
          intervalMinutes: 20,
          retentionCount: 10,
        },
      }),
    )
    const repository = createAppSettingsRepository({ isDesktop: false })

    await expect(repository.load()).resolves.toMatchObject({
      autoBackup: {
        enabled: false,
        intervalMinutes: 15,
        retentionCount: 14,
      },
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
      autoBackup: {
        enabled: true,
        intervalMinutes: 15,
        retentionCount: 14,
      },
      mcp: {
        enabled: true,
        port: 38472,
        token: 'test-token',
      },
    })
  })
})
