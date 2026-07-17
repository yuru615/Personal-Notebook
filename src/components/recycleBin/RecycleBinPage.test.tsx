import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { PageRecord } from '../../domain/types'
import { RecycleBinPage } from './RecycleBinPage'

const pages: PageRecord[] = [
  {
    id: 'page_parent',
    parentId: null,
    deletedAt: '2026-07-16T00:00:00.000Z',
    deletedRootId: 'page_parent',
    title: '已删除的父页面',
    icon: '📄',
    cover: null,
    blocks: [],
    createdAt: '2026-07-01T00:00:00.000Z',
    updatedAt: '2026-07-16T00:00:00.000Z',
  },
  {
    id: 'page_child',
    parentId: 'page_parent',
    deletedAt: '2026-07-16T00:00:00.000Z',
    deletedRootId: 'page_parent',
    title: '已删除的子页面',
    icon: '📄',
    cover: null,
    blocks: [],
    createdAt: '2026-07-01T00:00:00.000Z',
    updatedAt: '2026-07-16T00:00:00.000Z',
  },
]

describe('RecycleBinPage', () => {
  it('lists deleted page trees and restores the whole tree', async () => {
    const user = userEvent.setup()
    const onRestorePage = vi.fn()

    render(<RecycleBinPage pages={pages} onRestorePage={onRestorePage} />)

    expect(screen.getByRole('heading', { name: '回收站' })).toBeInTheDocument()
    expect(screen.getByText('已删除的父页面')).toBeInTheDocument()
    expect(screen.getByText('包含 1 个子页面')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '恢复' }))

    expect(onRestorePage).toHaveBeenCalledWith('page_parent')
  })
})
