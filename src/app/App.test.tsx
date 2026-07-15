import { StrictMode } from 'react'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AppSettings, McpSettings, WorkspaceSnapshot } from '../domain/types'
import { createDefaultAppState } from '../components/dataTable/domain/factory'
import { createAppSettingsRepository } from '../lib/appSettingsRepository'
import type { WorkspaceStorageClient } from '../lib/storageClient'
import type { WorkspaceRepository } from '../lib/workspaceRepository'
import { createMemoryRepository } from '../test/memoryRepository'
import { createWorkspaceStore } from '../store/createWorkspaceStore'
import { WorkspaceApp } from './App'

const desktopLifecycle = vi.hoisted(() => ({
  registerDesktopPendingSaveFlush: vi.fn(async () => () => undefined),
  registerDesktopTrayActions: vi.fn(async () => () => undefined),
}))
const fileAccess = vi.hoisted(() => ({
  openTextFile: vi.fn(async () => ({
    name: '知栖工作区备份.json',
    contents: JSON.stringify({
      boards: [],
      dataTables: [],
      mindmaps: [],
      pages: [
        {
          id: 'page_restored_home',
          parentId: null,
          title: '恢复后的首页',
          icon: null,
          cover: null,
          blocks: [],
          createdAt: '2026-07-08T00:00:00.000Z',
          updatedAt: '2026-07-08T00:00:00.000Z',
        },
      ],
      settings: {
        lastOpenedPageId: 'page_restored_home',
      },
    }),
  })),
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
const tauriEvents = vi.hoisted(() => ({
  listen: vi.fn(async () => () => undefined),
}))

vi.mock('@tauri-apps/api/event', () => tauriEvents)

vi.mock('../lib/desktopLifecycle', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/desktopLifecycle')>()
  return {
    ...actual,
    registerDesktopPendingSaveFlush: desktopLifecycle.registerDesktopPendingSaveFlush,
    registerDesktopTrayActions: desktopLifecycle.registerDesktopTrayActions,
  }
})

vi.mock('../lib/fileAccess', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/fileAccess')>()
  return {
    ...actual,
    openTextFile: fileAccess.openTextFile,
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

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })

  return { promise, resolve, reject }
}

function createMcpAppSettingsRepository(
  enableLocalMcp: () => Promise<McpSettings>,
  initialSettings: AppSettings | null = null,
) {
  const client = {
    loadAppSettings: vi.fn(async () => initialSettings),
    saveAppSettings: vi.fn(async () => undefined),
    enableLocalMcp: vi.fn(enableLocalMcp),
    disableLocalMcp: vi.fn(async () => undefined),
  } as unknown as WorkspaceStorageClient

  return {
    client,
    repository: createAppSettingsRepository({ client, isDesktop: true }),
  }
}

function createMcpSettingsSnapshot(): WorkspaceSnapshot {
  return {
    boards: [],
    dataTables: [],
    mindmaps: [],
    pages: [
      {
        id: 'page_mcp_settings',
        parentId: null,
        title: 'MCP 设置测试',
        icon: null,
        cover: null,
        blocks: [],
        createdAt: '2026-07-12T00:00:00.000Z',
        updatedAt: '2026-07-12T00:00:00.000Z',
      },
    ],
    settings: { lastOpenedPageId: 'page_mcp_settings' },
  }
}

describe('App', () => {
  let scrollTo: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    Reflect.deleteProperty(globalThis, '__TAURI_INTERNALS__')
    desktopLifecycle.registerDesktopPendingSaveFlush.mockResolvedValue(() => undefined)
    desktopLifecycle.registerDesktopTrayActions.mockResolvedValue(() => undefined)
    fileAccess.openTextFile.mockClear()
    fileAccess.openTextFile.mockResolvedValue({
      name: '知栖工作区备份.json',
      contents: JSON.stringify({
        boards: [],
        dataTables: [],
        mindmaps: [],
        pages: [
          {
            id: 'page_restored_home',
            parentId: null,
            title: '恢复后的首页',
            icon: null,
            cover: null,
            blocks: [],
            createdAt: '2026-07-08T00:00:00.000Z',
            updatedAt: '2026-07-08T00:00:00.000Z',
          },
        ],
        settings: {
          lastOpenedPageId: 'page_restored_home',
        },
      }),
    })
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
    tauriEvents.listen.mockClear()
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
        <WorkspaceApp repository={repository} />
      </StrictMode>,
    )

    await screen.findByDisplayValue('欢迎使用知栖', {}, { timeout: 3000 })

    expect(replaceCalls).toBe(1)
  })

  it('reloads the open page when the local MCP service reports a write', async () => {
    Object.defineProperty(globalThis, '__TAURI_INTERNALS__', {
      configurable: true,
      value: {},
    })
    const snapshot: WorkspaceSnapshot = {
      boards: [],
      dataTables: [],
      mindmaps: [],
      pages: [
        {
          id: 'page_mcp_refresh',
          parentId: null,
          title: 'MCP note',
          icon: null,
          cover: null,
          blocks: [{ id: 'block_before_mcp', type: 'paragraph', text: 'Before MCP' }],
          createdAt: '2026-07-11T00:00:00.000Z',
          updatedAt: '2026-07-11T00:00:00.000Z',
        },
      ],
      settings: { lastOpenedPageId: 'page_mcp_refresh' },
    }
    const repository: WorkspaceRepository = {
      load: async () => structuredClone(snapshot),
      save: async () => undefined,
      replace: async () => undefined,
      cleanupOrphanAssets: async () => 0,
    }

    const store = createWorkspaceStore(repository)
    const refreshMcpWorkspace = vi.spyOn(store.getState(), 'refreshMcpWorkspace')
    render(<WorkspaceApp store={store} initialEntries={['/pages/page_mcp_refresh']} />)

    await screen.findByText('Before MCP')
    snapshot.pages[0]?.blocks.push({ id: 'block_from_mcp', type: 'paragraph', text: 'Saved by MCP' })
    expect((await repository.load())?.pages[0]?.blocks).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: 'block_from_mcp' })]),
    )

    await waitFor(() => {
      expect(tauriEvents.listen).toHaveBeenCalledWith('zhixi://mcp-workspace-updated', expect.any(Function))
    })
    const handler = tauriEvents.listen.mock.calls.find(
      ([eventName]) => eventName === 'zhixi://mcp-workspace-updated',
    )?.[1] as ((event: { payload: { operation: 'append_content'; pageId: string; createdBlockIds: string[] } }) => Promise<void>) | undefined

    expect(handler).toBeDefined()

    await act(async () => {
      await handler?.({ payload: { operation: 'append_content', pageId: 'page_mcp_refresh', createdBlockIds: ['block_from_mcp'] } })
    })

    expect(refreshMcpWorkspace).toHaveBeenCalled()

    expect(store.getState().pages.find((page) => page.id === 'page_mcp_refresh')?.blocks).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: 'block_from_mcp' })]),
    )
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

    render(<WorkspaceApp store={store} initialEntries={['/pages/page_flush']} />)

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

    render(<WorkspaceApp store={store} initialEntries={['/pages/page_desktop_flush']} />)

    await screen.findByDisplayValue('Desktop flush page')

    await waitFor(() => {
      expect(desktopLifecycle.registerDesktopPendingSaveFlush).toHaveBeenCalled()
    })

    const registeredFlush = desktopLifecycle.registerDesktopPendingSaveFlush.mock.calls.at(-1)?.[0]
    await registeredFlush?.()

    expect(flushPendingSaves).toHaveBeenCalledTimes(1)
  })

  it('creates and opens a new top-level note from the desktop tray action', async () => {
    const snapshot: WorkspaceSnapshot = {
      boards: [],
      dataTables: [],
      mindmaps: [],
      pages: [
        {
          id: 'page_root',
          parentId: null,
          title: 'Home',
          icon: null,
          cover: null,
          blocks: [],
          createdAt: '2026-07-07T00:00:00.000Z',
          updatedAt: '2026-07-07T00:00:00.000Z',
        },
      ],
      settings: { lastOpenedPageId: 'page_root' },
    }

    render(<WorkspaceApp repository={createMemoryRepository(snapshot)} initialEntries={['/pages/page_root']} />)

    await screen.findByDisplayValue('Home')
    await waitFor(() => {
      expect(desktopLifecycle.registerDesktopTrayActions).toHaveBeenCalled()
    })

    const handlers = desktopLifecycle.registerDesktopTrayActions.mock.calls.at(-1)?.[0]
    await handlers?.onNewNote()

    expect(await screen.findByDisplayValue('未命名')).toBeInTheDocument()
  })

  it('opens the settings center from the sidebar utility menu', async () => {
    const user = userEvent.setup()
    const snapshot: WorkspaceSnapshot = {
      boards: [],
      dataTables: [],
      mindmaps: [],
      pages: [
        {
          id: 'page_settings_home',
          parentId: null,
          title: '快速开始',
          icon: null,
          cover: null,
          blocks: [],
          createdAt: '2026-07-08T00:00:00.000Z',
          updatedAt: '2026-07-08T00:00:00.000Z',
        },
      ],
      settings: { lastOpenedPageId: 'page_settings_home' },
    }

    render(
      <WorkspaceApp
        repository={createMemoryRepository(snapshot)}
        initialEntries={['/pages/page_settings_home']}
      />,
    )

    await screen.findByDisplayValue('快速开始')
    await user.click(screen.getByRole('button', { name: '更多' }))
    await user.click(screen.getByRole('button', { name: '设置' }))

    expect(await screen.findByRole('heading', { name: '设置中心' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '通用' })).toBeInTheDocument()
    expect(screen.queryByRole('complementary', { name: '侧边栏' })).not.toBeInTheDocument()
  })

  it('keeps the MCP toggle pending when the settings center remounts', async () => {
    const user = userEvent.setup()
    const deferred = createDeferred<McpSettings>()
    const appSettings = createMcpAppSettingsRepository(() => deferred.promise)
    const store = createWorkspaceStore(
      createMemoryRepository(createMcpSettingsSnapshot()),
      appSettings.repository,
    )

    render(<WorkspaceApp store={store} initialEntries={['/settings/experimental']} />)

    const toggle = await screen.findByRole('checkbox', { name: /启用本机 MCP 接入/ })
    await user.click(toggle)

    expect(appSettings.client.enableLocalMcp).toHaveBeenCalledTimes(1)
    expect(toggle).toBeDisabled()
    expect(screen.getByText('正在启用本机 MCP 接入…')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '返回工作区' }))
    await screen.findByDisplayValue('MCP 设置测试')
    await user.click(screen.getByRole('button', { name: '更多' }))
    await user.click(screen.getByRole('button', { name: '设置' }))
    await user.click(await screen.findByRole('button', { name: '实验功能' }))

    const remountedToggle = screen.getByRole('checkbox', { name: /启用本机 MCP 接入/ })
    expect(remountedToggle).toBeDisabled()
    expect(screen.getByText('正在启用本机 MCP 接入…')).toBeInTheDocument()

    deferred.resolve({ enabled: true, port: 9761, token: 'private-token' })
    await waitFor(() => expect(remountedToggle).toBeEnabled())
  })

  it('ignores a pending MCP rejection after the controlled config changes', async () => {
    const user = userEvent.setup()
    const deferred = createDeferred<McpSettings>()
    const appSettings = createMcpAppSettingsRepository(() => deferred.promise)
    const store = createWorkspaceStore(
      createMemoryRepository(createMcpSettingsSnapshot()),
      appSettings.repository,
    )

    render(<WorkspaceApp store={store} initialEntries={['/settings/experimental']} />)

    const toggle = await screen.findByRole('checkbox', { name: /启用本机 MCP 接入/ })
    await user.click(toggle)
    expect(toggle).toBeDisabled()

    act(() => {
      store.setState({
        appSettings: {
          closeAction: 'hide_to_tray',
          mcp: { enabled: true, port: 9762, token: 'new-token' },
        },
      })
    })

    await waitFor(() => expect(toggle).toBeEnabled())

    await act(async () => {
      deferred.reject({ code: 'mcp_unavailable', message: 'old request failed' })
      await deferred.promise.catch(() => undefined)
    })

    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(toggle).toBeChecked()
  })

  it('surfaces a real app-settings repository rejection and retries through the full settings chain', async () => {
    const user = userEvent.setup()
    const failure = { code: 'mcp_unavailable', message: 'MCP server did not start' }
    let attempt = 0
    const appSettings = createMcpAppSettingsRepository(async () => {
      attempt += 1
      if (attempt === 1) {
        throw failure
      }
      return { enabled: true, port: 9761, token: 'private-token' }
    })
    const store = createWorkspaceStore(
      createMemoryRepository(createMcpSettingsSnapshot()),
      appSettings.repository,
    )

    render(<WorkspaceApp store={store} initialEntries={['/settings/experimental']} />)

    const toggle = await screen.findByRole('checkbox', { name: /启用本机 MCP 接入/ })
    await user.click(toggle)

    expect(await screen.findByRole('alert')).toHaveTextContent('启用失败，请稍后重试。')
    expect(toggle).toBeEnabled()
    expect(toggle).not.toBeChecked()

    await user.click(toggle)

    await waitFor(() => expect(toggle).toBeChecked())
    expect(toggle).toBeEnabled()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(appSettings.client.enableLocalMcp).toHaveBeenCalledTimes(2)
  })

  it('returns to the workspace from the settings center', async () => {
    const user = userEvent.setup()
    const snapshot: WorkspaceSnapshot = {
      boards: [],
      dataTables: [],
      mindmaps: [],
      pages: [
        {
          id: 'page_settings_back',
          parentId: null,
          title: '快速开始',
          icon: null,
          cover: null,
          blocks: [],
          createdAt: '2026-07-08T00:00:00.000Z',
          updatedAt: '2026-07-08T00:00:00.000Z',
        },
      ],
      settings: { lastOpenedPageId: 'page_settings_back' },
    }

    const { container } = render(
      <WorkspaceApp
        repository={createMemoryRepository(snapshot)}
        initialEntries={['/settings/general']}
      />,
    )

    expect(await screen.findByRole('heading', { name: '设置中心' })).toBeInTheDocument()
    expect(container.querySelector('.page-panel-focus')).not.toBeNull()

    await user.click(screen.getByRole('button', { name: '返回工作区' }))

    expect(await screen.findByDisplayValue('快速开始')).toBeInTheDocument()
  })

  it('opens the inbox page from the desktop tray action', async () => {
    const snapshot: WorkspaceSnapshot = {
      boards: [],
      dataTables: [],
      mindmaps: [],
      pages: [
        {
          id: 'page_root',
          parentId: null,
          title: 'Home',
          icon: null,
          cover: null,
          blocks: [],
          createdAt: '2026-07-07T00:00:00.000Z',
          updatedAt: '2026-07-07T00:00:00.000Z',
        },
      ],
      settings: { lastOpenedPageId: 'page_root' },
    }

    render(<WorkspaceApp repository={createMemoryRepository(snapshot)} initialEntries={['/pages/page_root']} />)

    await screen.findByDisplayValue('Home')
    await waitFor(() => {
      expect(desktopLifecycle.registerDesktopTrayActions).toHaveBeenCalled()
    })

    const handlers = desktopLifecycle.registerDesktopTrayActions.mock.calls.at(-1)?.[0]
    await handlers?.onOpenInbox()

    expect(await screen.findByDisplayValue('收件箱')).toBeInTheDocument()
  })

  it('lets users navigate away after opening the sidebar page menu on a tray-created note', async () => {
    const user = userEvent.setup()
    const snapshot: WorkspaceSnapshot = {
      boards: [],
      dataTables: [],
      mindmaps: [],
      pages: [
        {
          id: 'page_home',
          parentId: null,
          title: 'Home',
          icon: null,
          cover: null,
          blocks: [],
          createdAt: '2026-07-07T00:00:00.000Z',
          updatedAt: '2026-07-07T00:00:00.000Z',
        },
        {
          id: 'page_other',
          parentId: null,
          title: 'Other Page',
          icon: null,
          cover: null,
          blocks: [],
          createdAt: '2026-07-07T00:00:00.000Z',
          updatedAt: '2026-07-07T00:00:00.000Z',
        },
      ],
      settings: { lastOpenedPageId: 'page_home' },
    }

    render(<WorkspaceApp repository={createMemoryRepository(snapshot)} initialEntries={['/pages/page_home']} />)

    await screen.findByDisplayValue('Home')
    await waitFor(() => {
      expect(desktopLifecycle.registerDesktopTrayActions).toHaveBeenCalled()
    })

    const handlers = desktopLifecycle.registerDesktopTrayActions.mock.calls.at(-1)?.[0]
    await handlers?.onNewNote()
    await screen.findByDisplayValue('未命名')

    const newPageLink = screen.getByRole('link', { name: '未命名' })
    const newPageRow = newPageLink.closest('.sidebar-tree-page-row')
    expect(newPageRow).not.toBeNull()

    await user.click(within(newPageRow as HTMLElement).getByRole('button', { name: '页面更多操作' }))
    expect(screen.getByRole('button', { name: '重命名页面' })).toBeInTheDocument()

    await user.click(screen.getByRole('link', { name: 'Other Page' }))

    await waitFor(() => {
      expect(screen.getByDisplayValue('Other Page')).toBeInTheDocument()
    })
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

    render(<WorkspaceApp repository={createMemoryRepository(snapshot)} initialEntries={['/pages/page_search_notes']} />)

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

    render(<WorkspaceApp repository={createMemoryRepository(snapshot)} initialEntries={['/pages/page_search_notes']} />)

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

  it('applies workspace search preferences to the global search dialog', async () => {
    const user = userEvent.setup()
    const snapshot: WorkspaceSnapshot = {
      boards: [],
      dataTables: [],
      mindmaps: [],
      pages: [
        {
          id: 'page_search_preferences',
          parentId: null,
          title: 'Search Notes',
          icon: null,
          cover: null,
          blocks: [
            {
              id: 'block_preferences',
              type: 'paragraph',
              text: 'alpha beta gamma delta epsilon zeta eta theta iota kappa lambda mu nu xi omicron pi rho sigma tau upsilon phi chi psi omega',
            },
          ],
          createdAt: '2026-07-08T00:00:00.000Z',
          updatedAt: '2026-07-08T00:00:00.000Z',
        },
      ],
      settings: {
        lastOpenedPageId: 'page_search_preferences',
        searchPreferences: {
          groupResults: false,
          showSourceLabels: false,
          excerptLength: 'short',
        },
      },
    }

    render(
      <WorkspaceApp
        repository={createMemoryRepository(snapshot)}
        initialEntries={['/pages/page_search_preferences']}
      />,
    )

    await screen.findByDisplayValue('Search Notes')

    await user.click(screen.getByRole('button', { name: '搜索' }))
    await user.type(screen.getByPlaceholderText('搜索页面或内容'), 'alpha')

    expect(document.body.querySelector('.search-group-title')).toBeNull()
    expect(document.body.querySelector('.search-result-source')).toBeNull()

    const excerpt = document.body.querySelector('.search-result-excerpt')?.textContent ?? ''
    expect(excerpt).toContain('...')
    expect(excerpt.length).toBeLessThan(80)
  })

  it('navigates a page-content search hit to the matched block on the target page', async () => {
    const user = userEvent.setup()
    const scrollIntoView = vi.fn()
    const originalScrollIntoView = HTMLElement.prototype.scrollIntoView
    HTMLElement.prototype.scrollIntoView = scrollIntoView

    try {
      Reflect.set(globalThis, '__TAURI_INTERNALS__', {})
      const snapshot: WorkspaceSnapshot = {
        boards: [],
        dataTables: [],
        mindmaps: [],
        pages: [
          {
            id: 'page_current',
            parentId: null,
            title: 'Current Page',
            icon: null,
            cover: null,
            blocks: [{ id: 'block_current', type: 'paragraph', text: 'misc notes' }],
            createdAt: '2026-07-06T00:00:00.000Z',
            updatedAt: '2026-07-06T00:00:00.000Z',
          },
          {
            id: 'page_target',
            parentId: null,
            title: 'Search Notes',
            icon: null,
            cover: null,
            blocks: [
              { id: 'block_1', type: 'paragraph', text: 'customer interview summary' },
              { id: 'block_2', type: 'paragraph', text: 'customer follow-up checklist' },
            ],
            createdAt: '2026-07-06T00:00:00.000Z',
            updatedAt: '2026-07-06T00:00:00.000Z',
          },
        ],
        settings: { lastOpenedPageId: 'page_current' },
      }

      render(
        <WorkspaceApp
          repository={createMemoryRepository(snapshot)}
          initialEntries={['/pages/page_current']}
        />,
      )

      await screen.findByDisplayValue('Current Page')

      await user.click(screen.getByRole('button', { name: '搜索' }))
      await user.type(screen.getByPlaceholderText('搜索页面或内容'), 'follow-up')

      const result = await screen.findByRole('button', {
        name: '打开页面 Search Notes',
      })

      scrollIntoView.mockClear()
      await user.click(result)

      await screen.findByDisplayValue('Search Notes')

      await waitFor(() => {
        expect(scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth', block: 'start' })
      })
    } finally {
      HTMLElement.prototype.scrollIntoView = originalScrollIntoView
    }
  })

  it('opens the source block when a bottom backlinks entry is clicked', async () => {
    const user = userEvent.setup()
    const scrollIntoView = vi.fn()
    const originalScrollIntoView = HTMLElement.prototype.scrollIntoView
    HTMLElement.prototype.scrollIntoView = scrollIntoView

    try {
      const snapshot: WorkspaceSnapshot = {
        boards: [],
        dataTables: [],
        mindmaps: [],
        pageProperties: [],
        pages: [
          {
            id: 'page_target',
            parentId: null,
            title: 'Product Plan',
            icon: null,
            cover: null,
            properties: {},
            blocks: [],
            createdAt: '2026-07-06T00:00:00.000Z',
            updatedAt: '2026-07-06T00:00:00.000Z',
          },
          {
            id: 'page_source',
            parentId: null,
            title: 'Meeting Notes',
            icon: null,
            cover: null,
            properties: {},
            blocks: [
              {
                id: 'block_relation',
                type: 'paragraph',
                text: 'See Product Plan',
                richText: [
                  { text: 'See ' },
                  { text: 'Product Plan', pageId: 'page_target', relationKind: 'link' },
                ],
              },
            ],
            createdAt: '2026-07-06T00:00:00.000Z',
            updatedAt: '2026-07-06T00:00:00.000Z',
          },
        ],
        settings: { lastOpenedPageId: 'page_target' },
      }

      render(<WorkspaceApp repository={createMemoryRepository(snapshot)} initialEntries={['/pages/page_target']} />)

      await user.click(await screen.findByRole('button', { name: /See Product Plan/ }))

      await screen.findByDisplayValue('Meeting Notes')

      await waitFor(() => {
        expect(scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth', block: 'start' })
      })
    } finally {
      HTMLElement.prototype.scrollIntoView = originalScrollIntoView
    }
  })

  it('shows page properties below the title and lets search surface property hits on normal pages', async () => {
    const user = userEvent.setup()
    const snapshot: WorkspaceSnapshot = {
      boards: [],
      dataTables: [],
      mindmaps: [],
      pageProperties: [
        {
          id: 'prop_tags',
          key: 'tags',
          name: '标签',
          type: 'multiSelect',
          config: {
            options: [
              { id: 'tag_product', label: '产品', color: '#2563eb' },
              { id: 'tag_search', label: '搜索', color: '#16a34a' },
            ],
          },
          createdAt: '2026-07-05T00:00:00.000Z',
          updatedAt: '2026-07-05T00:00:00.000Z',
        },
      ],
      pages: [
        {
          id: 'page_property_search',
          parentId: null,
          title: '产品规划',
          icon: null,
          cover: null,
          properties: { prop_tags: ['产品', '搜索'] },
          blocks: [{ id: 'block_1', type: 'paragraph', text: '发布节奏' }],
          createdAt: '2026-07-05T00:00:00.000Z',
          updatedAt: '2026-07-05T00:00:00.000Z',
        },
      ],
      settings: { lastOpenedPageId: 'page_property_search' },
    }

    render(
      <WorkspaceApp
        repository={createMemoryRepository(snapshot)}
        initialEntries={['/pages/page_property_search']}
      />,
    )

    const titleInput = await screen.findByDisplayValue('产品规划')
    const propertiesPanel = screen.getByRole('region', { name: '页面属性' })

    expect(titleInput.compareDocumentPosition(propertiesPanel)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    )
    expect(within(propertiesPanel).getByRole('button', { name: '产品 / 搜索' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '搜索' }))

    const searchInput = await screen.findByPlaceholderText('搜索页面或内容')
    const searchDialog = screen.getByRole('dialog', { name: '全局搜索' })

    await user.type(searchInput, '搜索')

    const pageGroup = await within(searchDialog).findByRole('region', {
      name: '页面',
    })

    expect(within(pageGroup).getByText('产品 / 搜索')).toBeInTheDocument()
    expect(within(pageGroup).getByText('标签')).toBeInTheDocument()
  })

  it('wires reference block insertion through the page editor into the workspace store', async () => {
    const user = userEvent.setup()
    const pageId = 'page_reference_insert'
    const snapshot: WorkspaceSnapshot = {
      boards: [],
      dataTables: [],
      mindmaps: [],
      syncedBlockGroups: [
        {
          id: 'group_1',
          blocks: [{ id: 'block_shared', type: 'paragraph', text: 'Weekly review' }],
          primaryInstanceId: 'instance_1',
          createdAt: '2026-07-07T00:00:00.000Z',
          updatedAt: '2026-07-07T00:00:00.000Z',
        },
      ],
      pages: [
        {
          id: pageId,
          parentId: null,
          title: '引用测试',
          icon: null,
          cover: null,
          blocks: [],
          createdAt: '2026-07-07T00:00:00.000Z',
          updatedAt: '2026-07-07T00:00:00.000Z',
        },
      ],
      settings: { lastOpenedPageId: pageId },
    }

    const { container } = render(
      <WorkspaceApp
        repository={createMemoryRepository(snapshot)}
        initialEntries={[`/pages/${pageId}`]}
      />,
    )

    await screen.findByDisplayValue('引用测试')
    await user.click(screen.getByRole('button', { name: '添加块' }))
    await user.click(screen.getByRole('button', { name: '引用块' }))
    await user.click(screen.getByRole('button', { name: /Weekly review/i }))

    await waitFor(() => {
      expect(container.querySelector('.synced-block-container-reference')).not.toBeNull()
    })
    expect(screen.getByText('Weekly review')).toBeInTheDocument()
  })

  it('creates a reference block from existing page content through the picker', async () => {
    const user = userEvent.setup()
    const pageId = 'page_target_reference_existing'
    const snapshot: WorkspaceSnapshot = {
      boards: [],
      dataTables: [],
      mindmaps: [],
      syncedBlockGroups: [],
      pages: [
        {
          id: 'page_source_reference_existing',
          parentId: null,
          title: '来源页',
          icon: null,
          cover: null,
          blocks: [{ id: 'source_1', type: 'paragraph', text: 'Existing source note' }],
          createdAt: '2026-07-07T00:00:00.000Z',
          updatedAt: '2026-07-07T00:00:00.000Z',
        },
        {
          id: pageId,
          parentId: null,
          title: '引用已有内容',
          icon: null,
          cover: null,
          blocks: [],
          createdAt: '2026-07-07T00:00:00.000Z',
          updatedAt: '2026-07-07T00:00:00.000Z',
        },
      ],
      settings: { lastOpenedPageId: pageId },
    }

    const { container } = render(
      <WorkspaceApp
        repository={createMemoryRepository(snapshot)}
        initialEntries={[`/pages/${pageId}`]}
      />,
    )

    await screen.findByDisplayValue('引用已有内容')
    await user.click(screen.getByRole('button', { name: '添加块' }))
    await user.click(screen.getByRole('button', { name: '引用块' }))
    await user.type(screen.getByPlaceholderText('搜索已有内容'), 'source note')
    await user.click(screen.getByRole('button', { name: /Existing source note/i }))

    await waitFor(() => {
      expect(container.querySelector('.synced-block-container-reference')).not.toBeNull()
    })
    expect(screen.getByText('Existing source note')).toBeInTheDocument()
  })

  it('creates a reference block from existing content on the same page', async () => {
    const user = userEvent.setup()
    const pageId = 'page_same_page_reference_existing'
    const snapshot: WorkspaceSnapshot = {
      boards: [],
      dataTables: [],
      mindmaps: [],
      syncedBlockGroups: [],
      pages: [
        {
          id: pageId,
          parentId: null,
          title: '同页引用',
          icon: null,
          cover: null,
          blocks: [
            { id: 'source_1', type: 'paragraph', text: 'Existing source note' },
            { id: 'target_1', type: 'paragraph', text: '' },
          ],
          createdAt: '2026-07-07T00:00:00.000Z',
          updatedAt: '2026-07-07T00:00:00.000Z',
        },
      ],
      settings: { lastOpenedPageId: pageId },
    }

    const { container } = render(
      <WorkspaceApp
        repository={createMemoryRepository(snapshot)}
        initialEntries={[`/pages/${pageId}`]}
      />,
    )

    await screen.findByDisplayValue('同页引用')
    const textboxes = screen.getAllByRole('textbox', { name: '输入正文' })
    await user.click(textboxes[1])
    await user.keyboard('/')
    await user.click(screen.getByRole('button', { name: '引用块' }))
    await user.type(screen.getByPlaceholderText('搜索已有内容'), 'source note')
    await user.click(screen.getByRole('button', { name: /Existing source note/i }))

    await waitFor(() => {
      expect(container.querySelectorAll('.synced-block-container-reference').length).toBe(1)
    })
    expect(screen.getAllByText('Existing source note').length).toBeGreaterThan(0)
  })

  it('creates a reference block from existing content with keyboard selection in the picker', async () => {
    const user = userEvent.setup()
    const pageId = 'page_keyboard_reference_existing'
    const snapshot: WorkspaceSnapshot = {
      boards: [],
      dataTables: [],
      mindmaps: [],
      syncedBlockGroups: [],
      pages: [
        {
          id: pageId,
          parentId: null,
          title: '键盘引用',
          icon: null,
          cover: null,
          blocks: [
            { id: 'source_1', type: 'paragraph', text: 'Existing source note' },
            { id: 'target_1', type: 'paragraph', text: '' },
          ],
          createdAt: '2026-07-07T00:00:00.000Z',
          updatedAt: '2026-07-07T00:00:00.000Z',
        },
      ],
      settings: { lastOpenedPageId: pageId },
    }

    const { container } = render(
      <WorkspaceApp
        repository={createMemoryRepository(snapshot)}
        initialEntries={[`/pages/${pageId}`]}
      />,
    )

    await screen.findByDisplayValue('键盘引用')
    const textboxes = screen.getAllByRole('textbox', { name: '输入正文' })
    await user.click(textboxes[1])
    await user.keyboard('/')
    await user.click(screen.getByRole('button', { name: '引用块' }))
    await user.type(screen.getByPlaceholderText('搜索已有内容'), 'source note')
    await user.keyboard('{ArrowDown}{Enter}')

    await waitFor(() => {
      expect(container.querySelectorAll('.synced-block-container-reference').length).toBe(1)
    })
    expect(screen.getAllByText('Existing source note').length).toBeGreaterThan(0)
  })

  it('wires sync range creation through the page editor into the workspace store', async () => {
    const user = userEvent.setup()
    const pageId = 'page_sync_range'
    const snapshot: WorkspaceSnapshot = {
      boards: [],
      dataTables: [],
      mindmaps: [],
      pages: [
        {
          id: pageId,
          parentId: null,
          title: '同步测试',
          icon: null,
          cover: null,
          blocks: [
            { id: 'block_1', type: 'paragraph', text: 'Alpha' },
            { id: 'block_2', type: 'paragraph', text: 'Beta' },
          ],
          createdAt: '2026-07-07T00:00:00.000Z',
          updatedAt: '2026-07-07T00:00:00.000Z',
        },
      ],
      settings: { lastOpenedPageId: pageId },
    }

    const { container } = render(
      <WorkspaceApp
        repository={createMemoryRepository(snapshot)}
        initialEntries={[`/pages/${pageId}`]}
      />,
    )

    await screen.findByDisplayValue('同步测试')

    const handles = screen.getAllByRole('button', { name: '拖动块' })
    await user.click(handles[0])
    await user.click(screen.getByRole('button', { name: '开始同步选区' }))
    await user.click(handles[1])
    await user.click(screen.getByRole('button', { name: '同步到这里' }))

    await waitFor(() => {
      expect(container.querySelector('.synced-block-container')).not.toBeNull()
    })
    expect(screen.getByText('同步块')).toBeInTheDocument()
    expect(screen.getByText('Alpha')).toBeInTheDocument()
    expect(screen.getByText('Beta')).toBeInTheDocument()
  })

  it('finds freshly edited synced block content in global search', async () => {
    const user = userEvent.setup()
    const pageId = 'page_sync_search'
    const snapshot: WorkspaceSnapshot = {
      boards: [],
      dataTables: [],
      mindmaps: [],
      syncedBlockGroups: [
        {
          id: 'group_1',
          blocks: [{ id: 'shared_block_1', type: 'paragraph', text: 'Old text' }],
          primaryInstanceId: 'instance_1',
          createdAt: '2026-07-07T00:00:00.000Z',
          updatedAt: '2026-07-07T00:00:00.000Z',
        },
      ],
      pages: [
        {
          id: pageId,
          parentId: null,
          title: '同步搜索',
          icon: null,
          cover: null,
          blocks: [
            {
              id: 'container_sync',
              type: 'synced_block',
              groupId: 'group_1',
              instanceId: 'instance_1',
              mode: 'sync',
            },
          ],
          createdAt: '2026-07-07T00:00:00.000Z',
          updatedAt: '2026-07-07T00:00:00.000Z',
        },
      ],
      settings: { lastOpenedPageId: pageId },
    }

    render(
      <WorkspaceApp
        repository={createMemoryRepository(snapshot)}
        initialEntries={[`/pages/${pageId}`]}
      />,
    )

    const editor = await screen.findByRole('textbox', { name: '输入正文' })
    await user.click(editor)
    await user.keyboard('{Control>}a{/Control}Fresh shared keyword')

    await user.click(screen.getByRole('button', { name: '搜索' }))
    await user.type(screen.getByPlaceholderText('搜索页面或内容'), 'Fresh shared keyword')

    expect(
      await screen.findByRole('button', {
        name: '打开页面 同步搜索',
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
      <WorkspaceApp
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
      <WorkspaceApp
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
      <WorkspaceApp
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
      <WorkspaceApp
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
      <WorkspaceApp
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
      <WorkspaceApp
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

    render(<WorkspaceApp store={store} initialEntries={[`/pages/${pageId}`]} />)

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
      <WorkspaceApp
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
      <WorkspaceApp
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
      <WorkspaceApp
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
      <WorkspaceApp
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
      <WorkspaceApp
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
    const exportedSnapshot = JSON.parse(String(exportPayload.contents))
    expect(exportedSnapshot.pages).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: pageId, title: '工作区首页' })]),
    )
    expect(exportedSnapshot.pages).toEqual(
      expect.arrayContaining([expect.objectContaining({ title: '收件箱' })]),
    )
    expect(exportedSnapshot.settings.inboxPageId).toBeTruthy()
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
      <WorkspaceApp
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

  it('imports one Markdown file as a new editable top-level page', async () => {
    const user = userEvent.setup()
    const pageId = 'page_markdown_source'
    fileAccess.openTextFile.mockResolvedValueOnce({
      name: 'guide.md',
      path: '/tmp/guide.md',
      contents: '# 导入指南\n\n第一段正文',
    })
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
          createdAt: '2026-07-10T00:00:00.000Z',
          updatedAt: '2026-07-10T00:00:00.000Z',
        },
      ],
      settings: { lastOpenedPageId: pageId },
    }

    render(<WorkspaceApp repository={createMemoryRepository(snapshot)} initialEntries={[`/pages/${pageId}`]} />)

    await screen.findByDisplayValue('当前页面')
    await user.click(screen.getByRole('button', { name: '页面菜单' }))
    await user.click(screen.getByRole('button', { name: '导入 Markdown' }))

    expect(fileAccess.openTextFile).toHaveBeenCalledWith({
      filters: [{ name: 'Markdown', extensions: ['md', 'markdown'] }],
    })
    expect(await screen.findByDisplayValue('导入指南')).toBeInTheDocument()
    expect(screen.getByText('第一段正文')).toBeInTheDocument()
  })

  it('imports a workspace backup from the page menu and refreshes the workspace', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true)
    const user = userEvent.setup()
    const pageId = 'page_before_restore'
    const snapshot: WorkspaceSnapshot = {
      boards: [],
      dataTables: [],
      mindmaps: [],
      pages: [
        {
          id: pageId,
          parentId: null,
          title: '导入前页面',
          icon: null,
          cover: null,
          blocks: [],
          createdAt: '2026-07-08T00:00:00.000Z',
          updatedAt: '2026-07-08T00:00:00.000Z',
        },
      ],
      settings: { lastOpenedPageId: pageId },
    }

    render(
      <WorkspaceApp
        repository={createMemoryRepository(snapshot)}
        initialEntries={[`/pages/${pageId}`]}
      />,
    )

    await screen.findByDisplayValue('导入前页面')
    await user.click(screen.getByRole('button', { name: '页面菜单' }))
    await user.click(screen.getByRole('button', { name: '导入完整备份' }))

    await waitFor(() => {
      expect(fileAccess.openTextFile).toHaveBeenCalledWith({
        filters: [{ name: 'JSON', extensions: ['json'] }],
      })
    })
    expect(confirm).toHaveBeenCalled()
    expect(await screen.findByDisplayValue('恢复后的首页')).toBeInTheDocument()

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

    render(<WorkspaceApp store={store} initialEntries={[`/pages/${pageId}`]} />)

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
      <WorkspaceApp
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
      <WorkspaceApp
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
      <WorkspaceApp
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
      <WorkspaceApp
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
      <WorkspaceApp
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
