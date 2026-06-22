import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { SlashMenu } from './SlashMenu'

describe('SlashMenu', () => {
  it('renders grouped sections for core block types', () => {
    render(<SlashMenu query="/" onPick={vi.fn()} />)

    expect(screen.getByText('基础块')).toBeInTheDocument()
    expect(screen.getByText('文本', { selector: '.slash-menu-section-label' })).toBeInTheDocument()
    expect(screen.getByText('列表', { selector: '.slash-menu-section-label' })).toBeInTheDocument()
    expect(screen.getByText('页面与数据', { selector: '.slash-menu-section-label' })).toBeInTheDocument()
  })

  it('only keeps sections that still have matching results', () => {
    render(<SlashMenu query="/代码" onPick={vi.fn()} />)

    expect(screen.getByText('页面与数据', { selector: '.slash-menu-section-label' })).toBeInTheDocument()
    expect(screen.queryByText('文本', { selector: '.slash-menu-section-label' })).not.toBeInTheDocument()
    expect(screen.queryByText('列表', { selector: '.slash-menu-section-label' })).not.toBeInTheDocument()
  })

  it('shows the whiteboard option', () => {
    render(<SlashMenu query="/白板" onPick={vi.fn()} />)

    expect(screen.getByRole('button', { name: '白板' })).toBeInTheDocument()
    expect(screen.getByText('插入一个可点击进入的白板卡片')).toBeInTheDocument()
  })
})
