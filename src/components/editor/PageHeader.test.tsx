import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { PageHeader } from './PageHeader'

const page = {
  id: 'page_product',
  title: '产品文档',
  parentId: null,
  icon: '📘',
  cover: null,
  createdAt: '',
  updatedAt: '',
  blocks: [],
}

describe('PageHeader', () => {
  it('renames the page on blur and falls back to 未命名 when empty', async () => {
    const user = userEvent.setup()
    const onRename = vi.fn()

    render(
      <PageHeader
        page={page}
        onRename={onRename}
        onChangeIcon={vi.fn()}
        onChangeCover={vi.fn()}
      />,
    )

    const input = screen.getByDisplayValue('产品文档')
    await user.clear(input)
    await user.tab()

    expect(onRename).toHaveBeenCalledWith('未命名')
  })

  it('opens the icon picker and updates the page icon', async () => {
    const user = userEvent.setup()
    const onChangeIcon = vi.fn()

    render(
      <PageHeader
        page={page}
        onRename={vi.fn()}
        onChangeIcon={onChangeIcon}
        onChangeCover={vi.fn()}
      />,
    )

    await user.click(screen.getByRole('button', { name: '添加图标' }))
    await user.click(screen.getByRole('button', { name: '📚' }))

    expect(onChangeIcon).toHaveBeenCalledWith('📚')
  })

  it('removes the current page icon from the picker', async () => {
    const user = userEvent.setup()
    const onChangeIcon = vi.fn()

    render(
      <PageHeader
        page={page}
        onRename={vi.fn()}
        onChangeIcon={onChangeIcon}
        onChangeCover={vi.fn()}
      />,
    )

    await user.click(screen.getByRole('button', { name: '添加图标' }))
    await user.click(screen.getByRole('button', { name: '移除图标' }))

    expect(onChangeIcon).toHaveBeenCalledWith(null)
  })

  it('opens the cover picker and updates the page cover', async () => {
    const user = userEvent.setup()
    const onChangeCover = vi.fn()

    render(
      <PageHeader
        page={page}
        onRename={vi.fn()}
        onChangeIcon={vi.fn()}
        onChangeCover={onChangeCover}
      />,
    )

    await user.click(screen.getByRole('button', { name: '添加封面' }))
    await user.click(screen.getByRole('button', { name: '海蓝' }))

    expect(onChangeCover).toHaveBeenCalledWith('ocean')
  })

  it('includes expanded cover and icon choices', async () => {
    const user = userEvent.setup()

    render(
      <PageHeader
        page={page}
        onRename={vi.fn()}
        onChangeIcon={vi.fn()}
        onChangeCover={vi.fn()}
      />,
    )

    await user.click(screen.getByRole('button', { name: '添加封面' }))

    expect(screen.getByRole('button', { name: '极光' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '夜航' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '添加图标' }))

    expect(screen.getByRole('button', { name: '🧠' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '📊' })).toBeInTheDocument()
  })

  it('removes the current page cover from the picker', async () => {
    const user = userEvent.setup()
    const onChangeCover = vi.fn()

    render(
      <PageHeader
        page={{ ...page, cover: 'ocean' }}
        onRename={vi.fn()}
        onChangeIcon={vi.fn()}
        onChangeCover={onChangeCover}
      />,
    )

    await user.click(screen.getByRole('button', { name: '更换封面' }))
    await user.click(screen.getByRole('button', { name: '移除封面' }))

    expect(onChangeCover).toHaveBeenCalledWith(null)
  })

  it('does not render the removed comment entry in the page header', () => {
    render(
      <PageHeader
        page={page}
        onRename={vi.fn()}
        onChangeIcon={vi.fn()}
        onChangeCover={vi.fn()}
      />,
    )

    expect(screen.queryByRole('button', { name: '添加评论' })).not.toBeInTheDocument()
  })
  it('applies the provided body class to the title column wrapper', () => {
    render(
      <PageHeader
        page={page}
        bodyClassName="page-content page-content-adaptive"
        onRename={vi.fn()}
        onChangeIcon={vi.fn()}
        onChangeCover={vi.fn()}
      />,
    )

    expect(screen.getByTestId('page-header-body')).toHaveClass(
      'page-content',
      'page-content-adaptive',
    )
  })
})
