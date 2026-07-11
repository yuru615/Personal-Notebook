import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { BlockHandleMenu } from './BlockHandleMenu'

describe('BlockHandleMenu', () => {
  it('renders grouped conversion and action sections', () => {
    render(
      <BlockHandleMenu
        onTurnInto={vi.fn()}
        onInsertAbove={vi.fn()}
        onInsertBelow={vi.fn()}
        onDuplicate={vi.fn()}
        onDelete={vi.fn()}
      />,
    )

    expect(screen.getByText('转换为')).toBeInTheDocument()
    expect(screen.getByText('操作')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '复制' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '删除' })).toBeInTheDocument()
  })

  it('offers inserting a paragraph above or below the current block', () => {
    render(
      <BlockHandleMenu
        onTurnInto={vi.fn()}
        onInsertAbove={vi.fn()}
        onInsertBelow={vi.fn()}
        onDuplicate={vi.fn()}
        onDelete={vi.fn()}
      />,
    )

    expect(screen.getByRole('button', { name: '在上方插入块' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '在下方插入块' })).toBeInTheDocument()
  })

  it('places insert actions before conversion and other block actions', () => {
    const { container } = render(
      <BlockHandleMenu
        onTurnInto={vi.fn()}
        onInsertAbove={vi.fn()}
        onInsertBelow={vi.fn()}
        onDuplicate={vi.fn()}
        onDelete={vi.fn()}
      />,
    )

    const labels = Array.from(container.querySelectorAll('.block-menu-action')).map((item) =>
      item.textContent?.trim(),
    )

    expect(labels.slice(0, 2)).toEqual(['在上方插入块', '在下方插入块'])
  })

  it('locks page scrolling while the menu is open', () => {
    const originalOverflow = document.documentElement.style.overflow
    document.documentElement.style.overflow = 'auto'

    try {
      const { unmount } = render(
        <BlockHandleMenu
          onTurnInto={vi.fn()}
          onDuplicate={vi.fn()}
          onDelete={vi.fn()}
        />,
      )

      expect(document.documentElement.style.overflow).toBe('hidden')

      unmount()

      expect(document.documentElement.style.overflow).toBe('auto')
    } finally {
      document.documentElement.style.overflow = originalOverflow
    }
  })

  it('renders text style controls when the block supports text styling', async () => {
    const user = userEvent.setup()
    const onChangeTextStyle = vi.fn()

    render(
      <BlockHandleMenu
        textStyle={{ textColor: 'blue', backgroundColor: 'yellow', textAlign: 'center' }}
        onChangeTextStyle={onChangeTextStyle}
        onTurnInto={vi.fn()}
        onDuplicate={vi.fn()}
        onDelete={vi.fn()}
      />,
    )

    expect(screen.getByText('文字颜色')).toBeInTheDocument()
    expect(screen.getByText('块颜色')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '文字颜色：蓝色' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    expect(screen.getByRole('button', { name: '块颜色：黄色背景' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    expect(screen.getByRole('button', { name: '文字居中' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )

    await user.click(screen.getByRole('button', { name: '文字颜色：红色' }))
    expect(onChangeTextStyle).toHaveBeenLastCalledWith({
      textColor: 'red',
      backgroundColor: 'yellow',
      textAlign: 'center',
    })

    await user.click(screen.getByRole('button', { name: '文字居中' }))
    expect(onChangeTextStyle).toHaveBeenLastCalledWith({
      textColor: 'blue',
      backgroundColor: 'yellow',
      textAlign: undefined,
    })
  })
})
