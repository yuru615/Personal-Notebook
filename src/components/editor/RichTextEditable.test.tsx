import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { openExternalLink } from '../../lib/externalLinks'
import { RichTextEditable } from './RichTextEditable'

vi.mock('../../lib/externalLinks', () => ({
  openExternalLink: vi.fn(),
}))

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

    expect(vi.mocked(openExternalLink)).toHaveBeenCalledWith('https://example.com')
  })

  it('opens the linked URL on a normal click when direct activation is selected', () => {
    vi.mocked(openExternalLink).mockClear()
    render(
      <RichTextEditable
        ariaLabel="body"
        className="block-input paragraph-block"
        value="hello world"
        richText={[
          { text: 'hello ' },
          { text: 'world', link: 'https://example.com' },
        ]}
        linkOpenMode="direct"
        onChange={vi.fn()}
      />,
    )

    const link = screen.getByRole('link', { name: 'world' })
    fireEvent.click(link)

    expect(vi.mocked(openExternalLink)).toHaveBeenCalledWith('https://example.com')
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

  it('shows page-link suggestions for [[ and inserts a confirmed relation segment', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()

    render(
      <RichTextEditable
        ariaLabel="body"
        className="block-input paragraph-block"
        value=""
        relationPages={[
          { id: 'page_product', title: 'Product Plan', icon: '📄', parentId: null },
          { id: 'page_roadmap', title: 'Roadmap', icon: '📘', parentId: null },
        ]}
        onChange={onChange}
      />,
    )

    const editor = screen.getByRole('textbox', { name: 'body' })
    await user.click(editor)
    await user.keyboard('[BracketLeft][BracketLeft]Prod')

    expect(await screen.findByRole('listbox', { name: '页面链接建议' })).toBeInTheDocument()
    await user.keyboard('{Enter}')

    expect(onChange).toHaveBeenLastCalledWith({
      text: 'Product Plan',
      richText: [{ text: 'Product Plan', pageId: 'page_product', relationKind: 'link' }],
    })
  })

  it('restores the caret after inserting a relation so typing can continue', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()

    render(
      <RichTextEditable
        ariaLabel="body"
        className="block-input paragraph-block"
        value=""
        relationPages={[{ id: 'page_product', title: 'Product Plan', icon: null, parentId: null }]}
        onChange={onChange}
      />,
    )

    const editor = screen.getByRole('textbox', { name: 'body' })
    await user.click(editor)
    await user.keyboard('[BracketLeft][BracketLeft]Prod{Enter}!')

    expect(onChange).toHaveBeenLastCalledWith({
      text: 'Product Plan!',
      richText: [
        { text: 'Product Plan', pageId: 'page_product', relationKind: 'link' },
        { text: '!' },
      ],
    })
  })

  it('opens an existing internal page relation on click', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    const onOpenPageRelation = vi.fn()

    render(
      <RichTextEditable
        ariaLabel="body"
        className="block-input paragraph-block"
        value="Launch Notes"
        richText={[{ text: '@Launch Notes', pageId: 'page_new', relationKind: 'mention' }]}
        relationPages={[]}
        onOpenPageRelation={onOpenPageRelation}
        onChange={onChange}
      />,
    )

    await user.click(screen.getByRole('link', { name: '@Launch Notes' }))
    expect(onOpenPageRelation).toHaveBeenCalledWith('page_new')
  })

  it('creates a new mention target when there is no existing page match', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    const onCreatePageRelation = vi.fn().mockResolvedValue({
      id: 'page_new',
      title: 'Launch Notes',
      icon: null,
      parentId: null,
    })

    render(
      <RichTextEditable
        ariaLabel="body"
        className="block-input paragraph-block"
        value=""
        relationPages={[]}
        onCreatePageRelation={onCreatePageRelation}
        onChange={onChange}
      />,
    )

    const editor = screen.getByRole('textbox', { name: 'body' })
    await user.click(editor)
    await user.keyboard('@Launch Notes')
    await user.click(await screen.findByRole('button', { name: '新建页面“Launch Notes”' }))

    expect(onCreatePageRelation).toHaveBeenCalledWith('Launch Notes')
    expect(onChange).toHaveBeenLastCalledWith({
      text: '@Launch Notes',
      richText: [{ text: '@Launch Notes', pageId: 'page_new', relationKind: 'mention' }],
    })
  })

  it('does not forward consumed relation autocomplete keys to outer handlers', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    const onKeyDown = vi.fn()

    render(
      <RichTextEditable
        ariaLabel="body"
        className="block-input paragraph-block"
        value=""
        relationPages={[
          { id: 'page_alpha', title: 'Alpha', icon: null, parentId: null },
          { id: 'page_product', title: 'Product Plan', icon: null, parentId: null },
        ]}
        onChange={onChange}
        onKeyDown={onKeyDown}
      />,
    )

    const editor = screen.getByRole('textbox', { name: 'body' })
    await user.click(editor)
    await user.keyboard('[BracketLeft][BracketLeft]Prod')
    expect(await screen.findByRole('listbox', { name: '页面链接建议' })).toBeInTheDocument()

    onKeyDown.mockClear()
    await user.keyboard('{ArrowDown}{Enter}')

    expect(onKeyDown).not.toHaveBeenCalled()
    expect(onChange).toHaveBeenLastCalledWith({
      text: 'Product Plan',
      richText: [{ text: 'Product Plan', pageId: 'page_product', relationKind: 'link' }],
    })
  })

  it('prevents duplicate page creation while relation page creation is pending', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    let resolveCreate:
      | ((value: { id: string; title: string; icon: null; parentId: null }) => void)
      | undefined
    const onCreatePageRelation = vi.fn().mockImplementation(
      () =>
        new Promise<{ id: string; title: string; icon: null; parentId: null }>((resolve) => {
          resolveCreate = resolve
        }),
    )

    render(
      <RichTextEditable
        ariaLabel="body"
        className="block-input paragraph-block"
        value=""
        relationPages={[]}
        onCreatePageRelation={onCreatePageRelation}
        onChange={onChange}
      />,
    )

    const editor = screen.getByRole('textbox', { name: 'body' })
    await user.click(editor)
    await user.keyboard('@Launch Notes')

    const createButton = await screen.findByRole('button', { name: /Launch Notes/ })
    await user.keyboard('{Enter}{Enter}')

    expect(onCreatePageRelation).toHaveBeenCalledTimes(1)
    expect(createButton).toBeDisabled()

    resolveCreate?.({
      id: 'page_new',
      title: 'Launch Notes',
      icon: null,
      parentId: null,
    })

    await waitFor(() =>
      expect(onChange).toHaveBeenLastCalledWith({
        text: '@Launch Notes',
        richText: [{ text: '@Launch Notes', pageId: 'page_new', relationKind: 'mention' }],
      }),
    )
  })

  it('keeps the original relation replacement range during async page creation', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    let resolveCreate:
      | ((value: { id: string; title: string; icon: null; parentId: null }) => void)
      | undefined
    const onCreatePageRelation = vi.fn().mockImplementation(
      () =>
        new Promise<{ id: string; title: string; icon: null; parentId: null }>((resolve) => {
          resolveCreate = resolve
        }),
    )

    function AsyncCreateHarness() {
      const [current, setCurrent] = useState({
        text: '',
        richText: undefined as undefined | Array<{ text: string; pageId?: string; relationKind?: 'mention' }>,
      })

      return (
        <RichTextEditable
          ariaLabel="body"
          className="block-input paragraph-block"
          value={current.text}
          richText={current.richText}
          relationPages={[]}
          onCreatePageRelation={onCreatePageRelation}
          onChange={(next) => {
            onChange(next)
            setCurrent({
              text: next.text,
              richText: next.richText as typeof current.richText,
            })
          }}
        />
      )
    }

    render(<AsyncCreateHarness />)

    const editor = screen.getByRole('textbox', { name: 'body' })
    await user.click(editor)
    await user.keyboard('@Launch Notes')
    await user.keyboard('{Enter}')

    window.getSelection()?.removeAllRanges()

    resolveCreate?.({
      id: 'page_new',
      title: 'Launch Notes',
      icon: null,
      parentId: null,
    })

    await waitFor(() =>
      expect(onChange).toHaveBeenLastCalledWith({
        text: '@Launch Notes',
        richText: [{ text: '@Launch Notes', pageId: 'page_new', relationKind: 'mention' }],
      }),
    )
  })

  it('does not consume autocomplete keys while the user is composing text', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    const onKeyDown = vi.fn()

    render(
      <RichTextEditable
        ariaLabel="body"
        className="block-input paragraph-block"
        value=""
        relationPages={[{ id: 'page_product', title: 'Product Plan', icon: null, parentId: null }]}
        onChange={onChange}
        onKeyDown={onKeyDown}
      />,
    )

    const editor = screen.getByRole('textbox', { name: 'body' })
    await user.click(editor)
    await user.keyboard('@Prod')
    expect(await screen.findByRole('listbox', { name: '页面提及建议' })).toBeInTheDocument()

    onChange.mockClear()
    onKeyDown.mockClear()

    fireEvent.keyDown(editor, { key: 'ArrowDown', isComposing: true })
    fireEvent.keyDown(editor, { key: 'Enter', isComposing: true })

    expect(onKeyDown).toHaveBeenCalledTimes(2)
    expect(onChange).not.toHaveBeenCalled()
  })

  it('closes autocomplete when the selection is no longer collapsed', async () => {
    const user = userEvent.setup()
    const onKeyDown = vi.fn()

    render(
      <RichTextEditable
        ariaLabel="body"
        className="block-input paragraph-block"
        value=""
        relationPages={[{ id: 'page_product', title: 'Product Plan', icon: null, parentId: null }]}
        onChange={vi.fn()}
        onKeyDown={onKeyDown}
      />,
    )

    const editor = screen.getByRole('textbox', { name: 'body' })
    await user.click(editor)
    await user.keyboard('@Prod')
    expect(await screen.findByRole('listbox', { name: '页面提及建议' })).toBeInTheDocument()

    selectText(editor, 0, 5)
    await waitFor(() =>
      expect(screen.queryByRole('listbox', { name: '页面提及建议' })).not.toBeInTheDocument(),
    )

    onKeyDown.mockClear()
    fireEvent.keyDown(editor, { key: 'Enter' })
    expect(onKeyDown).toHaveBeenCalledTimes(1)
  })
})
