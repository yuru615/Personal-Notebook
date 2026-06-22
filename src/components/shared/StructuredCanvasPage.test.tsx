import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { StructuredCanvasPage } from './StructuredCanvasPage'

describe('StructuredCanvasPage', () => {
  it('renders the shell with an editable title', () => {
    const { container } = render(
      <StructuredCanvasPage
        backLabel="返回页面"
        sourceLabel="来源"
        titleLabel="导图标题"
        sourcePageTitle="首页"
        title="产品调研导图"
        missingTitle="内容不存在"
        missingMessage="当前内容已不存在"
        onBack={() => undefined}
        onRename={() => undefined}
      >
        <div>画布区域</div>
      </StructuredCanvasPage>,
    )

    expect(screen.getByRole('button', { name: '返回页面' })).toBeInTheDocument()
    expect(screen.getByDisplayValue('产品调研导图')).toBeInTheDocument()
    expect(screen.getByText('来源：首页')).toBeInTheDocument()
    expect(screen.getByText('画布区域')).toBeInTheDocument()
    expect(container.firstElementChild).toHaveClass('structured-canvas-page')
  })

  it('forwards title edits', () => {
    const onRename = vi.fn()

    render(
      <StructuredCanvasPage
        backLabel="返回页面"
        sourceLabel="来源"
        titleLabel="导图标题"
        sourcePageTitle="首页"
        title="产品调研导图"
        missingTitle="内容不存在"
        missingMessage="当前内容已不存在"
        onBack={() => undefined}
        onRename={onRename}
      >
        <div>画布区域</div>
      </StructuredCanvasPage>,
    )

    fireEvent.input(screen.getByLabelText('导图标题'), {
      target: { value: '竞品拆解导图' },
    })

    expect(onRename).toHaveBeenLastCalledWith('竞品拆解导图')
  })

  it('renders missing state when title is null', () => {
    render(
      <StructuredCanvasPage
        backLabel="返回页面"
        sourceLabel="来源"
        titleLabel="导图标题"
        sourcePageTitle="首页"
        title={null}
        missingTitle="内容不存在"
        missingMessage="当前内容已不存在"
        onBack={() => undefined}
        onRename={() => undefined}
      />,
    )

    expect(screen.getByText('内容不存在')).toBeInTheDocument()
    expect(screen.getByText('当前内容已不存在')).toBeInTheDocument()
  })

  it('merges shared and mode-specific shell class names', () => {
    render(
      <StructuredCanvasPage
        backLabel="返回页面"
        sourceLabel="来源"
        titleLabel="导图标题"
        sourcePageTitle="首页"
        title="产品调研导图"
        missingTitle="内容不存在"
        missingMessage="当前内容已不存在"
        onBack={() => undefined}
        onRename={() => undefined}
        rootClassName="canvas-page"
        headerClassName="canvas-page-header"
      >
        <div>画布区域</div>
      </StructuredCanvasPage>,
    )

    const input = screen.getByLabelText('导图标题')
    const root = input.closest('section')
    const header = input.closest('header')

    expect(root).toHaveClass('structured-canvas-page', 'canvas-page')
    expect(header).toHaveClass('structured-canvas-page-header', 'canvas-page-header')
  })
})
