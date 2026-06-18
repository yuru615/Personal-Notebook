import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { MindmapBlock } from './MindmapBlock'

describe('MindmapBlock', () => {
  it('renders the mindmap card title and updated label', () => {
    render(
      <MindmapBlock
        title="产品调研导图"
        updatedLabel="刚刚更新"
        previewUrl={null}
        isMissing={false}
        onOpen={() => undefined}
      />,
    )

    expect(screen.getByRole('button', { name: '打开思维导图 产品调研导图' })).toBeInTheDocument()
    expect(screen.getByText('产品调研导图')).toBeInTheDocument()
    expect(screen.getByText('刚刚更新')).toBeInTheDocument()
    expect(screen.getByText('空白导图')).toBeInTheDocument()
  })

  it('opens the mindmap when clicked', async () => {
    const user = userEvent.setup()
    const onOpen = vi.fn()

    render(
      <MindmapBlock
        title="未命名思维导图"
        updatedLabel="刚刚更新"
        previewUrl={null}
        isMissing={false}
        onOpen={onOpen}
      />,
    )

    await user.click(screen.getByRole('button', { name: '打开思维导图 未命名思维导图' }))

    expect(onOpen).toHaveBeenCalledTimes(1)
  })

  it('shows the missing state text', () => {
    render(
      <MindmapBlock
        title="思维导图不存在"
        updatedLabel="引用已丢失"
        previewUrl={null}
        isMissing
        onOpen={() => undefined}
      />,
    )

    expect(screen.getByText('思维导图不存在')).toBeInTheDocument()
    expect(screen.getByText('引用已丢失')).toBeInTheDocument()
  })
})
