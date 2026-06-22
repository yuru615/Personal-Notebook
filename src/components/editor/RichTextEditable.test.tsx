import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { RichTextEditable } from './RichTextEditable'

function findTextNode(element: Node): Text {
  if (element.nodeType === Node.TEXT_NODE) {
    return element as Text
  }

  for (const child of Array.from(element.childNodes)) {
    const textNode = findTextNode(child)
    if (textNode) {
      return textNode
    }
  }

  throw new Error('Expected a text node')
}

function selectText(element: HTMLElement, start: number, end: number) {
  const textNode = findTextNode(element)
  const range = document.createRange()
  range.setStart(textNode, start)
  range.setEnd(textNode, end)
  window.getSelection()?.removeAllRanges()
  window.getSelection()?.addRange(range)
  fireEvent.mouseUp(element)
}

describe('RichTextEditable', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    window.getSelection()?.removeAllRanges()
  })

  it('shows a floating format toolbar for selected text and applies bold', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()

    render(
      <RichTextEditable
        ariaLabel="输入正文"
        className="block-input paragraph-block"
        value="第一段文字"
        onChange={onChange}
      />,
    )

    const editor = screen.getByRole('textbox', { name: '输入正文' })
    selectText(editor, 0, 3)

    expect(screen.getByRole('toolbar', { name: '文本格式' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '粗体' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '斜体' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '下划线' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '删除线' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '超链接' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '粗体' }))

    expect(onChange).toHaveBeenLastCalledWith({
      text: '第一段文字',
      richText: [
        { text: '第一段', bold: true },
        { text: '文字' },
      ],
    })
  })

  it('adds a link to selected text', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    vi.spyOn(window, 'prompt').mockReturnValue('https://example.com')

    render(
      <RichTextEditable
        ariaLabel="输入正文"
        className="block-input paragraph-block"
        value="访问链接"
        onChange={onChange}
      />,
    )

    const editor = screen.getByRole('textbox', { name: '输入正文' })
    selectText(editor, 2, 4)

    await user.click(screen.getByRole('button', { name: '超链接' }))

    expect(onChange).toHaveBeenLastCalledWith({
      text: '访问链接',
      richText: [
        { text: '访问' },
        { text: '链接', link: 'https://example.com' },
      ],
    })
  })

  it('applies a text color from the floating toolbar', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()

    render(
      <RichTextEditable
        ariaLabel="body"
        className="block-input paragraph-block"
        value="hello world"
        onChange={onChange}
      />,
    )

    const editor = screen.getByRole('textbox', { name: 'body' })
    selectText(editor, 6, 11)

    await user.click(screen.getByRole('button', { name: '文字颜色' }))
    await user.click(screen.getByRole('button', { name: '文字颜色：蓝色' }))

    expect(onChange).toHaveBeenLastCalledWith({
      text: 'hello world',
      richText: [
        { text: 'hello ' },
        { text: 'world', color: 'blue' },
      ],
    })
  })

  it('hides the floating toolbar when the user clicks outside the selected text', () => {
    render(
      <RichTextEditable
        ariaLabel="body"
        className="block-input paragraph-block"
        value="hello world"
        onChange={vi.fn()}
      />,
    )

    const editor = screen.getByRole('textbox', { name: 'body' })
    selectText(editor, 0, 5)

    expect(screen.getByRole('toolbar')).toBeInTheDocument()

    fireEvent.pointerDown(document.body)

    expect(screen.queryByRole('toolbar')).not.toBeInTheDocument()
  })
})
