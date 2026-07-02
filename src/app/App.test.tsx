import { StrictMode } from 'react'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { WorkspaceSnapshot } from '../domain/types'
import { createDefaultAppState } from '../components/dataTable/domain/factory'
import type { WorkspaceRepository } from '../lib/workspaceRepository'
import { createMemoryRepository } from '../test/memoryRepository'
import { createWorkspaceStore } from '../store/createWorkspaceStore'
import { App } from './App'

const desktopLifecycle = vi.hoisted(() => ({
  registerDesktopPendingSaveFlush: vi.fn(async () => () => undefined),
}))
const fileAccess = vi.hoisted(() => ({
  saveBinaryFile: vi.fn(async () => undefined),
}))
const archiveStorage = vi.hoisted(() => ({
  exportWorkspaceArchive: vi.fn(async () => new Uint8Array([80, 75, 3, 4])),
  importWorkspaceArchive: vi.fn(async () => undefined),
}))

vi.mock('../lib/desktopLifecycle', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/desktopLifecycle')>()
  return {
    ...actual,
    registerDesktopPendingSaveFlush: desktopLifecycle.registerDesktopPendingSaveFlush,
  }
})

vi.mock('../lib/fileAccess', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/fileAccess')>()
  return {
    ...actual,
    saveBinaryFile: fileAccess.saveBinaryFile,
  }
})

vi.mock('../lib/assets', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/assets')>()
  return {
    ...actual,
    exportWorkspaceArchive: archiveStorage.exportWorkspaceArchive,
    importWorkspaceArchive: archiveStorage.importWorkspaceArchive,
  }
})

function findTextNode(element: Node): Text {
  if (element.nodeType === Node.TEXT_NODE) {
    return element as Text
  }

  for (const child of Array.from(element.childNodes)) {
    const textNode = findTextNode(child)
    if (textNode) {
      return textNode
    }
  }

  throw new Error('Expected a text node')
}

function selectEditableText(element: HTMLElement, start: number, end: number) {
  const textNode = findTextNode(element)
  const range = document.createRange()
  range.setStart(textNode, start)
  range.setEnd(textNode, end)
  window.getSelection()?.removeAllRanges()
  window.getSelection()?.addRange(range)
  fireEvent.mouseUp(element)
}

describe('App', () => {
  let scrollTo: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    desktopLifecycle.registerDesktopPendingSaveFlush.mockResolvedValue(() => undefined)
    fileAccess.saveBinaryFile.mockClear()
    archiveStorage.exportWorkspaceArchive.mockClear()
    archiveStorage.importWorkspaceArchive.mockClear()
    scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined)
  })

  afterEach(() => {
    scrollTo.mockRestore()
  })

  it('bootstraps an empty repository once when StrictMode replays effects', async () => {
    let snapshot: WorkspaceSnapshot | null = null
    let replaceCalls = 0
    const repository = {
      async load() {
        return snapshot ? structuredClone(snapshot) : null
      },
      async save(nextSnapshot) {
        snapshot = structuredClone(nextSnapshot)
      },
      async replace(nextSnapshot) {
        replaceCalls += 1
        snapshot = structuredClone(nextSnapshot)
      },
    } satisfies WorkspaceRepository

    render(
      <StrictMode>
        <App repository={repository} />
      </StrictMode>,
    )

    await screen.findByDisplayValue('快速开始')

    expect(replaceCalls).toBe(1)
  })

  it('flushes pending saves when the page is being hidden', async () => {
    const snapshot: WorkspaceSnapshot = {
      boards: [],
      dataTables: [],
      mindmaps: [],
      pages: [
        {
          id: 'page_flush',
          parentId: null,
          title: 'Flush page',
          icon: null,
          cover: null,
          blocks: [{ id: 'block_1', type: 'paragraph', text: 'Draft' }],
          createdAt: '2026-06-29T00:00:00.000Z',
          updatedAt: '2026-06-29T00:00:00.000Z',
        },
      ],
      settings: { lastOpenedPageId: 'page_flush' },
    }
    const store = createWorkspaceStore(createMemoryRepository(snapshot))
    const flushPendingSaves = vi.fn(store.getState().flushPendingSaves)
    store.setState({ flushPendingSaves })

    render(<App store={store} initialEntries={['/pages/page_flush']} />)

    await screen.findByDisplayValue('Flush page')

    fireEvent(window, new Event('pagehide'))

    expect(flushPendingSaves).toHaveBeenCalledTimes(1)
  })

  it('registers pending saves for desktop close and quit lifecycle events', async () => {
    const snapshot: WorkspaceSnapshot = {
      boards: [],
      dataTables: [],
      mindmaps: [],
      pages: [
        {
          id: 'page_desktop_flush',
          parentId: null,
          title: 'Desktop flush page',
          icon: null,
          cover: null,
          blocks: [{ id: 'block_1', type: 'paragraph', text: 'Draft' }],
          createdAt: '2026-06-29T00:00:00.000Z',
          updatedAt: '2026-06-29T00:00:00.000Z',
        },
      ],
      settings: { lastOpenedPageId: 'page_desktop_flush' },
    }
    const store = createWorkspaceStore(createMemoryRepository(snapshot))
    const flushPendingSaves = vi.fn(store.getState().flushPendingSaves)
    store.setState({ flushPendingSaves })

    render(<App store={store} initialEntries={['/pages/page_desktop_flush']} />)

    await screen.findByDisplayValue('Desktop flush page')

    await waitFor(() => {
      expect(desktopLifecycle.registerDesktopPendingSaveFlush).toHaveBeenCalled()
    })

    const registeredFlush = desktopLifecycle.registerDesktopPendingSaveFlush.mock.calls.at(-1)?.[0]
    await registeredFlush?.()

    expect(flushPendingSaves).toHaveBeenCalledTimes(1)
  })

  it('uses workspace undo inside the focused rich text editor after a floating toolbar bold action', async () => {
    const user = userEvent.setup()
    const pageId = 'page_rich_text_undo'
    const snapshot: WorkspaceSnapshot = {
      boards: [],
      dataTables: [],
      pages: [
        {
          id: pageId,
          parentId: null,
          title: '富文本页面',
          icon: null,
          cover: null,
          isFullWidth: false,
          isSmallText: false,
          fontFamily: 'default',
          showOutline: true,
          blocks: [{ id: 'block_1', type: 'paragraph', text: 'hello world' }],
          createdAt: '2026-06-29T00:00:00.000Z',
          updatedAt: '2026-06-29T00:00:00.000Z',
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

    const editor = await screen.findByRole('textbox', { name: '输入正文' })
    editor.focus()
    selectEditableText(editor, 6, 11)
    const toolbar = screen.getByRole('toolbar')
    await user.click(within(toolbar).getByText('B'))

    await waitFor(() => {
      expect(editor.innerHTML).toContain('<strong>')
    })

    fireEvent.keyDown(window, { key: 'z', ctrlKey: true })

    await waitFor(() => {
      expect(editor.innerHTML).not.toContain('<strong>')
    })
  })

  it('uses workspace undo after a floating toolbar color action while the editor stays focused', async () => {
    const user = userEvent.setup()
    const pageId = 'page_rich_text_color_undo'
    const snapshot: WorkspaceSnapshot = {
      boards: [],
      dataTables: [],
      pages: [
        {
          id: pageId,
          parentId: null,
          title: '富文本页面',
          icon: null,
          cover: null,
          isFullWidth: false,
          isSmallText: false,
          fontFamily: 'default',
          showOutline: true,
          blocks: [{ id: 'block_1', type: 'paragraph', text: 'hello world' }],
          createdAt: '2026-06-29T00:00:00.000Z',
          updatedAt: '2026-06-29T00:00:00.000Z',
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

    const editor = await screen.findByRole('textbox', { name: '输入正文' })
    editor.focus()
    selectEditableText(editor, 6, 11)

    const toolbar = screen.getByRole('toolbar')
    const colorButton = toolbar.querySelector('.inline-format-toolbar-color')
    expect(colorButton).not.toBeNull()

    await user.click(colorButton as HTMLButtonElement)
    await user.click(screen.getByRole('button', { name: '文字颜色：蓝色' }))

    await waitFor(() => {
      expect(editor.innerHTML).toContain('data-rich-text-color="blue"')
    })

    fireEvent.keyDown(window, { key: 'z', ctrlKey: true })

    await waitFor(() => {
      expect(editor.innerHTML).not.toContain('data-rich-text-color="blue"')
    })
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

  it('confirms current page deletion with the shared confirm dialog', async () => {
    const user = userEvent.setup()
    const deletePage = vi.fn(async () => undefined)
    const pageId = 'page_delete'
    const snapshot: WorkspaceSnapshot = {
      boards: [],
      dataTables: [],
      mindmaps: [],
      pages: [
        {
          id: pageId,
          parentId: null,
          title: 'Delete me',
          icon: null,
          cover: null,
          blocks: [],
          createdAt: '2026-06-30T00:00:00.000Z',
          updatedAt: '2026-06-30T00:00:00.000Z',
        },
      ],
      settings: { lastOpenedPageId: pageId },
    }
    const store = createWorkspaceStore(createMemoryRepository(snapshot))
    store.setState({ deletePage })

    render(<App store={store} initialEntries={[`/pages/${pageId}`]} />)

    await screen.findByDisplayValue('Delete me')
    await user.click(screen.getByRole('button', { name: '页面菜单' }))
    await user.click(screen.getByRole('button', { name: '删除当前页面' }))

    const dialog = await screen.findByRole('dialog', { name: '删除当前页面' })
    expect(within(dialog).getByText(/Delete me/)).toBeInTheDocument()
    expect(deletePage).not.toHaveBeenCalled()

    await user.click(within(dialog).getByRole('button', { name: '取消' }))

    expect(screen.queryByRole('dialog', { name: '删除当前页面' })).not.toBeInTheDocument()
    expect(deletePage).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: '页面菜单' }))
    await user.click(screen.getByRole('button', { name: '删除当前页面' }))
    await user.click(
      within(await screen.findByRole('dialog', { name: '删除当前页面' })).getByRole('button', {
        name: '确认删除',
      }),
    )

    expect(deletePage).toHaveBeenCalledWith(pageId)
  })

  it('uses the current page title as the complete backup default file name', async () => {
    const user = userEvent.setup()
    const pageId = 'page_archive_title'
    const snapshot: WorkspaceSnapshot = {
      boards: [],
      dataTables: [],
      mindmaps: [],
      pages: [
        {
          id: pageId,
          parentId: null,
          title: '产品规划',
          icon: null,
          cover: null,
          blocks: [],
          createdAt: '2026-07-02T00:00:00.000Z',
          updatedAt: '2026-07-02T00:00:00.000Z',
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

    await screen.findByDisplayValue('产品规划')
    await user.click(screen.getByRole('button', { name: '页面菜单' }))
    await user.click(screen.getByRole('button', { name: '创建完整备份' }))

    await waitFor(() => {
      expect(fileAccess.saveBinaryFile).toHaveBeenCalledWith(
        expect.objectContaining({
          defaultPath: '产品规划.zip',
        }),
      )
    })
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
    expect(await screen.findByRole('button', { name: '页面菜单' })).toBeInTheDocument()
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

  it('shows a generated preview on mindmap cards in the page editor', async () => {
    const pageId = 'page_preview'
    const mindmapId = 'mindmap_preview'
    const snapshot: WorkspaceSnapshot = {
      boards: [],
      dataTables: [],
      mindmaps: [
        {
          id: mindmapId,
          title: '策略导图',
          snapshot: {
            title: '策略导图',
            structure: 'mindmap',
            rootId: 'node-root',
            nodes: {
              'node-root': {
                id: 'node-root',
                parentId: null,
                childIds: ['node-a', 'node-b'],
                text: '中心主题',
                collapsed: false,
                style: { nodeColor: '#ffffff', branchColor: '#0f766e' },
              },
              'node-a': {
                id: 'node-a',
                parentId: 'node-root',
                childIds: [],
                text: '需求梳理',
                collapsed: false,
                style: { nodeColor: '#ffffff', branchColor: '#0f766e' },
              },
              'node-b': {
                id: 'node-b',
                parentId: 'node-root',
                childIds: [],
                text: '方案设计',
                collapsed: false,
                style: { nodeColor: '#ffffff', branchColor: '#0f766e' },
              },
            },
          },
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

    render(
      <App
        repository={createMemoryRepository(snapshot)}
        initialEntries={[`/pages/${pageId}`]}
      />,
    )

    const card = await screen.findByRole('button', { name: '打开导图 策略导图' })
    const previewImage = card.querySelector('.canvas-entry-preview-image')

    expect(previewImage).not.toBeNull()
    expect(previewImage?.getAttribute('src')).toContain('data:image/svg+xml')
    expect(card).not.toHaveTextContent('空白导图')
  })
})
