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
  title: '导图标题',
  snapshot: {
    title: '导图标题',
  },
  createdAt: '2026-06-17T00:00:00.000Z',
  updatedAt: '2026-06-17T00:00:00.000Z',
}

describe('MindmapPage', () => {
  it('keeps only the back button chrome for an active mindmap', () => {
    render(
      <MindmapPage page={page} mindmap={mindmap} onBack={() => undefined}>
        <div>导图内容区</div>
      </MindmapPage>,
    )

    expect(screen.getByRole('button', { name: '返回页面' })).toBeInTheDocument()
    expect(screen.getByText('导图内容区')).toBeInTheDocument()
    expect(screen.queryByDisplayValue('导图标题')).not.toBeInTheDocument()
    expect(screen.queryByText('来源：知识库页面')).not.toBeInTheDocument()
  })

  it('renders a missing state when the mindmap record is missing', () => {
    render(<MindmapPage page={page} mindmap={null} onBack={() => undefined} />)

    expect(screen.getByRole('button', { name: '返回页面' })).toBeInTheDocument()
    expect(screen.getByText('导图不存在')).toBeInTheDocument()
    expect(screen.getByText('当前引用的导图已不存在')).toBeInTheDocument()
  })
})
