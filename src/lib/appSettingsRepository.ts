import type { AppSettings } from '../domain/types'
import { normalizeAppAccentTheme } from '../domain/theme'
import { isDesktopRuntime } from './fileAccess'
import { createTauriStorageClient, type WorkspaceStorageClient } from './storageClient'

const BROWSER_APP_SETTINGS_STORAGE_KEY = 'zhixi.app.settings.v1'

export interface AppSettingsRepository {
  load(): Promise<AppSettings | null>
  save(settings: AppSettings): Promise<void>
}

interface CreateAppSettingsRepositoryOptions {
  client?: WorkspaceStorageClient
  isDesktop?: boolean
}

function normalizeAppSettings(settings: AppSettings | null | undefined): AppSettings {
  return {
    closeAction: settings?.closeAction === 'quit' ? 'quit' : 'hide_to_tray',
    accentTheme: normalizeAppAccentTheme(settings?.accentTheme),
  }
}

export function createAppSettingsRepository({
  client,
  isDesktop = isDesktopRuntime(),
}: CreateAppSettingsRepositoryOptions = {}): AppSettingsRepository {
  if (!isDesktop) {
    return {
      async load() {
        const raw = window.localStorage.getItem(BROWSER_APP_SETTINGS_STORAGE_KEY)
        if (!raw) {
          return normalizeAppSettings(null)
        }

        try {
          return normalizeAppSettings(JSON.parse(raw) as AppSettings)
        } catch {
          return normalizeAppSettings(null)
        }
      },
      async save(settings) {
        window.localStorage.setItem(
          BROWSER_APP_SETTINGS_STORAGE_KEY,
          JSON.stringify(normalizeAppSettings(settings)),
        )
      },
    }
  }

  const resolvedClient = client ?? createTauriStorageClient()

  return {
    async load() {
      return normalizeAppSettings(await resolvedClient.loadAppSettings())
    },
    save(settings) {
      return resolvedClient.saveAppSettings(normalizeAppSettings(settings))
    },
  }
}
