import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { BoardRecord, DataTableRecord, MindmapRecord, PageRecord } from '../../domain/types'
import { SearchDialog } from './SearchDialog'

const now = '2026-06-15T00:00:00.000Z'
const searchPlaceholder = '搜索页面或内容'
const openPageLabel = '打开页面'
const openWhiteboardLabel = '打开白板'
const openDataTableLabel = '打开数据表格'
const openDataTableRecordLabel = '打开记录'

const pages: PageRecord[] = [
  {
    id: 'page-a',
    parentId: null,
    title: 'Customer Feedback',
    icon: '📝',
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
    icon: '📝',
    cover: null,
    blocks: [{ id: 'block-whiteboard', type: 'whiteboard', boardId: 'board-feedback' }],
    createdAt: now,
    updatedAt: now,
  },
]

const dataTablePages: PageRecord[] = [
  {
    id: 'page-a',
    parentId: null,
    title: 'Customer Feedback',
    icon: '🗂',
    cover: null,
    blocks: [{ id: 'block-data', type: 'data_table', databaseId: 'database-feedback' }],
    createdAt: now,
    updatedAt: now,
  },
]

const dataTables: DataTableRecord[] = [
  {
    id: 'database-feedback',
    title: 'Feedback Database',
    snapshot: {
      version: 1,
      records: {
        'record-a': {
          id: 'record-a',
          title: 'Interview Record',
          values: {},
          createdAt: now,
          updatedAt: now,
        },
      },
    },
    createdAt: now,
    updatedAt: now,
  },
]

const mindmapPages: PageRecord[] = [
  {
    id: 'page-mindmap',
    parentId: null,
    title: 'Strategy Workspace',
    icon: '🧭',
    cover: null,
    blocks: [{ id: 'block-mindmap', type: 'mindmap', mindmapId: 'mindmap-strategy' }],
    createdAt: now,
    updatedAt: now,
  },
]

const mindmaps: MindmapRecord[] = [
  {
    id: 'mindmap-strategy',
    title: 'Strategy Map',
    snapshot: {
      id: 'doc-root',
      title: 'Strategy Map',
      structure: 'mindmap',
      rootId: 'node-root',
      nodes: {
        'node-root': {
          id: 'node-root',
          parentId: null,
          childIds: ['node-1'],
          text: 'Strategy Map',
          collapsed: false,
        },
        'node-1': {
          id: 'node-1',
          parentId: 'node-root',
          childIds: [],
          text: 'North star metric',
          collapsed: false,
        },
      },
    },
    createdAt: now,
    updatedAt: now,
  },
]

describe('SearchDialog', () => {
  it('renders the overlay at the document root so it covers the whole app shell', () => {
    const { container } = render(
      <div data-testid="search-host">
        <SearchDialog open pages={pages} onClose={vi.fn()} onOpenPage={vi.fn()} />
      </div>,
    )

    expect(container.querySelector('.search-overlay')).toBeNull()
    expect(document.body.querySelector('.search-overlay')).toBeInTheDocument()
  })

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

    expect(onOpenPage).toHaveBeenCalledWith('page-b', 'block-b')
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('scrolls the active result into view when keyboard navigation changes selection', async () => {
    const user = userEvent.setup()
    const scrollIntoView = vi.fn()
    const originalScrollIntoView = HTMLElement.prototype.scrollIntoView
    HTMLElement.prototype.scrollIntoView = scrollIntoView

    try {
      render(<SearchDialog open pages={pages} onClose={vi.fn()} onOpenPage={vi.fn()} />)

      const input = screen.getByPlaceholderText(searchPlaceholder)
      await user.type(input, 'feedback')
      scrollIntoView.mockClear()

      fireEvent.keyDown(input, { key: 'ArrowDown' })

      expect(scrollIntoView).toHaveBeenCalledWith({ block: 'nearest' })
      expect(
        screen.getByRole('button', { name: `${openPageLabel} Search Improvements` }),
      ).toHaveClass('search-result-active')
    } finally {
      HTMLElement.prototype.scrollIntoView = originalScrollIntoView
    }
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

  it('renders a mindmap group and opens referenced mindmap results', async () => {
    const user = userEvent.setup()
    const onOpenPage = vi.fn()
    const onOpenMindmap = vi.fn()

    render(
      <SearchDialog
        open
        pages={mindmapPages}
        mindmaps={mindmaps}
        onClose={vi.fn()}
        onOpenPage={onOpenPage}
        onOpenMindmap={onOpenMindmap}
      />,
    )

    await user.type(screen.getByPlaceholderText(searchPlaceholder), 'north star')

    expect(await screen.findByRole('heading', { name: '导图' })).toBeInTheDocument()
    expect(screen.getByText('导图节点')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '打开导图 Strategy Map' }))

    expect(onOpenMindmap).toHaveBeenCalledWith('page-mindmap', 'mindmap-strategy')
    expect(onOpenPage).not.toHaveBeenCalled()
  })

  it('opens referenced data table results', async () => {
    const user = userEvent.setup()
    const onOpenPage = vi.fn()
    const onOpenDataTable = vi.fn()

    render(
      <SearchDialog
        open
        pages={dataTablePages}
        dataTables={dataTables}
        onClose={vi.fn()}
        onOpenPage={onOpenPage}
        onOpenDataTable={onOpenDataTable}
      />,
    )

    await user.type(screen.getByPlaceholderText(searchPlaceholder), 'feedback database')
    await user.click(
      screen.getByRole('button', { name: `${openDataTableLabel} Feedback Database` }),
    )

    expect(onOpenDataTable).toHaveBeenCalledWith('page-a', 'database-feedback', undefined)
    expect(onOpenPage).not.toHaveBeenCalled()
  })

  it('opens referenced data table record results', async () => {
    const user = userEvent.setup()
    const onOpenPage = vi.fn()
    const onOpenDataTable = vi.fn()

    render(
      <SearchDialog
        open
        pages={dataTablePages}
        dataTables={dataTables}
        onClose={vi.fn()}
        onOpenPage={onOpenPage}
        onOpenDataTable={onOpenDataTable}
      />,
    )

    await user.type(screen.getByPlaceholderText(searchPlaceholder), 'interview record')
    await user.click(
      screen.getByRole('button', { name: `${openDataTableRecordLabel} Interview Record` }),
    )

    expect(onOpenDataTable).toHaveBeenCalledWith('page-a', 'database-feedback', 'record-a')
  })

  it('renders legacy asynchronous backend search results without metadata', async () => {
    const user = userEvent.setup()
    const onOpenPage = vi.fn()
    const onSearch = vi.fn().mockResolvedValue([
      {
        kind: 'page',
        pageId: 'page-async',
        title: 'Async Result',
        icon: '📄',
        excerpt: 'Loaded from storage',
      },
    ])

    render(
      <SearchDialog
        open
        pages={[]}
        onClose={vi.fn()}
        onOpenPage={onOpenPage}
        onSearch={onSearch}
      />,
    )

    await user.type(screen.getByPlaceholderText(searchPlaceholder), 'async')

    expect(await screen.findByText('Loaded from storage')).toBeInTheDocument()
    expect(screen.getByText('正文')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: `${openPageLabel} Async Result` }))
    expect(onOpenPage).toHaveBeenCalledWith('page-async', undefined)
  })

  it('shows relation source labels for asynchronous page relation hits', async () => {
    const user = userEvent.setup()

    render(
      <SearchDialog
        open
        pages={[]}
        onClose={vi.fn()}
        onOpenPage={vi.fn()}
        onSearch={vi.fn().mockResolvedValue([
          {
            kind: 'page',
            pageId: 'page-source',
            blockId: 'block-relation',
            title: 'Meeting Notes',
            icon: '📝',
            excerpt: 'See Product Plan',
            matchSource: 'page_link',
          },
        ])}
      />,
    )

    await user.type(screen.getByPlaceholderText(searchPlaceholder), 'Product')

    expect(await screen.findByText('页面链接')).toBeInTheDocument()
  })

  it('renders multiple results from the same page with distinct accessible labels', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    const onOpenPage = vi.fn()
    const multiMatchPages: PageRecord[] = [
      {
        id: 'page-multi',
        parentId: null,
        title: 'Search Notes',
        icon: '📄',
        cover: null,
        blocks: [
          { id: 'block-1', type: 'paragraph', text: 'customer interview summary' },
          { id: 'block-2', type: 'paragraph', text: 'customer follow-up checklist' },
        ],
        createdAt: now,
        updatedAt: now,
      },
    ]

    render(
      <SearchDialog open pages={multiMatchPages} onClose={onClose} onOpenPage={onOpenPage} />,
    )

    await user.type(screen.getByPlaceholderText(searchPlaceholder), 'customer')

    expect(
      screen.getByRole('button', {
        name: `${openPageLabel} Search Notes customer interview summary`,
      }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', {
        name: `${openPageLabel} Search Notes customer follow-up checklist`,
      }),
    ).toBeInTheDocument()
  })

  it('renders grouped results and filters tags/status hits with chips', async () => {
    const user = userEvent.setup()

    render(
      <SearchDialog
        open
        pages={[]}
        onClose={vi.fn()}
        onOpenPage={vi.fn()}
        onSearch={vi.fn().mockResolvedValue([
          {
            kind: 'page',
            pageId: 'page-1',
            title: '产品规划',
            icon: '📄',
            excerpt: '产品 / 搜索',
            matchSource: 'property',
            matchKey: 'tags',
            sourceLabel: '标签',
          },
          {
            kind: 'page',
            pageId: 'page-1',
            title: '产品规划',
            icon: '📄',
            excerpt: '进行中',
            matchSource: 'property',
            matchKey: 'status',
            sourceLabel: '状态',
          },
          {
            kind: 'whiteboard',
            pageId: 'page-2',
            boardId: 'board-1',
            title: '规划白板',
            icon: '□',
            excerpt: '白板 · 产品规划',
            matchSource: 'whiteboard',
            sourceLabel: '白板',
          },
          {
            kind: 'data_table',
            pageId: 'page-3',
            databaseId: 'database-1',
            title: '产品数据库',
            icon: '▦',
            excerpt: '数据表格 · 产品规划',
            matchSource: 'data_table',
            sourceLabel: '数据表格',
          },
        ])}
      />,
    )

    await user.type(screen.getByPlaceholderText(searchPlaceholder), '产品')

    expect(await screen.findByRole('heading', { name: '页面' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '白板' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '数据表格' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '标签' }))
    expect(screen.getByText('产品 / 搜索')).toBeInTheDocument()
    expect(screen.queryByText('进行中')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '状态' }))
    expect(screen.getByText('进行中')).toBeInTheDocument()
    expect(screen.queryByText('产品 / 搜索')).not.toBeInTheDocument()
  })

  it('includes data table records in the data table filter chip', async () => {
    const user = userEvent.setup()

    render(
      <SearchDialog
        open
        pages={[]}
        onClose={vi.fn()}
        onOpenPage={vi.fn()}
        onSearch={vi.fn().mockResolvedValue([
          {
            kind: 'data_table',
            pageId: 'page-3',
            databaseId: 'database-1',
            title: '产品数据库',
            icon: '▦',
            excerpt: '数据表格 · 产品规划',
            matchSource: 'data_table',
            sourceLabel: '数据表格',
          },
          {
            kind: 'data_table_record',
            pageId: 'page-3',
            databaseId: 'database-1',
            recordId: 'record-1',
            title: '路线图记录',
            icon: '▦',
            excerpt: '产品数据库 · 记录',
          },
        ])}
      />,
    )

    await user.type(screen.getByPlaceholderText(searchPlaceholder), '产品')
    expect(await screen.findByText('路线图记录')).toBeInTheDocument()
    await user.click(await screen.findByRole('button', { name: '数据表格' }))

    expect(screen.getByText('产品数据库')).toBeInTheDocument()
    expect(screen.getByText('路线图记录')).toBeInTheDocument()
  })
})
