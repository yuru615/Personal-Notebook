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

export type SettingsSectionKey =
  | 'general'
  | 'appearance_sidebar'
  | 'editing_page_defaults'
  | 'search_knowledge'
  | 'import_export'
  | 'desktop'
  | 'data_maintenance'
  | 'experimental'

export const DEFAULT_SETTINGS_SECTION: SettingsSectionKey = 'general'

const SETTINGS_SECTIONS: Array<{ key: SettingsSectionKey; label: string }> = [
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
  workspaceSettings: WorkspaceSettings
  onSectionChange: (section: SettingsSectionKey) => void
  onSetPageDefaults: (defaults: Partial<PageDisplayDefaults>) => void | Promise<void>
  onSetAppCloseAction: (closeAction: AppCloseAction) => void | Promise<void>
  onSetAppAccentTheme: (theme: AppAccentTheme) => void | Promise<void>
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

export function SettingsCenter({
  activeSection,
  appSettings,
  workspaceSettings,
  onSectionChange,
  onSetPageDefaults,
  onSetAppCloseAction,
  onSetAppAccentTheme,
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
  const [currentSection, setCurrentSection] = useState(activeSection)

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

  useEffect(() => {
    setDraftSidebarWidth(sidebarWidth)
    pendingSidebarWidthRef.current = null
  }, [sidebarWidth])

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
          <section className="settings-section">
            <h2 className="settings-section-title">实验功能</h2>
            <p className="settings-placeholder">这里先留空，后面逐项接入。</p>
          </section>
        ) : null}
      </section>
    </div>
  )
}
