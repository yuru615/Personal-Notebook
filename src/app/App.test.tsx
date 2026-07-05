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
  openBinaryFile: vi.fn(async () => ({
    name: '工作区备份.zip',
    contents: new Uint8Array([80, 75, 3, 4]),
  })),
  openLocalFilePath: vi.fn(async () => ({
    name: '工作区备份.zip',
    path: '/tmp/工作区备份.zip',
  })),
  pickSaveFilePath: vi.fn(async () => '/tmp/产品规划.zip'),
  saveBinaryFile: vi.fn(async () => undefined),
  saveTextFile: vi.fn(async () => undefined),
}))
const pagePackageStorage = vi.hoisted(() => ({
  exportPagePackageToPath: vi.fn(async () => undefined),
  exportPagePackage: vi.fn(async () => new Uint8Array([80, 75, 3, 4])),
  importPagePackageFromPath: vi.fn(async () => ({ rootPageId: 'page_imported' })),
  importPagePackage: vi.fn(async () => ({ rootPageId: 'page_imported' })),
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
    openBinaryFile: fileAccess.openBinaryFile,
    openLocalFilePath: fileAccess.openLocalFilePath,
    pickSaveFilePath: fileAccess.pickSaveFilePath,
    saveBinaryFile: fileAccess.saveBinaryFile,
    saveTextFile: fileAccess.saveTextFile,
  }
})

vi.mock('../lib/assets', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/assets')>()
  return {
    ...actual,
    exportPagePackageToPath: pagePackageStorage.exportPagePackageToPath,
    exportPagePackage: pagePackageStorage.exportPagePackage,
    importPagePackageFromPath: pagePackageStorage.importPagePackageFromPath,
    importPagePackage: pagePackageStorage.importPagePackage,
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
    Reflect.deleteProperty(globalThis, '__TAURI_INTERNALS__')
    desktopLifecycle.registerDesktopPendingSaveFlush.mockResolvedValue(() => undefined)
    fileAccess.openBinaryFile.mockClear()
    fileAccess.openBinaryFile.mockResolvedValue({
      name: '工作区备份.zip',
      contents: new Uint8Array([80, 75, 3, 4]),
    })
    fileAccess.openLocalFilePath.mockClear()
    fileAccess.openLocalFilePath.mockResolvedValue({
      name: '工作区备份.zip',
      path: '/tmp/工作区备份.zip',
    })
    fileAccess.pickSaveFilePath.mockClear()
    fileAccess.pickSaveFilePath.mockResolvedValue('/tmp/产品规划.zip')
    fileAccess.saveBinaryFile.mockClear()
    fileAccess.saveTextFile.mockClear()
    pagePackageStorage.exportPagePackageToPath.mockClear()
    pagePackageStorage.exportPagePackage.mockClear()
    pagePackageStorage.importPagePackageFromPath.mockClear()
    pagePackageStorage.importPagePackage.mockClear()
    pagePackageStorage.importPagePackageFromPath.mockResolvedValue({ rootPageId: 'page_imported' })
    pagePackageStorage.importPagePackage.mockResolvedValue({ rootPageId: 'page_imported' })
    scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined)
  })

  afterEach(() => {
    scrollTo.mockRestore()
    Reflect.deleteProperty(globalThis, '__TAURI_INTERNALS__')
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

  it('falls back to local search results outside the desktop runtime', async () => {
    const user = userEvent.setup()
    const snapshot: WorkspaceSnapshot = {
      boards: [],
      dataTables: [],
      mindmaps: [],
      pages: [
        {
          id: 'page_search_notes',
          parentId: null,
          title: 'Search Notes',
          icon: null,
          cover: null,
          blocks: [{ id: 'block_1', type: 'paragraph', text: 'customer interview summary' }],
          createdAt: '2026-07-04T00:00:00.000Z',
          updatedAt: '2026-07-04T00:00:00.000Z',
        },
        {
          id: 'page_other',
          parentId: null,
          title: 'Other Page',
          icon: null,
          cover: null,
          blocks: [{ id: 'block_2', type: 'paragraph', text: 'misc notes' }],
          createdAt: '2026-07-04T00:00:00.000Z',
          updatedAt: '2026-07-04T00:00:00.000Z',
        },
      ],
      settings: { lastOpenedPageId: 'page_search_notes' },
    }

    render(<App repository={createMemoryRepository(snapshot)} initialEntries={['/pages/page_search_notes']} />)

    await screen.findByDisplayValue('Search Notes')

    await user.click(screen.getByRole('button', { name: '搜索' }))
    await user.type(screen.getByPlaceholderText('搜索页面或内容'), 'customer')

    expect(
      await screen.findByRole('button', { name: '打开页面 Search Notes' }),
    ).toBeInTheDocument()
  })

  it('uses the local search path inside the desktop runtime and keeps multiple matches from one page', async () => {
    const user = userEvent.setup()
    Reflect.set(globalThis, '__TAURI_INTERNALS__', {})
    const snapshot: WorkspaceSnapshot = {
      boards: [],
      dataTables: [],
      mindmaps: [],
      pages: [
        {
          id: 'page_search_notes',
          parentId: null,
          title: 'Search Notes',
          icon: null,
          cover: null,
          blocks: [
            { id: 'block_1', type: 'paragraph', text: 'customer interview summary' },
            { id: 'block_2', type: 'paragraph', text: 'customer follow-up checklist' },
          ],
          createdAt: '2026-07-04T00:00:00.000Z',
          updatedAt: '2026-07-04T00:00:00.000Z',
        },
      ],
      settings: { lastOpenedPageId: 'page_search_notes' },
    }

    render(<App repository={createMemoryRepository(snapshot)} initialEntries={['/pages/page_search_notes']} />)

    await screen.findByDisplayValue('Search Notes')

    await user.click(screen.getByRole('button', { name: '搜索' }))
    await user.type(screen.getByPlaceholderText('搜索页面或内容'), 'customer')

    expect(
      await screen.findByRole('button', {
        name: '打开页面 Search Notes customer interview summary',
      }),
    ).toBeInTheDocument()
    expect(
      await screen.findByRole('button', {
        name: '打开页面 Search Notes customer follow-up checklist',
      }),
    ).toBeInTheDocument()
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

  it('renders the page cover as a sibling band before the header on normal pages', async () => {
    const pageId = 'page_cover_band'
    const snapshot: WorkspaceSnapshot = {
      boards: [],
      dataTables: [],
      mindmaps: [],
      pages: [
        {
          id: pageId,
          parentId: null,
          title: 'Cover page',
          icon: null,
          cover: 'ocean',
          blocks: [],
          createdAt: '2026-07-04T00:00:00.000Z',
          updatedAt: '2026-07-04T00:00:00.000Z',
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

    await screen.findByDisplayValue('Cover page')

    expect(container.querySelector('.page-route-cover')).not.toBeNull()
    expect(container.querySelector('.page-header .page-cover')).toBeNull()
  })

  it('only shows the route topbar shadow after scrolling away from the top', async () => {
    const pageId = 'page_topbar_shadow'
    const scrollY = vi.spyOn(window, 'scrollY', 'get')
    scrollY.mockReturnValue(0)
    const snapshot: WorkspaceSnapshot = {
      boards: [],
      dataTables: [],
      mindmaps: [],
      pages: [
        {
          id: pageId,
          parentId: null,
          title: 'Shadow page',
          icon: null,
          cover: 'ocean',
          blocks: [{ id: 'block_shadow', type: 'paragraph', text: 'Keep reading' }],
          createdAt: '2026-07-04T00:00:00.000Z',
          updatedAt: '2026-07-04T00:00:00.000Z',
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

    await screen.findByDisplayValue('Shadow page')
    const topbar = container.querySelector('.page-route-topbar')
    expect(topbar).not.toHaveClass('page-route-topbar-scrolled')

    scrollY.mockReturnValue(80)
    fireEvent.scroll(window)
    await waitFor(() => expect(topbar).toHaveClass('page-route-topbar-scrolled'))

    scrollY.mockReturnValue(0)
    fireEvent.scroll(window)
    await waitFor(() => expect(topbar).not.toHaveClass('page-route-topbar-scrolled'))

    scrollY.mockRestore()
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
    expect(within(dialog).getByText(/未被其他页面或资源使用的关联文件/)).toBeInTheDocument()
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

  it('uses the current page title as the page package default file name', async () => {
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
    await user.click(screen.getByRole('button', { name: '导出当前页面' }))

    await waitFor(() => {
      expect(fileAccess.saveBinaryFile).toHaveBeenCalledWith(
        expect.objectContaining({
          defaultPath: '产品规划.zip',
        }),
      )
    })
  })

  it('exports a sidebar page from that page row menu', async () => {
    const user = userEvent.setup()
    const snapshot: WorkspaceSnapshot = {
      boards: [],
      dataTables: [],
      mindmaps: [],
      pages: [
        {
          id: 'page_parent',
          parentId: null,
          title: '产品规划',
          icon: null,
          cover: null,
          blocks: [],
          createdAt: '2026-07-05T00:00:00.000Z',
          updatedAt: '2026-07-05T00:00:00.000Z',
        },
        {
          id: 'page_child',
          parentId: 'page_parent',
          title: '当前页面',
          icon: null,
          cover: null,
          blocks: [],
          createdAt: '2026-07-05T00:00:00.000Z',
          updatedAt: '2026-07-05T00:00:00.000Z',
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

    await screen.findByDisplayValue('当前页面')
    await user.click(screen.getAllByRole('button', { name: '页面更多操作' })[0])
    await user.click(screen.getByRole('button', { name: '导出页面' }))

    await waitFor(() => {
      expect(pagePackageStorage.exportPagePackage).toHaveBeenCalledWith('page_parent')
    })
    expect(fileAccess.saveBinaryFile).toHaveBeenCalledWith(
      expect.objectContaining({
        defaultPath: '产品规划.zip',
      }),
    )
  })

  it('exports the current page package directly to the selected desktop path', async () => {
    Object.defineProperty(globalThis, '__TAURI_INTERNALS__', {
      configurable: true,
      value: {},
    })
    const user = userEvent.setup()
    const pageId = 'page_archive_desktop'
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
    await user.click(screen.getByRole('button', { name: '导出当前页面' }))

    await waitFor(() => {
      expect(fileAccess.pickSaveFilePath).toHaveBeenCalledWith({
        defaultPath: '产品规划.zip',
        filters: [{ name: 'ZIP', extensions: ['zip'] }],
      })
    })
    expect(pagePackageStorage.exportPagePackageToPath).toHaveBeenCalledWith(
      pageId,
      '/tmp/产品规划.zip',
      expect.any(Function),
    )
    expect(pagePackageStorage.exportPagePackage).not.toHaveBeenCalled()
    expect(fileAccess.saveBinaryFile).not.toHaveBeenCalled()
  })

  it('shows progress while exporting a desktop page package', async () => {
    Object.defineProperty(globalThis, '__TAURI_INTERNALS__', {
      configurable: true,
      value: {},
    })
    const user = userEvent.setup()
    const pageId = 'page_archive_progress'
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
    let resolveExport: () => void
    const exportDone = new Promise<void>((resolve) => {
      resolveExport = resolve
    })
    pagePackageStorage.exportPagePackageToPath.mockImplementationOnce(
      async (_pageId, _path, onProgress) => {
        onProgress?.({
          operation: 'export',
          phase: 'processingAsset',
          current: 1,
          total: 2,
          bytesProcessed: 512,
          bytesTotal: 1024,
          itemName: 'lesson.m4a',
        })
        await exportDone
      },
    )

    render(
      <App
        repository={createMemoryRepository(snapshot)}
        initialEntries={[`/pages/${pageId}`]}
      />,
    )

    await screen.findByDisplayValue('产品规划')
    await user.click(screen.getByRole('button', { name: '页面菜单' }))
    await user.click(screen.getByRole('button', { name: '导出当前页面' }))

    expect(await screen.findByText('正在导出当前页面')).toBeInTheDocument()
    expect(screen.getByText('lesson.m4a')).toBeInTheDocument()
    expect(screen.getByText('50%')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '页面菜单' })).toBeDisabled()

    resolveExport!()
    await waitFor(() => {
      expect(screen.getByText('当前页面已导出')).toBeInTheDocument()
    })
  })

  it('exports the whole workspace from the top page menu', async () => {
    const user = userEvent.setup()
    const pageId = 'page_workspace_export'
    const snapshot: WorkspaceSnapshot = {
      boards: [],
      dataTables: [],
      mindmaps: [],
      pages: [
        {
          id: pageId,
          parentId: null,
          title: '工作区首页',
          icon: null,
          cover: null,
          blocks: [],
          createdAt: '2026-07-05T00:00:00.000Z',
          updatedAt: '2026-07-05T00:00:00.000Z',
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

    await screen.findByDisplayValue('工作区首页')
    await user.click(screen.getByRole('button', { name: '页面菜单' }))
    await user.click(screen.getByRole('button', { name: '全部导出' }))

    await waitFor(() => {
      expect(fileAccess.saveTextFile).toHaveBeenCalledWith(
        expect.objectContaining({
          defaultPath: '知栖工作区备份.json',
          filters: [{ name: 'JSON', extensions: ['json'] }],
        }),
      )
    })

    const exportPayload = fileAccess.saveTextFile.mock.calls[0]?.[0]
    expect(exportPayload).toBeDefined()
    expect(JSON.parse(String(exportPayload.contents))).toMatchObject({
      pages: [expect.objectContaining({ id: pageId, title: '工作区首页' })],
    })
  })

  it('imports a page package as a new top-level page and navigates to it', async () => {
    Object.defineProperty(globalThis, '__TAURI_INTERNALS__', {
      configurable: true,
      value: {},
    })
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true)
    const user = userEvent.setup()
    const pageId = 'page_import_source'
    const snapshot: WorkspaceSnapshot = {
      boards: [],
      dataTables: [],
      mindmaps: [],
      pages: [
        {
          id: pageId,
          parentId: null,
          title: '当前页面',
          icon: null,
          cover: null,
          blocks: [],
          createdAt: '2026-07-02T00:00:00.000Z',
          updatedAt: '2026-07-02T00:00:00.000Z',
        },
      ],
      settings: { lastOpenedPageId: pageId },
    }
    pagePackageStorage.importPagePackageFromPath.mockResolvedValueOnce({
      rootPageId: 'page_imported',
    })

    render(
      <App
        repository={createMemoryRepository(snapshot)}
        initialEntries={[`/pages/${pageId}`]}
      />,
    )

    await screen.findByDisplayValue('当前页面')
    await user.click(screen.getByRole('button', { name: '页面菜单' }))
    await user.click(screen.getByRole('button', { name: '导入页面包' }))

    await waitFor(() => {
      expect(fileAccess.openLocalFilePath).toHaveBeenCalledWith({
        filters: [{ name: 'ZIP', extensions: ['zip'] }],
      })
    })
    expect(confirm).toHaveBeenCalledWith('导入会新增为一个顶层页面，确认继续吗？')
    expect(pagePackageStorage.importPagePackageFromPath).toHaveBeenCalledWith(
      '/tmp/工作区备份.zip',
      expect.any(Function),
    )

    confirm.mockRestore()
  })

  it('flushes pending workspace saves before importing a desktop page package', async () => {
    Object.defineProperty(globalThis, '__TAURI_INTERNALS__', {
      configurable: true,
      value: {},
    })
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true)
    const user = userEvent.setup()
    const pageId = 'page_import_flush'
    const snapshot: WorkspaceSnapshot = {
      boards: [],
      dataTables: [],
      mindmaps: [],
      pages: [
        {
          id: pageId,
          parentId: null,
          title: '待恢复页面',
          icon: null,
          cover: null,
          blocks: [{ id: 'block_1', type: 'paragraph', text: 'Unsaved draft' }],
          createdAt: '2026-07-02T00:00:00.000Z',
          updatedAt: '2026-07-02T00:00:00.000Z',
        },
      ],
      settings: { lastOpenedPageId: pageId },
    }
    const store = createWorkspaceStore(createMemoryRepository(snapshot))
    let resolveFlush: () => void
    const flushDone = new Promise<void>((resolve) => {
      resolveFlush = resolve
    })
    const flushPendingSaves = vi.fn(async () => {
      await flushDone
    })
    store.setState({ flushPendingSaves })

    render(<App store={store} initialEntries={[`/pages/${pageId}`]} />)

    await screen.findByDisplayValue('待恢复页面')
    await user.click(screen.getByRole('button', { name: '页面菜单' }))
    await user.click(screen.getByRole('button', { name: '导入页面包' }))

    await waitFor(() => {
      expect(flushPendingSaves).toHaveBeenCalledTimes(1)
    })
    expect(pagePackageStorage.importPagePackageFromPath).not.toHaveBeenCalled()

    resolveFlush!()

    await waitFor(() => {
      expect(pagePackageStorage.importPagePackageFromPath).toHaveBeenCalledWith(
        '/tmp/工作区备份.zip',
        expect.any(Function),
      )
    })

    confirm.mockRestore()
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
  it('opens a rename prompt from the whiteboard menu and applies the new title', async () => {
    const user = userEvent.setup()
    const pageId = 'page_whiteboard'
    const boardId = 'board_strategy'
    const promptSpy = vi.spyOn(window, 'prompt').mockReturnValue('新白板名称')
    const snapshot: WorkspaceSnapshot = {
      boards: [
        {
          id: boardId,
          title: '流程白板',
          snapshot: {
            version: 1,
            elements: [],
            viewport: { x: 0, y: 0, zoom: 1 },
          },
          createdAt: '2026-07-05T00:00:00.000Z',
          updatedAt: '2026-07-05T00:00:00.000Z',
        },
      ],
      dataTables: [],
      mindmaps: [],
      pages: [
        {
          id: pageId,
          parentId: null,
          title: '产品规划',
          icon: null,
          cover: null,
          blocks: [{ id: 'block_whiteboard', type: 'whiteboard', boardId }],
          createdAt: '2026-07-05T00:00:00.000Z',
          updatedAt: '2026-07-05T00:00:00.000Z',
        },
      ],
      settings: { lastOpenedPageId: pageId },
    }

    render(
      <App
        repository={createMemoryRepository(snapshot)}
        initialEntries={[`/pages/${pageId}/boards/${boardId}`]}
      />,
    )

    await user.click(await screen.findByRole('button', { name: '白板菜单' }))
    await user.click(screen.getByRole('button', { name: '重命名' }))

    expect(promptSpy).toHaveBeenCalledWith('重命名白板', '流程白板')
    await waitFor(() =>
      expect(screen.getByRole('textbox', { name: '白板标题' })).toHaveValue('新白板名称'),
    )

    promptSpy.mockRestore()
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
