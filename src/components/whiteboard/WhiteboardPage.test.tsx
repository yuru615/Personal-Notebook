import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { BoardRecord, PageRecord } from '../../domain/types'
import { WhiteboardPage } from './WhiteboardPage'

const page: PageRecord = {
  id: 'page-1',
  parentId: null,
  title: '知识库页面',
  icon: null,
  cover: null,
  blocks: [],
  createdAt: '2026-06-17T00:00:00.000Z',
  updatedAt: '2026-06-17T00:00:00.000Z',
}

const board: BoardRecord = {
  id: 'board-1',
  title: '白板标题',
  snapshot: {
    version: 1,
    elements: [],
    viewport: { x: 0, y: 0, zoom: 1 },
  },
  createdAt: '2026-06-17T00:00:00.000Z',
  updatedAt: '2026-06-17T00:00:00.000Z',
}

describe('WhiteboardPage', () => {
  it('marks host status chrome as visually hidden for an active board', () => {
    render(
      <WhiteboardPage page={page} board={board} onBack={() => undefined} onRename={() => undefined}>
        <div>画布区域</div>
      </WhiteboardPage>,
    )

    expect(screen.getByRole('button', { name: '返回页面' })).toBeInTheDocument()
    expect(screen.getByText('画布区域')).toBeInTheDocument()
    expect(screen.getByDisplayValue('白板标题').closest('.whiteboard-page-status')).toHaveClass(
      'whiteboard-page-overlay-hidden',
    )
    expect(screen.getByText('来源：知识库页面').closest('.whiteboard-page-status')).toHaveClass(
      'whiteboard-page-overlay-hidden',
    )
  })

  it('renders a missing state when the board record is missing', () => {
    render(
      <WhiteboardPage page={page} board={null} onBack={() => undefined} onRename={() => undefined} />,
    )

    expect(screen.getByText('白板不存在')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '返回页面' })).toBeInTheDocument()
  })
})
