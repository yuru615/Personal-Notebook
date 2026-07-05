import { act, createEvent, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { useState } from 'react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { BlockEditor } from './BlockEditor'
import { createDefaultAppState } from '../dataTable/domain/factory'

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
    editor.setSelectionRange(editor.value.length, editor.value.length)
    fireEvent.keyDown(editor, { key: 'ArrowDown' })

    expect(screen.getByPlaceholderText('输入 / 打开命令菜单')).toHaveFocus()
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

    fireEvent.keyDown(screen.getByDisplayValue('第一项'), { key: 'Enter' })

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
    fireEvent.change(editor, { target: { value: '风格化' } })
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

    fireEvent.change(screen.getByRole('textbox', { name: '每行一个列表项' }), {
      target: { value: '第一行\n第二行' },
    })

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
