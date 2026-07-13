import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, it, vi } from 'vitest'
import { version as appVersion } from '../../../package.json'
import { SettingsCenter, type SettingsCenterProps } from './SettingsCenter'

const originalClipboard = navigator.clipboard

afterEach(() => {
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: originalClipboard,
  })
})

function createDeferred() {
  let resolve!: () => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<void>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })

  return { promise, resolve, reject }
}

function setClipboard(writeText: (text: string) => Promise<void>) {
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText },
  })
}

function createProps(
  overrides: Partial<SettingsCenterProps> = {},
): SettingsCenterProps {
  return {
    activeSection: 'general',
    appSettings: { closeAction: 'hide_to_tray' },
    localMcpOperation: 'idle',
    localMcpOperationError: null,
    workspaceSettings: {
      lastOpenedPageId: 'page_1',
      sidebarLayout: 'compact',
      sidebarWidth: 272,
      clipboardCaptureMode: 'off',
      pageDefaults: {
        isFullWidth: false,
        isSmallText: false,
        fontFamily: 'default',
        showOutline: true,
      },
      searchPreferences: {
        groupResults: true,
        showSourceLabels: true,
        excerptLength: 'medium',
      },
    },
    onSectionChange: vi.fn(),
    onSetPageDefaults: vi.fn(),
    onSetAppCloseAction: vi.fn(),
    onSetAppAccentTheme: vi.fn(),
    onEnableLocalMcp: vi.fn(),
    onDisableLocalMcp: vi.fn(),
    onSetSidebarLayout: vi.fn(),
    onSetSidebarWidth: vi.fn(),
    onSetClipboardCaptureMode: vi.fn(),
    onSetBlockSelectionStartMode: vi.fn(),
    onSetLinkOpenMode: vi.fn(),
    onSetSearchPreferences: vi.fn(),
    onExportWorkspace: vi.fn(),
    onImportWorkspace: vi.fn(),
    onImportArchive: vi.fn(),
    onCleanupOrphanBoards: vi.fn(),
    onCleanupOrphanDataTables: vi.fn(),
    onCleanupOrphanAssets: vi.fn(),
    onOpenInbox: vi.fn(),
    onBackToWorkspace: vi.fn(),
    ...overrides,
  }
}

it('switches sections and edits page defaults from the left navigation', async () => {
  const user = userEvent.setup()
  const onSectionChange = vi.fn()
  const onSetPageDefaults = vi.fn()

  render(
    <SettingsCenter
      {...createProps({
        activeSection: 'general',
        onSectionChange,
        onSetPageDefaults,
      })}
    />,
  )

  await user.click(screen.getByRole('button', { name: '编辑与页面默认' }))
  expect(onSectionChange).toHaveBeenCalledWith('editing_page_defaults')

  await user.click(screen.getByRole('checkbox', { name: '新页面默认自适应正文宽度' }))
  expect(onSetPageDefaults).toHaveBeenCalledWith({ isFullWidth: true })
})

it('updates block selection start mode from the editing section', async () => {
  const user = userEvent.setup()
  const onSetBlockSelectionStartMode = vi.fn()

  render(
    <SettingsCenter
      {...createProps({
        activeSection: 'editing_page_defaults',
        workspaceSettings: {
          ...createProps().workspaceSettings,
          blockSelectionStartMode: 'safe_zone_only',
        },
        onSetBlockSelectionStartMode,
      })}
    />,
  )

  await user.click(screen.getByRole('button', { name: '允许从正文区域直接框选' }))

  expect(onSetBlockSelectionStartMode).toHaveBeenCalledWith('content_allowed')
})

it('updates new-page property visibility and external-link activation from editing settings', async () => {
  const user = userEvent.setup()
  const onSetPageDefaults = vi.fn()
  const onSetLinkOpenMode = vi.fn()

  render(
    <SettingsCenter
      {...createProps({
        activeSection: 'editing_page_defaults',
        onSetPageDefaults,
        onSetLinkOpenMode,
      })}
    />,
  )

  await user.click(screen.getByRole('checkbox', { name: '新页面默认显示页面属性' }))
  await user.click(screen.getByRole('button', { name: '点击直接打开外链' }))

  expect(onSetPageDefaults).toHaveBeenCalledWith({ showProperties: true })
  expect(onSetLinkOpenMode).toHaveBeenCalledWith('direct')
})

it('updates the app accent theme from appearance settings', async () => {
  const user = userEvent.setup()
  const onSetAppAccentTheme = vi.fn()

  render(
    <SettingsCenter
      {...createProps({
        activeSection: 'appearance_sidebar',
        onSetAppAccentTheme,
      })}
    />,
  )

  await user.click(screen.getByRole('button', { name: '紫罗兰' }))

  expect(onSetAppAccentTheme).toHaveBeenCalledWith('violet')
})

it('updates search preferences from the search section', async () => {
  const user = userEvent.setup()
  const onSetSearchPreferences = vi.fn()

  render(
    <SettingsCenter
      {...createProps({
        activeSection: 'search_knowledge',
        onSetSearchPreferences,
      })}
    />,
  )

  await user.click(screen.getByRole('checkbox', { name: '按类型分组显示搜索结果' }))
  expect(onSetSearchPreferences).toHaveBeenCalledWith({ groupResults: false })

  await user.click(screen.getByRole('checkbox', { name: '显示命中来源标签' }))
  expect(onSetSearchPreferences).toHaveBeenCalledWith({ showSourceLabels: false })

  await user.click(screen.getByRole('button', { name: '短摘要' }))
  expect(onSetSearchPreferences).toHaveBeenCalledWith({ excerptLength: 'short' })
})

it('stages sidebar width changes locally until the drag ends', () => {
  const onSetSidebarWidth = vi.fn()

  render(
    <SettingsCenter
      {...createProps({
        activeSection: 'appearance_sidebar',
        onSetSidebarWidth,
      })}
    />,
  )

  const slider = screen.getByRole('slider')
  fireEvent.change(slider, { target: { value: '240' } })

  expect(onSetSidebarWidth).not.toHaveBeenCalled()
  expect(screen.getByText('240px')).toBeInTheDocument()

  fireEvent.mouseUp(slider)

  expect(onSetSidebarWidth).toHaveBeenCalledWith(240)
})

it('triggers orphan asset cleanup from the maintenance section', async () => {
  const user = userEvent.setup()
  const onCleanupOrphanAssets = vi.fn()

  render(
    <SettingsCenter
      {...createProps({
        activeSection: 'data_maintenance',
        onCleanupOrphanAssets,
      })}
    />,
  )

  await user.click(screen.getByRole('button', { name: '清理孤立资源文件' }))
  expect(onCleanupOrphanAssets).toHaveBeenCalledTimes(1)
})

it('shows both workspace backup import and page package import actions', () => {
  render(<SettingsCenter {...createProps({ activeSection: 'import_export' })} />)

  expect(screen.getByRole('button', { name: '导入完整备份' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: '导入页面包' })).toBeInTheDocument()
})

it('shows a back-to-workspace action in the top-left area', async () => {
  const user = userEvent.setup()
  const onBackToWorkspace = vi.fn()

  render(
    <SettingsCenter
      {...createProps({
        activeSection: 'general',
        onBackToWorkspace,
      })}
    />,
  )

  await user.click(screen.getByRole('button', { name: '返回工作区' }))
  expect(onBackToWorkspace).toHaveBeenCalledTimes(1)
})

it('shows the installed app version at the bottom of the settings navigation', () => {
  render(<SettingsCenter {...createProps()} />)

  expect(screen.getByText(`版本 ${appVersion}`)).toBeInTheDocument()
})

it('renders MCP enablement pending state from its controlled operation', () => {
  render(
    <SettingsCenter
      {...createProps({
        activeSection: 'experimental',
        localMcpOperation: 'enabling',
      })}
    />,
  )

  const toggle = screen.getByRole('checkbox', { name: /启用本机 MCP 接入/ })
  expect(toggle).toBeDisabled()
  expect(toggle).not.toBeChecked()
  expect(screen.getByText('正在启用本机 MCP 接入…')).toBeInTheDocument()
})

it('renders MCP disablement pending state from its controlled operation', () => {
  render(
    <SettingsCenter
      {...createProps({
        activeSection: 'experimental',
        localMcpOperation: 'disabling',
        appSettings: {
          closeAction: 'hide_to_tray',
          mcp: { enabled: true, port: 9761, token: 'private-token' },
        },
      })}
    />,
  )

  const toggle = screen.getByRole('checkbox', { name: /启用本机 MCP 接入/ })
  expect(toggle).toBeDisabled()
  expect(toggle).toBeChecked()
  expect(screen.getByText('正在停用本机 MCP 接入…')).toBeInTheDocument()
})

it('shows an actionable controlled error when MCP enablement fails', () => {
  const error = {
    code: 'io_error',
    message:
      'Only one usage of each socket address is normally permitted. (os error 10048)',
  }

  render(
    <SettingsCenter
      {...createProps({
        activeSection: 'experimental',
        localMcpOperationError: { operation: 'enabling', error },
      })}
    />,
  )

  const toggle = screen.getByRole('checkbox', { name: /启用本机 MCP 接入/ })
  expect(screen.getByText('启用失败，请检查端口是否被占用，然后重试。')).toBeInTheDocument()
  expect(toggle).not.toBeChecked()
  expect(toggle).toBeEnabled()
})

it.each([
  [
    'desktop-only',
    new Error('Local MCP requires the desktop app'),
    '本机 MCP 仅支持知栖桌面版，请在桌面应用中重试。',
  ],
  [
    'unavailable',
    { code: 'mcp_unavailable', message: 'MCP server did not start' },
    '启用失败，请稍后重试。',
  ],
  [
    'non-port I/O',
    { code: 'io_error', message: 'Permission denied' },
    '启用失败，请稍后重试。',
  ],
  [
    'no-code port occupied',
    new Error('Address already in use'),
    '启用失败，请检查端口是否被占用，然后重试。',
  ],
  [
    'negated port occupancy',
    new Error('端口未被占用，但权限检查失败'),
    '启用失败，请稍后重试。',
  ],
  ['generic', new Error('unexpected failure'), '启用失败，请稍后重试。'],
])('maps %s MCP enable errors to truthful guidance', (_kind, error, expectedMessage) => {
  render(
    <SettingsCenter
      {...createProps({
        activeSection: 'experimental',
        localMcpOperationError: { operation: 'enabling', error },
      })}
    />,
  )

  expect(screen.getByRole('alert')).toHaveTextContent(expectedMessage)
})

it('prevents repeated MCP toggle requests while one is pending', () => {
  const deferred = createDeferred()
  const onEnableLocalMcp = vi.fn(() => deferred.promise)

  render(
    <SettingsCenter
      {...createProps({
        activeSection: 'experimental',
        onEnableLocalMcp,
      })}
    />,
  )

  const toggle = screen.getByRole('checkbox', { name: /启用本机 MCP 接入/ })
  fireEvent.click(toggle)
  fireEvent.click(toggle)

  expect(onEnableLocalMcp).toHaveBeenCalledTimes(1)
})

it('copies exact Cherry Studio MCP JSON without rendering the token', async () => {
  const user = userEvent.setup()
  const writeText = vi.fn().mockResolvedValue(undefined)
  const token = 'private-token-that-must-not-render'
  setClipboard(writeText)

  render(
    <SettingsCenter
      {...createProps({
        activeSection: 'experimental',
        appSettings: {
          closeAction: 'hide_to_tray',
          mcp: { enabled: true, port: 9761, token },
        },
      })}
    />,
  )

  expect(document.body).not.toHaveTextContent(token)
  await user.click(screen.getByRole('button', { name: '复制 MCP 配置' }))

  expect(writeText).toHaveBeenCalledTimes(1)
  expect(writeText).toHaveBeenCalledWith(
    JSON.stringify({
      mcpServers: {
        zhixi: {
          type: 'streamableHttp',
          url: 'http://127.0.0.1:9761/mcp',
          headers: { Authorization: `Bearer ${token}` },
        },
      },
    }),
  )
  expect(await screen.findByRole('status')).toHaveTextContent('配置已复制。')
  expect(document.body).not.toHaveTextContent(token)
})

it('shows a clipboard permission error when copying MCP JSON fails', async () => {
  const user = userEvent.setup()
  setClipboard(vi.fn().mockRejectedValue(new Error('clipboard denied')))

  render(
    <SettingsCenter
      {...createProps({
        activeSection: 'experimental',
        appSettings: {
          closeAction: 'hide_to_tray',
          mcp: { enabled: true, port: 9761, token: 'private-token' },
        },
      })}
    />,
  )

  await user.click(screen.getByRole('button', { name: '复制 MCP 配置' }))

  expect(await screen.findByRole('alert')).toHaveTextContent(
    '复制失败，请检查系统剪贴板权限。',
  )
})

it('guards rapid MCP config copy clicks until the clipboard operation settles', async () => {
  const deferred = createDeferred()
  const writeText = vi.fn(() => deferred.promise)
  setClipboard(writeText)

  render(
    <SettingsCenter
      {...createProps({
        activeSection: 'experimental',
        appSettings: {
          closeAction: 'hide_to_tray',
          mcp: { enabled: true, port: 9761, token: 'private-token' },
        },
      })}
    />,
  )

  const copyButton = screen.getByRole('button', { name: '复制 MCP 配置' })
  fireEvent.click(copyButton)
  fireEvent.click(copyButton)

  expect(writeText).toHaveBeenCalledTimes(1)
  expect(copyButton).toBeDisabled()

  deferred.resolve()
  expect(await screen.findByRole('status')).toHaveTextContent('配置已复制。')
  expect(copyButton).toBeEnabled()
})

it('resets copied feedback when the MCP config changes', async () => {
  const user = userEvent.setup()
  setClipboard(vi.fn().mockResolvedValue(undefined))
  const props = createProps({
    activeSection: 'experimental',
    appSettings: {
      closeAction: 'hide_to_tray',
      mcp: { enabled: true, port: 9761, token: 'first-token' },
    },
  })
  const { rerender } = render(<SettingsCenter {...props} />)

  await user.click(screen.getByRole('button', { name: '复制 MCP 配置' }))
  expect(await screen.findByText('配置已复制。')).toBeInTheDocument()

  rerender(
    <SettingsCenter
      {...props}
      appSettings={{
        closeAction: 'hide_to_tray',
        mcp: { enabled: true, port: 9762, token: 'second-token' },
      }}
    />,
  )

  await waitFor(() => expect(screen.queryByText('配置已复制。')).not.toBeInTheDocument())
})

it('resets copy failure feedback when the MCP config changes', async () => {
  const user = userEvent.setup()
  setClipboard(vi.fn().mockRejectedValue(new Error('clipboard denied')))
  const props = createProps({
    activeSection: 'experimental',
    appSettings: {
      closeAction: 'hide_to_tray',
      mcp: { enabled: true, port: 9761, token: 'first-token' },
    },
  })
  const { rerender } = render(<SettingsCenter {...props} />)

  await user.click(screen.getByRole('button', { name: '复制 MCP 配置' }))
  expect(await screen.findByRole('alert')).toHaveTextContent(
    '复制失败，请检查系统剪贴板权限。',
  )

  rerender(
    <SettingsCenter
      {...props}
      appSettings={{
        closeAction: 'hide_to_tray',
        mcp: { enabled: true, port: 9762, token: 'second-token' },
      }}
    />,
  )

  await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument())
})

it('ignores an old copy rejection after a newer MCP config copy succeeds', async () => {
  const first = createDeferred()
  const second = createDeferred()
  const writeText = vi
    .fn()
    .mockImplementationOnce(() => first.promise)
    .mockImplementationOnce(() => second.promise)
  setClipboard(writeText)
  const props = createProps({
    activeSection: 'experimental',
    appSettings: {
      closeAction: 'hide_to_tray',
      mcp: { enabled: true, port: 9761, token: 'first-token' },
    },
  })
  const { rerender } = render(<SettingsCenter {...props} />)

  fireEvent.click(screen.getByRole('button', { name: '复制 MCP 配置' }))
  rerender(
    <SettingsCenter
      {...props}
      appSettings={{
        closeAction: 'hide_to_tray',
        mcp: { enabled: true, port: 9762, token: 'second-token' },
      }}
    />,
  )
  await waitFor(() =>
    expect(screen.getByRole('button', { name: '复制 MCP 配置' })).toBeEnabled(),
  )
  fireEvent.click(screen.getByRole('button', { name: '复制 MCP 配置' }))

  expect(writeText).toHaveBeenCalledTimes(2)
  second.resolve()
  expect(await screen.findByText('配置已复制。')).toBeInTheDocument()

  await act(async () => {
    first.reject(new Error('old clipboard failure'))
    await first.promise.catch(() => undefined)
  })

  expect(screen.getByText('配置已复制。')).toBeInTheDocument()
  expect(screen.queryByText('复制失败，请检查系统剪贴板权限。')).not.toBeInTheDocument()
})
