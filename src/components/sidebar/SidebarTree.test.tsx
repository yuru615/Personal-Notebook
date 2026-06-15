import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { SidebarTree } from './SidebarTree'

const pages = [
  {
    id: 'page_parent',
    title: '产品',
    parentId: null,
    icon: '💼',
    cover: null,
    createdAt: '',
    updatedAt: '',
    blocks: [],
  },
]

describe('SidebarTree', () => {
  it('creates a new page via the Chinese button', async () => {
    const user = userEvent.setup()
    const onCreatePage = vi.fn()

    render(
      <MemoryRouter>
        <SidebarTree pages={pages} currentPageId="page_parent" onCreatePage={onCreatePage} />
      </MemoryRouter>,
    )

    await user.click(screen.getByRole('button', { name: /新建页面/i }))
    expect(onCreatePage).toHaveBeenCalledTimes(1)
  })
})
