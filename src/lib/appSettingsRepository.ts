import type { AppSettings, McpSettings } from '../domain/types'
import { normalizeAppAccentTheme } from '../domain/theme'
import { isDesktopRuntime } from './fileAccess'
import { createTauriStorageClient, type WorkspaceStorageClient } from './storageClient'

const BROWSER_APP_SETTINGS_STORAGE_KEY = 'zhixi.app.settings.v1'

export interface AppSettingsRepository {
  load(): Promise<AppSettings | null>
  save(settings: AppSettings): Promise<void>
  enableLocalMcp(): Promise<McpSettings>
  disableLocalMcp(): Promise<void>
  regenerateLocalMcpToken(): Promise<McpSettings>
}

interface CreateAppSettingsRepositoryOptions {
  client?: WorkspaceStorageClient
  isDesktop?: boolean
}

function normalizeAppSettings(settings: AppSettings | null | undefined): AppSettings {
  return {
    closeAction: settings?.closeAction === 'quit' ? 'quit' : 'hide_to_tray',
    accentTheme: normalizeAppAccentTheme(settings?.accentTheme),
    ...(normalizeMcpSettings(settings?.mcp) ? { mcp: normalizeMcpSettings(settings?.mcp) } : {}),
  }
}

function normalizeMcpSettings(settings: AppSettings['mcp']) {
  return settings && Number.isInteger(settings.port) && settings.port >= 1024 && settings.port <= 65535 && settings.token
    ? settings
    : undefined
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
      async enableLocalMcp() {
        throw new Error('Local MCP requires the desktop app')
      },
      async disableLocalMcp() {
        throw new Error('Local MCP requires the desktop app')
      },
      async regenerateLocalMcpToken() {
        throw new Error('Local MCP requires the desktop app')
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
    enableLocalMcp() {
      return resolvedClient.enableLocalMcp()
    },
    disableLocalMcp() {
      return resolvedClient.disableLocalMcp()
    },
    regenerateLocalMcpToken() {
      return resolvedClient.regenerateLocalMcpToken()
    },
  }
}
