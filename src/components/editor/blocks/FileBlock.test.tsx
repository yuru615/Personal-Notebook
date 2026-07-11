import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { FileBlock } from './FileBlock'

describe('FileBlock', () => {
  it('shows the attachment name and MIME type', () => {
    render(
      <FileBlock
        block={{
          id: 'file_1',
          type: 'file',
          assetId: 'asset_1',
          name: 'brief.pdf',
          mimeType: 'application/pdf',
          caption: '',
        }}
      />,
    )

    expect(screen.getByText('brief.pdf')).toBeInTheDocument()
    expect(screen.getByText('application/pdf')).toBeInTheDocument()
  })

  it('opens the managed attachment when requested', async () => {
    const user = userEvent.setup()
    const onOpen = vi.fn()

    render(
      <FileBlock
        block={{
          id: 'file_1',
          type: 'file',
          assetId: 'asset_1',
          name: 'brief.pdf',
          mimeType: 'application/pdf',
          caption: '',
        }}
        onOpen={onOpen}
      />,
    )

    await user.click(screen.getByRole('button', { name: '打开文件' }))

    expect(onOpen).toHaveBeenCalledTimes(1)
  })

  it('disables opening when the attachment asset is unavailable', () => {
    render(
      <FileBlock
        block={{
          id: 'file_1',
          type: 'file',
          assetId: '',
          name: 'brief.pdf',
          mimeType: 'application/pdf',
          caption: '',
        }}
      />,
    )

    expect(screen.getByRole('button', { name: '打开文件' })).toBeDisabled()
  })
})
