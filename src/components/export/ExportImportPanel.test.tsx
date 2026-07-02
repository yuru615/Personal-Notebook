import type { ComponentProps } from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { uiCopy } from '../../ui/copy'
import { ExportImportPanel } from './ExportImportPanel'

const CLEANUP_ORPHAN_WHITEBOARDS_LABEL = '\u6e05\u7406\u5b64\u7acb\u767d\u677f'
const CLEANUP_ORPHAN_DATA_TABLES_LABEL = '清理孤立数据表格'
const OLD_EXPORT_JSON_LABEL = '导出 JSON 备份'
const OLD_EXPORT_MARKDOWN_LABEL = '导出 Markdown 页面包'
const OLD_IMPORT_JSON_LABEL = '导入 JSON 备份'
const BACKUP_SECTION_LABEL = '备份与恢复'
const CREATE_BACKUP_LABEL = '创建完整备份'
const RESTORE_BACKUP_LABEL = '从备份恢复'

function renderPanel(overrides: Partial<ComponentProps<typeof ExportImportPanel>> = {}) {
  return render(
    <ExportImportPanel
      status="saved"
      adaptiveWidth={false}
      smallText={false}
      fontFamily="default"
      outlineVisible={true}
      onToggleAdaptiveWidth={vi.fn()}
      onToggleSmallText={vi.fn()}
      onToggleFontFamily={vi.fn()}
      onToggleOutlineVisible={vi.fn()}
      onExportArchive={vi.fn()}
      onImportArchive={vi.fn()}
      onCleanupOrphanBoards={vi.fn()}
      onCleanupOrphanDataTables={vi.fn()}
      {...overrides}
    />,
  )
}

describe('ExportImportPanel', () => {
  it('shows page actions inside a menu instead of rendering them inline', async () => {
    const user = userEvent.setup()

    renderPanel()

    expect(screen.getByRole('button', { name: uiCopy.page.menu })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: CREATE_BACKUP_LABEL })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: uiCopy.page.menu }))

    expect(screen.getByText(uiCopy.saveStatus.saved)).toBeInTheDocument()
    expect(screen.getByText(uiCopy.page.viewSection)).toBeInTheDocument()
    expect(screen.getByLabelText(uiCopy.page.smallText)).toBeInTheDocument()
    expect(screen.getByText(uiCopy.page.fontFamily)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: uiCopy.page.fontDefault })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: uiCopy.page.fontSerif })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: uiCopy.page.fontMono })).toBeInTheDocument()
    expect(screen.getByLabelText(uiCopy.page.outlineVisible)).toBeInTheDocument()
    expect(screen.getByText(BACKUP_SECTION_LABEL)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: CREATE_BACKUP_LABEL })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: RESTORE_BACKUP_LABEL })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: OLD_EXPORT_JSON_LABEL })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: OLD_EXPORT_MARKDOWN_LABEL })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: OLD_IMPORT_JSON_LABEL })).not.toBeInTheDocument()
  })

  it('closes the menu after triggering an export action', async () => {
    const user = userEvent.setup()
    const onExportArchive = vi.fn()

    renderPanel({ onExportArchive })

    await user.click(screen.getByRole('button', { name: uiCopy.page.menu }))
    await user.click(screen.getByRole('button', { name: CREATE_BACKUP_LABEL }))

    expect(onExportArchive).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('button', { name: RESTORE_BACKUP_LABEL })).not.toBeInTheDocument()
  })

  it('requests a complete zip import from the menu', async () => {
    const user = userEvent.setup()
    const onImportArchive = vi.fn()

    renderPanel({ onImportArchive })

    await user.click(screen.getByRole('button', { name: uiCopy.page.menu }))
    await user.click(screen.getByRole('button', { name: RESTORE_BACKUP_LABEL }))

    expect(onImportArchive).toHaveBeenCalledTimes(1)
  })

  it('shows active archive progress outside the closed menu', async () => {
    renderPanel({
      archiveTask: {
        label: '正在导出完整备份',
        detail: 'lesson.m4a',
        percent: 50,
      },
    })

    expect(screen.getByRole('status')).toHaveTextContent('正在导出完整备份')
    expect(screen.getByRole('status')).toHaveTextContent('lesson.m4a')
    expect(screen.getByRole('status')).toHaveTextContent('50%')
    expect(screen.getByRole('button', { name: uiCopy.page.menu })).toBeDisabled()
  })

  it('toggles adaptive content width from the page menu', async () => {
    const user = userEvent.setup()
    const onToggleAdaptiveWidth = vi.fn()

    renderPanel({ onToggleAdaptiveWidth })

    await user.click(screen.getByRole('button', { name: uiCopy.page.menu }))
    await user.click(screen.getByLabelText(uiCopy.page.adaptiveWidth))

    expect(onToggleAdaptiveWidth).toHaveBeenCalledWith(true)
  })

  it('toggles small text mode from the page menu', async () => {
    const user = userEvent.setup()
    const onToggleSmallText = vi.fn()

    renderPanel({ onToggleSmallText })

    await user.click(screen.getByRole('button', { name: uiCopy.page.menu }))
    await user.click(screen.getByLabelText(uiCopy.page.smallText))

    expect(onToggleSmallText).toHaveBeenCalledWith(true)
  })

  it('toggles page font family from the page menu', async () => {
    const user = userEvent.setup()
    const onToggleFontFamily = vi.fn()

    renderPanel({ onToggleFontFamily })

    await user.click(screen.getByRole('button', { name: uiCopy.page.menu }))
    await user.click(screen.getByRole('button', { name: uiCopy.page.fontSerif }))

    expect(onToggleFontFamily).toHaveBeenCalledWith('serif')
  })

  it('toggles page outline visibility from the page menu', async () => {
    const user = userEvent.setup()
    const onToggleOutlineVisible = vi.fn()

    renderPanel({ onToggleOutlineVisible })

    await user.click(screen.getByRole('button', { name: uiCopy.page.menu }))
    await user.click(screen.getByLabelText(uiCopy.page.outlineVisible))

    expect(onToggleOutlineVisible).toHaveBeenCalledWith(false)
  })

  it('triggers orphan whiteboard cleanup from the page menu', async () => {
    const user = userEvent.setup()
    const onCleanupOrphanBoards = vi.fn()

    renderPanel({ onCleanupOrphanBoards })

    await user.click(screen.getByRole('button', { name: uiCopy.page.menu }))
    await user.click(screen.getByRole('button', { name: CLEANUP_ORPHAN_WHITEBOARDS_LABEL }))

    expect(onCleanupOrphanBoards).toHaveBeenCalledTimes(1)
  })

  it('triggers orphan data table cleanup from the page menu', async () => {
    const user = userEvent.setup()
    const onCleanupOrphanDataTables = vi.fn()

    renderPanel({ onCleanupOrphanDataTables })

    await user.click(screen.getByRole('button', { name: uiCopy.page.menu }))
    await user.click(screen.getByRole('button', { name: CLEANUP_ORPHAN_DATA_TABLES_LABEL }))

    expect(onCleanupOrphanDataTables).toHaveBeenCalledTimes(1)
  })
})
