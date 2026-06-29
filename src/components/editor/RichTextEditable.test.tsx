import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
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

  it('opens a link input popover and applies a link to the selected text', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()

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
    const linkInput = screen.getByRole('textbox', { name: '链接地址' })
    await user.type(linkInput, 'https://example.com')
    await user.click(screen.getByRole('button', { name: '确认链接' }))

    expect(onChange).toHaveBeenLastCalledWith({
      text: '访问链接',
      richText: [
        { text: '访问' },
        { text: '链接', link: 'https://example.com' },
      ],
    })
  })

  it('opens the linked URL when ctrl-clicking linked text', () => {
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null)

    render(
      <RichTextEditable
        ariaLabel="body"
        className="block-input paragraph-block"
        value="hello world"
        richText={[
          { text: 'hello ' },
          { text: 'world', link: 'https://example.com' },
        ]}
        onChange={vi.fn()}
      />,
    )

    const editor = screen.getByRole('textbox', { name: 'body' })
    const link = editor.querySelector('a')

    expect(link).not.toBeNull()

    fireEvent.click(link as HTMLAnchorElement, { ctrlKey: true })

    expect(openSpy).toHaveBeenCalledWith('https://example.com', '_blank', 'noopener,noreferrer')
  })

  it('marks the editor as link-open-ready while ctrl-hovering a link', () => {
    render(
      <RichTextEditable
        ariaLabel="body"
        className="block-input paragraph-block"
        value="hello world"
        richText={[
          { text: 'hello ' },
          { text: 'world', link: 'https://example.com' },
        ]}
        onChange={vi.fn()}
      />,
    )

    const editor = screen.getByRole('textbox', { name: 'body' })
    const link = editor.querySelector('a')

    expect(link).not.toBeNull()

    fireEvent.mouseMove(link as HTMLAnchorElement, { ctrlKey: true })
    expect(editor).toHaveAttribute('data-link-open-ready', 'true')

    fireEvent.mouseLeave(editor)
    expect(editor).toHaveAttribute('data-link-open-ready', 'false')
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

  it('reflects the current strike state in the floating toolbar', async () => {
    const user = userEvent.setup()

    function StrikeHarness() {
      const [current, setCurrent] = useState({
        text: 'hello world',
        richText: undefined as undefined | Array<{ text: string; strike?: true }>,
      })

      return (
        <RichTextEditable
          ariaLabel="body"
          className="block-input paragraph-block"
          value={current.text}
          richText={current.richText}
          onChange={(next) =>
            setCurrent({
              text: next.text,
              richText: next.richText as typeof current.richText,
            })
          }
        />
      )
    }

    render(<StrikeHarness />)

    const editor = screen.getByRole('textbox', { name: 'body' })
    selectText(editor, 6, 11)

    const strikeButton = screen.getByRole('button', { name: '删除线' })
    expect(strikeButton).toHaveAttribute('aria-pressed', 'false')

    await user.click(strikeButton)

    expect(screen.getByRole('button', { name: '删除线' })).toHaveAttribute('aria-pressed', 'true')
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
