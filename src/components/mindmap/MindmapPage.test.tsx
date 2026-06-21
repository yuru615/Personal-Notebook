import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { MindmapRecord, PageRecord } from '../../domain/types'
import { MindmapPage } from './MindmapPage'

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

const mindmap: MindmapRecord = {
  id: 'mindmap-1',
  title: '思维导图标题',
  snapshot: {
    version: 1,
    elements: [],
    viewport: { x: 0, y: 0, zoom: 1 },
  },
  createdAt: '2026-06-17T00:00:00.000Z',
  updatedAt: '2026-06-17T00:00:00.000Z',
}

describe('MindmapPage', () => {
  it('marks host status chrome as visually hidden for an active mindmap', () => {
    render(
      <MindmapPage
        page={page}
        mindmap={mindmap}
        onBack={() => undefined}
        onRename={() => undefined}
      >
        <div>画布区域</div>
      </MindmapPage>,
    )

    expect(screen.getByRole('button', { name: '返回页面' })).toBeInTheDocument()
    expect(screen.getByText('画布区域')).toBeInTheDocument()
    expect(screen.getByDisplayValue('思维导图标题').closest('.mindmap-page-status')).toHaveClass(
      'mindmap-page-overlay-hidden',
    )
    expect(screen.getByText('来源：知识库页面').closest('.mindmap-page-status')).toHaveClass(
      'mindmap-page-overlay-hidden',
    )
  })

  it('renders a missing state when the mindmap record is missing', () => {
    render(
      <MindmapPage
        page={page}
        mindmap={null}
        onBack={() => undefined}
        onRename={() => undefined}
      />,
    )

    expect(screen.getByText('思维导图不存在')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '返回页面' })).toBeInTheDocument()
  })
})
