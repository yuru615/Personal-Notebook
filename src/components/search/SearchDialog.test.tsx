import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { BoardRecord, PageRecord } from '../../domain/types'
import { SearchDialog } from './SearchDialog'

const now = '2026-06-15T00:00:00.000Z'
const searchPlaceholder = '\u641c\u7d22\u9875\u9762\u6216\u5185\u5bb9'
const openPageLabel = '\u6253\u5f00\u9875\u9762'
const openWhiteboardLabel = '\u6253\u5f00\u767d\u677f'

const pages: PageRecord[] = [
  {
    id: 'page-a',
    parentId: null,
    title: 'Customer Feedback',
    icon: '📑',
    cover: null,
    blocks: [{ id: 'block-a', type: 'paragraph', text: 'Interview notes' }],
    createdAt: now,
    updatedAt: now,
  },
  {
    id: 'page-b',
    parentId: null,
    title: 'Search Improvements',
    icon: '📄',
    cover: null,
    blocks: [{ id: 'block-b', type: 'paragraph', text: 'Feedback entry opens faster' }],
    createdAt: now,
    updatedAt: now,
  },
]

const boards: BoardRecord[] = [
  {
    id: 'board-feedback',
    title: 'Feedback Board',
    snapshot: null,
    createdAt: now,
    updatedAt: '2026-06-16T00:00:00.000Z',
  },
  {
    id: 'board-orphan',
    title: 'Orphan Board',
    snapshot: null,
    createdAt: now,
    updatedAt: '2026-06-17T00:00:00.000Z',
  },
]

const whiteboardPages: PageRecord[] = [
  {
    id: 'page-a',
    parentId: null,
    title: 'Customer Feedback',
    icon: '📑',
    cover: null,
    blocks: [{ id: 'block-whiteboard', type: 'whiteboard', boardId: 'board-feedback' }],
    createdAt: now,
    updatedAt: now,
  },
]

describe('SearchDialog', () => {
  it('opens the selected search result with the keyboard', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    const onOpenPage = vi.fn()

    render(<SearchDialog open pages={pages} onClose={onClose} onOpenPage={onOpenPage} />)

    const input = screen.getByPlaceholderText(searchPlaceholder)
    await user.type(input, 'feedback')

    const firstResult = screen.getByRole('button', { name: `${openPageLabel} Customer Feedback` })
    const secondResult = screen.getByRole('button', { name: `${openPageLabel} Search Improvements` })
    expect(firstResult).toHaveClass('search-result-active')

    fireEvent.keyDown(input, { key: 'ArrowDown' })
    expect(secondResult).toHaveClass('search-result-active')

    fireEvent.keyDown(input, { key: 'Enter' })

    expect(onOpenPage).toHaveBeenCalledWith('page-b')
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('opens a referenced whiteboard result and hides orphan whiteboards', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    const onOpenPage = vi.fn()
    const onOpenBoard = vi.fn()

    render(
      <SearchDialog
        open
        pages={whiteboardPages}
        boards={boards}
        onClose={onClose}
        onOpenPage={onOpenPage}
        onOpenBoard={onOpenBoard}
      />,
    )

    await user.type(screen.getByPlaceholderText(searchPlaceholder), 'feedback board')

    expect(
      screen.queryByRole('button', { name: `${openWhiteboardLabel} Orphan Board` }),
    ).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: `${openWhiteboardLabel} Feedback Board` }))

    expect(onOpenBoard).toHaveBeenCalledWith('page-a', 'board-feedback')
    expect(onOpenPage).not.toHaveBeenCalled()
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
