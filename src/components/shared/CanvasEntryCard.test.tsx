import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { CanvasEntryCard } from './CanvasEntryCard'

describe('CanvasEntryCard', () => {
  it('renders title, meta, and empty preview text', () => {
    render(
      <CanvasEntryCard
        kindLabel="思维导图"
        title="产品调研导图"
        meta="刚刚更新"
        emptyPreviewLabel="空白导图"
        openLabel="打开"
        onOpen={() => undefined}
      />,
    )

    expect(screen.getByRole('button', { name: '打开思维导图 产品调研导图' })).toBeInTheDocument()
    expect(screen.getByText('产品调研导图')).toBeInTheDocument()
    expect(screen.getByText('刚刚更新')).toBeInTheDocument()
    expect(screen.getByText('空白导图')).toBeInTheDocument()
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
})
