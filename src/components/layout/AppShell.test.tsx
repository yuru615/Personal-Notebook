import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AppShell } from './AppShell'

const originalInnerWidth = window.innerWidth

describe('AppShell', () => {
  afterEach(() => {
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
})
