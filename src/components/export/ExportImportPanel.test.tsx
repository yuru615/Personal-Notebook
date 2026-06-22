import type { ComponentProps } from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { uiCopy } from '../../ui/copy'
import { ExportImportPanel } from './ExportImportPanel'

const CLEANUP_ORPHAN_WHITEBOARDS_LABEL = '\u6e05\u7406\u5b64\u7acb\u767d\u677f'
const IMPORT_MARKDOWN_LABEL = '\u5bfc\u5165 Markdown \u9875\u9762\u5305'

function renderPanel(overrides: Partial<ComponentProps<typeof ExportImportPanel>> = {}) {
  return render(
    <ExportImportPanel
      status="saved"
      reversible={false}
      adaptiveWidth={false}
      smallText={false}
      fontFamily="default"
      outlineVisible={true}
      onToggleReversible={vi.fn()}
      onToggleAdaptiveWidth={vi.fn()}
      onToggleSmallText={vi.fn()}
      onToggleFontFamily={vi.fn()}
      onToggleOutlineVisible={vi.fn()}
      onExportJson={vi.fn()}
      onExportMarkdown={vi.fn()}
      onImportJson={vi.fn()}
      onImportMarkdown={vi.fn()}
      onCleanupOrphanBoards={vi.fn()}
      {...overrides}
    />,
  )
}

describe('ExportImportPanel', () => {
  it('shows page actions inside a menu instead of rendering them inline', async () => {
    const user = userEvent.setup()

    renderPanel()

    expect(screen.getByRole('button', { name: uiCopy.page.menu })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: uiCopy.export.json })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: uiCopy.page.menu }))

    expect(screen.getByText(uiCopy.saveStatus.saved)).toBeInTheDocument()
    expect(screen.getByText(uiCopy.page.viewSection)).toBeInTheDocument()
    expect(screen.getByLabelText(uiCopy.page.smallText)).toBeInTheDocument()
    expect(screen.getByText(uiCopy.page.fontFamily)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: uiCopy.page.fontDefault })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: uiCopy.page.fontSerif })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: uiCopy.page.fontMono })).toBeInTheDocument()
    expect(screen.getByLabelText(uiCopy.page.outlineVisible)).toBeInTheDocument()
    expect(screen.getByText(uiCopy.export.section)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: uiCopy.export.json })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: uiCopy.export.markdown })).toBeInTheDocument()
    expect(screen.getByLabelText(uiCopy.export.import)).toBeInTheDocument()
    expect(screen.getByLabelText(IMPORT_MARKDOWN_LABEL)).toBeInTheDocument()
    expect(screen.getByLabelText(uiCopy.export.reversible)).toBeInTheDocument()
  })

  it('closes the menu after triggering an export action', async () => {
    const user = userEvent.setup()
    const onExportJson = vi.fn()

    renderPanel({ onExportJson })

    await user.click(screen.getByRole('button', { name: uiCopy.page.menu }))
    await user.click(screen.getByRole('button', { name: uiCopy.export.json }))

    expect(onExportJson).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('button', { name: uiCopy.export.markdown })).not.toBeInTheDocument()
  })

  it('uploads a json file after confirmation from the menu', async () => {
    const user = userEvent.setup()
    const onImportJson = vi.fn()
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true)

    renderPanel({ onImportJson })

    await user.click(screen.getByRole('button', { name: uiCopy.page.menu }))

    const input = screen.getByLabelText(uiCopy.export.import) as HTMLInputElement
    const file = new File(['{"pages":[]}'], 'backup.json', { type: 'application/json' })

    await user.upload(input, file)

    expect(confirmSpy).toHaveBeenCalled()
    expect(onImportJson).toHaveBeenCalledWith(file)
    confirmSpy.mockRestore()
  })

  it('uploads a markdown page package from the menu', async () => {
    const user = userEvent.setup()
    const onImportMarkdown = vi.fn()

    renderPanel({ onImportMarkdown })

    await user.click(screen.getByRole('button', { name: uiCopy.page.menu }))

    const input = screen.getByLabelText(IMPORT_MARKDOWN_LABEL) as HTMLInputElement
    const file = new File(['zip'], 'page-package.zip', { type: 'application/zip' })

    await user.upload(input, file)

    expect(onImportMarkdown).toHaveBeenCalledWith(file)
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
})
