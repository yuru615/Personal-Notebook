import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { CanvasEntryCard } from './CanvasEntryCard'

describe('CanvasEntryCard', () => {
  it('renders title, meta, and empty preview text', () => {
    render(
      <CanvasEntryCard
        kindLabel="白板"
        title="流程草图"
        meta="刚刚更新"
        emptyPreviewLabel="空白白板"
        openLabel="打开"
        onOpen={() => undefined}
      />,
    )

    expect(screen.getByRole('button', { name: '打开白板 流程草图' })).toHaveClass(
      'canvas-entry-card',
    )
    expect(screen.getByText('流程草图')).toBeInTheDocument()
    expect(screen.getByText('刚刚更新')).toBeInTheDocument()
    expect(screen.getByText('空白白板')).toBeInTheDocument()
  })

  it('merges shared and mode-specific class names', () => {
    render(
      <CanvasEntryCard
        kindLabel="白板"
        title="流程草图"
        meta="刚刚更新"
        emptyPreviewLabel="空白白板"
        openLabel="打开"
        onOpen={() => undefined}
        className="custom-card"
        previewClassName="custom-card-preview"
      />,
    )

    expect(screen.getByRole('button', { name: '打开白板 流程草图' })).toHaveClass(
      'canvas-entry-card',
      'custom-card',
    )
    expect(screen.getByText('空白白板').parentElement).toHaveClass(
      'canvas-entry-card-preview',
      'custom-card-preview',
    )
  })

  it('forwards open clicks', async () => {
    const user = userEvent.setup()
    const onOpen = vi.fn()

    render(
      <CanvasEntryCard
        kindLabel="白板"
        title="流程草图"
        meta="刚刚更新"
        emptyPreviewLabel="空白白板"
        openLabel="打开"
        onOpen={onOpen}
      />,
    )

    await user.click(screen.getByRole('button', { name: '打开白板 流程草图' }))

    expect(onOpen).toHaveBeenCalledTimes(1)
  })

  it('disables open interaction for missing entries', async () => {
    const user = userEvent.setup()
    const onOpen = vi.fn()

    render(
      <CanvasEntryCard
        kindLabel="白板"
        title="白板不存在"
        meta="引用已丢失"
        emptyPreviewLabel="空白白板"
        openLabel="打开"
        onOpen={onOpen}
        isMissing
      />,
    )

    const button = screen.getByRole('button', { name: '打开白板 白板不存在' })
    await user.click(button)

    expect(button).toBeDisabled()
    expect(onOpen).not.toHaveBeenCalled()
    expect(screen.queryByText('打开')).not.toBeInTheDocument()
  })
})
