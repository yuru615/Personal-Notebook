import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { MindmapPage } from './MindmapPage'

const page = {
  id: 'page-home',
  parentId: null,
  title: '首页',
  icon: '📎',
  cover: null,
  blocks: [],
  createdAt: '2026-06-18T00:00:00.000Z',
  updatedAt: '2026-06-18T00:00:00.000Z',
}

const mindmap = {
  id: 'mindmap-product',
  title: '产品调研导图',
  rootNodeId: 'mindmap-node-root',
  nodes: {
    'mindmap-node-root': {
      id: 'mindmap-node-root',
      parentId: null,
      text: '中心主题',
      order: 0,
    },
  },
  viewport: { x: 0, y: 0, zoom: 1 },
  createdAt: '2026-06-18T00:00:00.000Z',
  updatedAt: '2026-06-18T00:00:00.000Z',
}

describe('MindmapPage', () => {
  it('renders the title input and source page', () => {
    render(
      <MindmapPage page={page} mindmap={mindmap} onBack={() => undefined} onRename={() => undefined}>
        <div>canvas</div>
      </MindmapPage>,
    )

    expect(screen.getByDisplayValue('产品调研导图')).toBeInTheDocument()
    expect(screen.getByText('来源：首页')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '返回页面' })).toBeInTheDocument()
  })

  it('forwards title edits', () => {
    const onRename = vi.fn()

    render(
      <MindmapPage page={page} mindmap={mindmap} onBack={() => undefined} onRename={onRename}>
        <div>canvas</div>
      </MindmapPage>,
    )

    fireEvent.input(screen.getByLabelText('思维导图标题'), {
      target: { value: '竞品拆解导图' },
    })

    expect(onRename).toHaveBeenLastCalledWith('竞品拆解导图')
  })
})
