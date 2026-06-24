import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { MindmapBlock } from './MindmapBlock'

describe('MindmapBlock', () => {
  it('renders the mindmap card title and updated label', () => {
    render(
      <MindmapBlock
        title="产品导图"
        updatedLabel="刚刚更新"
        previewUrl={null}
        isMissing={false}
        onOpen={() => undefined}
      />,
    )

    expect(screen.getByRole('button', { name: '打开导图 产品导图' })).toBeInTheDocument()
    expect(screen.getByText('产品导图')).toBeInTheDocument()
    expect(screen.getByText('刚刚更新')).toBeInTheDocument()
    expect(screen.getByText('空白导图')).toBeInTheDocument()
  })

  it('opens the mindmap when clicked', async () => {
    const user = userEvent.setup()
    const onOpen = vi.fn()

    render(
      <MindmapBlock
        title="需求梳理"
        updatedLabel="刚刚更新"
        previewUrl={null}
        isMissing={false}
        onOpen={onOpen}
      />,
    )

    await user.click(screen.getByRole('button', { name: '打开导图 需求梳理' }))

    expect(onOpen).toHaveBeenCalledTimes(1)
  })

  it('shows a recover action when the mindmap reference is missing', async () => {
    const user = userEvent.setup()
    const onRecover = vi.fn()

    render(
      <MindmapBlock
        title="导图不存在"
        updatedLabel="引用已丢失"
        previewUrl={null}
        isMissing
        onOpen={() => undefined}
        onRecover={onRecover}
      />,
    )

    expect(screen.getByText('导图不存在')).toBeInTheDocument()
    expect(screen.getByText('引用已丢失')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '恢复导图' }))

    expect(onRecover).toHaveBeenCalledTimes(1)
  })
})
