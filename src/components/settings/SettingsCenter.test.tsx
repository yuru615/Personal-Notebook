import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, it, vi } from 'vitest'
import { SettingsCenter, type SettingsCenterProps } from './SettingsCenter'

function createProps(
  overrides: Partial<SettingsCenterProps> = {},
): SettingsCenterProps {
  return {
    activeSection: 'general',
    appSettings: { closeAction: 'hide_to_tray' },
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
    onSetSidebarLayout: vi.fn(),
    onSetSidebarWidth: vi.fn(),
    onSetClipboardCaptureMode: vi.fn(),
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
