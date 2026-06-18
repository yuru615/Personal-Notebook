import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { WhiteboardBlock } from './WhiteboardBlock'

describe('WhiteboardBlock', () => {
  it('renders the whiteboard card title and updated label', () => {
    render(
      <WhiteboardBlock
        title="流程草图"
        updatedLabel="刚刚更新"
        previewUrl={null}
        isMissing={false}
        onOpen={() => undefined}
      />,
    )

    expect(screen.getByRole('button', { name: '打开白板 流程草图' })).toBeInTheDocument()
    expect(screen.getByText('流程草图')).toBeInTheDocument()
    expect(screen.getByText('刚刚更新')).toBeInTheDocument()
    expect(screen.getByText('空白白板')).toBeInTheDocument()
  })

  it('opens the whiteboard when clicked', async () => {
    const user = userEvent.setup()
    const onOpen = vi.fn()

    render(
      <WhiteboardBlock
        title="需求脑图"
        updatedLabel="刚刚更新"
        previewUrl={null}
        isMissing={false}
        onOpen={onOpen}
      />,
    )

    await user.click(screen.getByRole('button', { name: '打开白板 需求脑图' }))

    expect(onOpen).toHaveBeenCalledTimes(1)
  })

  it('shows a missing state without open affordance text', () => {
    render(
      <WhiteboardBlock
        title="白板不存在"
        updatedLabel="引用已丢失"
        previewUrl={null}
        isMissing
        onOpen={() => undefined}
      />,
    )

    expect(screen.getByText('白板不存在')).toBeInTheDocument()
    expect(screen.getByText('引用已丢失')).toBeInTheDocument()
  })
})
