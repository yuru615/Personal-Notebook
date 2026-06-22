import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { BlockFrame } from './BlockFrame'

describe('BlockFrame', () => {
  it('closes the handle menu after clicking outside the block', async () => {
    const user = userEvent.setup()

    render(
      <div>
        <BlockFrame
          onDragStart={vi.fn()}
          onDragEnd={vi.fn()}
          onTurnInto={vi.fn()}
          onDuplicate={vi.fn()}
          onDelete={vi.fn()}
        >
          <input value="测试内容" readOnly />
        </BlockFrame>
        <button type="button">外部区域</button>
      </div>,
    )

    await user.click(screen.getByRole('button', { name: '拖动块' }))
    expect(screen.getByRole('button', { name: '复制' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '外部区域' }))
    expect(screen.queryByRole('button', { name: '复制' })).not.toBeInTheDocument()
  })

  it('closes the handle menu after clicking block content', async () => {
    const user = userEvent.setup()

    render(
      <BlockFrame
        onDragStart={vi.fn()}
        onDragEnd={vi.fn()}
        onTurnInto={vi.fn()}
        onDuplicate={vi.fn()}
        onDelete={vi.fn()}
      >
        <input aria-label="正文内容" value="测试内容" readOnly />
      </BlockFrame>,
    )

    await user.click(screen.getByRole('button', { name: '拖动块' }))
    expect(screen.getByRole('button', { name: '复制' })).toBeInTheDocument()

    await user.click(screen.getByRole('textbox', { name: '正文内容' }))
    expect(screen.queryByRole('button', { name: '复制' })).not.toBeInTheDocument()
  })
})
