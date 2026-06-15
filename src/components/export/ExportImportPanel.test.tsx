import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ExportImportPanel } from './ExportImportPanel'

describe('ExportImportPanel', () => {
  it('renders Chinese export and import actions', () => {
    render(
      <ExportImportPanel
        reversible={false}
        onToggleReversible={vi.fn()}
        onExportJson={vi.fn()}
        onExportMarkdown={vi.fn()}
        onImportJson={vi.fn()}
      />,
    )

    expect(screen.getByRole('button', { name: '导出 JSON 备份' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '导出 Markdown 页面包' })).toBeInTheDocument()
    expect(screen.getByText('导入 JSON 备份')).toBeInTheDocument()
    expect(screen.getByLabelText('兼容后续导入')).toBeInTheDocument()
  })

  it('uploads a json file after confirmation', async () => {
    const user = userEvent.setup()
    const onImportJson = vi.fn()
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true)

    render(
      <ExportImportPanel
        reversible={false}
        onToggleReversible={vi.fn()}
        onExportJson={vi.fn()}
        onExportMarkdown={vi.fn()}
        onImportJson={onImportJson}
      />,
    )

    const input = screen.getByLabelText('导入 JSON 备份') as HTMLInputElement
    const file = new File(['{"pages":[]}'], 'backup.json', { type: 'application/json' })

    await user.upload(input, file)

    expect(confirmSpy).toHaveBeenCalled()
    expect(onImportJson).toHaveBeenCalledWith(file)
    confirmSpy.mockRestore()
  })
})
