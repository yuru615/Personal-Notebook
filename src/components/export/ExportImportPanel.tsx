import { useEffect, useRef, useState } from 'react'
import type { PageFontFamily, SaveStatus } from '../../domain/types'
import { uiCopy } from '../../ui/copy'
import { SaveStatusBadge } from '../shared/SaveStatusBadge'

const CLEANUP_ORPHAN_WHITEBOARDS_LABEL = '\u6e05\u7406\u5b64\u7acb\u767d\u677f'
const CLEANUP_ORPHAN_DATA_TABLES_LABEL = '清理孤立数据表格'
const DANGER_SECTION_LABEL = '\u5371\u9669\u64cd\u4f5c'
const DELETE_CURRENT_PAGE_LABEL = '\u5220\u9664\u5f53\u524d\u9875\u9762'

export interface ArchiveTaskStatus {
  label: string
  detail?: string
  percent?: number
}

interface ExportImportPanelProps {
  status: SaveStatus
  adaptiveWidth: boolean
  smallText: boolean
  fontFamily: PageFontFamily
  outlineVisible: boolean
  archiveTask?: ArchiveTaskStatus | null
  onToggleAdaptiveWidth: (value: boolean) => void
  onToggleSmallText: (value: boolean) => void
  onToggleFontFamily: (value: PageFontFamily) => void
  onToggleOutlineVisible: (value: boolean) => void
  onExportArchive: () => void | Promise<void>
  onExportWorkspace: () => void | Promise<void>
  onImportWorkspace: () => void | Promise<void>
  onImportArchive: () => void | Promise<void>
  onCleanupOrphanBoards: () => void | Promise<void>
  onCleanupOrphanDataTables: () => void | Promise<void>
  onDeletePage?: () => void | Promise<void>
}

export function ExportImportPanel({
  status,
  adaptiveWidth,
  smallText,
  fontFamily,
  outlineVisible,
  archiveTask,
  onToggleAdaptiveWidth,
  onToggleSmallText,
  onToggleFontFamily,
  onToggleOutlineVisible,
  onExportArchive,
  onExportWorkspace,
  onImportWorkspace,
  onImportArchive,
  onCleanupOrphanBoards,
  onCleanupOrphanDataTables,
  onDeletePage,
}: ExportImportPanelProps) {
  const [open, setOpen] = useState(false)
  const panelRef = useRef<HTMLDivElement | null>(null)
  const isArchiveBusy = Boolean(archiveTask)
  const progressPercent = archiveTask?.percent == null ? null : clampPercent(archiveTask.percent)

  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      if (!panelRef.current?.contains(event.target as Node)) {
        setOpen(false)
      }
    }

    window.addEventListener('mousedown', handlePointerDown)
    return () => {
      window.removeEventListener('mousedown', handlePointerDown)
    }
  }, [])

  function closeMenu() {
    setOpen(false)
  }

  function handleExportArchive() {
    if (isArchiveBusy) {
      return
    }

    closeMenu()
    void onExportArchive()
  }

  function handleImportArchive() {
    if (isArchiveBusy) {
      return
    }

    closeMenu()
    void onImportArchive()
  }

  function handleExportWorkspace() {
    if (isArchiveBusy) {
      return
    }

    closeMenu()
    void onExportWorkspace()
  }

  function handleImportWorkspace() {
    if (isArchiveBusy) {
      return
    }

    closeMenu()
    void onImportWorkspace()
  }

  function handleCleanupOrphanBoards() {
    closeMenu()
    void onCleanupOrphanBoards()
  }

  function handleCleanupOrphanDataTables() {
    closeMenu()
    void onCleanupOrphanDataTables()
  }

  function handleDeletePage() {
    closeMenu()
    void onDeletePage?.()
  }

  const fontOptions: Array<{ value: PageFontFamily; label: string }> = [
    { value: 'default', label: uiCopy.page.fontDefault },
    { value: 'serif', label: uiCopy.page.fontSerif },
    { value: 'mono', label: uiCopy.page.fontMono },
  ]

  return (
    <div className="page-menu" ref={panelRef}>
      <button
        type="button"
        className="page-menu-button"
        aria-label={uiCopy.page.menu}
        aria-expanded={open}
        aria-haspopup="menu"
        disabled={isArchiveBusy}
        onClick={() => setOpen((value) => !value)}
      >
        <span aria-hidden="true">⋯</span>
      </button>
      {archiveTask ? (
        <div className="page-menu-archive-progress" role="status" aria-live="polite">
          <div className="page-menu-archive-progress-header">
            <span className="page-menu-archive-progress-title">{archiveTask.label}</span>
            {progressPercent == null ? null : (
              <span className="page-menu-archive-progress-percent">{progressPercent}%</span>
            )}
          </div>
          <div className="page-menu-archive-progress-track" aria-hidden="true">
            <span
              className="page-menu-archive-progress-bar"
              style={{ width: `${progressPercent ?? 8}%` }}
            />
          </div>
          {archiveTask.detail ? (
            <div className="page-menu-archive-progress-detail">{archiveTask.detail}</div>
          ) : null}
        </div>
      ) : null}
      {open ? (
        <div className="page-menu-popover">
          <div className="page-menu-meta">
            <SaveStatusBadge status={status} />
          </div>
          <div className="page-menu-divider" />
          <div className="page-menu-section">
            <div className="page-menu-section-title">{uiCopy.page.viewSection}</div>
            <label className="page-menu-toggle">
              <span className="page-menu-item-label">{uiCopy.page.smallText}</span>
              <input
                type="checkbox"
                checked={smallText}
                onChange={(event) => onToggleSmallText(event.target.checked)}
              />
            </label>
            <div className="page-menu-field">
              <span className="page-menu-item-label">{uiCopy.page.fontFamily}</span>
              <div className="page-menu-choice-group" role="group" aria-label={uiCopy.page.fontFamily}>
                {fontOptions.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    className={
                      option.value === fontFamily
                        ? 'page-menu-choice page-menu-choice-active'
                        : 'page-menu-choice'
                    }
                    aria-pressed={option.value === fontFamily}
                    onClick={() => onToggleFontFamily(option.value)}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
            <label className="page-menu-toggle">
              <span className="page-menu-item-label">{uiCopy.page.outlineVisible}</span>
              <input
                type="checkbox"
                checked={outlineVisible}
                onChange={(event) => onToggleOutlineVisible(event.target.checked)}
              />
            </label>
            <label className="page-menu-toggle">
              <span className="page-menu-item-label">{uiCopy.page.adaptiveWidth}</span>
              <input
                type="checkbox"
                checked={adaptiveWidth}
                onChange={(event) => onToggleAdaptiveWidth(event.target.checked)}
              />
            </label>
          </div>
          <div className="page-menu-divider" />
          <div className="page-menu-section">
            <div className="page-menu-section-title">{uiCopy.export.section}</div>
            <button
              type="button"
              className="page-menu-action"
              disabled={isArchiveBusy}
              onClick={handleExportArchive}
            >
              <span className="page-menu-item-label">{uiCopy.export.archive}</span>
            </button>
            <button
              type="button"
              className="page-menu-action"
              disabled={isArchiveBusy}
              onClick={handleExportWorkspace}
            >
              <span className="page-menu-item-label">{uiCopy.export.workspace}</span>
            </button>
            <button
              type="button"
              className="page-menu-action"
              disabled={isArchiveBusy}
              onClick={handleImportWorkspace}
            >
              <span className="page-menu-item-label">{uiCopy.export.importWorkspace}</span>
            </button>
            <button
              type="button"
              className="page-menu-action"
              disabled={isArchiveBusy}
              onClick={handleImportArchive}
            >
              <span className="page-menu-item-label">{uiCopy.export.importArchive}</span>
            </button>
            <button type="button" className="page-menu-action" onClick={handleCleanupOrphanBoards}>
              <span className="page-menu-item-label">{CLEANUP_ORPHAN_WHITEBOARDS_LABEL}</span>
            </button>
            <button type="button" className="page-menu-action" onClick={handleCleanupOrphanDataTables}>
              <span className="page-menu-item-label">{CLEANUP_ORPHAN_DATA_TABLES_LABEL}</span>
            </button>
          </div>
          {onDeletePage ? (
            <>
              <div className="page-menu-divider" />
              <div className="page-menu-section">
                <div className="page-menu-section-title">{DANGER_SECTION_LABEL}</div>
                <button
                  type="button"
                  className="page-menu-action page-menu-action-danger"
                  onClick={handleDeletePage}
                >
                  <span className="page-menu-item-label">{DELETE_CURRENT_PAGE_LABEL}</span>
                </button>
              </div>
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

function clampPercent(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)))
}
