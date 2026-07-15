import { act, createEvent, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { useRef, useState } from 'react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { BlockEditor } from './BlockEditor'
import { createDefaultAppState } from '../dataTable/domain/factory'

const assets = vi.hoisted(() => ({
  writeAssetBytes: vi.fn(async () => ({
    id: 'asset_pasted_image',
    sha256: 'sha-pasted-image',
    name: 'pasted-image.png',
    mimeType: 'image/png',
    byteSize: 4,
    relativePath: 'paste/d-image.png',
    createdAt: '2026-07-09T00:00:00.000Z',
  })),
}))

const desktopLifecycle = vi.hoisted(() => ({
  readDesktopClipboardCandidate: vi.fn(async () => null),
}))

vi.mock('../../lib/assets', () => ({
  writeAssetBytes: assets.writeAssetBytes,
}))

vi.mock('../../lib/desktopLifecycle', () => ({
  readDesktopClipboardCandidate: desktopLifecycle.readDesktopClipboardCandidate,
}))

const page = {
  id: 'page_a',
  title: '测试页',
  parentId: null,
  icon: '📄',
  cover: null,
  createdAt: '',
  updatedAt: '',
  blocks: [
    { id: 'b1', type: 'paragraph', text: '第一段' },
    { id: 'b2', type: 'todo', text: '待办事项', checked: true },
    { id: 'b3', type: 'code', language: 'ts', text: 'const a = 1;' },
    { id: 'b4', type: 'table', rows: [['列1', '列2'], ['A', 'B']] },
  ],
}

function dragOverAt(element: Element, clientY: number) {
  const event = createEvent.dragOver(element)
  Object.defineProperty(event, 'clientY', { value: clientY })
  fireEvent(element, event)
}

function pointerDownAt(element: Element | Window, clientX: number, clientY: number) {
  act(() => {
    fireEvent.pointerDown(element, { button: 0, clientX, clientY })
  })
}

function pointerMoveAt(element: Element | Window, clientX: number, clientY: number) {
  act(() => {
    fireEvent.pointerMove(element, { buttons: 1, clientX, clientY })
  })
}

function pointerUpAt(element: Element | Window, clientX: number, clientY: number) {
  act(() => {
    fireEvent.pointerUp(element, { button: 0, clientX, clientY })
  })
}

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

function selectEditableText(element: HTMLElement, start: number, end: number) {
  const textNode = findTextNode(element)
  const range = document.createRange()
  range.setStart(textNode, start)
  range.setEnd(textNode, end)
  window.getSelection()?.removeAllRanges()
  window.getSelection()?.addRange(range)
  fireEvent.mouseUp(element)
}

function placeCaretAtStart(element: HTMLElement) {
  const range = document.createRange()
  range.selectNodeContents(element)
  range.collapse(true)
  window.getSelection()?.removeAllRanges()
  window.getSelection()?.addRange(range)
}

function placeCaretAtEnd(element: HTMLElement) {
  const range = document.createRange()
  range.selectNodeContents(element)
  range.collapse(false)
  window.getSelection()?.removeAllRanges()
  window.getSelection()?.addRange(range)
}

function createClipboardImageFile(name = 'clipboard-source.png') {
  return new File([new Uint8Array([137, 80, 78, 71])], name, {
    type: 'image/png',
  })
}

function createUnreadableClipboardImageFile(name = 'clipboard-source.png') {
  const file = createClipboardImageFile(name)
  Object.defineProperty(file, 'arrayBuffer', {
    value: vi.fn(async () => {
      throw new Error('clipboard file bytes unavailable')
    }),
  })
  return file
}

function pasteImageInto(element: HTMLElement, file = createClipboardImageFile()) {
  fireEvent.paste(element, {
    clipboardData: {
      files: [file],
      items: [
        {
          kind: 'file',
          type: file.type,
          getAsFile: () => file,
        },
      ],
    },
  })
}

function pasteStructuredTextInto(
  element: HTMLElement,
  {
    markdown = '',
    html = '',
    text = markdown,
  }: { markdown?: string; html?: string; text?: string },
) {
  fireEvent.paste(element, {
    clipboardData: {
      files: [],
      items: [],
      getData: (type: string) =>
        type === 'text/markdown' ? markdown : type === 'text/html' ? html : type === 'text/plain' ? text : '',
    },
  })
}

function pasteWithoutBrowserImagePayload(element: HTMLElement) {
  fireEvent.paste(element, {
    clipboardData: {
      files: [],
      items: [],
    },
  })
}

function mockBrowserClipboardImageRead(mimeType = 'image/png') {
  const originalClipboard = navigator.clipboard
  const read = vi.fn(async () => [
    {
      types: [mimeType],
      getType: async () => new Blob([new Uint8Array([137, 80, 78, 71])], { type: mimeType }),
    },
  ])

  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { read },
  })

  return {
    read,
    restore() {
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: originalClipboard,
      })
    },
  }
}

function getParagraphEditorByText(text: string) {
  const editor = screen
    .getAllByRole('textbox', { name: '输入正文' })
    .find((element) => element.textContent === text)

  if (!editor) {
    throw new Error(`Expected text editor with content: ${text}`)
  }

  return editor
}

describe('BlockEditor', () => {
  it('turns pasted markdown into blocks while retaining the source formatting', async () => {
    const onUpdateBlock = vi.fn()
    const onInsertBlockAfter = vi
      .fn()
      .mockResolvedValueOnce('pasted_paragraph')
      .mockResolvedValueOnce('pasted_todo')
    const emptyPage = {
      ...page,
      blocks: [{ id: 'b1', type: 'paragraph' as const, text: '' }],
    }

    render(
      <BlockEditor
        page={emptyPage as never}
        allPages={[emptyPage as never]}
        onUpdateBlock={onUpdateBlock}
        onInsertBlockAfter={onInsertBlockAfter}
      />,
    )

    pasteStructuredTextInto(screen.getByRole('textbox', { name: '输入正文' }), {
      markdown: ['# 项目计划', '', '正文包含 **重点**。', '', '- [ ] 完成测试'].join('\n'),
    })

    await waitFor(() => {
      expect(onUpdateBlock).toHaveBeenCalledWith(
        'b1',
        expect.objectContaining({ id: 'b1', type: 'heading_1', text: '项目计划' }),
      )
    })
    expect(onInsertBlockAfter).toHaveBeenNthCalledWith(1, 'b1', 'paragraph')
    expect(onInsertBlockAfter).toHaveBeenNthCalledWith(2, 'pasted_paragraph', 'todo')
    expect(onUpdateBlock).toHaveBeenCalledWith(
      'pasted_paragraph',
      expect.objectContaining({
        id: 'pasted_paragraph',
        type: 'paragraph',
        text: '正文包含 重点。',
        richText: [{ text: '正文包含 ' }, { text: '重点', bold: true }, { text: '。' }],
      }),
    )
    expect(onUpdateBlock).toHaveBeenCalledWith(
      'pasted_todo',
      expect.objectContaining({ id: 'pasted_todo', type: 'todo', text: '完成测试', checked: false }),
    )
  })

  it('turns pasted markdown from the trailing empty row into blocks', async () => {
    const onUpdateBlock = vi.fn()
    const onInsert = vi.fn(async () => 'pasted_heading')
    const onInsertBlockAfter = vi.fn(async () => 'pasted_paragraph')

    render(
      <BlockEditor
        page={{ ...page, blocks: [] } as never}
        allPages={[page as never]}
        onUpdateBlock={onUpdateBlock}
        onInsert={onInsert}
        onInsertBlockAfter={onInsertBlockAfter}
      />,
    )

    pasteStructuredTextInto(screen.getByPlaceholderText('输入 / 打开命令菜单') as HTMLElement, {
      markdown: ['# 项目计划', '', '正文内容'].join('\n'),
    })

    await waitFor(() => {
      expect(onInsert).toHaveBeenCalledWith('heading_1')
    })
    expect(onUpdateBlock).toHaveBeenCalledWith(
      'pasted_heading',
      expect.objectContaining({ id: 'pasted_heading', type: 'heading_1', text: '项目计划' }),
    )
    expect(onInsertBlockAfter).toHaveBeenCalledWith('pasted_heading', 'paragraph')
    expect(onUpdateBlock).toHaveBeenCalledWith(
      'pasted_paragraph',
      expect.objectContaining({ id: 'pasted_paragraph', type: 'paragraph', text: '正文内容' }),
    )
  })

  it('prefers formatted HTML when the markdown clipboard payload is plain text', async () => {
    const onPasteBlocks = vi.fn()
    const emptyPage = {
      ...page,
      blocks: [{ id: 'b1', type: 'paragraph' as const, text: '' }],
    }

    render(
      <BlockEditor
        page={emptyPage as never}
        allPages={[emptyPage as never]}
        onUpdateBlock={vi.fn()}
        onPasteBlocks={onPasteBlocks}
      />,
    )

    pasteStructuredTextInto(screen.getByRole('textbox', { name: '输入正文' }), {
      markdown: '项目计划',
      html: '<h1>项目计划</h1><p>这是 <strong>重点</strong>。</p>',
      text: '项目计划\n这是重点。',
    })

    await waitFor(() => {
      expect(onPasteBlocks).toHaveBeenCalledWith(
        'b1',
        [
          expect.objectContaining({ type: 'heading_1', text: '项目计划' }),
          expect.objectContaining({
            type: 'paragraph',
            text: '这是 重点。',
            richText: [{ text: '这是 ' }, { text: '重点', bold: true }, { text: '。' }],
          }),
        ],
        true,
      )
    })
  })

  it('keeps Word headings and tables when its plain-text clipboard payload looks like markdown', async () => {
    const onPasteBlocks = vi.fn()
    const emptyPage = {
      ...page,
      blocks: [{ id: 'b1', type: 'paragraph' as const, text: '' }],
    }

    render(
      <BlockEditor
        page={emptyPage as never}
        allPages={[emptyPage as never]}
        onUpdateBlock={vi.fn()}
        onPasteBlocks={onPasteBlocks}
      />,
    )

    pasteStructuredTextInto(screen.getByRole('textbox', { name: '输入正文' }), {
      markdown: '',
      html: [
        '<p class="MsoHeading1">1 Introduction</p>',
        '<p class="MsoHeading2">1.1 Purpose</p>',
        '<table><tr><td>Module</td><td>Owner</td></tr><tr><td>Scheduling</td><td>Team</td></tr></table>',
      ].join(''),
      text: '1. Introduction\n1.1 Purpose\nModule\tOwner\nScheduling\tTeam',
    })

    await waitFor(() => {
      expect(onPasteBlocks).toHaveBeenCalledWith(
        'b1',
        [
          expect.objectContaining({ type: 'heading_1', text: '1 Introduction' }),
          expect.objectContaining({ type: 'heading_2', text: '1.1 Purpose' }),
          expect.objectContaining({
            type: 'table',
            rows: [
              ['Module', 'Owner'],
              ['Scheduling', 'Team'],
            ],
          }),
        ],
        true,
      )
    })
  })

  it('turns pasted Word HTML headings, tables, and images into editor blocks', async () => {
    const onPasteBlocks = vi.fn()
    const emptyPage = {
      ...page,
      blocks: [{ id: 'b1', type: 'paragraph' as const, text: '' }],
    }

    render(
      <BlockEditor
        page={emptyPage as never}
        allPages={[emptyPage as never]}
        onUpdateBlock={vi.fn()}
        onPasteBlocks={onPasteBlocks}
      />,
    )

    pasteStructuredTextInto(screen.getByRole('textbox', { name: '输入正文' }), {
      html: [
        '<style>p.CustomWordHeading { mso-outline-level: 1; }</style>',
        '<p class="CustomWordHeading">Word heading</p>',
        '<table><tr><td>Task</td><td>Owner</td></tr><tr><td>Import</td><td>Zhiqi</td></tr></table>',
        '<p><img src="data:image/png;base64,iVBORw0KGgo=" alt="Word image"></p>',
      ].join(''),
      text: 'Word heading\nTask\tOwner\nImport\tZhiqi',
    })

    await waitFor(() => {
      expect(onPasteBlocks).toHaveBeenCalledWith(
        'b1',
        [
          expect.objectContaining({ type: 'heading_1', text: 'Word heading' }),
          expect.objectContaining({
            type: 'table',
            rows: [
              ['Task', 'Owner'],
              ['Import', 'Zhiqi'],
            ],
          }),
          expect.objectContaining({
            type: 'image',
            assetId: 'asset_pasted_image',
            alt: 'Word image',
          }),
        ],
        true,
      )
    })
    expect(assets.writeAssetBytes).toHaveBeenCalledWith(
      expect.objectContaining({ mimeType: 'image/png' }),
    )
  })

  it('uses desktop clipboard markdown when the WebView paste payload has no readable text', async () => {
    const onPasteBlocks = vi.fn()
    const emptyPage = {
      ...page,
      blocks: [{ id: 'b1', type: 'paragraph' as const, text: '' }],
    }
    desktopLifecycle.readDesktopClipboardCandidate.mockResolvedValueOnce({
      kind: 'text',
      text: ['# 项目计划', '', '正文包含 **重点**。', '', '- [ ] 完成测试'].join('\n'),
      html: null,
    })

    render(
      <BlockEditor
        page={emptyPage as never}
        allPages={[emptyPage as never]}
        onUpdateBlock={vi.fn()}
        onPasteBlocks={onPasteBlocks}
      />,
    )

    pasteWithoutBrowserImagePayload(screen.getByRole('textbox', { name: '输入正文' }))

    await waitFor(() => {
      expect(onPasteBlocks).toHaveBeenCalledWith(
        'b1',
        [
          expect.objectContaining({ type: 'heading_1', text: '项目计划' }),
          expect.objectContaining({ type: 'paragraph', text: '正文包含 重点。' }),
          expect.objectContaining({ type: 'todo', text: '完成测试', checked: false }),
        ],
        true,
      )
    })
  })

  it('falls back to the desktop clipboard image bytes when the browser paste payload is empty', async () => {
    const onUpdateBlock = vi.fn()
    const onInsertBlockAfter = vi.fn(async () => 'image-block')
    const textPage = {
      ...page,
      blocks: [{ id: 'b1', type: 'paragraph' as const, text: '第一段' }],
    }
    desktopLifecycle.readDesktopClipboardCandidate.mockResolvedValueOnce({
      kind: 'image_bytes',
      bytes: new Uint8Array([137, 80, 78, 71]),
    })

    render(
      <BlockEditor
        page={textPage as never}
        allPages={[textPage as never]}
        onUpdateBlock={onUpdateBlock}
        onInsertBlockAfter={onInsertBlockAfter}
      />,
    )

    pasteWithoutBrowserImagePayload(screen.getByRole('textbox', { name: '输入正文' }))

    await waitFor(() => {
      expect(onInsertBlockAfter).toHaveBeenCalledWith('b1', 'image')
    })
    await waitFor(() => {
      expect(onUpdateBlock).toHaveBeenCalledWith(
        'image-block',
        expect.objectContaining({
          id: 'image-block',
          type: 'image',
          assetId: 'asset_pasted_image',
          mimeType: 'image/png',
        }),
      )
    })
  })

  it('falls back to the browser clipboard image when the paste payload is empty', async () => {
    const onUpdateBlock = vi.fn()
    const onInsertBlockAfter = vi.fn(async () => 'image-block')
    const textPage = {
      ...page,
      blocks: [{ id: 'b1', type: 'paragraph' as const, text: 'First block' }],
    }
    const clipboard = mockBrowserClipboardImageRead()

    try {
      render(
        <BlockEditor
          page={textPage as never}
          allPages={[textPage as never]}
          onUpdateBlock={onUpdateBlock}
          onInsertBlockAfter={onInsertBlockAfter}
        />,
      )

      pasteWithoutBrowserImagePayload(screen.getByRole('textbox', { name: '输入正文' }))

      await waitFor(() => {
        expect(clipboard.read).toHaveBeenCalledTimes(1)
      })
      await waitFor(() => {
        expect(onInsertBlockAfter).toHaveBeenCalledWith('b1', 'image')
      })
      await waitFor(() => {
        expect(onUpdateBlock).toHaveBeenCalledWith(
          'image-block',
          expect.objectContaining({
            id: 'image-block',
            type: 'image',
            assetId: 'asset_pasted_image',
            mimeType: 'image/png',
          }),
        )
      })
    } finally {
      clipboard.restore()
    }
  })

  it('falls back to the desktop clipboard image when the browser exposes an unreadable image file', async () => {
    const onUpdateBlock = vi.fn()
    const onInsertBlockAfter = vi.fn(async () => 'image-block')
    /*
    const textPage = {
      ...page,
      blocks: [{ id: 'b1', type: 'paragraph' as const, text: '绗竴娈? }],
    }
    */
    const textPage = {
      ...page,
      blocks: [{ id: 'b1', type: 'paragraph' as const, text: 'First block' }],
    }
    desktopLifecycle.readDesktopClipboardCandidate.mockResolvedValueOnce({
      kind: 'image_bytes',
      bytes: new Uint8Array([137, 80, 78, 71]),
    })

    render(
      <BlockEditor
        page={textPage as never}
        allPages={[textPage as never]}
        onUpdateBlock={onUpdateBlock}
        onInsertBlockAfter={onInsertBlockAfter}
      />,
    )

    pasteImageInto(
      screen.getByRole('textbox', { name: '输入正文' }),
      createUnreadableClipboardImageFile(),
    )

    await waitFor(() => {
      expect(onInsertBlockAfter).toHaveBeenCalledWith('b1', 'image')
    })
    await waitFor(() => {
      expect(onUpdateBlock).toHaveBeenCalledWith(
        'image-block',
        expect.objectContaining({
          id: 'image-block',
          type: 'image',
          assetId: 'asset_pasted_image',
          mimeType: 'image/png',
        }),
      )
    })
  })

  it('inserts a pasted image as an image block after a non-empty text block', async () => {
    const onUpdateBlock = vi.fn()
    const onInsertBlockAfter = vi.fn(async () => 'image-block')
    const textPage = {
      ...page,
      blocks: [{ id: 'b1', type: 'paragraph' as const, text: '第一段' }],
    }

    render(
      <BlockEditor
        page={textPage as never}
        allPages={[textPage as never]}
        onUpdateBlock={onUpdateBlock}
        onInsertBlockAfter={onInsertBlockAfter}
      />,
    )

    pasteImageInto(screen.getByRole('textbox', { name: '输入正文' }))

    await waitFor(() => {
      expect(onInsertBlockAfter).toHaveBeenCalledWith('b1', 'image')
    })
    await waitFor(() => {
      expect(onUpdateBlock).toHaveBeenCalledWith(
        'image-block',
        expect.objectContaining({
          id: 'image-block',
          type: 'image',
          assetId: 'asset_pasted_image',
          name: 'pasted-image.png',
          mimeType: 'image/png',
          alt: 'pasted-image.png',
        }),
      )
    })
  })

  it('inserts a pasted image from the trailing empty row', async () => {
    const onUpdateBlock = vi.fn()
    const onInsert = vi.fn(async () => 'image-block')

    render(
      <BlockEditor
        page={{ ...page, blocks: [] } as never}
        allPages={[page as never]}
        onUpdateBlock={onUpdateBlock}
        onInsert={onInsert}
      />,
    )

    pasteImageInto(screen.getByPlaceholderText('输入 / 打开命令菜单') as HTMLElement)

    await waitFor(() => {
      expect(onInsert).toHaveBeenCalledWith('image')
    })
    await waitFor(() => {
      expect(onUpdateBlock).toHaveBeenCalledWith(
        'image-block',
        expect.objectContaining({
          id: 'image-block',
          type: 'image',
          assetId: 'asset_pasted_image',
          name: 'pasted-image.png',
          mimeType: 'image/png',
          alt: 'pasted-image.png',
        }),
      )
    })
  })

  it('falls back to the browser clipboard image from the trailing empty row when the paste payload is empty', async () => {
    const onUpdateBlock = vi.fn()
    const onInsert = vi.fn(async () => 'image-block')
    const clipboard = mockBrowserClipboardImageRead()

    try {
      render(
        <BlockEditor
          page={{ ...page, blocks: [] } as never}
          allPages={[page as never]}
          onUpdateBlock={onUpdateBlock}
          onInsert={onInsert}
        />,
      )

      pasteWithoutBrowserImagePayload(screen.getByPlaceholderText('输入 / 打开命令菜单') as HTMLElement)

      await waitFor(() => {
        expect(clipboard.read).toHaveBeenCalledTimes(1)
      })
      await waitFor(() => {
        expect(onInsert).toHaveBeenCalledWith('image')
      })
      await waitFor(() => {
        expect(onUpdateBlock).toHaveBeenCalledWith(
          'image-block',
          expect.objectContaining({
            id: 'image-block',
            type: 'image',
            assetId: 'asset_pasted_image',
            mimeType: 'image/png',
          }),
        )
      })
    } finally {
      clipboard.restore()
    }
  })

  it('turns an empty text block into an image block before applying a pasted image', async () => {
    const onUpdateBlock = vi.fn()
    const onTurnInto = vi.fn(async () => undefined)
    const textPage = {
      ...page,
      blocks: [{ id: 'b1', type: 'paragraph' as const, text: '' }],
    }

    render(
      <BlockEditor
        page={textPage as never}
        allPages={[textPage as never]}
        onUpdateBlock={onUpdateBlock}
        onTurnInto={onTurnInto}
      />,
    )

    pasteImageInto(screen.getByRole('textbox', { name: '输入正文' }))

    await waitFor(() => {
      expect(onTurnInto).toHaveBeenCalledWith('b1', 'image')
    })
    await waitFor(() => {
      expect(onUpdateBlock).toHaveBeenCalledWith(
        'b1',
        expect.objectContaining({
          id: 'b1',
          type: 'image',
          assetId: 'asset_pasted_image',
          mimeType: 'image/png',
        }),
      )
    })
  })

  it('renders all core block types', () => {
    render(<BlockEditor page={page as never} allPages={[page as never]} onUpdateBlock={vi.fn()} />)

    expect(getParagraphEditorByText('第一段')).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: '待办事项' })).toHaveTextContent('待办事项')
    expect(screen.getByDisplayValue('const a = 1;')).toBeInTheDocument()
    expect(screen.getByDisplayValue('列1')).toBeInTheDocument()
    expect(screen.getByDisplayValue('A')).toBeInTheDocument()
  })

  it('marks heading rows and feature card rows for spacing rules', () => {
    const spacingPage = {
      ...page,
      blocks: [
        { id: 'heading-block', type: 'heading_2' as const, text: 'Section title' },
        { id: 'child-page-block', type: 'child_page' as const, pageId: 'child-page-1' },
      ],
    }
    const childPage = {
      ...page,
      id: 'child-page-1',
      title: 'Nested page',
      blocks: [],
    }
    const { container } = render(
      <BlockEditor
        page={spacingPage as never}
        allPages={[spacingPage as never, childPage as never]}
        onUpdateBlock={vi.fn()}
      />,
    )

    const rows = Array.from(container.querySelectorAll('.editor-row'))

    expect(rows[0]).toHaveClass('editor-row-kind-heading')
    expect(rows[1]).toHaveClass('editor-row-kind-feature-card')
  })

  it('marks feature card rows followed by heading rows for spacing rules', () => {
    const spacingPage = {
      ...page,
      blocks: [
        { id: 'child-page-block', type: 'child_page' as const, pageId: 'child-page-1' },
        { id: 'heading-block', type: 'heading_2' as const, text: 'Section title' },
      ],
    }
    const childPage = {
      ...page,
      id: 'child-page-1',
      title: 'Nested page',
      blocks: [],
    }
    const { container } = render(
      <BlockEditor
        page={spacingPage as never}
        allPages={[spacingPage as never, childPage as never]}
        onUpdateBlock={vi.fn()}
      />,
    )

    const rows = Array.from(container.querySelectorAll('.editor-row'))

    expect(rows[0]).toHaveClass('editor-row-kind-feature-card')
    expect(rows[1]).toHaveClass('editor-row-kind-heading')
  })

  it('renders saved text styles on text blocks', () => {
    const styledPage = {
      ...page,
      blocks: [
        {
          id: 'b1',
          type: 'paragraph',
          text: '第一段',
          textColor: 'blue',
          backgroundColor: 'yellow',
          textAlign: 'center',
        },
      ],
    }
    const { container } = render(
      <BlockEditor page={styledPage as never} allPages={[styledPage as never]} onUpdateBlock={vi.fn()} />,
    )

    const input = screen.getByRole('textbox', { name: '输入正文' })
    const surface = container.querySelector('.block-style-surface')

    expect(input).toHaveStyle({ textAlign: 'center' })
    expect(input.getAttribute('style')).toContain('color')
    expect(surface?.getAttribute('style')).toContain('background-color')
  })

  it('marks checked todo text as completed', () => {
    const todoPage = {
      ...page,
      blocks: [
        { id: 'todo-open', type: 'todo' as const, text: '待办事项', checked: false },
        { id: 'todo-done', type: 'todo' as const, text: '完成第一个待办', checked: true },
      ],
    }

    render(<BlockEditor page={todoPage as never} allPages={[todoPage as never]} onUpdateBlock={vi.fn()} />)

    const todoInputs = screen.getAllByRole('textbox', { name: '待办事项' })
    const openTodoInput = todoInputs.find((input) => input.textContent === '待办事项')
    const doneTodoInput = todoInputs.find((input) => input.textContent === '完成第一个待办')

    expect(openTodoInput).not.toHaveClass('todo-input-checked')
    expect(doneTodoInput).toHaveClass('todo-input-checked')
  })

  it('updates table cell styles from row and column menus', async () => {
    const user = userEvent.setup()
    const onUpdateBlock = vi.fn()
    const tableBlock = {
      id: 'table-style',
      type: 'table',
      rows: [
        ['A1', 'B1'],
        ['A2', 'B2'],
      ],
    }
    const tablePage = {
      ...page,
      blocks: [tableBlock],
    }

    render(
      <BlockEditor
        page={tablePage as never}
        allPages={[tablePage as never]}
        onUpdateBlock={onUpdateBlock}
      />,
    )

    await user.click(screen.getByRole('button', { name: '第 1 行操作' }))
    await user.click(screen.getByRole('button', { name: '文字居中' }))

    expect(onUpdateBlock).toHaveBeenLastCalledWith('table-style', {
      ...tableBlock,
      cellStyles: [[{ textAlign: 'center' }, { textAlign: 'center' }], [null, null]],
    })
  })

  it('updates text styles from the block handle menu', async () => {
    const user = userEvent.setup()
    const onUpdateBlock = vi.fn()
    const textBlock = { id: 'b1', type: 'paragraph', text: '第一段' }
    const textPage = {
      ...page,
      blocks: [textBlock],
    }

    render(
      <BlockEditor
        page={textPage as never}
        allPages={[textPage as never]}
        onUpdateBlock={onUpdateBlock}
      />,
    )

    await user.click(screen.getByRole('button', { name: '拖动块' }))
    await user.click(screen.getByRole('button', { name: '文字颜色：红色' }))

    expect(onUpdateBlock).toHaveBeenLastCalledWith('b1', {
      ...textBlock,
      textColor: 'red',
      backgroundColor: undefined,
      textAlign: undefined,
    })

    await user.click(screen.getByRole('button', { name: '文字居中' }))

    expect(onUpdateBlock).toHaveBeenLastCalledWith('b1', {
      ...textBlock,
      textColor: undefined,
      backgroundColor: undefined,
      textAlign: 'center',
    })
  })

  it('focuses a block after turning it into a list from the block handle menu', async () => {
    const user = userEvent.setup()

    function TurnIntoFocusHarness() {
      const [currentPage, setCurrentPage] = useState({
        ...page,
        blocks: [{ id: 'b1', type: 'paragraph' as const, text: '风格化' }],
      })

      return (
        <BlockEditor
          page={currentPage as never}
          allPages={[currentPage as never]}
          onUpdateBlock={vi.fn()}
          onTurnInto={async (blockId, type) => {
            setCurrentPage((previousPage) => ({
              ...previousPage,
              blocks: previousPage.blocks.map((block) =>
                block.id === blockId ? { id: block.id, type, items: ['风格化'] } : block,
              ),
            }))
          }}
        />
      )
    }

    render(<TurnIntoFocusHarness />)

    await user.click(screen.getByRole('button', { name: '拖动块' }))
    await user.click(screen.getByRole('button', { name: '转为无序列表' }))

    const listEditor = await screen.findByRole('textbox', { name: '每行一个列表项' })
    await waitFor(() => expect(listEditor).toHaveFocus())
  })

  it('updates rich text from the floating format toolbar', async () => {
    const user = userEvent.setup()
    const onUpdateBlock = vi.fn()
    const textBlock = { id: 'b1', type: 'paragraph', text: '第一段文字' }
    const textPage = {
      ...page,
      blocks: [textBlock],
    }

    render(
      <BlockEditor
        page={textPage as never}
        allPages={[textPage as never]}
        onUpdateBlock={onUpdateBlock}
      />,
    )

    const editor = screen.getByRole('textbox', { name: '输入正文' })
    selectEditableText(editor, 0, 3)
    await user.click(screen.getByRole('button', { name: '粗体' }))

    expect(onUpdateBlock).toHaveBeenLastCalledWith('b1', {
      ...textBlock,
      richText: [
        { text: '第一段', bold: true },
        { text: '文字' },
      ],
    })
  })

  it('opens the slash menu from the blank row and inserts a todo block', async () => {
    const user = userEvent.setup()
    const onInsert = vi.fn()

    render(
      <BlockEditor
        page={{ ...page, blocks: [] } as never}
        allPages={[page as never]}
        onUpdateBlock={vi.fn()}
        onInsert={onInsert}
      />,
    )

    const slashInput = screen.getByPlaceholderText('输入 / 打开命令菜单')
    await user.type(slashInput, '/待办')

    const option = screen.getByRole('button', { name: '待办列表' })
    expect(option).toBeInTheDocument()

    await user.click(option)
    expect(onInsert).toHaveBeenCalledWith('todo')
  })

  it('shows heading blocks in the slash menu', async () => {
    const user = userEvent.setup()
    const onInsert = vi.fn()

    render(
      <BlockEditor
        page={{ ...page, blocks: [] } as never}
        allPages={[page as never]}
        onUpdateBlock={vi.fn()}
        onInsert={onInsert}
      />,
    )

    const slashInput = screen.getByPlaceholderText('输入 / 打开命令菜单')
    await user.type(slashInput, '/标题')

    const option = screen.getByRole('button', { name: '标题 1' })
    expect(option).toBeInTheDocument()

    await user.click(option)
    expect(onInsert).toHaveBeenCalledWith('heading_1')
  })

  it('focuses a block inserted from the blank row slash menu', async () => {
    const user = userEvent.setup()

    function InsertFocusHarness() {
      const [currentPage, setCurrentPage] = useState({
        ...page,
        blocks: [],
      })

      return (
        <BlockEditor
          page={currentPage as never}
          allPages={[currentPage as never]}
          onUpdateBlock={vi.fn()}
          onInsert={(type) => {
            setCurrentPage((previousPage) => ({
              ...previousPage,
              blocks: [{ id: 'new-heading', type, text: '' }],
            }))

            return 'new-heading'
          }}
        />
      )
    }

    render(<InsertFocusHarness />)

    const input = screen.getByPlaceholderText('输入 / 打开命令菜单')
    await user.type(input, '/')
    await user.keyboard('{ArrowDown}{Enter}')

    await waitFor(() => {
      expect(screen.getByRole('textbox', { name: '输入正文' })).toHaveFocus()
    })
  })

  it('uses an insert handle for a plain empty paragraph block', async () => {
    const user = userEvent.setup()
    const onTurnInto = vi.fn()
    const textPage = {
      ...page,
      blocks: [{ id: 'b1', type: 'paragraph' as const, text: '' }],
    }

    render(
      <BlockEditor
        page={textPage as never}
        allPages={[textPage as never]}
        onUpdateBlock={vi.fn()}
        onTurnInto={onTurnInto}
      />,
    )

    expect(screen.queryByRole('button', { name: '拖动块' })).not.toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: '输入正文' })).toHaveAttribute(
      'data-placeholder',
      '输入 / 打开命令菜单',
    )

    await user.click(screen.getByRole('button', { name: '添加块' }))
    expect(screen.getByRole('button', { name: '文本' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '复制' })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '待办列表' }))

    expect(onTurnInto).toHaveBeenCalledWith('b1', 'todo')
  })

  it('opens the slash menu from an empty text block and turns that block into the picked type', async () => {
    const user = userEvent.setup()
    const onTurnInto = vi.fn()
    const textPage = {
      ...page,
      blocks: [{ id: 'b1', type: 'paragraph' as const, text: '' }],
    }

    render(
      <BlockEditor
        page={textPage as never}
        allPages={[textPage as never]}
        onUpdateBlock={vi.fn()}
        onTurnInto={onTurnInto}
      />,
    )

    await user.click(screen.getByRole('textbox', { name: '输入正文' }))
    await user.keyboard('/')

    expect(screen.getByText('基础块')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '待办列表' }))

    expect(onTurnInto).toHaveBeenCalledWith('b1', 'todo')
  })

  it('keeps the slash menu opened from a text block inside the viewport', async () => {
    const user = userEvent.setup()
    const originalInnerHeight = window.innerHeight
    const getBoundingClientRect = vi
      .spyOn(HTMLElement.prototype, 'getBoundingClientRect')
      .mockImplementation(function () {
        const element = this as HTMLElement

        if (element.classList.contains('editor-row')) {
          return {
            bottom: 332,
            height: 32,
            left: 0,
            right: 760,
            top: 300,
            width: 760,
            x: 0,
            y: 300,
            toJSON: () => ({}),
          } as DOMRect
        }

        if (element.classList.contains('slash-menu')) {
          return {
            bottom: 1040,
            height: 700,
            left: 0,
            right: 320,
            top: 340,
            width: 320,
            x: 0,
            y: 340,
            toJSON: () => ({}),
          } as DOMRect
        }

        return {
          bottom: 0,
          height: 0,
          left: 0,
          right: 0,
          top: 0,
          width: 0,
          x: 0,
          y: 0,
          toJSON: () => ({}),
        } as DOMRect
      })

    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 900 })

    try {
      const textPage = {
        ...page,
        blocks: [{ id: 'b1', type: 'paragraph' as const, text: '' }],
      }
      const { container } = render(
        <BlockEditor
          page={textPage as never}
          allPages={[textPage as never]}
          onUpdateBlock={vi.fn()}
        />,
      )

      await user.click(screen.getByRole('textbox', { name: '输入正文' }))
      await user.keyboard('/')

      await waitFor(() => {
        expect(container.querySelector('.slash-menu')).toHaveStyle({ maxHeight: '544px' })
      })
    } finally {
      getBoundingClientRect.mockRestore()
      Object.defineProperty(window, 'innerHeight', {
        configurable: true,
        value: originalInnerHeight,
      })
    }
  })

  it('renders a whiteboard card block', () => {
    const whiteboardPage = {
      ...page,
      blocks: [{ id: 'b5', type: 'whiteboard', boardId: 'board-1' }],
    }

    render(
      <BlockEditor
        page={whiteboardPage as never}
        allPages={[whiteboardPage as never]}
        boards={[
          {
            id: 'board-1',
            title: '流程草图',
            snapshot: {
              version: 1,
              elements: [],
              viewport: { x: 0, y: 0, zoom: 1 },
            },
            createdAt: '2026-06-17T00:00:00.000Z',
            updatedAt: '2026-06-17T00:00:00.000Z',
          },
        ] as never}
        onUpdateBlock={vi.fn()}
      />,
    )

    expect(screen.getByRole('button', { name: '打开白板 流程草图' })).toBeInTheDocument()
  })

  it('renders child page blocks with the referenced page icon', () => {
    const childPage = {
      id: 'page_child',
      title: '子页面',
      parentId: 'page_a',
      icon: '⭐',
      cover: null,
      createdAt: '',
      updatedAt: '',
      blocks: [],
    }
    const childPageHost = {
      ...page,
      blocks: [{ id: 'b5', type: 'child_page' as const, pageId: 'page_child' }],
    }

    const { container } = render(
      <BlockEditor
        page={childPageHost as never}
        allPages={[childPageHost as never, childPage as never]}
        onUpdateBlock={vi.fn()}
      />,
    )

    expect(container.querySelector('.child-page-icon')).toHaveTextContent('⭐')
  })

  it('renders a whiteboard card with its real updated label', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-18T12:30:00.000Z'))

    try {
      const whiteboardPage = {
        ...page,
        blocks: [{ id: 'b5', type: 'whiteboard', boardId: 'board-1' }],
      }

      render(
        <BlockEditor
          page={whiteboardPage as never}
          allPages={[whiteboardPage as never]}
          boards={[
            {
              id: 'board-1',
              title: '娴佺▼鑽夊浘',
              snapshot: {
                version: 1,
                elements: [],
                viewport: { x: 0, y: 0, zoom: 1 },
              },
              createdAt: '2026-06-17T00:00:00.000Z',
              updatedAt: '2026-06-18T10:00:00.000Z',
            },
          ] as never}
          onUpdateBlock={vi.fn()}
        />,
      )

      expect(screen.getByText('2 小时前更新')).toBeInTheDocument()
    } finally {
      vi.useRealTimers()
    }
  })

  it('renders a data table card block', () => {
    const dataTablePage = {
      ...page,
      blocks: [{ id: 'b6', type: 'data_table', databaseId: 'database-1' }],
    }

    render(
      <BlockEditor
        page={dataTablePage as never}
        allPages={[dataTablePage as never]}
        dataTables={[
          {
            id: 'database-1',
            title: '项目数据库',
            snapshot: { version: 1 },
            createdAt: '2026-06-22T00:00:00.000Z',
            updatedAt: '2026-06-22T00:00:00.000Z',
          },
        ] as never}
        onUpdateBlock={vi.fn()}
      />,
    )

    expect(screen.getByRole('button', { name: '打开数据表格 项目数据库' })).toBeInTheDocument()
  })

  it('renders an inline data table block', async () => {
    const dataTablePage = {
      ...page,
      blocks: [
        { id: 'b6', type: 'data_table', displayMode: 'inline', databaseId: 'database-1' },
      ],
    }
    const snapshot = createDefaultAppState()

    snapshot.database.name = '项目数据表'

    render(
      <MemoryRouter>
        <BlockEditor
          page={dataTablePage as never}
          allPages={[dataTablePage as never]}
          dataTables={[
            {
              id: 'database-1',
              title: '项目数据表',
              snapshot,
              createdAt: '2026-06-22T00:00:00.000Z',
              updatedAt: '2026-06-22T00:00:00.000Z',
            },
          ] as never}
          onUpdateBlock={vi.fn()}
          onUpdateDataTableSnapshot={vi.fn()}
        />
      </MemoryRouter>,
    )

    expect(await screen.findByRole('button', { name: '打开整页' })).toBeInTheDocument()
    expect(await screen.findByRole('heading', { name: '项目数据表' })).toBeInTheDocument()
  })

  it('keeps records visible when a legacy data table is shown inline', async () => {
    const dataTablePage = {
      ...page,
      blocks: [
        { id: 'b6', type: 'data_table', displayMode: 'inline', databaseId: 'database-1' },
      ],
    }
    const snapshot = createDefaultAppState()
    const record = {
      id: 'record_1',
      title: '保留的任务',
      values: {},
      createdAt: '2026-07-11T00:00:00.000Z',
      updatedAt: '2026-07-11T00:00:00.000Z',
    }

    snapshot.records[record.id] = record
    snapshot.recordPages[record.id] = {
      recordId: record.id,
      blockIds: [],
      updatedAt: record.updatedAt,
    }
    delete (snapshot as { version?: number }).version

    render(
      <MemoryRouter>
        <BlockEditor
          page={dataTablePage as never}
          allPages={[dataTablePage as never]}
          dataTables={[
            {
              id: 'database-1',
              title: '项目数据表',
              snapshot,
              createdAt: '2026-06-22T00:00:00.000Z',
              updatedAt: '2026-06-22T00:00:00.000Z',
            },
          ] as never}
          onUpdateBlock={vi.fn()}
          onUpdateDataTableSnapshot={vi.fn()}
        />
      </MemoryRouter>,
    )

    expect(await screen.findByText('保留的任务')).toBeInTheDocument()
  })

  it('lets an inline data table convert back to a card', async () => {
    const user = userEvent.setup()
    const onTurnInto = vi.fn()
    const dataTablePage = {
      ...page,
      blocks: [
        { id: 'b6', type: 'data_table', displayMode: 'inline', databaseId: 'database-1' },
      ],
    }

    render(
      <MemoryRouter>
        <BlockEditor
          page={dataTablePage as never}
          allPages={[dataTablePage as never]}
          dataTables={[
            {
              id: 'database-1',
              title: '项目数据表',
              snapshot: createDefaultAppState(),
              createdAt: '2026-06-22T00:00:00.000Z',
              updatedAt: '2026-06-22T00:00:00.000Z',
            },
          ] as never}
          onUpdateBlock={vi.fn()}
          onUpdateDataTableSnapshot={vi.fn()}
          onTurnInto={onTurnInto}
        />
      </MemoryRouter>,
    )

    await user.click(screen.getByRole('button', { name: '拖动块' }))
    await user.click(screen.getByRole('button', { name: '转换为数据表格卡片' }))

    expect(onTurnInto).toHaveBeenCalledWith('b6', 'data_table')
  })

  it('shows record and property counts on a data table card', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-22T12:00:00.000Z'))

    try {
      const dataTablePage = {
        ...page,
        blocks: [{ id: 'b6', type: 'data_table', databaseId: 'database-1' }],
      }

      render(
        <BlockEditor
          page={dataTablePage as never}
          allPages={[dataTablePage as never]}
          dataTables={[
            {
              id: 'database-1',
              title: '项目数据库',
              snapshot: {
                version: 1,
                database: {},
                properties: {
                  name: {},
                  status: {},
                },
                records: {
                  r1: {},
                  r2: {},
                },
              },
              createdAt: '2026-06-22T10:00:00.000Z',
              updatedAt: '2026-06-22T11:59:30.000Z',
            },
          ] as never}
          onUpdateBlock={vi.fn()}
        />,
      )

      expect(screen.getByText('2 条记录 · 2 个字段 · 刚刚更新')).toBeInTheDocument()
    } finally {
      vi.useRealTimers()
    }
  })

  it('shows the first record titles on a data table card', () => {
    const dataTablePage = {
      ...page,
      blocks: [{ id: 'b6', type: 'data_table', databaseId: 'database-1' }],
    }

    render(
      <BlockEditor
        page={dataTablePage as never}
        allPages={[dataTablePage as never]}
        dataTables={[
          {
            id: 'database-1',
            title: '项目数据库',
            snapshot: {
              version: 1,
              database: {},
              properties: { name: {} },
              records: {
                r1: { title: '需求池' },
                r2: { title: '本周计划' },
                r3: { title: '客户访谈' },
                r4: { title: '不应显示' },
              },
            },
            createdAt: '2026-06-22T10:00:00.000Z',
            updatedAt: '2026-06-22T11:59:30.000Z',
          },
        ] as never}
        onUpdateBlock={vi.fn()}
      />,
    )

    expect(screen.getAllByText('需求池').length).toBeGreaterThan(0)
    expect(screen.getAllByText('本周计划').length).toBeGreaterThan(0)
    expect(screen.getByText('客户访谈')).toBeInTheDocument()
    expect(screen.queryByText('不应显示')).not.toBeInTheDocument()
  })

  it('shows table fields and rows in the data table card preview', () => {
    const dataTablePage = {
      ...page,
      blocks: [{ id: 'b6', type: 'data_table', databaseId: 'database-1' }],
    }

    render(
      <BlockEditor
        page={dataTablePage as never}
        allPages={[dataTablePage as never]}
        dataTables={[
          {
            id: 'database-1',
            title: '项目数据库',
            snapshot: {
              version: 1,
              database: {},
              properties: {
                name: { name: '名称' },
                status: { name: '状态' },
                owner: { name: '负责人' },
                hidden: { name: '不应显示字段' },
              },
              records: {
                r1: { title: '需求池' },
                r2: { title: '本周计划' },
                r3: { title: '客户访谈' },
                r4: { title: '不应显示记录' },
              },
            },
            createdAt: '2026-06-22T10:00:00.000Z',
            updatedAt: '2026-06-22T11:59:30.000Z',
          },
        ] as never}
        onUpdateBlock={vi.fn()}
      />,
    )

    expect(screen.getByText('名称')).toBeInTheDocument()
    expect(screen.getByText('状态')).toBeInTheDocument()
    expect(screen.getAllByText('需求池').length).toBeGreaterThan(0)
    expect(screen.queryByText('不应显示字段')).not.toBeInTheDocument()
    expect(screen.queryByText('不应显示记录')).not.toBeInTheDocument()
  })

  it('commits plain text from the blank row when pressing enter', async () => {
    const user = userEvent.setup()
    const onInsertParagraph = vi.fn()

    render(
      <BlockEditor
        page={{ ...page, blocks: [] } as never}
        allPages={[page as never]}
        onUpdateBlock={vi.fn()}
        onInsertParagraph={onInsertParagraph}
      />,
    )

    const blankInput = screen.getByRole('textbox')
    await user.type(blankInput, 'First line{enter}')

    expect(onInsertParagraph).toHaveBeenCalledWith('First line')
  })

  it('creates a paragraph from the blank row when pressing Enter with no text', async () => {
    const user = userEvent.setup()
    const onInsert = vi.fn()

    render(
      <BlockEditor
        page={{ ...page, blocks: [] } as never}
        allPages={[page as never]}
        onUpdateBlock={vi.fn()}
        onInsert={onInsert}
      />,
    )

    await user.click(screen.getByRole('textbox'))
    await user.keyboard('{Enter}')

    expect(onInsert).toHaveBeenCalledWith('paragraph')
  })

  it('moves to a new paragraph when Enter is pressed in the blank trailing row', async () => {
    const user = userEvent.setup()

    function EmptyPageHarness() {
      const [currentPage, setCurrentPage] = useState({ ...page, blocks: [] as never[] })
      const nextBlockNumber = useRef(0)

      return (
        <BlockEditor
          page={currentPage as never}
          allPages={[currentPage as never]}
          onUpdateBlock={vi.fn()}
          onInsert={async (type) => {
            nextBlockNumber.current += 1
            const id = `empty_paragraph_${nextBlockNumber.current}`
            setCurrentPage((previousPage) => ({
              ...previousPage,
              blocks: [...previousPage.blocks, { id, type, text: '' }],
            }))
            return id
          }}
        />
      )
    }

    render(<EmptyPageHarness />)

    await user.click(screen.getByRole('textbox'))
    await user.keyboard('{Enter}')

    await waitFor(() => {
      const paragraphs = screen.getAllByRole('textbox', { name: '输入正文' })
      expect(paragraphs).toHaveLength(2)
      expect(paragraphs[1]).toHaveFocus()
    })
  })

  it('shows an upper drop indicator while dragging over the upper half of another block', () => {
    const onReorderBlock = vi.fn()
    const { container } = render(
      <BlockEditor
        page={page as never}
        allPages={[page as never]}
        onUpdateBlock={vi.fn()}
        onReorderBlock={onReorderBlock}
      />,
    )

    const rows = Array.from(container.querySelectorAll('.editor-row'))
    const handles = screen.getAllByRole('button', { name: '拖动块' })

    rows[1].getBoundingClientRect = () =>
      ({ top: 100, bottom: 140, height: 40 } as DOMRect)

    fireEvent.dragStart(handles[0])
    dragOverAt(rows[1], 110)

    expect(rows[0]).toHaveClass('editor-row-dragging')
    expect(rows[1]).toHaveClass('editor-row-drop-target-before')

    fireEvent.drop(rows[1])

    expect(onReorderBlock).toHaveBeenCalledWith('b1', 'b2', 'before')
    expect(rows[0]).not.toHaveClass('editor-row-dragging')
    expect(rows[1]).not.toHaveClass('editor-row-drop-target-before')
  })

  it('shows a lower drop indicator when dragging over the lower half of a block', () => {
    const onReorderBlock = vi.fn()
    const { container } = render(
      <BlockEditor
        page={page as never}
        allPages={[page as never]}
        onUpdateBlock={vi.fn()}
        onReorderBlock={onReorderBlock}
      />,
    )

    const rows = Array.from(container.querySelectorAll('.editor-row'))
    const handles = screen.getAllByRole('button', { name: '拖动块' })

    rows[1].getBoundingClientRect = () =>
      ({ top: 100, bottom: 140, height: 40 } as DOMRect)

    fireEvent.dragStart(handles[0])
    dragOverAt(rows[1], 132)

    expect(rows[1]).toHaveClass('editor-row-drop-target-after')

    fireEvent.drop(rows[1])

    expect(onReorderBlock).toHaveBeenCalledWith('b1', 'b2', 'after')
  })

  it('selects rows with a marquee that starts in the safe zone', () => {
    const { container } = render(
      <BlockEditor
        page={page as never}
        allPages={[page as never]}
        onUpdateBlock={vi.fn()}
        blockSelectionStartMode="safe_zone_only"
      />,
    )

    const surface = container.querySelector('.editor-surface')
    const rows = Array.from(container.querySelectorAll('.editor-row'))
    if (!(surface instanceof HTMLElement)) {
      throw new Error('Expected editor surface')
    }

    vi.spyOn(surface, 'getBoundingClientRect').mockReturnValue({
      left: 0,
      top: 0,
      right: 480,
      bottom: 320,
      width: 480,
      height: 320,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    } as DOMRect)

    rows.forEach((row, index) => {
      vi.spyOn(row, 'getBoundingClientRect').mockReturnValue({
        left: 0,
        top: 16 + index * 48,
        right: 420,
        bottom: 56 + index * 48,
        width: 420,
        height: 40,
        x: 0,
        y: 16 + index * 48,
        toJSON: () => ({}),
      } as DOMRect)
    })

    pointerDownAt(surface, 12, 18)
    pointerMoveAt(surface, 220, 120)

    expect(rows[0]).toHaveClass('editor-row-selected')
    expect(rows[1]).toHaveClass('editor-row-selected')
    expect(container.querySelector('.editor-selection-marquee')).toBeInTheDocument()

    pointerUpAt(surface, 220, 120)
    expect(container.querySelector('.editor-selection-marquee')).not.toBeInTheDocument()
  })

  it('starts marquee selection from the empty area below the final block when content selection is allowed', () => {
    const getBoundingClientRect = vi
      .spyOn(HTMLElement.prototype, 'getBoundingClientRect')
      .mockImplementation(function () {
        const element = this as HTMLElement

        if (element.classList.contains('editor-row')) {
          return {
            bottom: 120,
            height: 24,
            left: 0,
            right: 760,
            top: 96,
            width: 760,
            x: 0,
            y: 96,
            toJSON: () => ({}),
          } as DOMRect
        }

        return {
          bottom: 0,
          height: 0,
          left: 0,
          right: 0,
          top: 0,
          width: 0,
          x: 0,
          y: 0,
          toJSON: () => ({}),
        } as DOMRect
      })
    const textPage = {
      ...page,
      blocks: [{ id: 'b1', type: 'paragraph' as const, text: '' }],
    }

    try {
      const { container } = render(
        <BlockEditor
          page={textPage as never}
          allPages={[textPage as never]}
          onUpdateBlock={vi.fn()}
          blockSelectionStartMode="content_allowed"
        />,
      )
      const surface = container.querySelector('.editor-surface')
      const row = container.querySelector('.editor-row')
      if (!(surface instanceof HTMLElement) || !(row instanceof HTMLElement)) {
        throw new Error('Expected editor surface and row')
      }

      pointerDownAt(surface, 180, 180)
      pointerMoveAt(window, 220, 80)

      expect(row).toHaveClass('editor-row-selected')
    } finally {
      getBoundingClientRect.mockRestore()
    }
  })

  it('does not start marquee selection when resizing a simple table', () => {
    const { container } = render(
      <BlockEditor
        page={page as never}
        allPages={[page as never]}
        onUpdateBlock={vi.fn()}
        blockSelectionStartMode="content_allowed"
      />,
    )

    const surface = container.querySelector('.editor-surface')
    const resizeHandle = container.querySelector('.table-column-resize-handle')
    if (!(surface instanceof HTMLElement) || !(resizeHandle instanceof HTMLElement)) {
      throw new Error('Expected editor surface and table resize handle')
    }

    pointerDownAt(resizeHandle, 160, 180)
    pointerMoveAt(surface, 280, 300)

    expect(container.querySelector('.editor-selection-marquee')).not.toBeInTheDocument()
  })

  it('keeps every block in the marquee range while the page scrolls', () => {
    const originalScrollY = Object.getOwnPropertyDescriptor(window, 'scrollY')
    let scrollY = 0
    Object.defineProperty(window, 'scrollY', {
      configurable: true,
      get: () => scrollY,
    })

    const { container } = render(
      <BlockEditor
        page={page as never}
        allPages={[page as never]}
        onUpdateBlock={vi.fn()}
        blockSelectionStartMode="content_allowed"
      />,
    )
    const surface = container.querySelector('.editor-surface')
    const rows = Array.from(container.querySelectorAll<HTMLElement>('.editor-row'))
    if (!(surface instanceof HTMLElement)) {
      throw new Error('Expected editor surface')
    }

    vi.spyOn(surface, 'getBoundingClientRect').mockReturnValue({
      left: 0,
      top: 0,
      right: 480,
      bottom: 320,
      width: 480,
      height: 320,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    } as DOMRect)
    rows.forEach((row, index) => {
      vi.spyOn(row, 'getBoundingClientRect').mockImplementation(() => {
        const top = 16 + index * 48 - scrollY
        return {
          left: 0,
          top,
          right: 420,
          bottom: top + 40,
          width: 420,
          height: 40,
          x: 0,
          y: top,
          toJSON: () => ({}),
        } as DOMRect
      })
    })

    try {
      pointerDownAt(surface, 180, 18)
      pointerMoveAt(window, 280, 100)

      scrollY = 100
      fireEvent.scroll(window)
      pointerMoveAt(window, 280, 100)

      rows.forEach((row) => {
        expect(row).toHaveClass('editor-row-selected')
      })
    } finally {
      if (originalScrollY) {
        Object.defineProperty(window, 'scrollY', originalScrollY)
      } else {
        Reflect.deleteProperty(window, 'scrollY')
      }
    }
  })

  it('starts marquee selection from a dedicated block gutter without handing the drag to native text selection', () => {
    const { container } = render(
      <BlockEditor
        page={page as never}
        allPages={[page as never]}
        onUpdateBlock={vi.fn()}
        blockSelectionStartMode="safe_zone_only"
      />,
    )

    const surface = container.querySelector('.editor-surface')
    const rows = Array.from(container.querySelectorAll('.editor-row'))
    const gutters = Array.from(container.querySelectorAll('.block-selection-gutter'))
    if (!(surface instanceof HTMLElement)) {
      throw new Error('Expected editor surface')
    }

    expect(gutters).toHaveLength(page.blocks.length)

    vi.spyOn(surface, 'getBoundingClientRect').mockReturnValue({
      left: 0,
      top: 0,
      right: 480,
      bottom: 320,
      width: 480,
      height: 320,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    } as DOMRect)

    rows.forEach((row, index) => {
      vi.spyOn(row, 'getBoundingClientRect').mockReturnValue({
        left: 0,
        top: 16 + index * 48,
        right: 420,
        bottom: 56 + index * 48,
        width: 420,
        height: 40,
        x: 0,
        y: 16 + index * 48,
        toJSON: () => ({}),
      } as DOMRect)
    })

    const pointerDown = createEvent.pointerDown(gutters[0], { button: 0, clientX: 12, clientY: 18 })
    fireEvent(gutters[0], pointerDown)
    pointerMoveAt(window, 220, 120)

    expect(pointerDown.defaultPrevented).toBe(true)
    expect(rows[0]).toHaveClass('editor-row-selected')
    expect(rows[1]).toHaveClass('editor-row-selected')
  })

  it('starts marquee selection from the page side area outside a centered body', () => {
    function SelectionHost() {
      const selectionHostRef = useRef<HTMLDivElement>(null)

      return (
        <div ref={selectionHostRef} data-testid="selection-host">
          <BlockEditor
            page={page as never}
            allPages={[page as never]}
            onUpdateBlock={vi.fn()}
            blockSelectionStartMode="safe_zone_only"
            selectionHostRef={selectionHostRef}
          />
        </div>
      )
    }

    const { container } = render(<SelectionHost />)
    const host = screen.getByTestId('selection-host')
    const surface = container.querySelector('.editor-surface')
    const rows = Array.from(container.querySelectorAll('.editor-row'))
    if (!(surface instanceof HTMLElement)) {
      throw new Error('Expected editor surface')
    }

    vi.spyOn(surface, 'getBoundingClientRect').mockReturnValue({
      left: 120,
      top: 0,
      right: 880,
      bottom: 320,
      width: 760,
      height: 320,
      x: 120,
      y: 0,
      toJSON: () => ({}),
    } as DOMRect)

    rows.forEach((row, index) => {
      vi.spyOn(row, 'getBoundingClientRect').mockReturnValue({
        left: 120,
        top: 16 + index * 48,
        right: 840,
        bottom: 56 + index * 48,
        width: 720,
        height: 40,
        x: 120,
        y: 16 + index * 48,
        toJSON: () => ({}),
      } as DOMRect)
    })

    fireEvent.pointerDown(host, { button: 0, clientX: 28, clientY: 18 })
    pointerMoveAt(window, 220, 120)

    expect(rows[0]).toHaveClass('editor-row-selected')
    expect(rows[1]).toHaveClass('editor-row-selected')
  })

  it('clears a marquee selection when clicking a text block in safe-zone mode', () => {
    const { container } = render(
      <BlockEditor
        page={page as never}
        allPages={[page as never]}
        onUpdateBlock={vi.fn()}
        blockSelectionStartMode="safe_zone_only"
      />,
    )

    const surface = container.querySelector('.editor-surface')
    const rows = Array.from(container.querySelectorAll('.editor-row'))
    const gutter = container.querySelector('.block-selection-gutter')
    const textBlock = screen.getByRole('textbox', { name: '输入正文' })
    if (!(surface instanceof HTMLElement) || !(gutter instanceof HTMLElement)) {
      throw new Error('Expected selection surface and gutter')
    }

    vi.spyOn(surface, 'getBoundingClientRect').mockReturnValue({
      left: 0,
      top: 0,
      right: 480,
      bottom: 320,
      width: 480,
      height: 320,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    } as DOMRect)

    rows.forEach((row, index) => {
      vi.spyOn(row, 'getBoundingClientRect').mockReturnValue({
        left: 0,
        top: 16 + index * 48,
        right: 420,
        bottom: 56 + index * 48,
        width: 420,
        height: 40,
        x: 0,
        y: 16 + index * 48,
        toJSON: () => ({}),
      } as DOMRect)
    })

    pointerDownAt(gutter, 12, 18)
    pointerMoveAt(window, 220, 120)
    pointerUpAt(window, 220, 120)
    expect(container.querySelector('.editor-row-selected')).toBeInTheDocument()

    fireEvent.pointerDown(textBlock, { button: 0, clientX: 180, clientY: 18 })
    fireEvent.pointerUp(textBlock, { button: 0, clientX: 180, clientY: 18 })

    expect(container.querySelector('.editor-row-selected')).not.toBeInTheDocument()
  })

  it('deletes a finished marquee selection with the Delete key', () => {
    const onDeleteBlocks = vi.fn()
    const { container } = render(
      <BlockEditor
        page={page as never}
        allPages={[page as never]}
        onUpdateBlock={vi.fn()}
        onDeleteBlocks={onDeleteBlocks}
        blockSelectionStartMode="safe_zone_only"
      />,
    )

    const surface = container.querySelector('.editor-surface')
    const rows = Array.from(container.querySelectorAll('.editor-row'))
    const gutter = container.querySelector('.block-selection-gutter')
    if (!(surface instanceof HTMLElement) || !(gutter instanceof HTMLElement)) {
      throw new Error('Expected selection surface and gutter')
    }

    vi.spyOn(surface, 'getBoundingClientRect').mockReturnValue({
      left: 0,
      top: 0,
      right: 480,
      bottom: 320,
      width: 480,
      height: 320,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    } as DOMRect)

    rows.forEach((row, index) => {
      vi.spyOn(row, 'getBoundingClientRect').mockReturnValue({
        left: 0,
        top: 16 + index * 48,
        right: 420,
        bottom: 56 + index * 48,
        width: 420,
        height: 40,
        x: 0,
        y: 16 + index * 48,
        toJSON: () => ({}),
      } as DOMRect)
    })

    pointerDownAt(gutter, 12, 18)
    pointerMoveAt(window, 220, 120)
    pointerUpAt(window, 220, 120)

    expect(surface).toHaveFocus()
    fireEvent.keyDown(surface, { key: 'Delete' })

    expect(onDeleteBlocks).toHaveBeenCalledWith(['b1', 'b2', 'b3'])
  })

  it('copies marquee-selected blocks and pastes them into the trailing empty row', async () => {
    const copyPage = { ...page, blocks: page.blocks.slice(0, 2) }
    const onPasteBlocks = vi.fn()
    const { container } = render(
      <BlockEditor
        page={copyPage as never}
        allPages={[copyPage as never]}
        onUpdateBlock={vi.fn()}
        onPasteBlocks={onPasteBlocks}
        blockSelectionStartMode="safe_zone_only"
      />,
    )

    const surface = container.querySelector('.editor-surface')
    const gutter = container.querySelector('.block-selection-gutter')
    const rows = Array.from(container.querySelectorAll('.editor-row'))
    const trailingInput = container.querySelector('.empty-block-input')
    if (
      !(surface instanceof HTMLElement) ||
      !(gutter instanceof HTMLElement) ||
      !(trailingInput instanceof HTMLInputElement)
    ) {
      throw new Error('Expected selection surface and trailing input')
    }

    vi.spyOn(surface, 'getBoundingClientRect').mockReturnValue({
      left: 0,
      top: 0,
      right: 480,
      bottom: 320,
      width: 480,
      height: 320,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    } as DOMRect)
    rows.forEach((row, index) => {
      vi.spyOn(row, 'getBoundingClientRect').mockReturnValue({
        left: 0,
        top: 16 + index * 48,
        right: 420,
        bottom: 56 + index * 48,
        width: 420,
        height: 40,
        x: 0,
        y: 16 + index * 48,
        toJSON: () => ({}),
      } as DOMRect)
    })

    pointerDownAt(gutter, 12, 18)
    pointerMoveAt(window, 220, 110)
    pointerUpAt(window, 220, 110)

    const clipboardValues = new Map<string, string>()
    fireEvent.copy(surface, {
      clipboardData: {
        setData: (type: string, value: string) => clipboardValues.set(type, value),
      },
    })

    const copiedBlocks = JSON.parse(clipboardValues.get('application/x-zhiqi-blocks+json') ?? 'null')
    expect(copiedBlocks).toMatchObject([
      { id: 'b1', type: 'paragraph', text: '第一段' },
      { id: 'b2', type: 'todo', text: '待办事项', checked: true },
    ])

    fireEvent.paste(trailingInput, {
      clipboardData: {
        files: [],
        items: [],
        getData: (type: string) => clipboardValues.get(type) ?? '',
      },
    })

    await waitFor(() => {
      expect(onPasteBlocks).toHaveBeenCalledWith(
        null,
        [
          expect.objectContaining({ type: 'paragraph', text: '第一段', id: expect.not.stringMatching(/^b1$/) }),
          expect.objectContaining({ type: 'todo', text: '待办事项', checked: true, id: expect.not.stringMatching(/^b2$/) }),
        ],
      )
    })
  })

  it('does not start selection from the content area in safe-zone mode, but does in content-allowed mode', () => {
    const first = render(
      <BlockEditor
        page={page as never}
        allPages={[page as never]}
        onUpdateBlock={vi.fn()}
        blockSelectionStartMode="safe_zone_only"
      />,
    )

    const firstSurface = first.container.querySelector('.editor-surface')
    if (!(firstSurface instanceof HTMLElement)) {
      throw new Error('Expected first editor surface')
    }

    pointerDownAt(firstSurface, 180, 18)
    pointerMoveAt(firstSurface, 280, 120)
    expect(first.container.querySelector('.editor-row-selected')).not.toBeInTheDocument()
    pointerUpAt(firstSurface, 280, 120)

    const second = render(
      <BlockEditor
        page={page as never}
        allPages={[page as never]}
        onUpdateBlock={vi.fn()}
        blockSelectionStartMode="content_allowed"
      />,
    )

    const secondSurface = second.container.querySelector('.editor-surface')
    const secondRows = Array.from(second.container.querySelectorAll('.editor-row'))
    if (!(secondSurface instanceof HTMLElement)) {
      throw new Error('Expected second editor surface')
    }

    vi.spyOn(secondSurface, 'getBoundingClientRect').mockReturnValue({
      left: 0,
      top: 0,
      right: 480,
      bottom: 320,
      width: 480,
      height: 320,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    } as DOMRect)

    secondRows.forEach((row, index) => {
      vi.spyOn(row, 'getBoundingClientRect').mockReturnValue({
        left: 0,
        top: 16 + index * 48,
        right: 420,
        bottom: 56 + index * 48,
        width: 420,
        height: 40,
        x: 0,
        y: 16 + index * 48,
        toJSON: () => ({}),
      } as DOMRect)
    })

    pointerDownAt(secondSurface, 180, 18)
    pointerMoveAt(secondSurface, 280, 120)

    expect(secondRows[0]).toHaveClass('editor-row-selected')
    pointerUpAt(secondSurface, 280, 120)
  })

  it('preserves native text selection in editable content when content selection is allowed', () => {
    const { container } = render(
      <BlockEditor
        page={page as never}
        allPages={[page as never]}
        onUpdateBlock={vi.fn()}
        blockSelectionStartMode="content_allowed"
      />,
    )

    const surface = container.querySelector('.editor-surface')
    const rows = Array.from(container.querySelectorAll('.editor-row'))
    const editable = screen.getByRole('textbox', { name: '输入正文' })
    if (!(surface instanceof HTMLElement)) {
      throw new Error('Expected editor surface')
    }

    vi.spyOn(surface, 'getBoundingClientRect').mockReturnValue({
      left: 0,
      top: 0,
      right: 480,
      bottom: 320,
      width: 480,
      height: 320,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    } as DOMRect)

    rows.forEach((row, index) => {
      vi.spyOn(row, 'getBoundingClientRect').mockReturnValue({
        left: 0,
        top: 16 + index * 48,
        right: 420,
        bottom: 56 + index * 48,
        width: 420,
        height: 40,
        x: 0,
        y: 16 + index * 48,
        toJSON: () => ({}),
      } as DOMRect)
    })

    const pointerDown = createEvent.pointerDown(editable, { button: 0, clientX: 180, clientY: 18 })
    fireEvent(editable, pointerDown)
    pointerMoveAt(window, 280, 40)

    expect(pointerDown.defaultPrevented).toBe(false)
    expect(container.querySelector('.editor-row-selected')).not.toBeInTheDocument()
    pointerUpAt(window, 280, 120)
  })

  it('keeps a text range across adjacent rich-text blocks in safe selection mode', () => {
    const selectionPage = {
      ...page,
      blocks: [
        { id: 'selection_first', type: 'paragraph' as const, text: '第一段文字' },
        { id: 'selection_second', type: 'paragraph' as const, text: '第二段文字' },
      ],
    }
    const { container } = render(
      <BlockEditor
        page={selectionPage as never}
        allPages={[selectionPage as never]}
        onUpdateBlock={vi.fn()}
        blockSelectionStartMode="safe_zone_only"
      />,
    )

    const surface = container.querySelector('.editor-surface')
    const rows = Array.from(container.querySelectorAll('.editor-row'))
    const editables = screen.getAllByRole('textbox', { name: '输入正文' })
    if (!(surface instanceof HTMLElement) || editables.length < 2) {
      throw new Error('Expected two rich-text blocks')
    }

    vi.spyOn(surface, 'getBoundingClientRect').mockReturnValue({
      left: 0,
      top: 0,
      right: 480,
      bottom: 320,
      width: 480,
      height: 320,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    } as DOMRect)
    rows.forEach((row, index) => {
      vi.spyOn(row, 'getBoundingClientRect').mockReturnValue({
        left: 0,
        top: 16 + index * 48,
        right: 420,
        bottom: 56 + index * 48,
        width: 420,
        height: 40,
        x: 0,
        y: 16 + index * 48,
        toJSON: () => ({}),
      } as DOMRect)
    })

    const firstEditable = editables[0]
    const secondEditable = editables[1]
    Object.defineProperty(document, 'elementFromPoint', {
      configurable: true,
      value: (_x: number, y: number) => (y < 64 ? firstEditable : secondEditable),
    })
    const caretRangeFromPoint = vi.fn((_x: number, y: number) => {
      const range = document.createRange()
      range.selectNodeContents(y < 64 ? firstEditable : secondEditable)
      range.collapse(y < 64)
      return range
    })
    Object.defineProperty(document, 'caretRangeFromPoint', {
      configurable: true,
      value: caretRangeFromPoint,
    })

    pointerDownAt(firstEditable, 180, 20)
    pointerMoveAt(window, 280, 82)

    expect(container.querySelector('.editor-row-selected')).not.toBeInTheDocument()
    expect(caretRangeFromPoint).toHaveBeenCalledTimes(2)
    expect(window.getSelection()?.toString()).toContain(firstEditable.textContent)
    expect(window.getSelection()?.toString()).toContain(secondEditable.textContent)
    pointerUpAt(window, 280, 82)
  })

  it('switches to marquee selection when an editable drag leaves its starting block row', () => {
    const { container } = render(
      <BlockEditor
        page={page as never}
        allPages={[page as never]}
        onUpdateBlock={vi.fn()}
        blockSelectionStartMode="content_allowed"
      />,
    )

    const surface = container.querySelector('.editor-surface')
    const rows = Array.from(container.querySelectorAll('.editor-row'))
    const editable = screen.getByRole('textbox', { name: '输入正文' })
    if (!(surface instanceof HTMLElement)) {
      throw new Error('Expected editor surface')
    }

    vi.spyOn(surface, 'getBoundingClientRect').mockReturnValue({
      left: 0,
      top: 0,
      right: 480,
      bottom: 320,
      width: 480,
      height: 320,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    } as DOMRect)

    rows.forEach((row, index) => {
      vi.spyOn(row, 'getBoundingClientRect').mockReturnValue({
        left: 0,
        top: 16 + index * 48,
        right: 420,
        bottom: 56 + index * 48,
        width: 420,
        height: 40,
        x: 0,
        y: 16 + index * 48,
        toJSON: () => ({}),
      } as DOMRect)
    })

    pointerDownAt(editable, 180, 18)
    pointerMoveAt(window, 280, 120)

    expect(rows[0]).toHaveClass('editor-row-selected')
    expect(rows[1]).toHaveClass('editor-row-selected')
    pointerUpAt(window, 280, 120)
  })

  it('clears the selection with Escape, plain content click, and page change', async () => {
    const user = userEvent.setup()
    const firstPage = page
    const secondPage = { ...page, id: 'page_b', blocks: page.blocks.slice(0, 2) }
    const { container, rerender } = render(
      <BlockEditor
        page={firstPage as never}
        allPages={[firstPage as never, secondPage as never]}
        onUpdateBlock={vi.fn()}
        blockSelectionStartMode="content_allowed"
      />,
    )

    const surface = container.querySelector('.editor-surface')
    const rows = Array.from(container.querySelectorAll('.editor-row'))
    if (!(surface instanceof HTMLElement)) {
      throw new Error('Expected editor surface')
    }

    vi.spyOn(surface, 'getBoundingClientRect').mockReturnValue({
      left: 0,
      top: 0,
      right: 480,
      bottom: 320,
      width: 480,
      height: 320,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    } as DOMRect)

    rows.forEach((row, index) => {
      vi.spyOn(row, 'getBoundingClientRect').mockReturnValue({
        left: 0,
        top: 16 + index * 48,
        right: 420,
        bottom: 56 + index * 48,
        width: 420,
        height: 40,
        x: 0,
        y: 16 + index * 48,
        toJSON: () => ({}),
      } as DOMRect)
    })

    pointerDownAt(surface, 180, 18)
    pointerMoveAt(surface, 280, 103)
    pointerUpAt(surface, 280, 103)
    expect(container.querySelector('.editor-row-selected')).toBeInTheDocument()

    fireEvent.keyDown(surface, { key: 'Escape' })
    expect(container.querySelector('.editor-row-selected')).not.toBeInTheDocument()

    pointerDownAt(surface, 180, 18)
    pointerMoveAt(surface, 280, 103)
    pointerUpAt(surface, 280, 103)
    expect(container.querySelector('.editor-row-selected')).toBeInTheDocument()

    await user.click(screen.getByRole('textbox', { name: '输入正文' }))
    expect(container.querySelector('.editor-row-selected')).not.toBeInTheDocument()

    pointerDownAt(surface, 180, 18)
    pointerMoveAt(surface, 280, 103)
    pointerUpAt(surface, 280, 103)
    expect(container.querySelector('.editor-row-selected')).toBeInTheDocument()

    rerender(
      <BlockEditor
        page={secondPage as never}
        allPages={[firstPage as never, secondPage as never]}
        onUpdateBlock={vi.fn()}
        blockSelectionStartMode="content_allowed"
      />,
    )

    expect(container.querySelector('.editor-row-selected')).not.toBeInTheDocument()
  })

  it('deletes the selected block group when pressing Delete', () => {
    const onDeleteBlocks = vi.fn()
    const { container } = render(
      <BlockEditor
        page={page as never}
        allPages={[page as never]}
        onUpdateBlock={vi.fn()}
        onDeleteBlocks={onDeleteBlocks}
        blockSelectionStartMode="content_allowed"
      />,
    )

    const surface = container.querySelector('.editor-surface')
    const rows = Array.from(container.querySelectorAll('.editor-row'))
    if (!(surface instanceof HTMLElement)) {
      throw new Error('Expected editor surface')
    }

    vi.spyOn(surface, 'getBoundingClientRect').mockReturnValue({
      left: 0,
      top: 0,
      right: 480,
      bottom: 320,
      width: 480,
      height: 320,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    } as DOMRect)

    rows.forEach((row, index) => {
      vi.spyOn(row, 'getBoundingClientRect').mockReturnValue({
        left: 0,
        top: 16 + index * 48,
        right: 420,
        bottom: 56 + index * 48,
        width: 420,
        height: 40,
        x: 0,
        y: 16 + index * 48,
        toJSON: () => ({}),
      } as DOMRect)
    })

    pointerDownAt(surface, 180, 18)
    pointerMoveAt(surface, 280, 120)
    pointerUpAt(surface, 280, 120)

    fireEvent.keyDown(surface, { key: 'Delete' })

    expect(onDeleteBlocks).toHaveBeenCalledWith(['b1', 'b2', 'b3'])
  })

  it('reorders the selected block group when dragging from a selected handle', () => {
    const onReorderBlockGroup = vi.fn()
    const onReorderBlock = vi.fn()
    const { container } = render(
      <BlockEditor
        page={page as never}
        allPages={[page as never]}
        onUpdateBlock={vi.fn()}
        onReorderBlock={onReorderBlock}
        onReorderBlockGroup={onReorderBlockGroup}
        blockSelectionStartMode="content_allowed"
      />,
    )

    const surface = container.querySelector('.editor-surface')
    const rows = Array.from(container.querySelectorAll('.editor-row'))
    const handles = screen.getAllByRole('button', { name: '拖动块' })
    if (!(surface instanceof HTMLElement)) {
      throw new Error('Expected editor surface')
    }

    vi.spyOn(surface, 'getBoundingClientRect').mockReturnValue({
      left: 0,
      top: 0,
      right: 480,
      bottom: 320,
      width: 480,
      height: 320,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    } as DOMRect)

    rows.forEach((row, index) => {
      vi.spyOn(row, 'getBoundingClientRect').mockReturnValue({
        left: 0,
        top: 16 + index * 48,
        right: 420,
        bottom: 56 + index * 48,
        width: 420,
        height: 40,
        x: 0,
        y: 16 + index * 48,
        toJSON: () => ({}),
      } as DOMRect)
    })

    rows[3].getBoundingClientRect = () => ({ top: 180, bottom: 220, height: 40 } as DOMRect)

    pointerDownAt(surface, 180, 18)
    pointerMoveAt(surface, 280, 120)
    pointerUpAt(surface, 280, 120)

    fireEvent.dragStart(handles[0])
    dragOverAt(rows[3], 190)
    fireEvent.drop(rows[3])

    expect(onReorderBlockGroup).toHaveBeenCalledWith(['b1', 'b2', 'b3'], 'b4', 'before')
    expect(onReorderBlock).not.toHaveBeenCalled()
  })

  it('keeps single-block drag when the handle belongs to an unselected row', () => {
    const onReorderBlockGroup = vi.fn()
    const onReorderBlock = vi.fn()
    const { container } = render(
      <BlockEditor
        page={page as never}
        allPages={[page as never]}
        onUpdateBlock={vi.fn()}
        onReorderBlock={onReorderBlock}
        onReorderBlockGroup={onReorderBlockGroup}
        blockSelectionStartMode="content_allowed"
      />,
    )

    const surface = container.querySelector('.editor-surface')
    const rows = Array.from(container.querySelectorAll('.editor-row'))
    const handles = screen.getAllByRole('button', { name: '拖动块' })
    if (!(surface instanceof HTMLElement)) {
      throw new Error('Expected editor surface')
    }

    vi.spyOn(surface, 'getBoundingClientRect').mockReturnValue({
      left: 0,
      top: 0,
      right: 480,
      bottom: 320,
      width: 480,
      height: 320,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    } as DOMRect)

    rows.forEach((row, index) => {
      vi.spyOn(row, 'getBoundingClientRect').mockReturnValue({
        left: 0,
        top: 16 + index * 48,
        right: 420,
        bottom: 56 + index * 48,
        width: 420,
        height: 40,
        x: 0,
        y: 16 + index * 48,
        toJSON: () => ({}),
      } as DOMRect)
    })

    rows[0].getBoundingClientRect = () => ({ top: 60, bottom: 100, height: 40 } as DOMRect)

    pointerDownAt(surface, 180, 18)
    pointerMoveAt(surface, 280, 120)
    pointerUpAt(surface, 280, 120)

    fireEvent.dragStart(handles[3])
    dragOverAt(rows[0], 70)
    fireEvent.drop(rows[0])

    expect(onReorderBlock).toHaveBeenCalledWith('b4', 'b1', 'before')
    expect(onReorderBlockGroup).not.toHaveBeenCalled()
  })

  it('creates a paragraph block after a text block when pressing Enter', () => {
    const onInsertBlockAfter = vi.fn(() => 'new-block')

    render(
      <BlockEditor
        page={page as never}
        allPages={[page as never]}
        onUpdateBlock={vi.fn()}
        onInsertBlockAfter={onInsertBlockAfter}
      />,
    )

    fireEvent.keyDown(getParagraphEditorByText('第一段'), { key: 'Enter' })

    expect(onInsertBlockAfter).toHaveBeenCalledWith('b1', 'paragraph')
  })

  it('keeps multiline text when pressing Shift+Enter in a text block', () => {
    const onInsertBlockAfter = vi.fn()

    render(
      <BlockEditor
        page={page as never}
        allPages={[page as never]}
        onUpdateBlock={vi.fn()}
        onInsertBlockAfter={onInsertBlockAfter}
      />,
    )

    fireEvent.keyDown(getParagraphEditorByText('第一段'), { key: 'Enter', shiftKey: true })

    expect(onInsertBlockAfter).not.toHaveBeenCalled()
  })

  it('focuses the blank row when pressing ArrowDown at the end of the final text block', () => {
    const textPage = {
      ...page,
      blocks: [{ id: 'b1', type: 'paragraph' as const, text: '最后一段' }],
    }

    render(
      <BlockEditor
        page={textPage as never}
        allPages={[textPage as never]}
        onUpdateBlock={vi.fn()}
      />,
    )

    const editor = screen.getByRole('textbox', { name: '输入正文' })
    placeCaretAtEnd(editor)
    fireEvent.keyDown(editor, { key: 'ArrowDown' })

    expect(screen.getByPlaceholderText('输入 / 打开命令菜单')).toHaveFocus()
  })

  it('focuses the blank row when clicking the empty area below the editor content', () => {
    const getBoundingClientRect = vi
      .spyOn(HTMLElement.prototype, 'getBoundingClientRect')
      .mockImplementation(function () {
        const element = this as HTMLElement

        if (element.classList.contains('empty-block-row')) {
          return {
            bottom: 120,
            height: 24,
            left: 0,
            right: 760,
            top: 96,
            width: 760,
            x: 0,
            y: 96,
            toJSON: () => ({}),
          } as DOMRect
        }

        if (element.classList.contains('editor-row')) {
          return {
            bottom: 80,
            height: 32,
            left: 0,
            right: 760,
            top: 48,
            width: 760,
            x: 0,
            y: 48,
            toJSON: () => ({}),
          } as DOMRect
        }

        return {
          bottom: 0,
          height: 0,
          left: 0,
          right: 0,
          top: 0,
          width: 0,
          x: 0,
          y: 0,
          toJSON: () => ({}),
        } as DOMRect
      })
    const textPage = {
      ...page,
      blocks: [{ id: 'b1', type: 'paragraph' as const, text: '最后一段' }],
    }
    try {
      const { container } = render(
        <BlockEditor
          page={textPage as never}
          allPages={[textPage as never]}
          onUpdateBlock={vi.fn()}
        />,
      )

      const surface = container.querySelector('.editor-surface')
      if (!(surface instanceof HTMLElement)) {
        throw new Error('Expected editor surface')
      }

      fireEvent.pointerDown(surface, { clientY: 180 })

      expect(screen.getByPlaceholderText('输入 / 打开命令菜单')).toHaveFocus()
    } finally {
      getBoundingClientRect.mockRestore()
    }
  })

  it('focuses the blank row when pressing ArrowDown at the end of the final list block', () => {
    const listPage = {
      ...page,
      blocks: [{ id: 'b1', type: 'bulleted_list' as const, items: ['最后一项'] }],
    }

    render(
      <BlockEditor
        page={listPage as never}
        allPages={[listPage as never]}
        onUpdateBlock={vi.fn()}
      />,
    )

    const editor = screen.getByRole('textbox', { name: '每行一个列表项' })
    placeCaretAtEnd(editor)
    fireEvent.keyDown(editor, { key: 'ArrowDown' })

    expect(screen.getByPlaceholderText('输入 / 打开命令菜单')).toHaveFocus()
  })

  it('focuses the trailing insert-mode paragraph when clicking the empty area below it', () => {
    const getBoundingClientRect = vi
      .spyOn(HTMLElement.prototype, 'getBoundingClientRect')
      .mockImplementation(function () {
        const element = this as HTMLElement

        if (element.classList.contains('editor-row')) {
          return {
            bottom: 120,
            height: 24,
            left: 0,
            right: 760,
            top: 96,
            width: 760,
            x: 0,
            y: 96,
            toJSON: () => ({}),
          } as DOMRect
        }

        return {
          bottom: 0,
          height: 0,
          left: 0,
          right: 0,
          top: 0,
          width: 0,
          x: 0,
          y: 0,
          toJSON: () => ({}),
        } as DOMRect
      })
    const textPage = {
      ...page,
      blocks: [{ id: 'b1', type: 'paragraph' as const, text: '' }],
    }
    try {
      const { container } = render(
        <BlockEditor
          page={textPage as never}
          allPages={[textPage as never]}
          onUpdateBlock={vi.fn()}
        />,
      )

      const surface = container.querySelector('.editor-surface')
      if (!(surface instanceof HTMLElement)) {
        throw new Error('Expected editor surface')
      }

      fireEvent.pointerDown(surface, { clientY: 180 })

      expect(screen.getByRole('textbox', { name: '输入正文' })).toHaveFocus()
    } finally {
      getBoundingClientRect.mockRestore()
    }
  })

  it('does not jump to the final blank row when clicking a gap between earlier blank rows', () => {
    const getBoundingClientRect = vi
      .spyOn(HTMLElement.prototype, 'getBoundingClientRect')
      .mockImplementation(function () {
        const element = this as HTMLElement

        if (element.classList.contains('editor-row')) {
          const blockId = element.dataset.blockId

          if (blockId === 'b1') {
            return {
              bottom: 80,
              height: 24,
              left: 0,
              right: 760,
              top: 56,
              width: 760,
              x: 0,
              y: 56,
              toJSON: () => ({}),
            } as DOMRect
          }

          if (blockId === 'b2') {
            return {
              bottom: 160,
              height: 24,
              left: 0,
              right: 760,
              top: 136,
              width: 760,
              x: 0,
              y: 136,
              toJSON: () => ({}),
            } as DOMRect
          }
        }

        return {
          bottom: 0,
          height: 0,
          left: 0,
          right: 0,
          top: 0,
          width: 0,
          x: 0,
          y: 0,
          toJSON: () => ({}),
        } as DOMRect
      })
    const textPage = {
      ...page,
      blocks: [
        { id: 'b1', type: 'paragraph' as const, text: '' },
        { id: 'b2', type: 'paragraph' as const, text: '' },
      ],
    }

    try {
      const { container } = render(
        <BlockEditor
          page={textPage as never}
          allPages={[textPage as never]}
          onUpdateBlock={vi.fn()}
        />,
      )

      const surface = container.querySelector('.editor-surface')
      const firstEditor = container.querySelector(
        '.editor-row[data-block-id="b1"] [role="textbox"]',
      )
      const secondEditor = container.querySelector(
        '.editor-row[data-block-id="b2"] [role="textbox"]',
      )

      if (!(surface instanceof HTMLElement) || !(firstEditor instanceof HTMLElement) || !(secondEditor instanceof HTMLElement)) {
        throw new Error('Expected editor elements')
      }

      firstEditor.focus()
      expect(firstEditor).toHaveFocus()

      fireEvent.pointerDown(surface, { clientY: 108 })

      expect(firstEditor).toHaveFocus()
      expect(secondEditor).not.toHaveFocus()
    } finally {
      getBoundingClientRect.mockRestore()
    }
  })

  it('scrolls the page when the active text block grows below the viewport while typing', async () => {
    const originalScrollBy = window.scrollBy
    const originalInnerHeight = window.innerHeight
    const scrollBy = vi.fn()
    window.scrollBy = scrollBy
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 500 })

    try {
      render(
        <BlockEditor
          page={page as never}
          allPages={[page as never]}
          onUpdateBlock={vi.fn()}
        />,
      )

      const editor = getParagraphEditorByText('第一段')
      vi.spyOn(editor, 'getBoundingClientRect').mockReturnValue({
        bottom: 620,
        height: 220,
        left: 0,
        right: 760,
        top: 400,
        width: 760,
        x: 0,
        y: 400,
        toJSON: () => ({}),
      })

      fireEvent.input(editor, {
        target: { textContent: '第一段\n第二行' },
      })

      await waitFor(() => {
        expect(scrollBy).toHaveBeenCalledWith({ top: 420, behavior: 'auto' })
      })
    } finally {
      window.scrollBy = originalScrollBy
      Object.defineProperty(window, 'innerHeight', {
        configurable: true,
        value: originalInnerHeight,
      })
    }
  })

  it('keeps the focused text block visible after its rendered height changes', async () => {
    const originalScrollBy = window.scrollBy
    const originalInnerHeight = window.innerHeight
    const scrollBy = vi.fn()
    window.scrollBy = scrollBy
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 500 })

    try {
      const { rerender } = render(
        <BlockEditor
          page={page as never}
          allPages={[page as never]}
          onUpdateBlock={vi.fn()}
        />,
      )
      const editor = getParagraphEditorByText((page.blocks[0] as { text: string }).text)
      vi.spyOn(editor, 'getBoundingClientRect').mockReturnValue({
        bottom: 620,
        height: 220,
        left: 0,
        right: 760,
        top: 400,
        width: 760,
        x: 0,
        y: 400,
        toJSON: () => ({}),
      })

      editor.focus()
      rerender(
        <BlockEditor
          page={{
            ...page,
            blocks: page.blocks.map((block) =>
              block.id === 'b1'
                ? { ...block, text: `${(block as { text: string }).text} ${'line '.repeat(80)}` }
                : block,
            ),
          } as never}
          allPages={[page as never]}
          onUpdateBlock={vi.fn()}
        />,
      )

      await waitFor(() => {
        expect(scrollBy).toHaveBeenCalledWith({ top: 420, behavior: 'auto' })
      })
    } finally {
      window.scrollBy = originalScrollBy
      Object.defineProperty(window, 'innerHeight', {
        configurable: true,
        value: originalInnerHeight,
      })
    }
  })

  it('scrolls the page while typing in the blank row input near the viewport bottom', async () => {
    const originalScrollBy = window.scrollBy
    const originalInnerHeight = window.innerHeight
    const scrollBy = vi.fn()
    window.scrollBy = scrollBy
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 500 })

    try {
      render(
        <BlockEditor
          page={page as never}
          allPages={[page as never]}
          onUpdateBlock={vi.fn()}
        />,
      )

      const input = screen.getByPlaceholderText('输入 / 打开命令菜单')
      vi.spyOn(input, 'getBoundingClientRect').mockReturnValue({
        bottom: 800,
        height: 30,
        left: 0,
        right: 760,
        top: 770,
        width: 760,
        x: 0,
        y: 770,
        toJSON: () => ({}),
      })

      fireEvent.input(input, { target: { value: '继续输入' } })

      await waitFor(() => {
        expect(scrollBy).toHaveBeenCalledWith({ top: 600, behavior: 'auto' })
      })
    } finally {
      window.scrollBy = originalScrollBy
      Object.defineProperty(window, 'innerHeight', {
        configurable: true,
        value: originalInnerHeight,
      })
    }
  })

  it('creates another list block when pressing Enter in a non-empty list item', () => {
    const onInsertBlockAfter = vi.fn(() => 'new-list-block')
    const listPage = {
      ...page,
      blocks: [{ id: 'b1', type: 'bulleted_list', items: ['第一项'] }],
    }

    render(
      <BlockEditor
        page={listPage as never}
        allPages={[listPage as never]}
        onUpdateBlock={vi.fn()}
        onInsertBlockAfter={onInsertBlockAfter}
      />,
    )

    fireEvent.keyDown(screen.getByRole('textbox', { name: '每行一个列表项' }), { key: 'Enter' })

    expect(onInsertBlockAfter).toHaveBeenCalledWith('b1', 'bulleted_list')
  })

  it('uses the live list text when Enter is pressed before block state refreshes', () => {
    const onInsertBlockAfter = vi.fn(() => 'new-list-block')
    const onTurnInto = vi.fn()
    const listPage = {
      ...page,
      blocks: [{ id: 'b1', type: 'bulleted_list', items: [''] }],
    }

    render(
      <BlockEditor
        page={listPage as never}
        allPages={[listPage as never]}
        onUpdateBlock={vi.fn()}
        onInsertBlockAfter={onInsertBlockAfter}
        onTurnInto={onTurnInto}
      />,
    )

    const editor = screen.getByRole('textbox', { name: '每行一个列表项' })
    editor.textContent = '风格化'
    fireEvent.keyDown(editor, { key: 'Enter' })

    expect(onInsertBlockAfter).toHaveBeenCalledWith('b1', 'bulleted_list')
    expect(onTurnInto).not.toHaveBeenCalled()
  })

  it('normalizes line breaks while editing a list item', () => {
    const onUpdateBlock = vi.fn()
    const listBlock = { id: 'b1', type: 'bulleted_list' as const, items: ['第一项'] }
    const listPage = {
      ...page,
      blocks: [listBlock],
    }

    render(
      <BlockEditor
        page={listPage as never}
        allPages={[listPage as never]}
        onUpdateBlock={onUpdateBlock}
      />,
    )

    const editor = screen.getByRole('textbox', { name: '每行一个列表项' })
    editor.textContent = '第一行\n第二行'
    fireEvent.input(editor)

    expect(onUpdateBlock).toHaveBeenCalledWith('b1', {
      ...listBlock,
      items: ['第一行 第二行'],
    })
  })

  it('turns an empty list item back into a paragraph when pressing Enter', () => {
    const onTurnInto = vi.fn()
    const listPage = {
      ...page,
      blocks: [{ id: 'b1', type: 'numbered_list', items: [''] }],
    }

    render(
      <BlockEditor
        page={listPage as never}
        allPages={[listPage as never]}
        onUpdateBlock={vi.fn()}
        onTurnInto={onTurnInto}
      />,
    )

    fireEvent.keyDown(screen.getByRole('textbox', { name: '每行一个列表项' }), { key: 'Enter' })

    expect(onTurnInto).toHaveBeenCalledWith('b1', 'paragraph')
  })

  it('focuses the new paragraph editor after exiting an empty list item', async () => {
    vi.useFakeTimers()

    function DelayedTurnIntoHarness() {
      const [currentPage, setCurrentPage] = useState({
        ...page,
        blocks: [{ id: 'b1', type: 'numbered_list' as const, items: [''] }],
      })

      return (
        <BlockEditor
          page={currentPage as never}
          allPages={[currentPage as never]}
          onUpdateBlock={vi.fn()}
          onTurnInto={() => {
            setTimeout(() => {
              setCurrentPage((previousPage) => ({
                ...previousPage,
                blocks: [{ id: 'b1', type: 'paragraph' as const, text: '' }],
              }))
            }, 0)
          }}
        />
      )
    }

    render(<DelayedTurnIntoHarness />)

    fireEvent.keyDown(screen.getByRole('textbox', { name: '每行一个列表项' }), {
      key: 'Enter',
    })

    await act(async () => {
      vi.runAllTimers()
    })

    expect(screen.getByRole('textbox', { name: '输入正文' })).toHaveFocus()
    vi.useRealTimers()
  })

  it('deletes an empty text block when pressing Backspace at the start', () => {
    const onDeleteBlock = vi.fn()
    const emptyPage = {
      ...page,
      blocks: [
        { id: 'b1', type: 'paragraph', text: '第一段' },
        { id: 'b2', type: 'paragraph', text: '' },
      ],
    }

    render(
      <BlockEditor
        page={emptyPage as never}
        allPages={[emptyPage as never]}
        onUpdateBlock={vi.fn()}
        onDeleteBlock={onDeleteBlock}
      />,
    )

    const emptyInput = screen.getAllByRole('textbox', { name: '输入正文' })[1]
    placeCaretAtStart(emptyInput)
    fireEvent.keyDown(emptyInput, { key: 'Backspace' })

    expect(onDeleteBlock).toHaveBeenCalledWith('b2')
  })

  it('continues deleting upward through an image block when Backspace starts from the empty paragraph below it', async () => {
    function MediaDeleteHarness() {
      const [currentPage, setCurrentPage] = useState({
        ...page,
        blocks: [
          { id: 'b1', type: 'paragraph' as const, text: 'Alpha' },
          {
            id: 'b2',
            type: 'image' as const,
            assetId: null,
            name: '',
            mimeType: '',
            caption: '',
            alt: '',
          },
          { id: 'b3', type: 'paragraph' as const, text: '' },
        ],
      })

      return (
        <BlockEditor
          page={currentPage as never}
          allPages={[currentPage as never]}
          onUpdateBlock={vi.fn()}
          onDeleteBlock={(blockId) => {
            setCurrentPage((previousPage) => ({
              ...previousPage,
              blocks: previousPage.blocks.filter((block) => block.id !== blockId),
            }))
          }}
        />
      )
    }

    const { container } = render(<MediaDeleteHarness />)

    const emptyInput = container.querySelector(
      '.editor-row[data-block-id="b3"] [role="textbox"]',
    )

    if (!(emptyInput instanceof HTMLElement)) {
      throw new Error('Expected empty paragraph editor')
    }

    placeCaretAtStart(emptyInput)
    fireEvent.keyDown(emptyInput, { key: 'Backspace' })

    const imageBlock = await waitFor(() => {
      const mediaBlock = container.querySelector(
        '.editor-row[data-block-id="b2"] figure.media-block',
      )

      if (!(mediaBlock instanceof HTMLElement)) {
        throw new Error('Expected image media block')
      }

      expect(mediaBlock).toHaveFocus()
      return mediaBlock
    })

    fireEvent.keyDown(imageBlock, { key: 'Backspace' })

    await waitFor(() => {
      expect(
        container.querySelector('.editor-row[data-block-id="b2"]'),
      ).not.toBeInTheDocument()
    })

    expect(screen.getByRole('textbox', { name: '输入正文' })).toHaveFocus()
  })

  it('merges a non-empty text block into the previous block when pressing Backspace at the start', () => {
    const onMergeBlockWithPrevious = vi.fn(() => 'b1')
    const mergePage = {
      ...page,
      blocks: [
        { id: 'b1', type: 'paragraph', text: '第一段' },
        { id: 'b2', type: 'paragraph', text: '第二段' },
      ],
    }

    render(
      <BlockEditor
        page={mergePage as never}
        allPages={[mergePage as never]}
        onUpdateBlock={vi.fn()}
        onMergeBlockWithPrevious={onMergeBlockWithPrevious}
      />,
    )

    const secondInput = getParagraphEditorByText('第二段')
    placeCaretAtStart(secondInput)
    fireEvent.keyDown(secondInput, { key: 'Backspace' })

    expect(onMergeBlockWithPrevious).toHaveBeenCalledWith('b2')
  })
})
