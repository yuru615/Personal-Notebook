import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { WorkspaceSnapshot } from '../domain/types'
import { createDefaultAppState } from '../components/dataTable/domain/factory'
import { createMemoryRepository } from '../test/memoryRepository'
import { App } from './App'

describe('App', () => {
  let scrollTo: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined)
  })

  afterEach(() => {
    scrollTo.mockRestore()
  })

  it('focuses the paragraph editor after exiting an empty list item', async () => {
    const pageId = 'page_focus'
    const snapshot: WorkspaceSnapshot = {
      boards: [],
      pages: [
        {
          id: pageId,
          parentId: null,
          title: '列表页',
          icon: null,
          cover: null,
          isFullWidth: false,
          isSmallText: false,
          fontFamily: 'default',
          showOutline: true,
          blocks: [{ id: 'block_1', type: 'bulleted_list', items: [''] }],
          createdAt: '2026-06-21T00:00:00.000Z',
          updatedAt: '2026-06-21T00:00:00.000Z',
        },
      ],
      settings: { lastOpenedPageId: pageId },
    }

    render(
      <App
        repository={createMemoryRepository(snapshot)}
        initialEntries={[`/pages/${pageId}`]}
      />,
    )

    const listEditor = await screen.findByRole('textbox', { name: '每行一个列表项' })
    fireEvent.keyDown(listEditor, { key: 'Enter' })

    const paragraphEditor = await screen.findByRole('textbox', { name: '输入正文' })
    await waitFor(() => expect(paragraphEditor).toHaveFocus())
  })

  it('shows breadcrumbs on nested pages', async () => {
    const snapshot: WorkspaceSnapshot = {
      boards: [],
      dataTables: [],
      pages: [
        {
          id: 'page_parent',
          parentId: null,
          title: 'Parent',
          icon: 'P',
          cover: null,
          blocks: [],
          createdAt: '2026-06-21T00:00:00.000Z',
          updatedAt: '2026-06-21T00:00:00.000Z',
        },
        {
          id: 'page_child',
          parentId: 'page_parent',
          title: 'Child',
          icon: 'C',
          cover: null,
          blocks: [],
          createdAt: '2026-06-21T00:00:00.000Z',
          updatedAt: '2026-06-21T00:00:00.000Z',
        },
      ],
      settings: { lastOpenedPageId: 'page_child' },
    }

    render(
      <App
        repository={createMemoryRepository(snapshot)}
        initialEntries={['/pages/page_child']}
      />,
    )

    const breadcrumbs = await screen.findByRole('navigation', { name: '页面层级' })
    expect(breadcrumbs).toHaveTextContent('Parent')
    expect(breadcrumbs).toHaveTextContent('Child')
    expect(screen.getByRole('link', { name: 'P Parent' })).toHaveAttribute(
      'href',
      '/pages/page_parent',
    )
  })

  it('keeps the page directory visible on data table pages', async () => {
    const pageId = 'page_database'
    const databaseId = 'database_project'
    const snapshot: WorkspaceSnapshot = {
      boards: [],
      dataTables: [
        {
          id: databaseId,
          title: '项目数据库',
          icon: null,
          cover: null,
          snapshot: createDefaultAppState(),
          createdAt: '2026-06-23T00:00:00.000Z',
          updatedAt: '2026-06-23T00:00:00.000Z',
        },
      ],
      pages: [
        {
          id: pageId,
          parentId: null,
          title: '快速开始',
          icon: null,
          cover: null,
          blocks: [{ id: 'block_database', type: 'data_table', databaseId }],
          createdAt: '2026-06-23T00:00:00.000Z',
          updatedAt: '2026-06-23T00:00:00.000Z',
        },
      ],
      settings: { lastOpenedPageId: pageId },
    }

    const { container } = render(
      <App
        repository={createMemoryRepository(snapshot)}
        initialEntries={[`/pages/${pageId}/data-tables/${databaseId}`]}
      />,
    )

    const sidebar = await screen.findByRole('complementary', { name: '侧边栏' })

    expect(sidebar).toBeInTheDocument()
    expect(container.querySelector('.page-panel-focus')).toBeNull()
    expect(within(sidebar).getByText('快速开始')).toBeInTheDocument()
  })
  it('hides the sidebar on mindmap pages', async () => {
    const pageId = 'page_mindmap'
    const mindmapId = 'mindmap_strategy'
    const snapshot: WorkspaceSnapshot = {
      boards: [],
      dataTables: [],
      mindmaps: [
        {
          id: mindmapId,
          title: '策略导图',
          snapshot: { title: '策略导图' },
          createdAt: '2026-06-24T00:00:00.000Z',
          updatedAt: '2026-06-24T00:00:00.000Z',
        },
      ],
      pages: [
        {
          id: pageId,
          parentId: null,
          title: '产品规划',
          icon: null,
          cover: null,
          blocks: [{ id: 'block_mindmap', type: 'mindmap', mindmapId }],
          createdAt: '2026-06-24T00:00:00.000Z',
          updatedAt: '2026-06-24T00:00:00.000Z',
        },
      ],
      settings: { lastOpenedPageId: pageId },
    }

    const { container } = render(
      <App
        repository={createMemoryRepository(snapshot)}
        initialEntries={[`/pages/${pageId}/mindmaps/${mindmapId}`]}
      />,
    )

    await screen.findByRole('button', { name: '返回页面' })

    expect(screen.queryByRole('complementary', { name: '侧边栏' })).not.toBeInTheDocument()
    expect(container.querySelector('.page-panel-focus')).not.toBeNull()
  })
  it('opens the mindmap route when clicking a mindmap card from the page editor', async () => {
    const user = userEvent.setup()
    const pageId = 'page_product'
    const mindmapId = 'mindmap_strategy'
    const snapshot: WorkspaceSnapshot = {
      boards: [],
      dataTables: [],
      mindmaps: [
        {
          id: mindmapId,
          title: '策略导图',
          snapshot: { title: '策略导图' },
          createdAt: '2026-06-24T00:00:00.000Z',
          updatedAt: '2026-06-24T00:00:00.000Z',
        },
      ],
      pages: [
        {
          id: pageId,
          parentId: null,
          title: '产品规划',
          icon: null,
          cover: null,
          blocks: [{ id: 'block_mindmap', type: 'mindmap', mindmapId }],
          createdAt: '2026-06-24T00:00:00.000Z',
          updatedAt: '2026-06-24T00:00:00.000Z',
        },
      ],
      settings: { lastOpenedPageId: pageId },
    }

    const { container } = render(
      <App
        repository={createMemoryRepository(snapshot)}
        initialEntries={[`/pages/${pageId}`]}
      />,
    )

    await user.click(await screen.findByRole('button', { name: '打开导图 策略导图' }))

    await screen.findByRole('button', { name: '返回页面' })

    expect(screen.queryByRole('complementary', { name: '侧边栏' })).not.toBeInTheDocument()
    expect(container.querySelector('.page-panel-focus')).not.toBeNull()
    expect(container.querySelector(`[data-mindmap-id="${mindmapId}"]`)).not.toBeNull()
  })
})
