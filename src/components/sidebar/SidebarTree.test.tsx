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
    icon: '📘',
    cover: null,
    createdAt: '',
    updatedAt: '',
    blocks: [],
  },
  {
    id: 'page_child',
    title: '需求池',
    parentId: 'page_parent',
    icon: '📄',
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
        <SidebarTree pages={pages as never} currentPageId="page_parent" onCreatePage={onCreatePage} />
      </MemoryRouter>,
    )

    await user.click(screen.getByRole('button', { name: '新建页面' }))
    expect(onCreatePage).toHaveBeenCalledTimes(1)
  })

  it('renders child pages by indentation without expand or collapse buttons', () => {
    render(
      <MemoryRouter>
        <SidebarTree pages={pages as never} currentPageId="page_parent" onCreatePage={vi.fn()} />
      </MemoryRouter>,
    )

    expect(screen.getByRole('link', { name: '产品' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '需求池' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '展开页面' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '收起页面' })).not.toBeInTheDocument()
  })

  it('does not render page delete actions in the sidebar tree', () => {
    const actionPages = [
      {
        ...pages[0],
        title: 'Parent',
      },
      {
        ...pages[1],
        title: 'Child',
      },
    ]

    render(
      <MemoryRouter>
        <SidebarTree
          pages={actionPages as never}
          currentPageId="page_parent"
          onCreatePage={vi.fn()}
        />
      </MemoryRouter>,
    )

    expect(screen.queryByRole('button', { name: /\u5220\u9664 Child/ })).not.toBeInTheDocument()
  })

  it('renders recent whiteboards from referenced boards only', () => {
    const whiteboardPages = [
      {
        id: 'page_parent',
        title: 'Product',
        parentId: null,
        icon: '??',
        cover: null,
        createdAt: '',
        updatedAt: '',
        blocks: [
          {
            id: 'block-whiteboard',
            type: 'whiteboard',
            boardId: 'board_recent',
          },
        ],
      },
    ]
    const boards = [
      {
        id: 'board_recent',
        title: 'Flow Board',
        snapshot: null,
        createdAt: '',
        updatedAt: '2026-06-18T12:00:00.000Z',
      },
      {
        id: 'board_orphan',
        title: 'Orphan Board',
        snapshot: null,
        createdAt: '',
        updatedAt: '2026-06-18T13:00:00.000Z',
      },
    ]

    render(
      <MemoryRouter>
        <SidebarTree
          pages={whiteboardPages as never}
          boards={boards as never}
          currentPageId="page_parent"
          onCreatePage={vi.fn()}
        />
      </MemoryRouter>,
    )

    expect(screen.getByRole('link', { name: 'Flow Board' })).toHaveAttribute(
      'href',
      '/pages/page_parent/boards/board_recent',
    )
    expect(screen.queryByRole('link', { name: 'Orphan Board' })).not.toBeInTheDocument()
  })

  it('renders referenced data tables under their source page', () => {
    const databasePages = [
      {
        id: 'page_parent',
        title: 'Project',
        parentId: null,
        icon: 'P',
        cover: null,
        createdAt: '',
        updatedAt: '',
        blocks: [
          {
            id: 'block-database',
            type: 'data_table',
            databaseId: 'database_project',
          },
        ],
      },
    ]
    const dataTables = [
      {
        id: 'database_project',
        title: 'Project database',
        icon: 'D',
        cover: null,
        snapshot: null,
        createdAt: '',
        updatedAt: '',
      },
      {
        id: 'database_orphan',
        title: 'Orphan database',
        icon: null,
        cover: null,
        snapshot: null,
        createdAt: '',
        updatedAt: '',
      },
    ]

    render(
      <MemoryRouter>
        <SidebarTree
          pages={databasePages as never}
          dataTables={dataTables as never}
          currentPageId="page_parent"
          onCreatePage={vi.fn()}
        />
      </MemoryRouter>,
    )

    const pageLink = screen.getByRole('link', { name: 'Project' })
    const databaseLink = screen.getByRole('link', { name: 'Project database' })

    expect(databaseLink).toHaveAttribute(
      'href',
      '/pages/page_parent/data-tables/database_project',
    )
    expect(databaseLink).toHaveStyle({ paddingLeft: '26px' })
    expect(pageLink.compareDocumentPosition(databaseLink)).toBe(Node.DOCUMENT_POSITION_FOLLOWING)
    expect(screen.queryByRole('link', { name: 'Orphan database' })).not.toBeInTheDocument()
  })
})
