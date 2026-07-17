import { createEvent, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
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
    const onOpenRecycleBin = vi.fn()

    render(
      <MemoryRouter>
        <SidebarTree
          pages={pages as never}
          currentPageId="page_parent"
          onCreatePage={vi.fn()}
          layout="compact"
          onSetSidebarLayout={onSetSidebarLayout}
          onOpenRecycleBin={onOpenRecycleBin}
        />
      </MemoryRouter>,
    )

    expect(screen.getByText('本地工作区')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '搜索' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '新建页面' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '导入内容' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '回收站' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '消息' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '搜索' })).toHaveAttribute('data-tooltip', '搜索')
    expect(screen.getByRole('button', { name: '回收站' })).toHaveAttribute(
      'data-tooltip',
      '回收站',
    )

    await user.click(screen.getByRole('button', { name: '回收站' }))
    expect(onOpenRecycleBin).toHaveBeenCalledTimes(1)

    await user.click(screen.getByRole('button', { name: '更多' }))
    await user.click(screen.getByRole('button', { name: '经典模式' }))

    expect(onSetSidebarLayout).toHaveBeenCalledWith('classic')
  })

  it('triggers workspace export from the sidebar utility menu', async () => {
    const user = userEvent.setup()
    const onExportWorkspace = vi.fn()

    render(
      <MemoryRouter>
        <SidebarTree
          pages={pages as never}
          currentPageId="page_parent"
          onCreatePage={vi.fn()}
          layout="compact"
          onExportWorkspace={onExportWorkspace}
        />
      </MemoryRouter>,
    )

    await user.click(screen.getByRole('button', { name: '更多' }))
    await user.click(screen.getByRole('button', { name: '全部导出' }))

    expect(onExportWorkspace).toHaveBeenCalledTimes(1)
  })

  it('triggers content import from the compact import button', async () => {
    const user = userEvent.setup()
    const onImportContent = vi.fn()

    render(
      <MemoryRouter>
        <SidebarTree
          {...({
            pages: pages as never,
            currentPageId: 'page_parent',
            onCreatePage: vi.fn(),
            layout: 'compact',
            onImportContent,
          } as never)}
        />
      </MemoryRouter>,
    )

    await user.click(screen.getByRole('button', { name: '导入内容' }))

    expect(onImportContent).toHaveBeenCalledTimes(1)
  })

  it('renders a settings action in the utility menu', async () => {
    const user = userEvent.setup()

    render(
      <MemoryRouter>
        <SidebarTree
          pages={pages as never}
          currentPageId="page_parent"
          onCreatePage={vi.fn()}
          layout="compact"
          onOpenSettings={vi.fn()}
        />
      </MemoryRouter>,
    )

    await user.click(screen.getByRole('button', { name: '更多' }))
    expect(screen.getByRole('button', { name: '设置' })).toBeInTheDocument()
  })

  it('adds the scrolled header state only after the sidebar content starts scrolling', async () => {
    const { container } = render(
      <MemoryRouter>
        <SidebarTree
          pages={pages as never}
          currentPageId="page_parent"
          onCreatePage={vi.fn()}
          layout="compact"
        />
      </MemoryRouter>,
    )

    const fixedTop = container.querySelector('.sidebar-fixed-top')
    const scrollContent = container.querySelector('.sidebar-scroll-content')

    expect(fixedTop).not.toBeNull()
    expect(scrollContent).not.toBeNull()
    expect(fixedTop).not.toHaveClass('sidebar-fixed-top-scrolled')

    Object.defineProperty(scrollContent as HTMLDivElement, 'scrollTop', {
      configurable: true,
      value: 24,
    })
    fireEvent.scroll(scrollContent as HTMLDivElement)

    await waitFor(() => expect(fixedTop).toHaveClass('sidebar-fixed-top-scrolled'))

    Object.defineProperty(scrollContent as HTMLDivElement, 'scrollTop', {
      configurable: true,
      value: 0,
    })
    fireEvent.scroll(scrollContent as HTMLDivElement)

    await waitFor(() => expect(fixedTop).not.toHaveClass('sidebar-fixed-top-scrolled'))
  })

  it('compensates the fixed sidebar header when window scrolling nudges its sticky position', async () => {
    let sidebarLayoutTop = 12

    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function () {
      if ((this as Element).classList.contains('sidebar')) {
        return {
          x: 0,
          y: sidebarLayoutTop,
          top: sidebarLayoutTop,
          left: 0,
          bottom: sidebarLayoutTop + 120,
          right: 120,
          width: 120,
          height: 120,
          toJSON() {
            return {}
          },
        } as DOMRect
      }

      return {
        x: 0,
        y: 0,
        top: 0,
        left: 0,
        bottom: 0,
        right: 0,
        width: 0,
        height: 0,
        toJSON() {
          return {}
        },
      } as DOMRect
    })

    const { container } = render(
      <div className="sidebar">
        <MemoryRouter>
          <SidebarTree
            pages={pages as never}
            currentPageId="page_parent"
            onCreatePage={vi.fn()}
            layout="compact"
          />
        </MemoryRouter>
      </div>,
    )

    const sidebarLayout = container.querySelector('.sidebar-layout') as HTMLDivElement | null

    expect(sidebarLayout).not.toBeNull()
    await waitFor(() =>
      expect(sidebarLayout?.style.getPropertyValue('--sidebar-fixed-top-offset')).toBe('0px'),
    )

    sidebarLayoutTop = 11.5
    fireEvent.scroll(window)

    await waitFor(() =>
      expect(sidebarLayout?.style.getPropertyValue('--sidebar-fixed-top-offset')).toBe('0.5px'),
    )
  })

  it('renders the my pages section and lets users collapse and expand it', async () => {
    const user = userEvent.setup()

    render(
      <MemoryRouter>
        <SidebarTree pages={pages as never} currentPageId="page_parent" onCreatePage={vi.fn()} />
      </MemoryRouter>,
    )

    expect(screen.getByText('我的页面')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '产品' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '收起我的页面' }))

    expect(screen.queryByRole('link', { name: '产品' })).not.toBeInTheDocument()
    expect(screen.queryByLabelText('页面树')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '展开我的页面' }))

    expect(screen.getByRole('link', { name: '产品' })).toBeInTheDocument()
    expect(screen.getByLabelText('页面树')).toBeInTheDocument()
  })

  it('does not render the shared pages section when there are no shared entries', () => {
    render(
      <MemoryRouter>
        <SidebarTree pages={pages as never} currentPageId="page_parent" onCreatePage={vi.fn()} />
      </MemoryRouter>,
    )

    expect(screen.queryByText('共享页面')).not.toBeInTheDocument()
  })

  it('renders the inbox page inside a system section', () => {
    render(
      <MemoryRouter>
        <SidebarTree
          pages={[{ ...pages[0], id: 'page_inbox', title: '收件箱' }, ...pages] as never}
          currentPageId="page_parent"
          inboxPageId="page_inbox"
          onCreatePage={vi.fn()}
        />
      </MemoryRouter>,
    )

    expect(screen.getByText('系统')).toBeInTheDocument()
    expect(screen.getByLabelText('系统')).toBeInTheDocument()
    expect(
      within(screen.getByLabelText('系统')).getByRole('link', { name: '收件箱' }),
    ).toBeInTheDocument()
  })

  it('does not render the inbox page again inside my pages', () => {
    render(
      <MemoryRouter>
        <SidebarTree
          pages={[{ ...pages[0], id: 'page_inbox', title: '收件箱' }, ...pages] as never}
          currentPageId="page_parent"
          inboxPageId="page_inbox"
          onCreatePage={vi.fn()}
        />
      </MemoryRouter>,
    )

    expect(screen.getAllByRole('link', { name: '收件箱' })).toHaveLength(1)
  })

  it('lets users collapse and expand the system section', async () => {
    const user = userEvent.setup()

    render(
      <MemoryRouter>
        <SidebarTree
          pages={[{ ...pages[0], id: 'page_inbox', title: '收件箱' }, ...pages] as never}
          currentPageId="page_parent"
          inboxPageId="page_inbox"
          onCreatePage={vi.fn()}
        />
      </MemoryRouter>,
    )

    await user.click(screen.getByRole('button', { name: '收起系统' }))
    expect(screen.queryByLabelText('系统')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '展开系统' }))
    expect(screen.getByLabelText('系统')).toBeInTheDocument()
  })

  it('lets users collapse and expand the pinned section', async () => {
    const user = userEvent.setup()

    render(
      <MemoryRouter>
        <SidebarTree
          pages={pages as never}
          currentPageId="page_parent"
          onCreatePage={vi.fn()}
          pinnedSidebarItems={[{ kind: 'page', pageId: 'page_parent' }]}
        />
      </MemoryRouter>,
    )

    expect(screen.getByText('星标置顶')).toBeInTheDocument()
    expect(screen.getByLabelText('星标置顶')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '收起星标置顶' }))

    expect(screen.queryByLabelText('星标置顶')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '展开星标置顶' }))

    expect(screen.getByLabelText('星标置顶')).toBeInTheDocument()
  })

  it('keeps page-level expand state after collapsing and expanding the my pages section', async () => {
    const user = userEvent.setup()

    render(
      <MemoryRouter>
        <SidebarTree pages={pages as never} currentPageId="page_parent" onCreatePage={vi.fn()} />
      </MemoryRouter>,
    )

    await user.click(screen.getByRole('button', { name: '收起页面' }))
    expect(screen.queryByRole('link', { name: '需求池' })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '收起我的页面' }))
    await user.click(screen.getByRole('button', { name: '展开我的页面' }))

    expect(screen.queryByRole('link', { name: '需求池' })).not.toBeInTheDocument()
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

  it('does not render a recent whiteboards section even when whiteboards exist', () => {
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
    render(
      <MemoryRouter>
        <SidebarTree
          pages={whiteboardPages as never}
          currentPageId="page_parent"
          onCreatePage={vi.fn()}
        />
      </MemoryRouter>,
    )

    expect(screen.queryByRole('link', { name: 'Flow Board' })).not.toBeInTheDocument()
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
      <MemoryRouter initialEntries={['/pages/page_parent/data-tables/database_project']}>
        <SidebarTree
          pages={databasePages as never}
          dataTables={dataTables as never}
          currentPageId="page_parent"
          onCreatePage={vi.fn()}
        />
      </MemoryRouter>,
    )

    expect(screen.getByRole('link', { name: 'Project' })).not.toHaveClass('sidebar-link-active')
    expect(screen.getByRole('link', { name: 'Project database' })).toHaveClass('sidebar-link-active')
    expect(document.querySelector('.sidebar-tree-page-row')).not.toHaveClass('sidebar-tree-row-active')
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
    const onExportPage = vi.fn()
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
          onExportPage={onExportPage}
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

  it('triggers page export from the page actions menu', async () => {
    const user = userEvent.setup()
    const onExportPage = vi.fn()

    render(
      <MemoryRouter>
        <SidebarTree
          pages={pages as never}
          currentPageId="page_parent"
          onCreatePage={vi.fn()}
          onExportPage={onExportPage}
        />
      </MemoryRouter>,
    )

    await user.click(screen.getAllByRole('button', { name: '页面更多操作' })[0])
    await user.click(screen.getByRole('button', { name: '导出页面' }))

    expect(onExportPage).toHaveBeenCalledWith('page_parent')
  })

  it('renders pinned page and data-table entries in the starred section', () => {
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
          pinnedSidebarItems={[
            { kind: 'page', pageId: 'page_parent' },
            { kind: 'data_table', pageId: 'page_parent', dataTableId: 'database_project' },
          ]}
        />
      </MemoryRouter>,
    )

    expect(screen.getByText('星标置顶')).toBeInTheDocument()
    expect(screen.getAllByRole('link', { name: 'Project' })[0]).toHaveAttribute(
      'href',
      '/pages/page_parent',
    )
    expect(screen.getAllByRole('link', { name: 'Project database' })[0]).toHaveAttribute(
      'href',
      '/pages/page_parent/data-tables/database_project',
    )
  })

  it('includes descendant pages when a parent page is pinned', () => {
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
        title: 'Child page',
        parentId: 'page_parent',
        icon: 'C',
        cover: null,
        createdAt: '',
        updatedAt: '',
        blocks: [],
      },
      {
        id: 'page_grandchild',
        title: 'Grandchild page',
        parentId: 'page_child',
        icon: 'G',
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
          pinnedSidebarItems={[{ kind: 'page', pageId: 'page_parent' }]}
        />
      </MemoryRouter>,
    )

    const pinnedSection = screen.getByLabelText('星标置顶')
    const pinnedChildLink = within(pinnedSection).getByRole('link', { name: 'Child page' })
    const pinnedGrandchildLink = within(pinnedSection).getByRole('link', { name: 'Grandchild page' })

    expect(pinnedChildLink).toHaveAttribute('href', '/pages/page_child')
    expect(pinnedChildLink).toHaveStyle({ paddingLeft: '44px' })
    expect(pinnedGrandchildLink).toHaveAttribute('href', '/pages/page_grandchild')
    expect(pinnedGrandchildLink).toHaveStyle({ paddingLeft: '60px' })
  })

  it('lets pinned parent pages collapse and expand their descendants inside the pinned section', async () => {
    const user = userEvent.setup()
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
        title: 'Child page',
        parentId: 'page_parent',
        icon: 'C',
        cover: null,
        createdAt: '',
        updatedAt: '',
        blocks: [],
      },
      {
        id: 'page_grandchild',
        title: 'Grandchild page',
        parentId: 'page_child',
        icon: 'G',
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
          pinnedSidebarItems={[{ kind: 'page', pageId: 'page_parent' }]}
        />
      </MemoryRouter>,
    )

    const pinnedSection = screen.getByLabelText('星标置顶')

    expect(within(pinnedSection).getByRole('link', { name: 'Child page' })).toBeInTheDocument()

    await user.click(within(pinnedSection).getAllByRole('button', { name: '收起页面' })[0])

    expect(within(pinnedSection).queryByRole('link', { name: 'Child page' })).not.toBeInTheDocument()
    expect(within(pinnedSection).queryByRole('link', { name: 'Grandchild page' })).not.toBeInTheDocument()

    await user.click(within(pinnedSection).getByRole('button', { name: '展开页面' }))

    expect(within(pinnedSection).getByRole('link', { name: 'Child page' })).toBeInTheDocument()
    expect(within(pinnedSection).getByRole('link', { name: 'Grandchild page' })).toBeInTheDocument()
  })

  it('lets users pin both pages and data tables from the sidebar tree', async () => {
    const user = userEvent.setup()
    const onTogglePinnedSidebarItem = vi.fn()
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
          onRenamePage={vi.fn()}
          onTogglePinnedSidebarItem={onTogglePinnedSidebarItem}
        />
      </MemoryRouter>,
    )

    const moreButtons = screen.getAllByRole('button', { name: '页面更多操作' })

    await user.click(moreButtons[0])
    await user.click(screen.getByRole('button', { name: '星标置顶' }))
    expect(onTogglePinnedSidebarItem).toHaveBeenCalledWith({
      kind: 'page',
      pageId: 'page_parent',
    })

    await user.click(moreButtons[1])
    await user.click(screen.getByRole('button', { name: '星标置顶' }))
    expect(onTogglePinnedSidebarItem).toHaveBeenCalledWith({
      kind: 'data_table',
      pageId: 'page_parent',
      dataTableId: 'database_project',
    })
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
    expect(popover?.parentElement).toBe(document.body)

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

  it('flips the page actions menu upward when the trigger is near the viewport bottom', async () => {
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
      value: 520,
    })

    const rectSpy = vi
      .spyOn(HTMLElement.prototype, 'getBoundingClientRect')
      .mockImplementation(function mockRect() {
        if (this.classList?.contains('sidebar-tree-more-button')) {
          return {
            x: 160,
            y: 470,
            top: 470,
            right: 184,
            bottom: 494,
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

    await user.click(screen.getAllByRole('button', { name: /页面更多操作/ })[0])

    const popover = document.body.querySelector('.sidebar-tree-page-menu-popover')

    expect(popover).not.toBeNull()
    expect(popover).toHaveStyle({
      position: 'fixed',
      left: '192px',
      top: '374px',
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
    expect(popover?.parentElement).toBe(document.body)

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

  it('sends every supported file dropped on the page-tree blank area to one target-aware importer', () => {
    const onDropFiles = vi.fn()
    const file = new File(['Word content'], '会议记录.docx', {
      type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    })
    const { container } = render(
      <MemoryRouter>
        <SidebarTree
          {...({
            pages: pages as never,
            currentPageId: 'page_parent',
            onCreatePage: vi.fn(),
            onDropFiles,
          } as never)}
        />
      </MemoryRouter>,
    )

    fireEvent.drop(container.querySelector('.sidebar-scroll-content')!, {
      dataTransfer: { files: [file] },
    })

    expect(onDropFiles).toHaveBeenCalledWith([file])
  })

  it('keeps a Windows file drag over the sidebar blank area out of the global inbox handler', () => {
    const { container } = render(
      <MemoryRouter>
        <SidebarTree
          {...({
            pages: pages as never,
            currentPageId: 'page_parent',
            onCreatePage: vi.fn(),
          } as never)}
        />
      </MemoryRouter>,
    )
    const target = container.querySelector('.sidebar-scroll-content')!
    const event = createEvent.dragOver(target)
    Object.defineProperty(event, 'dataTransfer', {
      value: { types: ['Files'], files: [] },
    })
    const globalDragOver = vi.fn()
    document.body.addEventListener('dragover', globalDragOver)

    fireEvent(target, event)
    document.body.removeEventListener('dragover', globalDragOver)

    expect(event.defaultPrevented).toBe(true)
    expect(globalDragOver).not.toHaveBeenCalled()
  })

  it('keeps mixed document and attachment drops in their original order', async () => {
    const onDropFiles = vi.fn()
    const docx = new File(['Word content'], '会议记录.docx')
    const pdf = new File(['PDF content'], '合同.pdf', { type: 'application/pdf' })
    const { container } = render(
      <MemoryRouter>
        <SidebarTree
          {...({
            pages: pages as never,
            currentPageId: 'page_parent',
            onCreatePage: vi.fn(),
            onDropFiles,
          } as never)}
        />
      </MemoryRouter>,
    )

    fireEvent.drop(container.querySelector('.sidebar-scroll-content')!, {
      dataTransfer: { files: [docx, pdf] },
    })

    await waitFor(() => expect(onDropFiles).toHaveBeenCalledWith([docx, pdf]))
  })
})
