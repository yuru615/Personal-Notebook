import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AppShell } from './AppShell'

const originalInnerWidth = window.innerWidth
const nativeDragDrop = vi.hoisted(() => ({
  handler: null as ((event: { payload: Record<string, unknown> }) => void) | null,
  onDragDropEvent: vi.fn(),
}))

vi.mock('@tauri-apps/api/webview', () => ({
  getCurrentWebview: () => ({
    onDragDropEvent: nativeDragDrop.onDragDropEvent,
  }),
}))

describe('AppShell', () => {
  beforeEach(() => {
    nativeDragDrop.handler = null
    nativeDragDrop.onDragDropEvent.mockReset()
    nativeDragDrop.onDragDropEvent.mockImplementation(async (handler) => {
      nativeDragDrop.handler = handler
      return () => undefined
    })
  })

  afterEach(() => {
    Reflect.deleteProperty(globalThis, '__TAURI_INTERNALS__')
    Object.defineProperty(window, 'innerWidth', {
      configurable: true,
      writable: true,
      value: originalInnerWidth,
    })
  })

  it('clamps sidebar dragging between one eighth and one quarter of the viewport and persists the result', () => {
    Object.defineProperty(window, 'innerWidth', {
      configurable: true,
      writable: true,
      value: 1200,
    })

    const onSidebarWidthChange = vi.fn()

    render(
      <AppShell
        sidebar={<div>Sidebar</div>}
        sidebarWidth={272}
        accentTheme="violet"
        onSidebarWidthChange={onSidebarWidthChange}
      >
        <div>Page</div>
      </AppShell>,
    )

    const shell = document.querySelector('.app-shell')
    const resizer = screen.getByRole('separator', { name: '调整侧边栏宽度' })

    expect(shell).toHaveStyle({
      '--app-sidebar-width': '272px',
    })
    expect(shell).toHaveAttribute('data-accent-theme', 'violet')

    fireEvent.mouseDown(resizer, { clientX: 272 })
    fireEvent.mouseMove(window, { clientX: 80 })

    expect(shell).toHaveStyle({
      '--app-sidebar-width': '150px',
    })

    fireEvent.mouseMove(window, { clientX: 420 })

    expect(shell).toHaveStyle({
      '--app-sidebar-width': '300px',
    })

    fireEvent.mouseUp(window)

    expect(onSidebarWidthChange).toHaveBeenCalledWith(300)
  })

  it('highlights and routes native file drops by left or right target', async () => {
    Object.defineProperty(globalThis, '__TAURI_INTERNALS__', {
      configurable: true,
      value: {},
    })
    const onDropFilePaths = vi.fn()

    render(
      <AppShell
        {...({
          sidebar: <div>Sidebar</div>,
          sidebarWidth: 272,
          onDropFilePaths,
        } as never)}
      >
        <div>Page</div>
      </AppShell>,
    )

    await waitFor(() => expect(nativeDragDrop.onDragDropEvent).toHaveBeenCalledTimes(1))

    act(() => {
      nativeDragDrop.handler?.({
        payload: { type: 'enter', paths: ['C:/drop/会议记录.docx'], position: { x: 160, y: 240 } },
      })
    })

    expect(screen.getByText('拖入左侧')).toBeInTheDocument()
    expect(screen.getByText('创建顶级页面，附件进入收件箱')).toBeInTheDocument()

    act(() => {
      nativeDragDrop.handler?.({
        payload: { type: 'drop', paths: ['C:/drop/会议记录.docx'], position: { x: 160, y: 240 } },
      })
    })

    expect(onDropFilePaths).toHaveBeenCalledWith(['C:/drop/会议记录.docx'], 'sidebar')

    act(() => {
      nativeDragDrop.handler?.({
        payload: { type: 'over', position: { x: 720, y: 240 } },
      })
    })

    expect(screen.getByText('拖入正文')).toBeInTheDocument()
    expect(screen.getByText('创建子页面，附件追加到当前页面')).toBeInTheDocument()
  })
})
