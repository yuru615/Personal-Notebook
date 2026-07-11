import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ListBlock } from './ListBlock'

describe('ListBlock', () => {
  it('renders a single list row with the matching marker', () => {
    const { container } = render(
      <ListBlock
        type="numbered_list"
        value="第一项"
        onChange={vi.fn()}
      />,
    )

    expect(screen.getAllByRole('textbox')).toHaveLength(1)
    expect(screen.getByRole('textbox', { name: '每行一个列表项' })).toHaveTextContent('第一项')

    const markers = Array.from(container.querySelectorAll('.list-block-marker')).map((element) =>
      element.textContent?.trim(),
    )

    expect(markers).toEqual(['1.'])
  })

  it('shows the rich-text format toolbar when list text is selected', () => {
    render(
      <ListBlock
        type="bulleted_list"
        value="列表文本"
        onChange={vi.fn()}
      />,
    )

    const editor = screen.getByRole('textbox', { name: '每行一个列表项' })
    const textNode = editor.firstChild

    if (textNode) {
      const range = document.createRange()
      range.setStart(textNode, 0)
      range.setEnd(textNode, 2)
      window.getSelection()?.removeAllRanges()
      window.getSelection()?.addRange(range)
    }

    fireEvent.mouseUp(editor)

    expect(screen.getByRole('toolbar', { name: '文本格式' })).toBeInTheDocument()
  })
})
