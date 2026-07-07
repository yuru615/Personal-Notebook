import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { EmptyBlockRow } from './EmptyBlockRow'

describe('EmptyBlockRow', () => {
  it('opens the slash menu when clicking the plus button', async () => {
    const user = userEvent.setup()

    render(<EmptyBlockRow onInsert={vi.fn()} />)

    await user.click(screen.getByRole('button', { name: '添加块' }))

    expect(screen.getByRole('button', { name: '文本' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '标题 1' })).toBeInTheDocument()
  })

  it('closes the slash menu when clicking outside the row', async () => {
    const user = userEvent.setup()

    render(
      <div>
        <EmptyBlockRow onInsert={vi.fn()} />
        <button type="button">页面空白</button>
      </div>,
    )

    await user.type(screen.getByRole('textbox'), '/')
    expect(screen.getByRole('button', { name: '文本' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '页面空白' }))
    expect(screen.queryByRole('button', { name: '文本' })).not.toBeInTheDocument()
  })

  it('picks a slash menu option with ArrowDown and Enter', async () => {
    const user = userEvent.setup()
    const onInsert = vi.fn()

    render(<EmptyBlockRow onInsert={onInsert} />)

    const input = screen.getByRole('textbox')
    await user.type(input, '/')
    await user.keyboard('{ArrowDown}{Enter}')

    expect(onInsert).toHaveBeenCalledWith('heading_1')
    expect(screen.queryByRole('button', { name: '标题 1' })).not.toBeInTheDocument()
  })

  it('inserts an empty paragraph when pressing Enter on an empty row', async () => {
    const user = userEvent.setup()
    const onInsert = vi.fn()

    render(<EmptyBlockRow onInsert={onInsert} />)

    await user.click(screen.getByRole('textbox'))
    await user.keyboard('{Enter}')

    expect(onInsert).toHaveBeenCalledWith('paragraph')
  })
})
