import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SidebarTree } from './SidebarTree'

const pages = [
  {
    id: 'page_parent',
    title: '产品',
    parentId: null,
    icon: '📌',
    cover: null,
    createdAt: '',
    updatedAt: '',
    blocks: [],
  },
  {
    id: 'page_child',
    title: '需求池',
    parentId: 'page_parent',
    icon: '📫',
    cover: null,
    createdAt: '',
    updatedAt: '',
    blocks: [],
  },
]

describe('SidebarTree', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

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

  it('renders the compact sidebar tools and lets users switch layout mode', async () => {
    const user = userEvent.setup()
    const onSetSidebarLayout = vi.fn()

    render(
      <MemoryRouter>
        <SidebarTree
          pages={pages as never}
          currentPageId="page_parent"
          onCreatePage={vi.fn()}
          layout="compact"
          onSetSidebarLayout={onSetSidebarLayout}
        />
      </MemoryRouter>,
    )

    expect(screen.getByText('本地工作区')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '搜索' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '新建页面' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '导入' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '消息' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '更多' }))
    await user.click(screen.getByRole('button', { name: '经典模式' }))

    expect(onSetSidebarLayout).toHaveBeenCalledWith('classic')
  })

  it('lets parent pages collapse and expand their child pages', async () => {
    const user = userEvent.setup()

    render(
      <MemoryRouter>
        <SidebarTree pages={pages as never} currentPageId="page_parent" onCreatePage={vi.fn()} />
      </MemoryRouter>,
    )

    expect(screen.getByRole('link', { name: '产品' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '需求池' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '收起页面' }))
    expect(screen.queryByRole('link', { name: '需求池' })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '展开页面' }))
    expect(screen.getByRole('link', { name: '需求池' })).toBeInTheDocument()
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

    expect(screen.queryByRole('button', { name: /删除 Child/ })).not.toBeInTheDocument()
  })

  it('renders recent whiteboards from referenced boards only', () => {
    const whiteboardPages = [
      {
        id: 'page_parent',
        title: 'Product',
        parentId: null,
        icon: 'P',
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
    expect(databaseLink).toHaveStyle({ paddingLeft: '44px' })
    expect(pageLink.compareDocumentPosition(databaseLink)).toBe(Node.DOCUMENT_POSITION_FOLLOWING)
    expect(screen.queryByRole('link', { name: 'Orphan database' })).not.toBeInTheDocument()
  })

  it('hides referenced data tables when the parent page is collapsed', async () => {
    const user = userEvent.setup()
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
      {
        id: 'page_child',
        title: 'Nested page',
        parentId: 'page_parent',
        icon: 'C',
        cover: null,
        createdAt: '',
        updatedAt: '',
        blocks: [],
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

    expect(screen.getByRole('link', { name: 'Project database' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '收起页面' }))

    expect(screen.queryByRole('link', { name: 'Project database' })).not.toBeInTheDocument()
  })

  it('shows a collapse toggle for pages that only have nested data tables', async () => {
    const user = userEvent.setup()
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

    expect(screen.getByRole('button', { name: '收起页面' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '收起页面' }))
    expect(screen.queryByRole('link', { name: 'Project database' })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '展开页面' }))
    expect(screen.getByRole('link', { name: 'Project database' })).toBeInTheDocument()
  })

  it('renders child pages with the shared default icon and nested padding on first paint', () => {
    const nestedPages = [
      {
        id: 'page_parent',
        title: 'Project',
        parentId: null,
        icon: 'P',
        cover: null,
        createdAt: '',
        updatedAt: '',
        blocks: [],
      },
      {
        id: 'page_child',
        title: 'Nested page',
        parentId: 'page_parent',
        icon: null,
        cover: null,
        createdAt: '',
        updatedAt: '',
        blocks: [],
      },
    ]

    render(
      <MemoryRouter>
        <SidebarTree
          pages={nestedPages as never}
          currentPageId="page_parent"
          onCreatePage={vi.fn()}
        />
      </MemoryRouter>,
    )

    const childLink = screen.getByRole('link', { name: 'Nested page' })

    expect(childLink).toHaveStyle({ paddingLeft: '44px' })
    expect(childLink).toHaveTextContent('📄')
  })

  it('keeps top-level leaf pages aligned with pages that have collapse controls', () => {
    const leafPages = [
      {
        id: 'page_leaf',
        title: 'Quick Start',
        parentId: null,
        icon: 'Q',
        cover: null,
        createdAt: '',
        updatedAt: '',
        blocks: [],
      },
      {
        id: 'page_parent',
        title: 'Parent',
        parentId: null,
        icon: 'P',
        cover: null,
        createdAt: '',
        updatedAt: '',
        blocks: [],
      },
      {
        id: 'page_child',
        title: 'Child',
        parentId: 'page_parent',
        icon: 'C',
        cover: null,
        createdAt: '',
        updatedAt: '',
        blocks: [],
      },
    ]

    render(
      <MemoryRouter>
        <SidebarTree
          pages={leafPages as never}
          currentPageId="page_leaf"
          onCreatePage={vi.fn()}
        />
      </MemoryRouter>,
    )

    expect(screen.getByRole('link', { name: 'Quick Start' })).toHaveStyle({ paddingLeft: '28px' })
    expect(screen.getByRole('link', { name: 'Parent' })).toHaveStyle({ paddingLeft: '28px' })
  })

  it('uses tighter tree indentation in compact mode', () => {
    const nestedPages = [
      {
        id: 'page_parent',
        title: 'Project',
        parentId: null,
        icon: 'P',
        cover: null,
        createdAt: '',
        updatedAt: '',
        blocks: [],
      },
      {
        id: 'page_child',
        title: 'Nested page',
        parentId: 'page_parent',
        icon: 'C',
        cover: null,
        createdAt: '',
        updatedAt: '',
        blocks: [],
      },
    ]

    render(
      <MemoryRouter>
        <SidebarTree
          pages={nestedPages as never}
          currentPageId="page_parent"
          onCreatePage={vi.fn()}
          layout="compact"
        />
      </MemoryRouter>,
    )

    expect(screen.getByRole('link', { name: 'Project' })).toHaveStyle({ paddingLeft: '24px' })
    expect(screen.getByRole('link', { name: 'Nested page' })).toHaveStyle({ paddingLeft: '38px' })
  })

  it('opens the page actions menu and triggers rename, duplicate, and delete actions', async () => {
    const user = userEvent.setup()
    const onRenamePage = vi.fn()
    const onDuplicatePage = vi.fn()
    const onDeletePage = vi.fn()
    const promptSpy = vi.spyOn(window, 'prompt').mockReturnValue('Renamed page')

    render(
      <MemoryRouter>
        <SidebarTree
          pages={pages as never}
          currentPageId="page_parent"
          onCreatePage={vi.fn()}
          onRenamePage={onRenamePage}
          onDuplicatePage={onDuplicatePage}
          onDeletePage={onDeletePage}
        />
      </MemoryRouter>,
    )

    await user.click(screen.getAllByRole('button', { name: '页面更多操作' })[0])
    await user.click(screen.getByRole('button', { name: '重命名页面' }))
    expect(onRenamePage).toHaveBeenCalledWith('page_parent', 'Renamed page')

    await user.click(screen.getAllByRole('button', { name: '页面更多操作' })[0])
    await user.click(screen.getByRole('button', { name: '复制页面' }))
    expect(onDuplicatePage).toHaveBeenCalledWith('page_parent')

    await user.click(screen.getAllByRole('button', { name: '页面更多操作' })[0])
    await user.click(screen.getByRole('button', { name: '删除页面' }))
    expect(onDeletePage).toHaveBeenCalledWith('page_parent')

    promptSpy.mockRestore()
  })

  it('renders the page actions menu in a fixed layer so a narrow sidebar does not clip it', async () => {
    const user = userEvent.setup()
    const originalInnerWidth = window.innerWidth
    const originalInnerHeight = window.innerHeight

    Object.defineProperty(window, 'innerWidth', {
      configurable: true,
      writable: true,
      value: 1280,
    })
    Object.defineProperty(window, 'innerHeight', {
      configurable: true,
      writable: true,
      value: 720,
    })

    const rectSpy = vi
      .spyOn(HTMLElement.prototype, 'getBoundingClientRect')
      .mockImplementation(function mockRect() {
        if (this.classList?.contains('sidebar-tree-more-button')) {
          return {
            x: 160,
            y: 212,
            top: 212,
            right: 184,
            bottom: 236,
            left: 160,
            width: 24,
            height: 24,
            toJSON: () => ({}),
          }
        }

        if (this.classList?.contains('sidebar-tree-page-menu-popover')) {
          return {
            x: 0,
            y: 0,
            top: 0,
            right: 176,
            bottom: 124,
            left: 0,
            width: 176,
            height: 124,
            toJSON: () => ({}),
          }
        }

        return {
          x: 0,
          y: 0,
          top: 0,
          right: 0,
          bottom: 0,
          left: 0,
          width: 0,
          height: 0,
          toJSON: () => ({}),
        }
      })

    render(
      <MemoryRouter>
        <SidebarTree
          pages={pages as never}
          currentPageId="page_parent"
          onCreatePage={vi.fn()}
          onRenamePage={vi.fn()}
        />
      </MemoryRouter>,
    )

    await user.click(screen.getAllByRole('button', { name: '页面更多操作' })[0])

    const popover = document.body.querySelector('.sidebar-tree-page-menu-popover')

    expect(popover).not.toBeNull()
    expect(popover).toHaveStyle({
      position: 'fixed',
      left: '192px',
      top: '208px',
    })

    rectSpy.mockRestore()
    Object.defineProperty(window, 'innerWidth', {
      configurable: true,
      writable: true,
      value: originalInnerWidth,
    })
    Object.defineProperty(window, 'innerHeight', {
      configurable: true,
      writable: true,
      value: originalInnerHeight,
    })
  })

  it('renders the top utility menu in a fixed layer so a narrow sidebar does not clip it', async () => {
    const user = userEvent.setup()
    const originalInnerWidth = window.innerWidth
    const originalInnerHeight = window.innerHeight

    Object.defineProperty(window, 'innerWidth', {
      configurable: true,
      writable: true,
      value: 1280,
    })
    Object.defineProperty(window, 'innerHeight', {
      configurable: true,
      writable: true,
      value: 720,
    })

    const rectSpy = vi
      .spyOn(HTMLElement.prototype, 'getBoundingClientRect')
      .mockImplementation(function mockRect() {
        if (this.classList?.contains('sidebar-tool-button') && this.getAttribute('aria-label') === '更多') {
          return {
            x: 168,
            y: 56,
            top: 56,
            right: 204,
            bottom: 88,
            left: 168,
            width: 36,
            height: 32,
            toJSON: () => ({}),
          }
        }

        if (this.classList?.contains('sidebar-utility-menu-popover')) {
          return {
            x: 0,
            y: 0,
            top: 0,
            right: 164,
            bottom: 92,
            left: 0,
            width: 164,
            height: 92,
            toJSON: () => ({}),
          }
        }

        return {
          x: 0,
          y: 0,
          top: 0,
          right: 0,
          bottom: 0,
          left: 0,
          width: 0,
          height: 0,
          toJSON: () => ({}),
        }
      })

    render(
      <MemoryRouter>
        <SidebarTree
          pages={pages as never}
          currentPageId="page_parent"
          onCreatePage={vi.fn()}
          layout="compact"
          onSetSidebarLayout={vi.fn()}
        />
      </MemoryRouter>,
    )

    await user.click(screen.getByRole('button', { name: '更多' }))

    const popover = document.body.querySelector('.sidebar-utility-menu-popover')

    expect(popover).not.toBeNull()
    expect(popover).toHaveStyle({
      position: 'fixed',
      left: '212px',
      top: '52px',
    })

    rectSpy.mockRestore()
    Object.defineProperty(window, 'innerWidth', {
      configurable: true,
      writable: true,
      value: originalInnerWidth,
    })
    Object.defineProperty(window, 'innerHeight', {
      configurable: true,
      writable: true,
      value: originalInnerHeight,
    })
  })
})
