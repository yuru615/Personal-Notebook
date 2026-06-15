import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { BlockEditor } from './BlockEditor'

const page = {
  id: 'page_a',
  title: '测试页',
  parentId: null,
  icon: '📄',
  cover: null,
  createdAt: '',
  updatedAt: '',
  blocks: [
    { id: 'b1', type: 'paragraph', text: '第一段' },
    { id: 'b2', type: 'todo', text: '待办事项', checked: true },
    { id: 'b3', type: 'code', language: 'ts', text: 'const a = 1;' },
    { id: 'b4', type: 'table', rows: [['列1', '列2'], ['A', 'B']] },
  ],
}

describe('BlockEditor', () => {
  it('renders all core block types', () => {
    render(<BlockEditor page={page as never} allPages={[page as never]} onUpdateBlock={vi.fn()} />)

    expect(screen.getByDisplayValue('第一段')).toBeInTheDocument()
    expect(screen.getByDisplayValue('待办事项')).toBeInTheDocument()
    expect(screen.getByDisplayValue('const a = 1;')).toBeInTheDocument()
    expect(screen.getByDisplayValue('列1')).toBeInTheDocument()
    expect(screen.getByDisplayValue('A')).toBeInTheDocument()
  })

  it('opens the slash menu from the blank row and inserts a todo block', async () => {
    const user = userEvent.setup()
    const onInsert = vi.fn()

    render(
      <BlockEditor
        page={{ ...page, blocks: [] } as never}
        allPages={[page as never]}
        onUpdateBlock={vi.fn()}
        onInsert={onInsert}
      />,
    )

    const slashInput = screen.getByPlaceholderText('输入 / 打开命令菜单')
    await user.type(slashInput, '/待办')

    const option = screen.getByRole('button', { name: '待办列表' })
    expect(option).toBeInTheDocument()

    await user.click(option)
    expect(onInsert).toHaveBeenCalledWith('todo')
  })
})
