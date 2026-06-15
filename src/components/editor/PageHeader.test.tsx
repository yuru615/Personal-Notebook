import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { PageHeader } from './PageHeader'

const page = {
  id: 'page_product',
  title: '产品文档',
  parentId: null,
  icon: '📘',
  cover: null,
  createdAt: '',
  updatedAt: '',
  blocks: [],
}

describe('PageHeader', () => {
  it('renames the page on blur and falls back to 未命名 when empty', async () => {
    const user = userEvent.setup()
    const onRename = vi.fn()

    render(<PageHeader page={page} onRename={onRename} />)

    const input = screen.getByDisplayValue('产品文档')
    await user.clear(input)
    await user.tab()

    expect(onRename).toHaveBeenCalledWith('未命名')
  })
})
