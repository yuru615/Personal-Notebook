import { createEvent, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { TableBlock } from './TableBlock'

describe('TableBlock', () => {
  it('extends the table from the final cell with Tab and Enter', () => {
    const onChange = vi.fn()

    render(<TableBlock rows={[['A1', 'B1']]} onChange={onChange} />)

    const finalCell = screen.getByRole('textbox', { name: '第 1 行第 2 列' })
    const tabEvent = createEvent.keyDown(finalCell, { key: 'Tab' })
    fireEvent(finalCell, tabEvent)

    expect(tabEvent.defaultPrevented).toBe(true)
    expect(onChange).toHaveBeenLastCalledWith([['A1', 'B1', '']])

    onChange.mockClear()

    const enterEvent = createEvent.keyDown(finalCell, { key: 'Enter' })
    fireEvent(finalCell, enterEvent)

    expect(enterEvent.defaultPrevented).toBe(true)
    expect(onChange).toHaveBeenLastCalledWith([
      ['A1', 'B1'],
      ['', ''],
    ])
  })

  it('adds rows and columns from edge controls', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()

    render(<TableBlock rows={[['A1', 'B1']]} onChange={onChange} />)

    await user.click(screen.getByRole('button', { name: '添加一行' }))
    expect(onChange).toHaveBeenCalledWith([
      ['A1', 'B1'],
      ['', ''],
    ])

    onChange.mockClear()

    await user.click(screen.getByRole('button', { name: '添加一列' }))
    expect(onChange).toHaveBeenCalledWith([['A1', 'B1', '']])
  })

  it('renders the add row and add column controls outside the data grid', () => {
    render(
      <TableBlock
        rows={[
          ['A1', 'B1'],
          ['A2', 'B2'],
        ]}
        onChange={vi.fn()}
      />,
    )

    const addColumnButton = screen.getByRole('button', { name: '添加一列' })
    const addRowButton = screen.getByRole('button', { name: '添加一行' })

    expect(addColumnButton).toHaveTextContent('＋')
    expect(addColumnButton.closest('.table-add-column-cell')).not.toBeNull()
    expect(addRowButton.closest('.table-add-row-cell')).not.toBeNull()
  })

  it('uses the full row and column control areas as menu triggers', async () => {
    const user = userEvent.setup()

    render(
      <TableBlock
        rows={[
          ['A1', 'B1'],
          ['A2', 'B2'],
        ]}
        onChange={vi.fn()}
      />,
    )

    const rowTrigger = screen.getByRole('button', { name: '第 1 行操作' })
    const columnTrigger = screen.getByRole('button', { name: '第 1 列操作' })

    expect(rowTrigger).toHaveClass('table-control-trigger')
    expect(rowTrigger).toHaveClass('table-row-control-trigger')
    expect(rowTrigger).not.toHaveClass('table-handle-button')
    expect(columnTrigger).toHaveClass('table-control-trigger')
    expect(columnTrigger).toHaveClass('table-column-control-trigger')
    expect(columnTrigger).not.toHaveClass('table-handle-button')
    expect(rowTrigger.querySelector('.lucide-ellipsis-vertical')).not.toBeNull()
    expect(columnTrigger.querySelector('.lucide-ellipsis')).not.toBeNull()

    await user.click(rowTrigger)
    expect(screen.getByRole('menu', { name: '第 1 行菜单' })).toBeInTheDocument()

    await user.click(columnTrigger)
    expect(screen.getByRole('menu', { name: '第 1 列菜单' })).toBeInTheDocument()
  })

  it('renders table menus outside the scroll area so they are not clipped', async () => {
    const user = userEvent.setup()

    const { container } = render(
      <TableBlock
        rows={[
          ['A1', 'B1'],
          ['A2', 'B2'],
        ]}
        onChange={vi.fn()}
      />,
    )

    const columnTrigger = container.querySelector('.table-column-control-cell .table-control-trigger')
    if (!columnTrigger) {
      throw new Error('Expected a column menu trigger')
    }

    await user.click(columnTrigger)
    expect(screen.getByRole('menu').closest('.table-scroll')).toBeNull()

    const rowTrigger = container.querySelector('.table-row-control-cell .table-control-trigger')
    if (!rowTrigger) {
      throw new Error('Expected a row menu trigger')
    }

    await user.click(rowTrigger)
    expect(screen.getByRole('menu').closest('.table-scroll')).toBeNull()
  })

  it('highlights the column cells when hovering a column control area', async () => {
    const user = userEvent.setup()

    render(
      <TableBlock
        rows={[
          ['A1', 'B1'],
          ['A2', 'B2'],
        ]}
        onChange={vi.fn()}
      />,
    )

    await user.hover(screen.getByRole('button', { name: '第 2 列操作' }))

    expect(screen.getByRole('textbox', { name: '第 1 行第 2 列' }).closest('.table-data-cell')).toHaveClass(
      'table-data-cell-column-hovered',
    )
    expect(screen.getByRole('textbox', { name: '第 2 行第 2 列' }).closest('.table-data-cell')).toHaveClass(
      'table-data-cell-column-hovered',
    )
    expect(screen.getByRole('textbox', { name: '第 1 行第 1 列' }).closest('.table-data-cell')).not.toHaveClass(
      'table-data-cell-column-hovered',
    )
  })

  it('highlights the hovered column control strip cell itself', async () => {
    const user = userEvent.setup()

    render(
      <TableBlock
        rows={[
          ['A1', 'B1'],
          ['A2', 'B2'],
        ]}
        onChange={vi.fn()}
      />,
    )

    const firstColumnTrigger = screen.getByRole('button', { name: '第 1 列操作' })
    const secondColumnTrigger = screen.getByRole('button', { name: '第 2 列操作' })

    await user.hover(secondColumnTrigger)

    expect(secondColumnTrigger.closest('.table-column-control-cell')).toHaveClass('table-control-cell-active')
    expect(firstColumnTrigger.closest('.table-column-control-cell')).not.toHaveClass('table-control-cell-active')
  })

  it('highlights the row cells when hovering a row control area', async () => {
    const user = userEvent.setup()

    render(
      <TableBlock
        rows={[
          ['A1', 'B1'],
          ['A2', 'B2'],
        ]}
        onChange={vi.fn()}
      />,
    )

    await user.hover(screen.getByRole('button', { name: '第 2 行操作' }))

    expect(screen.getByRole('textbox', { name: '第 2 行第 1 列' }).closest('.table-data-cell')).toHaveClass(
      'table-data-cell-row-hovered',
    )
    expect(screen.getByRole('textbox', { name: '第 2 行第 2 列' }).closest('.table-data-cell')).toHaveClass(
      'table-data-cell-row-hovered',
    )
    expect(screen.getByRole('textbox', { name: '第 1 行第 1 列' }).closest('.table-data-cell')).not.toHaveClass(
      'table-data-cell-row-hovered',
    )
  })

  it('highlights the hovered row control strip cell itself', async () => {
    const user = userEvent.setup()

    render(
      <TableBlock
        rows={[
          ['A1', 'B1'],
          ['A2', 'B2'],
        ]}
        onChange={vi.fn()}
      />,
    )

    const firstRowTrigger = screen.getByRole('button', { name: '第 1 行操作' })
    const secondRowTrigger = screen.getByRole('button', { name: '第 2 行操作' })

    await user.hover(secondRowTrigger)

    expect(secondRowTrigger.closest('.table-row-control-cell')).toHaveClass('table-control-cell-active')
    expect(firstRowTrigger.closest('.table-row-control-cell')).not.toHaveClass('table-control-cell-active')
  })

  it('opens row and column menus for local actions', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()

    render(
      <TableBlock
        rows={[
          ['A1', 'B1'],
          ['A2', 'B2'],
        ]}
        onChange={onChange}
      />,
    )

    await user.click(screen.getByRole('button', { name: '第 2 行操作' }))
    await user.click(screen.getByRole('button', { name: '删除行' }))
    expect(onChange).toHaveBeenCalledWith([['A1', 'B1']])

    onChange.mockClear()

    await user.click(screen.getByRole('button', { name: '第 1 列操作' }))
    await user.click(screen.getByRole('button', { name: '删除列' }))
    expect(onChange).toHaveBeenCalledWith([
      ['B1'],
      ['B2'],
    ])
  })

  it('closes an open row menu when clicking a table cell', async () => {
    const user = userEvent.setup()

    render(
      <TableBlock
        rows={[
          ['A1', 'B1'],
          ['A2', 'B2'],
        ]}
        onChange={vi.fn()}
      />,
    )

    await user.click(screen.getByRole('button', { name: '第 1 行操作' }))
    expect(screen.getByRole('menu', { name: '第 1 行菜单' })).toBeInTheDocument()

    await user.click(screen.getByRole('textbox', { name: '第 1 行第 1 列' }))

    expect(screen.queryByRole('menu', { name: '第 1 行菜单' })).not.toBeInTheDocument()
  })

  it('inserts rows and columns near the selected handle', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()

    render(
      <TableBlock
        rows={[
          ['A1', 'B1'],
          ['A2', 'B2'],
        ]}
        onChange={onChange}
      />,
    )

    await user.click(screen.getByRole('button', { name: '第 1 行操作' }))
    await user.click(screen.getByRole('button', { name: '在下方插入行' }))
    expect(onChange).toHaveBeenCalledWith([
      ['A1', 'B1'],
      ['', ''],
      ['A2', 'B2'],
    ])

    onChange.mockClear()

    await user.click(screen.getByRole('button', { name: '第 2 列操作' }))
    await user.click(screen.getByRole('button', { name: '在左侧插入列' }))
    expect(onChange).toHaveBeenCalledWith([
      ['A1', '', 'B1'],
      ['A2', '', 'B2'],
    ])
  })

  it('keeps the last row and column available', async () => {
    const user = userEvent.setup()

    render(<TableBlock rows={[['A1']]} onChange={vi.fn()} />)

    await user.click(screen.getByRole('button', { name: '第 1 行操作' }))
    expect(screen.getByRole('button', { name: '删除行' })).toBeDisabled()

    await user.click(screen.getByRole('button', { name: '第 1 列操作' }))
    expect(screen.getByRole('button', { name: '删除列' })).toBeDisabled()
  })

  it('clears row and column content from handle menus', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()

    render(
      <TableBlock
        rows={[
          ['A1', 'B1'],
          ['A2', 'B2'],
        ]}
        onChange={onChange}
      />,
    )

    await user.click(screen.getByRole('button', { name: '第 1 行操作' }))
    await user.click(screen.getByRole('button', { name: '清空单元格内容' }))
    expect(onChange).toHaveBeenCalledWith([
      ['', ''],
      ['A2', 'B2'],
    ])

    onChange.mockClear()

    await user.click(screen.getByRole('button', { name: '第 2 列操作' }))
    await user.click(screen.getByRole('button', { name: '清空单元格内容' }))
    expect(onChange).toHaveBeenCalledWith([
      ['A1', ''],
      ['A2', ''],
    ])
  })

  it('applies row and column cell styles from handle menus', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    const rows = [
      ['A1', 'B1'],
      ['A2', 'B2'],
    ]

    render(<TableBlock rows={rows} onChange={onChange} />)

    await user.click(screen.getByRole('button', { name: '第 1 行操作' }))
    await user.click(screen.getByRole('button', { name: '文字居中' }))
    expect(onChange).toHaveBeenLastCalledWith(rows, {
      cellStyles: [[{ textAlign: 'center' }, { textAlign: 'center' }], [null, null]],
    })

    onChange.mockClear()

    await user.click(screen.getByRole('button', { name: '第 2 列操作' }))
    await user.click(screen.getByRole('button', { name: '垂直居中' }))
    expect(onChange).toHaveBeenLastCalledWith(rows, {
      cellStyles: [
        [null, { verticalAlign: 'middle' }],
        [null, { verticalAlign: 'middle' }],
      ],
    })
  })

  it('applies row and column colors from handle menus', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()

    render(
      <TableBlock
        rows={[
          ['A1', 'B1'],
          ['A2', 'B2'],
        ]}
        onChange={onChange}
      />,
    )

    await user.click(screen.getByRole('button', { name: '第 2 行操作' }))
    await user.click(screen.getByRole('button', { name: '行颜色：蓝色背景' }))
    expect(onChange).toHaveBeenLastCalledWith(
      [
        ['A1', 'B1'],
        ['A2', 'B2'],
      ],
      {
        cellStyles: [
          [null, null],
          [{ backgroundColor: 'blue' }, { backgroundColor: 'blue' }],
        ],
      },
    )
  })

  it('renders saved cell styles', () => {
    render(
      <TableBlock
        rows={[['A1', 'B1']]}
        cellStyles={[[{ textAlign: 'center', verticalAlign: 'middle', backgroundColor: 'blue' }, null]]}
        onChange={vi.fn()}
      />,
    )

    const input = screen.getByRole('textbox', { name: '第 1 行第 1 列' })
    const cell = input.closest('.table-data-cell')

    expect(input).toHaveStyle({ textAlign: 'center' })
    expect(cell).toHaveStyle({ alignItems: 'center', backgroundColor: '#e7f3f8' })
  })

  it('preserves saved cell alignment styles when resizing table dimensions', async () => {
    vi.useFakeTimers()

    try {
      const onChange = vi.fn()
      const rows = [
        ['A1', 'B1'],
        ['A2', 'B2'],
      ]
      const cellStyles = [
        [{ textAlign: 'center', verticalAlign: 'middle' }, null],
        [null, null],
      ]
      const { container } = render(
        <TableBlock rows={rows} cellStyles={cellStyles} onChange={onChange} />,
      )

      const columnHandle = container.querySelector('.table-column-resize-handle')
      expect(columnHandle).not.toBeNull()

      fireEvent.mouseDown(columnHandle!, { clientX: 100 })
      fireEvent.mouseMove(document, { clientX: 136 })
      fireEvent.mouseUp(document)
      await vi.runAllTimersAsync()

      expect(onChange).toHaveBeenLastCalledWith(
        rows,
        expect.objectContaining({
          columnWidths: [156],
          cellStyles: [
            [{ textAlign: 'center', verticalAlign: 'middle' }, null],
            [null, null],
          ],
        }),
      )

      onChange.mockClear()

      const rowHandle = container.querySelector('.table-row-resize-handle')
      expect(rowHandle).not.toBeNull()

      fireEvent.mouseDown(rowHandle!, { clientY: 100 })
      fireEvent.mouseMove(document, { clientY: 128 })
      fireEvent.mouseUp(document)
      await vi.runAllTimersAsync()

      expect(onChange).toHaveBeenLastCalledWith(
        rows,
        expect.objectContaining({
          columnWidths: [156],
          rowHeights: [67],
          cellStyles: [
            [{ textAlign: 'center', verticalAlign: 'middle' }, null],
            [null, null],
          ],
        }),
      )
    } finally {
      vi.useRealTimers()
    }
  })

  it('does not resize columns below the table cell minimum width', async () => {
    vi.useFakeTimers()

    try {
      const onChange = vi.fn()
      const rows = [['A1', 'B1']]
      const { container } = render(<TableBlock rows={rows} onChange={onChange} />)
      const columnHandle = container.querySelector('.table-column-resize-handle')
      expect(columnHandle).not.toBeNull()

      fireEvent.mouseDown(columnHandle!, { clientX: 120 })
      fireEvent.mouseMove(document, { clientX: -100 })
      fireEvent.mouseUp(document)
      await vi.runAllTimersAsync()

      expect(onChange).toHaveBeenLastCalledWith(rows, { columnWidths: [120] })
    } finally {
      vi.useRealTimers()
    }
  })

  it('toggles the first row as a persisted header row', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    const rows = [
      ['名称', '状态'],
      ['知栖', '进行中'],
    ]

    render(<TableBlock rows={rows} hasHeaderRow onChange={onChange} />)

    expect(screen.getByRole('textbox', { name: '第 1 行第 1 列' }).closest('.table-data-cell')).toHaveClass(
      'table-data-cell-header',
    )

    await user.click(screen.getByRole('button', { name: '第 1 行操作' }))
    await user.click(screen.getByRole('button', { name: '取消表头行' }))

    expect(onChange).toHaveBeenLastCalledWith(rows, { hasHeaderRow: false })
  })

  it('uses a lightweight selected state for the active cell', async () => {
    const user = userEvent.setup()

    render(<TableBlock rows={[['A1', 'B1']]} onChange={vi.fn()} />)

    const firstCell = screen.getByRole('textbox', { name: '第 1 行第 1 列' })
    const secondCell = screen.getByRole('textbox', { name: '第 1 行第 2 列' })

    await user.click(firstCell)
    expect(firstCell.closest('.table-data-cell')).toHaveClass('table-data-cell-selected')

    await user.click(secondCell)
    expect(secondCell.closest('.table-data-cell')).toHaveClass('table-data-cell-selected')
    expect(firstCell.closest('.table-data-cell')).not.toHaveClass('table-data-cell-selected')

    fireEvent.pointerDown(document.body)
    expect(secondCell.closest('.table-data-cell')).not.toHaveClass('table-data-cell-selected')
  })

  it('uses multiline cells and resets manual dimensions by double-clicking resize handles', async () => {
    vi.useFakeTimers()

    try {
      const onChange = vi.fn()
      const rows = [
        ['A1', 'B1'],
        ['A2', 'B2'],
      ]
      const { container } = render(
        <TableBlock rows={rows} columnWidths={[180, 0]} rowHeights={[64]} onChange={onChange} />,
      )

      const cell = screen.getByRole('textbox', { name: '第 1 行第 1 列' })
      expect(cell.tagName).toBe('TEXTAREA')

      const columnHandle = container.querySelector('.table-column-resize-handle')
      expect(columnHandle).not.toBeNull()
      fireEvent.doubleClick(columnHandle!)
      await vi.runAllTimersAsync()
      expect(onChange).toHaveBeenLastCalledWith(rows, { rowHeights: [64] })

      onChange.mockClear()

      const rowHandle = container.querySelector('.table-row-resize-handle')
      expect(rowHandle).not.toBeNull()
      fireEvent.doubleClick(rowHandle!)
      await vi.runAllTimersAsync()
      expect(onChange).toHaveBeenLastCalledWith(rows, {})
    } finally {
      vi.useRealTimers()
    }
  })

  it('keeps resize handles on the final row and column edges', () => {
    const { container } = render(
      <TableBlock
        rows={[
          ['A1', 'B1'],
          ['A2', 'B2'],
        ]}
        onChange={vi.fn()}
      />,
    )

    expect(container.querySelectorAll('.table-column-resize-handle')).toHaveLength(2)
    expect(container.querySelectorAll('.table-row-resize-handle')).toHaveLength(2)
  })

  it('persists the table body-width setting from the first column menu', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    const rows = [['A1', 'B1']]

    render(<TableBlock rows={rows} fitToContent={false} onChange={onChange} />)

    await user.click(screen.getByRole('button', { name: '第 1 列操作' }))
    await user.click(screen.getByRole('button', { name: '适应正文宽度' }))

    expect(onChange).toHaveBeenLastCalledWith(rows, { fitToContent: true })
  })
})
