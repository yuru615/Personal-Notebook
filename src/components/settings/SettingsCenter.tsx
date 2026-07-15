import { useEffect, useMemo, useRef, useState } from 'react'
import type {
  AppCloseAction,
  AppSettings,
  BlockSelectionStartMode,
  ExternalLinkOpenMode,
  PageDisplayDefaults,
  SearchPreferences,
  WorkspaceSettings,
} from '../../domain/types'
import { appAccentThemeOptions, type AppAccentTheme } from '../../domain/theme'
import { useOptionalAccount } from '../../app/accountContext'

export type SettingsSectionKey =
  | 'account'
  | 'general'
  | 'appearance_sidebar'
  | 'editing_page_defaults'
  | 'search_knowledge'
  | 'import_export'
  | 'desktop'
  | 'data_maintenance'
  | 'experimental'

export const DEFAULT_SETTINGS_SECTION: SettingsSectionKey = 'general'
export type LocalMcpOperation = 'idle' | 'enabling' | 'disabling' | 'regenerating'
export interface LocalMcpOperationFailure {
  operation: Exclude<LocalMcpOperation, 'idle'>
  error: unknown
}

const SETTINGS_SECTIONS: Array<{ key: SettingsSectionKey; label: string }> = [
  { key: 'account', label: '账号' },
  { key: 'general', label: '通用' },
  { key: 'appearance_sidebar', label: '外观与侧边栏' },
  { key: 'editing_page_defaults', label: '编辑与页面默认' },
  { key: 'search_knowledge', label: '搜索与知识组织' },
  { key: 'import_export', label: '导入导出' },
  { key: 'desktop', label: '桌面端' },
  { key: 'data_maintenance', label: '数据与维护' },
  { key: 'experimental', label: '实验功能' },
]

// eslint-disable-next-line react-refresh/only-export-components
export function normalizeSettingsSection(section: string | undefined): SettingsSectionKey {
  return SETTINGS_SECTIONS.some((item) => item.key === section)
    ? (section as SettingsSectionKey)
    : DEFAULT_SETTINGS_SECTION
}

export interface SettingsCenterProps {
  activeSection: SettingsSectionKey
  appSettings: AppSettings
  localMcpOperation: LocalMcpOperation
  localMcpOperationError: LocalMcpOperationFailure | null
  workspaceSettings: WorkspaceSettings
  onSectionChange: (section: SettingsSectionKey) => void
  onSetPageDefaults: (defaults: Partial<PageDisplayDefaults>) => void | Promise<void>
  onSetAppCloseAction: (closeAction: AppCloseAction) => void | Promise<void>
  onSetAppAccentTheme: (theme: AppAccentTheme) => void | Promise<void>
  onEnableLocalMcp: () => Promise<void>
  onDisableLocalMcp: () => Promise<void>
  onRegenerateLocalMcpToken: () => Promise<void>
  onSetSidebarLayout: (layout: NonNullable<WorkspaceSettings['sidebarLayout']>) => void | Promise<void>
  onSetSidebarWidth: (width: number) => void | Promise<void>
  onSetClipboardCaptureMode: (
    mode: NonNullable<WorkspaceSettings['clipboardCaptureMode']>,
  ) => void | Promise<void>
  onSetBlockSelectionStartMode: (mode: BlockSelectionStartMode) => void | Promise<void>
  onSetLinkOpenMode: (mode: ExternalLinkOpenMode) => void | Promise<void>
  onSetSearchPreferences: (preferences: Partial<SearchPreferences>) => void | Promise<void>
  onExportWorkspace: () => void | Promise<void>
  onImportWorkspace: () => void | Promise<void>
  onImportArchive: () => void | Promise<void>
  onImportMarkdown: () => void | Promise<void>
  onCleanupOrphanBoards: () => void | Promise<void>
  onCleanupOrphanDataTables: () => void | Promise<void>
  onCleanupOrphanAssets: () => void | Promise<void>
  onOpenInbox: () => void | Promise<void>
  onBackToWorkspace: () => void | Promise<void>
}

function normalizePageDefaults(defaults: WorkspaceSettings['pageDefaults']): PageDisplayDefaults {
  return {
    isFullWidth: defaults?.isFullWidth === true,
    isSmallText: defaults?.isSmallText === true,
    fontFamily:
      defaults?.fontFamily === 'serif' || defaults?.fontFamily === 'mono'
        ? defaults.fontFamily
        : 'default',
    showOutline: defaults?.showOutline !== false,
    showProperties: defaults?.showProperties === true,
  }
}

function normalizeSearchPreferences(
  preferences: WorkspaceSettings['searchPreferences'],
): SearchPreferences {
  return {
    groupResults: preferences?.groupResults !== false,
    showSourceLabels: preferences?.showSourceLabels !== false,
    excerptLength:
      preferences?.excerptLength === 'short' || preferences?.excerptLength === 'long'
        ? preferences.excerptLength
        : 'medium',
  }
}

function getSidebarWidthMax() {
  if (typeof window === 'undefined') {
    return 360
  }

  return Math.max(220, Math.round(window.innerWidth / 4))
}

function serializeLocalMcpConfig(mcp: NonNullable<AppSettings['mcp']>) {
  return JSON.stringify({
    mcpServers: {
      zhixi: {
        type: 'streamableHttp',
        url: `http://127.0.0.1:${mcp.port}/mcp`,
        headers: { Authorization: `Bearer ${mcp.token}` },
      },
    },
  })
}

function getLocalMcpOperationError(error: unknown, nextEnabled: boolean) {
  let code = ''
  let message = ''

  if (error instanceof Error) {
    message = error.message
  } else if (typeof error === 'string') {
    message = error
  } else if (error && typeof error === 'object') {
    const record = error as { code?: unknown; message?: unknown }
    code = typeof record.code === 'string' ? record.code : ''
    message = typeof record.message === 'string' ? record.message : ''
  }

  if (/requires the desktop app|desktop[-_ ]only|仅支持.*桌面/i.test(message)) {
    return '本机 MCP 仅支持知栖桌面版，请在桌面应用中重试。'
  }

  const action = nextEnabled ? '启用' : '停用'
  const hasPortInUseMessage =
    /port(?: is)? (?:busy|in use)|address already in use|only one usage of each socket address|os error (?:48|98|10048)\b|端口(?:已被|被|已|正被|正在被)?占用/i.test(
      message,
    )
  const isPortInUse =
    (code === 'io_error' || code === '') && hasPortInUseMessage

  if (isPortInUse) {
    return `${action}失败，请检查端口是否被占用，然后重试。`
  }

  return `${action}失败，请稍后重试。`
}

export function SettingsCenter({
  activeSection,
  appSettings,
  localMcpOperation: mcpOperation,
  localMcpOperationError: mcpOperationError,
  workspaceSettings,
  onSectionChange,
  onSetPageDefaults,
  onSetAppCloseAction,
  onSetAppAccentTheme,
  onEnableLocalMcp,
  onDisableLocalMcp,
  onRegenerateLocalMcpToken,
  onSetSidebarLayout,
  onSetSidebarWidth,
  onSetClipboardCaptureMode,
  onSetBlockSelectionStartMode,
  onSetLinkOpenMode,
  onSetSearchPreferences,
  onExportWorkspace,
  onImportWorkspace,
  onImportArchive,
  onImportMarkdown,
  onCleanupOrphanBoards,
  onCleanupOrphanDataTables,
  onCleanupOrphanAssets,
  onOpenInbox,
  onBackToWorkspace,
}: SettingsCenterProps) {
  const account = useOptionalAccount()
  const [currentSection, setCurrentSection] = useState(activeSection)
  const [isLoggingOut, setIsLoggingOut] = useState(false)
  const [logoutError, setLogoutError] = useState('')

  useEffect(() => {
    setCurrentSection(activeSection)
  }, [activeSection])

  const pageDefaults = useMemo(
    () => normalizePageDefaults(workspaceSettings.pageDefaults),
    [workspaceSettings.pageDefaults],
  )
  const sidebarLayout = workspaceSettings.sidebarLayout ?? 'compact'
  const sidebarWidth = workspaceSettings.sidebarWidth ?? 272
  const [draftSidebarWidth, setDraftSidebarWidth] = useState(sidebarWidth)
  const pendingSidebarWidthRef = useRef<number | null>(null)
  const clipboardCaptureMode = workspaceSettings.clipboardCaptureMode ?? 'off'
  const blockSelectionStartMode = workspaceSettings.blockSelectionStartMode ?? 'safe_zone_only'
  const linkOpenMode = workspaceSettings.linkOpenMode === 'direct' ? 'direct' : 'modifier'
  const searchPreferences = useMemo(
    () => normalizeSearchPreferences(workspaceSettings.searchPreferences),
    [workspaceSettings.searchPreferences],
  )
  const closeAction = appSettings.closeAction === 'quit' ? 'quit' : 'hide_to_tray'
  const accentTheme = appSettings.accentTheme ?? 'blue_gray'
  const localMcp = appSettings.mcp
  const [mcpCopyStatus, setMcpCopyStatus] = useState<
    'idle' | 'copying' | 'copied' | 'error'
  >('idle')
  const mcpCopyPendingRef = useRef(false)
  const mcpCopyVersionRef = useRef(0)
  const mcpOperationPendingRef = useRef(false)
  const mcpOperationVersionRef = useRef(0)

  useEffect(() => {
    setDraftSidebarWidth(sidebarWidth)
    pendingSidebarWidthRef.current = null
  }, [sidebarWidth])

  useEffect(() => {
    mcpCopyVersionRef.current += 1
    mcpCopyPendingRef.current = false
    mcpOperationVersionRef.current += 1
    mcpOperationPendingRef.current = false
    setMcpCopyStatus('idle')
  }, [localMcp?.enabled, localMcp?.port, localMcp?.token])

  function openSection(section: SettingsSectionKey) {
    setCurrentSection(section)
    onSectionChange(section)
  }

  async function commitSidebarWidth(nextWidth: number) {
    const normalizedWidth = Math.round(nextWidth)

    if (
      normalizedWidth === sidebarWidth ||
      pendingSidebarWidthRef.current === normalizedWidth
    ) {
      return
    }

    pendingSidebarWidthRef.current = normalizedWidth

    try {
      await onSetSidebarWidth(normalizedWidth)
    } catch {
      if (pendingSidebarWidthRef.current === normalizedWidth) {
        pendingSidebarWidthRef.current = null
      }
    }
  }

  async function copyLocalMcpConfig() {
    if (mcpCopyPendingRef.current) {
      return
    }

    if (!localMcp?.enabled || !navigator.clipboard) {
      setMcpCopyStatus('error')
      return
    }

    mcpCopyPendingRef.current = true
    const copyVersion = ++mcpCopyVersionRef.current
    setMcpCopyStatus('copying')

    try {
      await navigator.clipboard.writeText(serializeLocalMcpConfig(localMcp))
      if (mcpCopyVersionRef.current === copyVersion) {
        setMcpCopyStatus('copied')
      }
    } catch {
      if (mcpCopyVersionRef.current === copyVersion) {
        setMcpCopyStatus('error')
      }
    } finally {
      if (mcpCopyVersionRef.current === copyVersion) {
        mcpCopyPendingRef.current = false
      }
    }
  }

  async function toggleLocalMcp(nextEnabled: boolean) {
    if (mcpOperationPendingRef.current || mcpOperation !== 'idle') {
      return
    }

    mcpOperationPendingRef.current = true
    const operationVersion = ++mcpOperationVersionRef.current

    try {
      await (nextEnabled ? onEnableLocalMcp() : onDisableLocalMcp())
    } catch {
      // The stable parent operation state carries the visible error.
    } finally {
      if (mcpOperationVersionRef.current === operationVersion) {
        mcpOperationPendingRef.current = false
      }
    }
  }

  async function regenerateLocalMcpToken() {
    if (mcpOperationPendingRef.current || mcpOperation !== 'idle') {
      return
    }
    if (!window.confirm('重新生成后，已配置的 AI 客户端需要粘贴新的 MCP 配置。是否继续？')) {
      return
    }

    mcpOperationPendingRef.current = true
    const operationVersion = ++mcpOperationVersionRef.current
    try {
      await onRegenerateLocalMcpToken()
    } catch {
      // The stable parent operation state carries the visible error.
    } finally {
      if (mcpOperationVersionRef.current === operationVersion) {
        mcpOperationPendingRef.current = false
      }
    }
  }

  return (
    <div className="settings-center">
      <aside className="settings-center-nav" aria-label="设置分类">
        <button
          type="button"
          className="settings-action-button settings-back-button"
          onClick={() => {
            void onBackToWorkspace()
          }}
        >
          返回工作区
        </button>
        <h1 className="settings-center-title">设置中心</h1>
        <div className="settings-center-nav-list">
          {SETTINGS_SECTIONS.map((section) => (
            <button
              key={section.key}
              type="button"
              className={
                section.key === currentSection
                  ? 'settings-center-nav-item settings-center-nav-item-active'
                  : 'settings-center-nav-item'
              }
              aria-pressed={section.key === currentSection}
              onClick={() => openSection(section.key)}
            >
              {section.label}
            </button>
          ))}
        </div>
      </aside>

      <section className="settings-center-panel">
        {currentSection === 'account' && account ? (
          <div className="settings-section-stack">
            <section className="settings-section">
              <h2 className="settings-section-title">账号</h2>
              <p className="settings-section-description">当前设备的知栖账号与会话状态。</p>
              <div className="settings-card">
                <div className="settings-card-row">
                  <div>
                    <div className="settings-card-label">QQ 邮箱</div>
                    <div className="settings-card-help">{account.session.user.email}</div>
                  </div>
                  <span
                    className={
                      account.session.connectivity === 'offline'
                        ? 'account-status-badge account-status-offline'
                        : 'account-status-badge'
                    }
                  >
                    {account.session.connectivity === 'offline' ? '离线可用' : '在线'}
                  </span>
                </div>
                <div className="settings-card-divider" />
                <div className="settings-card-row">
                  <div>
                    <div className="settings-card-label">登录有效期</div>
                    <div className="settings-card-help">
                      {formatAccountExpiry(account.session.expiresAt)}
                    </div>
                  </div>
                </div>
                <div className="settings-card-divider" />
                <div className="settings-card-row">
                  <div>
                    <div className="settings-card-label">退出登录</div>
                    <div className="settings-card-help">本地知识库不会被删除或上传。</div>
                    {logoutError ? <div className="settings-inline-error">{logoutError}</div> : null}
                  </div>
                  <button
                    type="button"
                    className="settings-action-button settings-action-danger"
                    disabled={isLoggingOut}
                    onClick={() => {
                      if (isLoggingOut) return
                      setIsLoggingOut(true)
                      setLogoutError('')
                      void account.logout().catch(() => {
                        setLogoutError('退出失败，请稍后重试。')
                        setIsLoggingOut(false)
                      })
                    }}
                  >
                    {isLoggingOut ? '正在退出...' : '退出登录'}
                  </button>
                </div>
              </div>
            </section>
          </div>
        ) : null}

        {currentSection === 'general' ? (
          <div className="settings-section-stack">
            <section className="settings-section">
              <h2 className="settings-section-title">通用</h2>
              <p className="settings-section-description">把常用入口和默认捕获方式收在一起。</p>
              <div className="settings-card">
                <div className="settings-card-row">
                  <div>
                    <div className="settings-card-label">收件箱</div>
                    <div className="settings-card-help">快速打开默认收件入口。</div>
                  </div>
                  <button
                    type="button"
                    className="settings-action-button"
                    onClick={() => {
                      void onOpenInbox()
                    }}
                  >
                    打开收件箱
                  </button>
                </div>
                <div className="settings-card-divider" />
                <div className="settings-card-field">
                  <div className="settings-card-label">剪贴板捕获</div>
                  <div className="settings-choice-group">
                    <button
                      type="button"
                      className="settings-choice-button"
                      aria-pressed={clipboardCaptureMode === 'off'}
                      onClick={() => {
                        void onSetClipboardCaptureMode('off')
                      }}
                    >
                      关闭
                    </button>
                    <button
                      type="button"
                      className="settings-choice-button"
                      aria-pressed={clipboardCaptureMode === 'prompt_to_inbox'}
                      onClick={() => {
                        void onSetClipboardCaptureMode('prompt_to_inbox')
                      }}
                    >
                      复制后提示收进收件箱
                    </button>
                  </div>
                </div>
              </div>
            </section>
          </div>
        ) : null}

        {currentSection === 'appearance_sidebar' ? (
          <div className="settings-section-stack">
            <section className="settings-section">
              <h2 className="settings-section-title">外观与侧边栏</h2>
              <div className="settings-card">
                <div className="settings-card-field">
                  <div className="settings-card-label">界面强调色</div>
                  <div className="settings-theme-choice-group" role="group" aria-label="界面强调色">
                    {appAccentThemeOptions.map((theme) => (
                      <button
                        key={theme.value}
                        type="button"
                        className="settings-theme-choice"
                        data-accent-theme={theme.value}
                        aria-pressed={accentTheme === theme.value}
                        onClick={() => {
                          void onSetAppAccentTheme(theme.value)
                        }}
                      >
                        <span aria-hidden="true" />
                        {theme.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="settings-card-divider" />
                <div className="settings-card-field">
                  <div className="settings-card-label">侧边栏模式</div>
                  <div className="settings-choice-group">
                    <button
                      type="button"
                      className="settings-choice-button"
                      aria-pressed={sidebarLayout === 'compact'}
                      onClick={() => {
                        void onSetSidebarLayout('compact')
                      }}
                    >
                      紧凑模式
                    </button>
                    <button
                      type="button"
                      className="settings-choice-button"
                      aria-pressed={sidebarLayout === 'classic'}
                      onClick={() => {
                        void onSetSidebarLayout('classic')
                      }}
                    >
                      经典模式
                    </button>
                  </div>
                </div>
                <div className="settings-card-divider" />
                <label className="settings-card-field" htmlFor="settings-sidebar-width">
                  <div className="settings-card-label">侧边栏宽度</div>
                  <div className="settings-slider-row">
                    <input
                      id="settings-sidebar-width"
                      className="settings-slider"
                      type="range"
                      min={220}
                      max={getSidebarWidthMax()}
                      value={draftSidebarWidth}
                      onChange={(event) => {
                        setDraftSidebarWidth(Number(event.currentTarget.value))
                      }}
                      onMouseUp={(event) => {
                        void commitSidebarWidth(Number(event.currentTarget.value))
                      }}
                      onBlur={(event) => {
                        void commitSidebarWidth(Number(event.currentTarget.value))
                      }}
                      onKeyUp={(event) => {
                        void commitSidebarWidth(Number(event.currentTarget.value))
                      }}
                    />
                    <span className="settings-slider-value">{draftSidebarWidth}px</span>
                  </div>
                </label>
              </div>
            </section>
          </div>
        ) : null}

        {currentSection === 'editing_page_defaults' ? (
          <div className="settings-section-stack">
            <section className="settings-section">
              <h2 className="settings-section-title">编辑与页面默认</h2>
              <p className="settings-section-description">这些默认值只影响后续新建页面。</p>
              <div className="settings-card">
                <label className="settings-toggle-row">
                  <input
                    type="checkbox"
                    checked={pageDefaults.isFullWidth}
                    onChange={(event) => {
                      void onSetPageDefaults({ isFullWidth: event.currentTarget.checked })
                    }}
                  />
                  <span>新页面默认自适应正文宽度</span>
                </label>
                <label className="settings-toggle-row">
                  <input
                    type="checkbox"
                    checked={pageDefaults.isSmallText}
                    onChange={(event) => {
                      void onSetPageDefaults({ isSmallText: event.currentTarget.checked })
                    }}
                  />
                  <span>新页面默认小字号正文</span>
                </label>
                <label className="settings-toggle-row">
                  <input
                    type="checkbox"
                    checked={pageDefaults.showOutline}
                    onChange={(event) => {
                      void onSetPageDefaults({ showOutline: event.currentTarget.checked })
                    }}
                  />
                  <span>新页面默认显示目录</span>
                </label>
                <label className="settings-toggle-row">
                  <input
                    type="checkbox"
                    checked={pageDefaults.showProperties}
                    onChange={(event) => {
                      void onSetPageDefaults({ showProperties: event.currentTarget.checked })
                    }}
                  />
                  <span>新页面默认显示页面属性</span>
                </label>
                <div className="settings-card-divider" />
                <div className="settings-card-field">
                  <div className="settings-card-label">正文外链打开方式</div>
                  <div className="settings-choice-group">
                    <button
                      type="button"
                      className="settings-choice-button"
                      aria-pressed={linkOpenMode === 'modifier'}
                      onClick={() => {
                        void onSetLinkOpenMode('modifier')
                      }}
                    >
                      按 Ctrl 后打开外链
                    </button>
                    <button
                      type="button"
                      className="settings-choice-button"
                      aria-pressed={linkOpenMode === 'direct'}
                      onClick={() => {
                        void onSetLinkOpenMode('direct')
                      }}
                    >
                      点击直接打开外链
                    </button>
                  </div>
                </div>
                <div className="settings-card-divider" />
                <div className="settings-card-field">
                  <div className="settings-card-label">新页面默认字体</div>
                  <div className="settings-choice-group">
                    <button
                      type="button"
                      className="settings-choice-button"
                      aria-pressed={pageDefaults.fontFamily === 'default'}
                      onClick={() => {
                        void onSetPageDefaults({ fontFamily: 'default' })
                      }}
                    >
                      默认
                    </button>
                    <button
                      type="button"
                      className="settings-choice-button"
                      aria-pressed={pageDefaults.fontFamily === 'serif'}
                      onClick={() => {
                        void onSetPageDefaults({ fontFamily: 'serif' })
                      }}
                    >
                      衬线
                    </button>
                    <button
                      type="button"
                      className="settings-choice-button"
                      aria-pressed={pageDefaults.fontFamily === 'mono'}
                      onClick={() => {
                        void onSetPageDefaults({ fontFamily: 'mono' })
                      }}
                    >
                      等宽
                    </button>
                  </div>
                </div>
                <div className="settings-card-divider" />
                <div className="settings-card-field">
                  <div className="settings-card-label">框选起点</div>
                  <div className="settings-choice-group">
                    <button
                      type="button"
                      className="settings-choice-button"
                      aria-pressed={blockSelectionStartMode === 'safe_zone_only'}
                      onClick={() => {
                        void onSetBlockSelectionStartMode('safe_zone_only')
                      }}
                    >
                      仅在块左侧或空白处框选
                    </button>
                    <button
                      type="button"
                      className="settings-choice-button"
                      aria-pressed={blockSelectionStartMode === 'content_allowed'}
                      onClick={() => {
                        void onSetBlockSelectionStartMode('content_allowed')
                      }}
                    >
                      允许从正文区域直接框选
                    </button>
                  </div>
                </div>
              </div>
            </section>
          </div>
        ) : null}

        {currentSection === 'search_knowledge' ? (
          <div className="settings-section-stack">
            <section className="settings-section">
              <h2 className="settings-section-title">搜索与知识组织</h2>
              <p className="settings-section-description">调整搜索结果的展示方式，不动搜索索引本身。</p>
              <div className="settings-card">
                <label className="settings-toggle-row">
                  <input
                    type="checkbox"
                    checked={searchPreferences.groupResults}
                    onChange={(event) => {
                      void onSetSearchPreferences({ groupResults: event.currentTarget.checked })
                    }}
                  />
                  <span>按类型分组显示搜索结果</span>
                </label>
                <label className="settings-toggle-row">
                  <input
                    type="checkbox"
                    checked={searchPreferences.showSourceLabels}
                    onChange={(event) => {
                      void onSetSearchPreferences({
                        showSourceLabels: event.currentTarget.checked,
                      })
                    }}
                  />
                  <span>显示命中来源标签</span>
                </label>
                <div className="settings-card-divider" />
                <div className="settings-card-field">
                  <div className="settings-card-label">搜索摘要长度</div>
                  <div className="settings-choice-group">
                    <button
                      type="button"
                      className="settings-choice-button"
                      aria-pressed={searchPreferences.excerptLength === 'short'}
                      onClick={() => {
                        void onSetSearchPreferences({ excerptLength: 'short' })
                      }}
                    >
                      短摘要
                    </button>
                    <button
                      type="button"
                      className="settings-choice-button"
                      aria-pressed={searchPreferences.excerptLength === 'medium'}
                      onClick={() => {
                        void onSetSearchPreferences({ excerptLength: 'medium' })
                      }}
                    >
                      标准
                    </button>
                    <button
                      type="button"
                      className="settings-choice-button"
                      aria-pressed={searchPreferences.excerptLength === 'long'}
                      onClick={() => {
                        void onSetSearchPreferences({ excerptLength: 'long' })
                      }}
                    >
                      长摘要
                    </button>
                  </div>
                </div>
              </div>
            </section>
          </div>
        ) : null}

        {currentSection === 'import_export' ? (
          <div className="settings-section-stack">
            <section className="settings-section">
              <h2 className="settings-section-title">导入导出</h2>
              <div className="settings-card">
                <div className="settings-action-list">
                  <button
                    type="button"
                    className="settings-action-button"
                    onClick={() => {
                      void onExportWorkspace()
                    }}
                  >
                    全部导出
                  </button>
                  <button
                    type="button"
                    className="settings-action-button"
                    onClick={() => {
                      void onImportWorkspace()
                    }}
                  >
                    导入完整备份
                  </button>
                  <button
                    type="button"
                    className="settings-action-button"
                    onClick={() => {
                      void onImportArchive()
                    }}
                  >
                    导入页面包
                  </button>
                  <button
                    type="button"
                    className="settings-action-button"
                    onClick={() => {
                      void onImportMarkdown()
                    }}
                  >
                    导入 Markdown
                  </button>
                </div>
              </div>
            </section>
          </div>
        ) : null}

        {currentSection === 'desktop' ? (
          <div className="settings-section-stack">
            <section className="settings-section">
              <h2 className="settings-section-title">桌面端</h2>
              <div className="settings-card">
                <div className="settings-card-field">
                  <div className="settings-card-label">关闭窗口时</div>
                  <div className="settings-choice-group">
                    <button
                      type="button"
                      className="settings-choice-button"
                      aria-pressed={closeAction === 'hide_to_tray'}
                      onClick={() => {
                        void onSetAppCloseAction('hide_to_tray')
                      }}
                    >
                      最小化到托盘
                    </button>
                    <button
                      type="button"
                      className="settings-choice-button"
                      aria-pressed={closeAction === 'quit'}
                      onClick={() => {
                        void onSetAppCloseAction('quit')
                      }}
                    >
                      直接退出
                    </button>
                  </div>
                </div>
              </div>
            </section>
          </div>
        ) : null}

        {currentSection === 'data_maintenance' ? (
          <div className="settings-section-stack">
            <section className="settings-section">
              <h2 className="settings-section-title">数据与维护</h2>
              <div className="settings-card">
                <div className="settings-action-list">
                  <button
                    type="button"
                    className="settings-action-button"
                    onClick={() => {
                      void onCleanupOrphanBoards()
                    }}
                  >
                    清理孤立白板
                  </button>
                  <button
                    type="button"
                    className="settings-action-button"
                    onClick={() => {
                      void onCleanupOrphanDataTables()
                    }}
                  >
                    清理孤立数据表
                  </button>
                  <button
                    type="button"
                    className="settings-action-button"
                    onClick={() => {
                      void onCleanupOrphanAssets()
                    }}
                  >
                    清理孤立资源文件
                  </button>
                </div>
              </div>
            </section>
          </div>
        ) : null}

        {currentSection === 'experimental' ? (
          <div className="settings-section-stack">
            <section className="settings-section">
              <h2 className="settings-section-title">实验功能</h2>
              <div className="settings-card">
                <label className="settings-toggle-row">
                  <span>
                    <span className="settings-card-label">启用本机 MCP 接入</span>
                    <span className="settings-card-help">允许已授权的本机 AI 客户端访问知栖。</span>
                  </span>
                  <input
                    type="checkbox"
                    checked={localMcp?.enabled === true}
                    disabled={mcpOperation !== 'idle'}
                    onChange={(event) => {
                      void toggleLocalMcp(event.currentTarget.checked)
                    }}
                  />
                </label>
                {mcpOperation === 'enabling' ? (
                  <div className="settings-card-help" role="status">正在启用本机 MCP 接入…</div>
                ) : null}
                {mcpOperation === 'disabling' ? (
                  <div className="settings-card-help" role="status">正在停用本机 MCP 接入…</div>
                ) : null}
                {mcpOperation === 'regenerating' ? (
                  <div className="settings-card-help" role="status">正在重新生成 MCP 令牌…</div>
                ) : null}
                {mcpOperationError ? (
                  <div className="settings-card-help" role="alert">
                    {getLocalMcpOperationError(
                      mcpOperationError.error,
                      mcpOperationError.operation === 'enabling',
                    )}
                  </div>
                ) : null}
                {localMcp?.enabled ? (
                  <>
                    <div className="settings-card-divider" />
                    <div className="settings-card-field">
                      <div className="settings-card-label">连接地址</div>
                      <div className="settings-card-help">http://127.0.0.1:{localMcp.port}/mcp</div>
                      <button
                        type="button"
                        className="settings-action-button"
                        disabled={mcpCopyStatus === 'copying'}
                        onClick={() => void copyLocalMcpConfig()}
                      >
                        复制 MCP 配置
                      </button>
                      <button
                        type="button"
                        className="settings-action-button"
                        disabled={mcpOperation !== 'idle'}
                        onClick={() => void regenerateLocalMcpToken()}
                      >
                        重新生成令牌
                      </button>
                      {mcpCopyStatus === 'copied' ? (
                        <div className="settings-card-help" role="status">配置已复制。</div>
                      ) : null}
                      {mcpCopyStatus === 'error' ? (
                        <div className="settings-card-help" role="alert">
                          复制失败，请检查系统剪贴板权限。
                        </div>
                      ) : null}
                    </div>
                  </>
                ) : null}
              </div>
            </section>
          </div>
        ) : null}
      </section>
    </div>
  )
}

function formatAccountExpiry(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '未知'
  return date.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}
