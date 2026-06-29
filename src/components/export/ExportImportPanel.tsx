import { useEffect, useRef, useState } from 'react'
import type { PageFontFamily, SaveStatus } from '../../domain/types'
import { uiCopy } from '../../ui/copy'
import { SaveStatusBadge } from '../shared/SaveStatusBadge'

const CLEANUP_ORPHAN_WHITEBOARDS_LABEL = '\u6e05\u7406\u5b64\u7acb\u767d\u677f'
const CLEANUP_ORPHAN_DATA_TABLES_LABEL = '清理孤立数据表格'
const IMPORT_MARKDOWN_LABEL = '\u5bfc\u5165 Markdown \u9875\u9762\u5305'

interface ExportImportPanelProps {
  status: SaveStatus
  reversible: boolean
  adaptiveWidth: boolean
  smallText: boolean
  fontFamily: PageFontFamily
  outlineVisible: boolean
  onToggleReversible: (value: boolean) => void
  onToggleAdaptiveWidth: (value: boolean) => void
  onToggleSmallText: (value: boolean) => void
  onToggleFontFamily: (value: PageFontFamily) => void
  onToggleOutlineVisible: (value: boolean) => void
  onExportJson: () => void | Promise<void>
  onExportMarkdown: () => void | Promise<void>
  onImportJson: () => void | Promise<void>
  onImportMarkdown: () => void | Promise<void>
  onCleanupOrphanBoards: () => void | Promise<void>
  onCleanupOrphanDataTables: () => void | Promise<void>
}

export function ExportImportPanel({
  status,
  reversible,
  adaptiveWidth,
  smallText,
  fontFamily,
  outlineVisible,
  onToggleReversible,
  onToggleAdaptiveWidth,
  onToggleSmallText,
  onToggleFontFamily,
  onToggleOutlineVisible,
  onExportJson,
  onExportMarkdown,
  onImportJson,
  onImportMarkdown,
  onCleanupOrphanBoards,
  onCleanupOrphanDataTables,
}: ExportImportPanelProps) {
  const [open, setOpen] = useState(false)
  const panelRef = useRef<HTMLDivElement | null>(null)

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

  function handleExportJson() {
    closeMenu()
    void onExportJson()
  }

  function handleExportMarkdown() {
    closeMenu()
    void onExportMarkdown()
  }

  function handleImportJson() {
    closeMenu()
    void onImportJson()
  }

  function handleImportMarkdown() {
    closeMenu()
    void onImportMarkdown()
  }

  function handleCleanupOrphanBoards() {
    closeMenu()
    void onCleanupOrphanBoards()
  }

  function handleCleanupOrphanDataTables() {
    closeMenu()
    void onCleanupOrphanDataTables()
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
        onClick={() => setOpen((value) => !value)}
      >
        <span aria-hidden="true">⋯</span>
      </button>
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
            <button type="button" className="page-menu-action" onClick={handleExportJson}>
              <span className="page-menu-item-label">{uiCopy.export.json}</span>
            </button>
            <button type="button" className="page-menu-action" onClick={handleExportMarkdown}>
              <span className="page-menu-item-label">{uiCopy.export.markdown}</span>
            </button>
            <button type="button" className="page-menu-action" onClick={handleImportJson}>
              <span className="page-menu-item-label">{uiCopy.export.import}</span>
            </button>
            <button type="button" className="page-menu-action" onClick={handleImportMarkdown}>
              <span className="page-menu-item-label">{IMPORT_MARKDOWN_LABEL}</span>
            </button>
            <button type="button" className="page-menu-action" onClick={handleCleanupOrphanBoards}>
              <span className="page-menu-item-label">{CLEANUP_ORPHAN_WHITEBOARDS_LABEL}</span>
            </button>
            <button type="button" className="page-menu-action" onClick={handleCleanupOrphanDataTables}>
              <span className="page-menu-item-label">{CLEANUP_ORPHAN_DATA_TABLES_LABEL}</span>
            </button>
            <label className="page-menu-toggle">
              <span className="page-menu-item-label">{uiCopy.export.reversible}</span>
              <input
                type="checkbox"
                checked={reversible}
                onChange={(event) => onToggleReversible(event.target.checked)}
              />
            </label>
          </div>
        </div>
      ) : null}
    </div>
  )
}
