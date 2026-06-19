import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import type { WorkspaceSnapshot } from '../domain/types'
import { createWorkspaceStore } from '../store/createWorkspaceStore'
import { createMemoryRepository } from '../test/memoryRepository'
import { App } from './App'

function createSnapshot(): WorkspaceSnapshot {
  const now = new Date().toISOString()

  return {
    boards: [],
    mindmaps: [],
    pages: [
      {
        id: 'page-home',
        parentId: null,
        title: '快速开始',
        icon: '📼',
        cover: null,
        blocks: [
          {
            id: 'block-home',
            type: 'paragraph',
            text: '这是首页内容。',
          },
        ],
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'page-notes',
        parentId: null,
        title: '会议记录',
        icon: '🗒️',
        cover: null,
        blocks: [
          {
            id: 'block-notes',
            type: 'paragraph',
            text: '这是第二页内容。',
          },
        ],
        createdAt: now,
        updatedAt: now,
      },
    ],
    settings: {
      lastOpenedPageId: 'page-home',
    },
  }
}

function createChildPageSnapshot(): WorkspaceSnapshot {
  const now = new Date().toISOString()

  return {
    boards: [],
    mindmaps: [],
    pages: [
      {
        id: 'page-parent',
        parentId: null,
        title: '父页面',
        icon: '📚',
        cover: null,
        blocks: [
          {
            id: 'block-child-page',
            type: 'child_page',
            pageId: 'page-child',
          },
        ],
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'page-child',
        parentId: 'page-parent',
        title: '子页面一',
        icon: '📓',
        cover: null,
        blocks: [
          {
            id: 'block-child-text',
            type: 'paragraph',
            text: '子页面内容',
          },
        ],
        createdAt: now,
        updatedAt: now,
      },
    ],
    settings: {
      lastOpenedPageId: 'page-parent',
    },
  }
}

function createHeadingOutlineSnapshot(): WorkspaceSnapshot {
  const now = new Date().toISOString()

  return {
    boards: [],
    mindmaps: [],
    pages: [
      {
        id: 'page-outline',
        parentId: null,
        title: '产品方案',
        icon: '📘',
        cover: null,
        blocks: [
          {
            id: 'block-h1',
            type: 'heading_1',
            text: '项目概览',
          },
          {
            id: 'block-p1',
            type: 'paragraph',
            text: '这里是概览内容。',
          },
          {
            id: 'block-h2',
            type: 'heading_2',
            text: '实施步骤',
          },
          {
            id: 'block-h3',
            type: 'heading_3',
            text: '第一阶段',
          },
        ],
        createdAt: now,
        updatedAt: now,
      },
    ],
    settings: {
      lastOpenedPageId: 'page-outline',
    },
  }
}

function createSearchSnapshot(): WorkspaceSnapshot {
  const now = new Date().toISOString()

  return {
    boards: [],
    mindmaps: [],
    pages: [
      {
        id: 'page-home',
        parentId: null,
        title: '首页',
        icon: '📷',
        cover: null,
        blocks: [
          {
            id: 'block-home',
            type: 'paragraph',
            text: '这里是首页内容。',
          },
        ],
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'page-customer',
        parentId: null,
        title: '客户访谈',
        icon: '📝',
        cover: null,
        blocks: [
          {
            id: 'block-customer',
            type: 'paragraph',
            text: '记录搜索功能反馈。',
          },
        ],
        createdAt: now,
        updatedAt: now,
      },
    ],
    settings: {
      lastOpenedPageId: 'page-home',
    },
  }
}

describe('App shell', () => {
  it('renders the requested page from a controlled repository and memory route', async () => {
    const repository = createMemoryRepository(createSnapshot())

    render(<App repository={repository} initialEntries={['/pages/page-notes']} />)

    expect(await screen.findByRole('button', { name: '搜索' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '首页' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '新建页面' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '页面菜单' })).toBeInTheDocument()
    expect(await screen.findByDisplayValue('会议记录')).toBeInTheDocument()
    expect(screen.getByText('这是第二页内容。')).toBeInTheDocument()
  })

  it('syncs store state after navigating to another page', async () => {
    const repository = createMemoryRepository(createSnapshot())
    const store = createWorkspaceStore(repository)
    const user = userEvent.setup()

    render(<App store={store} initialEntries={['/pages/page-home']} />)

    await screen.findByDisplayValue('快速开始')
    await user.click(screen.getByRole('link', { name: '会议记录' }))

    expect(await screen.findByDisplayValue('会议记录')).toBeInTheDocument()

    await waitFor(() => {
      expect(store.getState().currentPageId).toBe('page-notes')
      expect(store.getState().settings.lastOpenedPageId).toBe('page-notes')
      expect(screen.getByRole('link', { name: '首页' })).toHaveAttribute('href', '/pages/page-notes')
    })
  })

  it('opens a child page block when clicked', async () => {
    const repository = createMemoryRepository(createChildPageSnapshot())
    const user = userEvent.setup()

    render(<App repository={repository} initialEntries={['/pages/page-parent']} />)

    await screen.findByDisplayValue('父页面')
    await user.click(screen.getByRole('button', { name: '子页面一' }))

    expect(await screen.findByDisplayValue('子页面一')).toBeInTheDocument()
    expect(screen.getByText('子页面内容')).toBeInTheDocument()
  })

  it('opens a whiteboard page when clicking a whiteboard block', async () => {
    const repository = createMemoryRepository({
      boards: [
        {
          id: 'board-flow',
          title: '流程草图',
          snapshot: {
            version: 1,
            elements: [],
            viewport: { x: 0, y: 0, zoom: 1 },
          },
          createdAt: '2026-06-17T00:00:00.000Z',
          updatedAt: '2026-06-17T00:00:00.000Z',
        },
      ],
      mindmaps: [],
      pages: [
        {
          id: 'page-home',
          parentId: null,
          title: '首页',
          icon: '📄',
          cover: null,
          blocks: [
            {
              id: 'block-whiteboard',
              type: 'whiteboard',
              boardId: 'board-flow',
            },
          ],
          createdAt: '2026-06-17T00:00:00.000Z',
          updatedAt: '2026-06-17T00:00:00.000Z',
        },
      ],
      settings: {
        lastOpenedPageId: 'page-home',
      },
    })
    const user = userEvent.setup()

    render(<App repository={repository} initialEntries={['/pages/page-home']} />)

    await screen.findByDisplayValue('首页')
    await user.click(screen.getByRole('button', { name: '打开白板 流程草图' }))

    expect(await screen.findByDisplayValue('流程草图')).toBeInTheDocument()
    expect(screen.getByText('来源：首页')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '返回页面' })).toBeInTheDocument()
  })

  it('opens a mindmap page when clicking a mindmap block', async () => {
    const repository = createMemoryRepository({
      boards: [],
      mindmaps: [
        {
          id: 'mindmap-product',
          title: '产品调研导图',
          rootNodeId: 'mindmap-node-root',
          nodes: {
            'mindmap-node-root': {
              id: 'mindmap-node-root',
              parentId: null,
              text: '中心主题',
              order: 0,
            },
          },
          viewport: { x: 0, y: 0, zoom: 1 },
          createdAt: '2026-06-18T00:00:00.000Z',
          updatedAt: '2026-06-18T00:00:00.000Z',
        },
      ],
      pages: [
        {
          id: 'page-home',
          parentId: null,
          title: '首页',
          icon: '📚',
          cover: null,
          blocks: [
            {
              id: 'block-mindmap',
              type: 'mindmap',
              mindmapId: 'mindmap-product',
            },
          ],
          createdAt: '2026-06-18T00:00:00.000Z',
          updatedAt: '2026-06-18T00:00:00.000Z',
        },
      ],
      settings: {
        lastOpenedPageId: 'page-home',
      },
    })
    const user = userEvent.setup()

    render(<App repository={repository} initialEntries={['/pages/page-home']} />)

    await screen.findByDisplayValue('首页')
    await user.click(screen.getByRole('button', { name: /打开思维导图/ }))

    expect(await screen.findByDisplayValue('产品调研导图')).toBeInTheDocument()
    expect(screen.getByText(/来源：/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '返回页面' })).toBeInTheDocument()
    expect(screen.getByLabelText('思维导图画布')).toBeInTheDocument()
  })

  it('persists adding a child node from the mindmap route', async () => {
    const repository = createMemoryRepository({
      boards: [],
      mindmaps: [
        {
          id: 'mindmap-product',
          title: '产品调研导图',
          rootNodeId: 'mindmap-node-root',
          nodes: {
            'mindmap-node-root': {
              id: 'mindmap-node-root',
              parentId: null,
              text: '中心主题',
              order: 0,
            },
          },
          viewport: { x: 0, y: 0, zoom: 1 },
          createdAt: '2026-06-18T00:00:00.000Z',
          updatedAt: '2026-06-18T00:00:00.000Z',
        },
      ],
      pages: [
        {
          id: 'page-home',
          parentId: null,
          title: '首页',
          icon: null,
          cover: null,
          blocks: [
            {
              id: 'block-mindmap',
              type: 'mindmap',
              mindmapId: 'mindmap-product',
            },
          ],
          createdAt: '2026-06-18T00:00:00.000Z',
          updatedAt: '2026-06-18T00:00:00.000Z',
        },
      ],
      settings: {
        lastOpenedPageId: 'page-home',
      },
    })
    const user = userEvent.setup()

    render(<App repository={repository} initialEntries={['/pages/page-home/mindmaps/mindmap-product']} />)

    await screen.findByDisplayValue('产品调研导图')
    await user.click(screen.getByRole('button', { name: '子级' }))

    await waitFor(async () => {
      const snapshot = await repository.load()
      expect(Object.keys(snapshot?.mindmaps[0].nodes ?? {})).toHaveLength(2)
    })
  })

  it('persists mindmap layout mode and collapsed node changes from the mindmap route', async () => {
    const repository = createMemoryRepository({
      boards: [],
      mindmaps: [
        {
          id: 'mindmap-product',
          title: '产品调研导图',
          rootNodeId: 'mindmap-node-root',
          layoutMode: 'balanced',
          nodes: {
            'mindmap-node-root': {
              id: 'mindmap-node-root',
              parentId: null,
              text: '中心主题',
              order: 0,
            },
            'mindmap-node-child': {
              id: 'mindmap-node-child',
              parentId: 'mindmap-node-root',
              text: '已有分支',
              order: 0,
            },
          },
          viewport: { x: 0, y: 0, zoom: 1 },
          createdAt: '2026-06-18T00:00:00.000Z',
          updatedAt: '2026-06-18T00:00:00.000Z',
        },
      ],
      pages: [
        {
          id: 'page-home',
          parentId: null,
          title: '首页',
          icon: null,
          cover: null,
          blocks: [
            {
              id: 'block-mindmap',
              type: 'mindmap',
              mindmapId: 'mindmap-product',
            },
          ],
          createdAt: '2026-06-18T00:00:00.000Z',
          updatedAt: '2026-06-18T00:00:00.000Z',
        },
      ],
      settings: {
        lastOpenedPageId: 'page-home',
      },
    })
    const user = userEvent.setup()

    render(<App repository={repository} initialEntries={['/pages/page-home/mindmaps/mindmap-product']} />)

    await screen.findByDisplayValue('产品调研导图')
    await user.click(screen.getByRole('button', { name: '大纲导图' }))

    await waitFor(async () => {
      const snapshot = await repository.load()
      expect(snapshot?.mindmaps[0].layoutMode).toBe('outline')
    })

    await user.click(screen.getByRole('button', { name: '折叠' }))

    await waitFor(async () => {
      const snapshot = await repository.load()
      expect(snapshot?.mindmaps[0].nodes['mindmap-node-child']?.collapsed).toBe(true)
    })
  })
  it('persists mindmap title and node edits from the mindmap route', async () => {
    const repository = createMemoryRepository({
      boards: [],
      mindmaps: [
        {
          id: 'mindmap-product',
          title: '产品调研导图',
          rootNodeId: 'mindmap-node-root',
          nodes: {
            'mindmap-node-root': {
              id: 'mindmap-node-root',
              parentId: null,
              text: '中心主题',
              order: 0,
            },
            'mindmap-node-child': {
              id: 'mindmap-node-child',
              parentId: 'mindmap-node-root',
              text: '已有分支',
              order: 0,
            },
          },
          viewport: { x: 0, y: 0, zoom: 1 },
          createdAt: '2026-06-18T00:00:00.000Z',
          updatedAt: '2026-06-18T00:00:00.000Z',
        },
      ],
      pages: [
        {
          id: 'page-home',
          parentId: null,
          title: '首页',
          icon: null,
          cover: null,
          blocks: [
            {
              id: 'block-mindmap',
              type: 'mindmap',
              mindmapId: 'mindmap-product',
            },
          ],
          createdAt: '2026-06-18T00:00:00.000Z',
          updatedAt: '2026-06-18T00:00:00.000Z',
        },
      ],
      settings: {
        lastOpenedPageId: 'page-home',
      },
    })
    const user = userEvent.setup()

    render(<App repository={repository} initialEntries={['/pages/page-home/mindmaps/mindmap-product']} />)

    const titleInput = await screen.findByDisplayValue('产品调研导图')
    fireEvent.input(titleInput, { target: { value: '竞品拆解导图' } })
    const rootInput = screen.getByLabelText('节点 mindmap-node-root')
    fireEvent.input(rootInput, { target: { value: '研究主题' } })

    await user.click(screen.getAllByRole('button', { name: '同级' })[1])
    await user.click(screen.getAllByRole('button', { name: '删除' })[0])

    await waitFor(async () => {
      const snapshot = await repository.load()
      expect(snapshot?.mindmaps[0].title).toBe('竞品拆解导图')
      expect(snapshot?.mindmaps[0].nodes['mindmap-node-root']?.text).toBe('研究主题')
      expect(
        Object.values(snapshot?.mindmaps[0].nodes ?? {}).filter(
          (node) => node.parentId === 'mindmap-node-root',
        ),
      ).toHaveLength(1)
    })
  })

  it('persists whiteboard canvas changes from the board route', async () => {
    const repository = createMemoryRepository({
      boards: [
        {
          id: 'board-flow',
          title: '流程草图',
          snapshot: {
            version: 1,
            elements: [],
            viewport: { x: 0, y: 0, zoom: 1 },
          },
          createdAt: '2026-06-17T00:00:00.000Z',
          updatedAt: '2026-06-17T00:00:00.000Z',
        },
      ],
      mindmaps: [],
      pages: [
        {
          id: 'page-home',
          parentId: null,
          title: '首页',
          icon: null,
          cover: null,
          blocks: [
            {
              id: 'block-whiteboard',
              type: 'whiteboard',
              boardId: 'board-flow',
            },
          ],
          createdAt: '2026-06-17T00:00:00.000Z',
          updatedAt: '2026-06-17T00:00:00.000Z',
        },
      ],
      settings: {
        lastOpenedPageId: 'page-home',
      },
    })
    const user = userEvent.setup()

    render(<App repository={repository} initialEntries={['/pages/page-home/boards/board-flow']} />)

    await screen.findByDisplayValue('流程草图')
    await user.click(screen.getByRole('button', { name: '矩形' }))

    await waitFor(async () => {
      const snapshot = await repository.load()
      expect(snapshot?.boards[0].snapshot).toMatchObject({
        version: 1,
        elements: [
          {
            type: 'rect',
            x: 96,
            y: 96,
            width: 220,
            height: 132,
          },
        ],
      })
    })
  })

  it('turns a paragraph into a bulleted list from the block handle menu and renders list markers', async () => {
    const repository = createMemoryRepository(createSnapshot())
    const user = userEvent.setup()
    const { container } = render(<App repository={repository} initialEntries={['/pages/page-home']} />)

    await screen.findByDisplayValue('快速开始')
    await user.click(screen.getAllByRole('button', { name: '拖动块' })[0])
    await user.click(screen.getByRole('button', { name: '转为无序列表' }))

    await waitFor(() => {
      const markers = Array.from(container.querySelectorAll('.list-block-marker')).map((element) =>
        element.textContent?.trim(),
      )

      expect(markers).toContain('•')
      expect(screen.getByDisplayValue('这是首页内容。')).toBeInTheDocument()
    })
  })

  it('inserts a numbered list from the slash menu and renders number markers', async () => {
    const repository = createMemoryRepository(createSnapshot())
    const user = userEvent.setup()
    const { container } = render(<App repository={repository} initialEntries={['/pages/page-home']} />)

    await screen.findByDisplayValue('快速开始')
    const slashInput = screen.getByPlaceholderText('输入 / 打开命令菜单')

    await user.type(slashInput, '/有序')
    await user.click(screen.getByRole('button', { name: '有序列表' }))

    await waitFor(() => {
      const markers = Array.from(container.querySelectorAll('.list-block-marker')).map((element) =>
        element.textContent?.trim(),
      )

      expect(markers).toContain('1.')
    })
  })

  it('undoes the last page rename when pressing Ctrl+Z', async () => {
    const repository = createMemoryRepository(createSnapshot())
    const user = userEvent.setup()

    render(<App repository={repository} initialEntries={['/pages/page-home']} />)

    const input = await screen.findByDisplayValue('快速开始')
    await user.clear(input)
    await user.type(input, '临时标题')
    await user.tab()

    expect(await screen.findByDisplayValue('临时标题')).toBeInTheDocument()

    fireEvent.keyDown(window, { key: 'z', ctrlKey: true })

    await waitFor(() => {
      expect(screen.getByDisplayValue('快速开始')).toBeInTheDocument()
    })
  })

  it('renders a right-side outline for heading blocks on the current page', async () => {
    const repository = createMemoryRepository(createHeadingOutlineSnapshot())

    render(<App repository={repository} initialEntries={['/pages/page-outline']} />)

    await screen.findByDisplayValue('产品方案')

    expect(screen.getByText('目录')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '项目概览' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '实施步骤' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '第一阶段' })).toBeInTheDocument()
  })

  it('switches the current page to adaptive content width from the page menu', async () => {
    const repository = createMemoryRepository(createHeadingOutlineSnapshot())
    const user = userEvent.setup()
    const { container } = render(<App repository={repository} initialEntries={['/pages/page-outline']} />)

    await screen.findByDisplayValue('产品方案')
    const pageContent = container.querySelector('.page-content')
    if (!pageContent) {
      throw new Error('Expected page content container')
    }

    expect(pageContent).not.toHaveClass('page-content-adaptive')

    await user.click(screen.getByRole('button', { name: '页面菜单' }))
    await user.click(screen.getByLabelText('自适应正文宽度'))

    expect(pageContent).toHaveClass('page-content-adaptive')

    await waitFor(async () => {
      const snapshot = await repository.load()
      expect(snapshot?.pages[0]).toMatchObject({
        id: 'page-outline',
        isFullWidth: true,
      })
    })
  })

  it('switches the current page to small text mode from the page menu', async () => {
    const repository = createMemoryRepository(createHeadingOutlineSnapshot())
    const user = userEvent.setup()
    const { container } = render(<App repository={repository} initialEntries={['/pages/page-outline']} />)

    await screen.findByDisplayValue('产品方案')
    const pageContent = container.querySelector('.page-content')
    if (!pageContent) {
      throw new Error('Expected page content container')
    }

    expect(pageContent).not.toHaveClass('page-content-small-text')

    await user.click(screen.getByRole('button', { name: '页面菜单' }))
    await user.click(screen.getByLabelText('小字号正文'))

    expect(pageContent).toHaveClass('page-content-small-text')

    await waitFor(async () => {
      const snapshot = await repository.load()
      expect(snapshot?.pages[0]).toMatchObject({
        id: 'page-outline',
        isSmallText: true,
      })
    })
  })

  it('switches the current page to serif font mode from the page menu', async () => {
    const repository = createMemoryRepository(createHeadingOutlineSnapshot())
    const user = userEvent.setup()
    const { container } = render(<App repository={repository} initialEntries={['/pages/page-outline']} />)

    await screen.findByDisplayValue('产品方案')
    const pageContent = container.querySelector('.page-content')
    if (!pageContent) {
      throw new Error('Expected page content container')
    }

    expect(pageContent).toHaveClass('page-content-font-default')
    expect(pageContent).not.toHaveClass('page-content-font-serif')

    await user.click(screen.getByRole('button', { name: '页面菜单' }))
    await user.click(screen.getByRole('button', { name: '衬线' }))

    expect(pageContent).toHaveClass('page-content-font-serif')
    expect(pageContent).not.toHaveClass('page-content-font-default')

    await waitFor(async () => {
      const snapshot = await repository.load()
      expect(snapshot?.pages[0]).toMatchObject({
        id: 'page-outline',
        fontFamily: 'serif',
      })
    })
  })

  it('updates the current page icon from the page header and persists it', async () => {
    const repository = createMemoryRepository(createHeadingOutlineSnapshot())
    const user = userEvent.setup()

    render(<App repository={repository} initialEntries={['/pages/page-outline']} />)

    await screen.findByDisplayValue('产品方案')
    await user.click(screen.getByRole('button', { name: '添加图标' }))
    await user.click(screen.getByRole('button', { name: '📚' }))

    await waitFor(async () => {
      const snapshot = await repository.load()
      expect(snapshot?.pages[0]).toMatchObject({
        id: 'page-outline',
        icon: '📚',
      })
    })
  })

  it('updates the current page cover from the page header and persists it', async () => {
    const repository = createMemoryRepository(createHeadingOutlineSnapshot())
    const user = userEvent.setup()

    render(<App repository={repository} initialEntries={['/pages/page-outline']} />)

    await screen.findByDisplayValue('产品方案')
    await user.click(screen.getByRole('button', { name: '添加封面' }))
    await user.click(screen.getByRole('button', { name: '海蓝' }))

    await waitFor(async () => {
      const snapshot = await repository.load()
      expect(snapshot?.pages[0]).toMatchObject({
        id: 'page-outline',
        cover: 'ocean',
      })
    })
  })

  it('toggles the page outline from the page menu and persists the setting', async () => {
    const repository = createMemoryRepository(createHeadingOutlineSnapshot())
    const user = userEvent.setup()

    render(<App repository={repository} initialEntries={['/pages/page-outline']} />)

    await screen.findByDisplayValue('产品方案')
    expect(screen.getByRole('complementary', { name: '当前页面目录' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '页面菜单' }))
    await user.click(screen.getByLabelText('显示页面目录'))

    expect(screen.queryByRole('complementary', { name: '当前页面目录' })).not.toBeInTheDocument()

    await waitFor(async () => {
      const snapshot = await repository.load()
      expect(snapshot?.pages[0]).toMatchObject({
        id: 'page-outline',
        showOutline: false,
      })
    })
  })

  it('searches pages and opens a selected result', async () => {
    const repository = createMemoryRepository(createSearchSnapshot())
    const user = userEvent.setup()

    render(<App repository={repository} initialEntries={['/pages/page-home']} />)

    await user.click(await screen.findByRole('button', { name: '搜索' }))
    await user.type(screen.getByPlaceholderText('搜索页面或内容'), '反馈')

    expect(screen.getByText('记录搜索功能反馈。')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '打开页面 客户访谈' }))

    expect(await screen.findByDisplayValue('客户访谈')).toBeInTheDocument()
    expect(screen.queryByRole('dialog', { name: '全局搜索' })).not.toBeInTheDocument()
  })

  it('opens global search with keyboard shortcuts', async () => {
    const repository = createMemoryRepository(createSearchSnapshot())

    render(<App repository={repository} initialEntries={['/pages/page-home']} />)

    await screen.findByDisplayValue('首页')
    fireEvent.keyDown(window, { key: 'k', ctrlKey: true })

    expect(await screen.findByRole('dialog', { name: '全局搜索' })).toBeInTheDocument()
    expect(await screen.findByPlaceholderText('搜索页面或内容')).toBeInTheDocument()

    fireEvent.keyDown(window, { key: 'Escape' })
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: '全局搜索' })).not.toBeInTheDocument()
    })

    fireEvent.keyDown(window, { key: 'p', ctrlKey: true })
    expect(await screen.findByRole('dialog', { name: '全局搜索' })).toBeInTheDocument()
  })
})
