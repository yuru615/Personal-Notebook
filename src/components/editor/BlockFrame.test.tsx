import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

let capturedAnchorRef: { current: HTMLElement | null } | null = null

vi.mock('./floatingMenu', async () => {
  const actual = await vi.importActual<typeof import('./floatingMenu')>('./floatingMenu')
  return {
    ...actual,
    useFloatingMenuLayout: (options: {
      open: boolean
      anchorRef: { current: HTMLElement | null }
      menuRef: { current: HTMLElement | null }
    }) => {
      capturedAnchorRef = options.anchorRef
      return {
        placement: 'bottom' as const,
        maxHeight: 320,
      }
    },
  }
})

import { BlockFrame } from './BlockFrame'

describe('BlockFrame', () => {
  it('anchors the handle menu to the handle button instead of the full block frame', () => {
    render(
      <BlockFrame
        onDragStart={vi.fn()}
        onDragEnd={vi.fn()}
        onTurnInto={vi.fn()}
        onDuplicate={vi.fn()}
        onDelete={vi.fn()}
      >
        <div>content</div>
      </BlockFrame>,
    )

    expect(capturedAnchorRef?.current).toBeInstanceOf(HTMLButtonElement)
    expect(capturedAnchorRef?.current).toHaveClass('block-handle')
  })

  it('closes the handle menu after clicking outside the block', async () => {
    const user = userEvent.setup()

    render(
      <div>
        <BlockFrame
          onDragStart={vi.fn()}
          onDragEnd={vi.fn()}
          onTurnInto={vi.fn()}
          onDuplicate={vi.fn()}
          onDelete={vi.fn()}
        >
          <input value="test content" readOnly />
        </BlockFrame>
        <button type="button">outside</button>
      </div>,
    )

    await user.click(screen.getByRole('button', { name: '拖动块' }))
    expect(screen.getByRole('button', { name: '复制' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'outside' }))
    expect(screen.queryByRole('button', { name: '复制' })).not.toBeInTheDocument()
  })

  it('closes the handle menu after clicking block content', async () => {
    const user = userEvent.setup()

    render(
      <BlockFrame
        onDragStart={vi.fn()}
        onDragEnd={vi.fn()}
        onTurnInto={vi.fn()}
        onDuplicate={vi.fn()}
        onDelete={vi.fn()}
      >
        <input aria-label="body content" value="test content" readOnly />
      </BlockFrame>,
    )

    await user.click(screen.getByRole('button', { name: '拖动块' }))
    expect(screen.getByRole('button', { name: '复制' })).toBeInTheDocument()

    await user.click(screen.getByRole('textbox', { name: 'body content' }))
    expect(screen.queryByRole('button', { name: '复制' })).not.toBeInTheDocument()
  })

  it('renders the handle menu inside the handle anchor instead of under the full block body', async () => {
    const user = userEvent.setup()

    render(
      <BlockFrame
        onDragStart={vi.fn()}
        onDragEnd={vi.fn()}
        onTurnInto={vi.fn()}
        onDuplicate={vi.fn()}
        onDelete={vi.fn()}
      >
        <div style={{ minHeight: '240px' }}>long content</div>
      </BlockFrame>,
    )

    await user.click(screen.getByRole('button', { name: '拖动块' }))

    const duplicateAction = screen.getByRole('button', { name: '复制' })
    const menu = duplicateAction.closest('.block-menu')

    expect(menu?.parentElement).toHaveClass('block-frame-handle-anchor')
  })
})
