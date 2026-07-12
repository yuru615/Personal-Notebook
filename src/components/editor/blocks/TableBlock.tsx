import type { CSSProperties } from 'react'
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Ellipsis, EllipsisVertical } from 'lucide-react'
import { blockBackgroundColorValues } from '../../../domain/colors'
import type {
  BlockBackgroundColor,
  TableCellStyle,
  TableCellStyleGrid,
} from '../../../domain/types'
import { useDismissableLayer } from '../useDismissableLayer'

interface TableBlockChangeDetails {
  hasHeaderRow?: boolean
  fitToContent?: boolean
  cellStyles?: TableCellStyleGrid
  columnWidths?: number[]
  rowHeights?: number[]
}

interface TableBlockProps {
  rows: string[][]
  hasHeaderRow?: boolean
  fitToContent?: boolean
  cellStyles?: TableCellStyleGrid
  columnWidths?: number[]
  rowHeights?: number[]
  onChange: (rows: string[][], details?: TableBlockChangeDetails) => void
}

interface ActiveMenu {
  kind: 'row' | 'column'
  index: number
}

interface MenuPosition {
  top: number
  left: number
}

interface PendingCellFocus {
  rowIndex: number
  cellIndex: number
}

interface ControlTrack {
  offset: number
  size: number
}

interface ControlTracks {
  columns: ControlTrack[]
  rows: ControlTrack[]
}

const menuOffset = 6
const menuViewportPadding = 8

function getCellKey(rowIndex: number, cellIndex: number) {
  return `${rowIndex}:${cellIndex}`
}

const backgroundColorOptions: Array<{ value: BlockBackgroundColor; label: string }> = [
  { value: 'gray', label: '灰色背景' },
  { value: 'brown', label: '棕色背景' },
  { value: 'orange', label: '橙色背景' },
  { value: 'yellow', label: '黄色背景' },
  { value: 'green', label: '绿色背景' },
  { value: 'blue', label: '蓝色背景' },
  { value: 'purple', label: '紫色背景' },
  { value: 'pink', label: '粉色背景' },
  { value: 'red', label: '红色背景' },
]

function getColumnCount(rows: string[][]) {
  return Math.max(1, ...rows.map((row) => row.length))
}

function normalizeRows(rows: string[][]) {
  const columnCount = getColumnCount(rows)
  const sourceRows = rows.length > 0 ? rows : [Array.from({ length: columnCount }, () => '')]

  return sourceRows.map((row) =>
    Array.from({ length: columnCount }, (_, cellIndex) => row[cellIndex] ?? ''),
  )
}

function cleanCellStyle(style: TableCellStyle | null | undefined): TableCellStyle | null {
  if (!style) {
    return null
  }

  const nextStyle: TableCellStyle = {
    backgroundColor: style.backgroundColor,
    textAlign: style.textAlign,
    verticalAlign: style.verticalAlign,
  }

  return Object.values(nextStyle).some((value) => value !== undefined) ? nextStyle : null
}

function normalizeCellStyles(rows: string[][], cellStyles?: TableCellStyleGrid): TableCellStyleGrid {
  return rows.map((row, rowIndex) =>
    row.map((_, cellIndex) => cleanCellStyle(cellStyles?.[rowIndex]?.[cellIndex])),
  )
}

function compactCellStyles(cellStyles: TableCellStyleGrid): TableCellStyleGrid | undefined {
  return cellStyles.some((row) => row.some(Boolean)) ? cellStyles : undefined
}

function createEmptyStyleRow(columnCount: number): Array<TableCellStyle | null> {
  return Array.from({ length: columnCount }, (): TableCellStyle | null => null)
}

function isScopeCell(scope: ActiveMenu, rowIndex: number, cellIndex: number) {
  return scope.kind === 'row' ? rowIndex === scope.index : cellIndex === scope.index
}

function getScopeStyles(
  cellStyles: TableCellStyleGrid,
  scope: ActiveMenu,
): Array<TableCellStyle | null> {
  return scope.kind === 'row'
    ? (cellStyles[scope.index] ?? [])
    : cellStyles.map((row) => row[scope.index] ?? null)
}

function scopeEvery(
  cellStyles: TableCellStyleGrid,
  scope: ActiveMenu,
  predicate: (style: TableCellStyle | null) => boolean,
) {
  const scopeStyles = getScopeStyles(cellStyles, scope)
  return scopeStyles.length > 0 && scopeStyles.every(predicate)
}

function getCellSurfaceStyle(style: TableCellStyle | null): CSSProperties | undefined {
  const nextStyle: CSSProperties = {}

  if (style?.backgroundColor) {
    nextStyle.backgroundColor = blockBackgroundColorValues[style.backgroundColor]
  }

  if (style?.verticalAlign) {
    nextStyle.alignItems = 'center'
  }

  return Object.keys(nextStyle).length > 0 ? nextStyle : undefined
}

function getCellInputStyle(style: TableCellStyle | null): CSSProperties | undefined {
  if (!style?.textAlign) {
    return undefined
  }

  return {
    textAlign: style.textAlign,
  }
}

function getMenuPosition(kind: ActiveMenu['kind'], anchor: HTMLElement): MenuPosition {
  const rect = anchor.getBoundingClientRect()

  if (kind === 'row') {
    return {
      top: rect.top,
      left: rect.right + menuOffset,
    }
  }

  return {
    top: rect.bottom + menuOffset,
    left: rect.left,
  }
}

export function TableBlock({
  rows,
  hasHeaderRow = false,
  fitToContent = true,
  cellStyles,
  columnWidths: initialColumnWidths,
  rowHeights: initialRowHeights,
  onChange,
}: TableBlockProps) {
  const [activeMenu, setActiveMenu] = useState<ActiveMenu | null>(null)
  const [menuPosition, setMenuPosition] = useState<MenuPosition | null>(null)
  const [hoveredColumnIndex, setHoveredColumnIndex] = useState<number | null>(null)
  const [hoveredRowIndex, setHoveredRowIndex] = useState<number | null>(null)
  const [selectedCell, setSelectedCell] = useState<PendingCellFocus | null>(null)
  const [columnWidths, setColumnWidths] = useState<number[]>(initialColumnWidths ?? [])
  const [rowHeights, setRowHeights] = useState<number[]>(initialRowHeights ?? [])
  const menuRef = useRef<HTMLDivElement | null>(null)
  const tableRef = useRef<HTMLDivElement | null>(null)
  const gridRef = useRef<HTMLDivElement | null>(null)
  const cellRefs = useRef(new Map<string, HTMLTextAreaElement>())
  const pendingCellFocusRef = useRef<PendingCellFocus | null>(null)
  const [controlTracks, setControlTracks] = useState<ControlTracks>({ columns: [], rows: [] })
  const normalizedRows = normalizeRows(rows)
  const columnCount = getColumnCount(normalizedRows)
  const normalizedCellStyles = normalizeCellStyles(normalizedRows, cellStyles)
  const canDeleteRow = normalizedRows.length > 1
  const canDeleteColumn = columnCount > 1
  const gridTemplateColumns = Array.from({ length: columnCount }, (_, index) =>
    columnWidths[index] && columnWidths[index] > 0
      ? `${columnWidths[index]}px`
      : 'minmax(120px, 1fr)',
  ).join(' ')
  const gridTemplateRows = Array.from({ length: normalizedRows.length }, (_, index) =>
    rowHeights[index] && rowHeights[index] > 0
      ? `minmax(${rowHeights[index]}px, auto)`
      : 'minmax(39px, auto)',
  ).join(' ')

  const closeMenu = useCallback(() => {
    setActiveMenu(null)
    setMenuPosition(null)
  }, [])

  const keepTableMenuOpen = useCallback((target: Node) => {
    const element = target instanceof Element ? target : target.parentElement
    return Boolean(element?.closest('.table-control-trigger, .table-control-menu'))
  }, [])

  useDismissableLayer({
    open: activeMenu !== null,
    onDismiss: closeMenu,
    shouldKeepOpen: keepTableMenuOpen,
  })

  useEffect(() => {
    function clearSelectionWhenClickingOutside(event: PointerEvent) {
      if (event.target instanceof Node && !tableRef.current?.contains(event.target)) {
        setSelectedCell(null)
      }
    }

    document.addEventListener('pointerdown', clearSelectionWhenClickingOutside)
    return () => document.removeEventListener('pointerdown', clearSelectionWhenClickingOutside)
  }, [])

  useLayoutEffect(() => {
    const grid = gridRef.current
    if (!grid) {
      return
    }
    const observedGrid = grid

    function syncControlTracks() {
      const gridRect = observedGrid.getBoundingClientRect()
      const cells = Array.from(observedGrid.querySelectorAll<HTMLElement>('.table-data-cell'))
      const columnTracks = Array.from({ length: columnCount }, (_, index) =>
        cells[index]?.getBoundingClientRect(),
      )
      const rowTracks = Array.from({ length: normalizedRows.length }, (_, index) =>
        cells[index * columnCount]?.getBoundingClientRect(),
      )
      if (
        !columnTracks.every((rect) => rect && rect.width > 0) ||
        !rowTracks.every((rect) => rect && rect.height > 0)
      ) {
        return
      }

      const next: ControlTracks = {
        columns: columnTracks.map((rect) => ({
          offset: rect.left - gridRect.left,
          size: rect.width,
        })),
        rows: rowTracks.map((rect) => ({
          offset: rect.top - gridRect.top,
          size: rect.height,
        })),
      }
      setControlTracks((current) =>
        JSON.stringify(current) === JSON.stringify(next) ? current : next,
      )
    }

    syncControlTracks()
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(syncControlTracks)
    observer?.observe(observedGrid)
    window.addEventListener('resize', syncControlTracks)
    const animationFrame =
      typeof window.requestAnimationFrame === 'function'
        ? window.requestAnimationFrame(syncControlTracks)
        : null
    const delayedSync = window.setTimeout(syncControlTracks, 0)

    return () => {
      observer?.disconnect()
      window.removeEventListener('resize', syncControlTracks)
      if (animationFrame !== null) {
        window.cancelAnimationFrame(animationFrame)
      }
      window.clearTimeout(delayedSync)
    }
  }, [columnCount, gridTemplateColumns, gridTemplateRows, normalizedRows.length, rows])

  useLayoutEffect(() => {
    if (!activeMenu || !menuPosition || !menuRef.current) {
      return
    }

    const rect = menuRef.current.getBoundingClientRect()
    const nextPosition = {
      top: Math.min(
        Math.max(menuViewportPadding, menuPosition.top),
        Math.max(menuViewportPadding, window.innerHeight - rect.height - menuViewportPadding),
      ),
      left: Math.min(
        Math.max(menuViewportPadding, menuPosition.left),
        Math.max(menuViewportPadding, window.innerWidth - rect.width - menuViewportPadding),
      ),
    }

    if (nextPosition.top !== menuPosition.top || nextPosition.left !== menuPosition.left) {
      setMenuPosition(nextPosition)
    }
  }, [activeMenu, menuPosition])

  const commitDimensions = useCallback(
    (nextColumnWidths?: number[], nextRowHeights?: number[]) => {
      const details: TableBlockChangeDetails = {}
      const compactedCellStyles = compactCellStyles(normalizedCellStyles)
      if (cellStyles || compactedCellStyles) {
        details.cellStyles = compactedCellStyles
      }
      if (hasHeaderRow) {
        details.hasHeaderRow = true
      }
      if (!fitToContent) {
        details.fitToContent = false
      }
      if (nextColumnWidths && nextColumnWidths.some((w) => w > 0)) {
        details.columnWidths = nextColumnWidths
      }
      if (nextRowHeights && nextRowHeights.some((h) => h > 0)) {
        details.rowHeights = nextRowHeights
      }
      onChange(normalizedRows, details)
    },
    [cellStyles, fitToContent, hasHeaderRow, normalizedCellStyles, normalizedRows, onChange],
  )

  useEffect(() => {
    setColumnWidths(initialColumnWidths ?? [])
  }, [initialColumnWidths])

  useEffect(() => {
    setRowHeights(initialRowHeights ?? [])
  }, [initialRowHeights])

  useEffect(() => {
    const pendingFocus = pendingCellFocusRef.current
    if (!pendingFocus) {
      return
    }

    const input = cellRefs.current.get(getCellKey(pendingFocus.rowIndex, pendingFocus.cellIndex))
    if (input) {
      input.focus()
      pendingCellFocusRef.current = null
    }
  }, [columnCount, normalizedRows])

  function requestCellFocus(rowIndex: number, cellIndex: number) {
    pendingCellFocusRef.current = { rowIndex, cellIndex }
  }

  function syncCellHeight(cell: HTMLTextAreaElement) {
    cell.style.height = '0px'
    cell.style.height = `${cell.scrollHeight}px`
  }

  useLayoutEffect(() => {
    cellRefs.current.forEach(syncCellHeight)
  }, [normalizedRows])

  function commitRows(nextRows: string[][], nextCellStyles?: TableCellStyleGrid) {
    const details: TableBlockChangeDetails = {}
    if (nextCellStyles !== undefined) {
      const compactedCellStyles = compactCellStyles(nextCellStyles)
      if (cellStyles || compactedCellStyles) {
        details.cellStyles = compactedCellStyles
      }
    }
    if (columnWidths.some((w) => w > 0)) {
      details.columnWidths = columnWidths
    }
    if (rowHeights.some((h) => h > 0)) {
      details.rowHeights = rowHeights
    }
    if (hasHeaderRow) {
      details.hasHeaderRow = true
    }
    if (!fitToContent) {
      details.fitToContent = false
    }
    if (Object.keys(details).length > 0) {
      onChange(nextRows, details)
    } else {
      onChange(nextRows)
    }
  }

  function commitCellStyles(nextCellStyles: TableCellStyleGrid) {
    const details: TableBlockChangeDetails = { cellStyles: compactCellStyles(nextCellStyles) }
    if (columnWidths.some((w) => w > 0)) {
      details.columnWidths = columnWidths
    }
    if (rowHeights.some((h) => h > 0)) {
      details.rowHeights = rowHeights
    }
    if (hasHeaderRow) {
      details.hasHeaderRow = true
    }
    if (!fitToContent) {
      details.fitToContent = false
    }
    if (Object.keys(details).length > 0) {
      onChange(normalizedRows, details)
    } else {
      onChange(normalizedRows)
    }
  }

  function updateCell(rowIndex: number, cellIndex: number, value: string) {
    const nextRows = normalizedRows.map((currentRow) => [...currentRow])
    nextRows[rowIndex][cellIndex] = value
    const details: TableBlockChangeDetails = {}
    if (cellStyles) {
      details.cellStyles = cellStyles
    }
    if (columnWidths.some((w) => w > 0)) {
      details.columnWidths = columnWidths
    }
    if (rowHeights.some((h) => h > 0)) {
      details.rowHeights = rowHeights
    }
    if (hasHeaderRow) {
      details.hasHeaderRow = true
    }
    if (!fitToContent) {
      details.fitToContent = false
    }
    if (Object.keys(details).length > 0) {
      onChange(nextRows, details)
    } else {
      onChange(nextRows)
    }
  }

  function addRow() {
    commitRows(
      [...normalizedRows, Array.from({ length: columnCount }, () => '')],
      [...normalizedCellStyles, createEmptyStyleRow(columnCount)],
    )
  }

  function addColumn() {
    commitRows(
      normalizedRows.map((row) => [...row, '']),
      normalizedCellStyles.map((row) => [...row, null]),
    )
  }

  function handleCellKeyDown(
    event: React.KeyboardEvent<HTMLTextAreaElement>,
    rowIndex: number,
    cellIndex: number,
  ) {
    if (event.key === 'Tab') {
      if (event.shiftKey) {
        if (rowIndex === 0 && cellIndex === 0) {
          return
        }

        event.preventDefault()
        if (cellIndex > 0) {
          requestCellFocus(rowIndex, cellIndex - 1)
        } else {
          requestCellFocus(rowIndex - 1, columnCount - 1)
        }
        return
      }

      event.preventDefault()
      if (cellIndex < columnCount - 1) {
        requestCellFocus(rowIndex, cellIndex + 1)
        return
      }

      if (rowIndex < normalizedRows.length - 1) {
        requestCellFocus(rowIndex + 1, 0)
        return
      }

      requestCellFocus(rowIndex, cellIndex + 1)
      addColumn()
      return
    }

    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      if (rowIndex < normalizedRows.length - 1) {
        requestCellFocus(rowIndex + 1, cellIndex)
        return
      }

      requestCellFocus(rowIndex + 1, cellIndex)
      addRow()
    }
  }

  function insertRow(rowIndex: number, placement: 'before' | 'after') {
    const insertIndex = placement === 'before' ? rowIndex : rowIndex + 1
    const nextRow = Array.from({ length: columnCount }, () => '')
    commitRows(
      [
        ...normalizedRows.slice(0, insertIndex),
        nextRow,
        ...normalizedRows.slice(insertIndex),
      ],
      [
        ...normalizedCellStyles.slice(0, insertIndex),
        createEmptyStyleRow(columnCount),
        ...normalizedCellStyles.slice(insertIndex),
      ],
    )
    setActiveMenu(null)
  }

  function insertColumn(cellIndex: number, placement: 'before' | 'after') {
    const insertIndex = placement === 'before' ? cellIndex : cellIndex + 1
    commitRows(
      normalizedRows.map((row) => [
        ...row.slice(0, insertIndex),
        '',
        ...row.slice(insertIndex),
      ]),
      normalizedCellStyles.map((row) => [
        ...row.slice(0, insertIndex),
        null,
        ...row.slice(insertIndex),
      ]),
    )
    setActiveMenu(null)
  }

  function deleteRow(rowIndex: number) {
    if (!canDeleteRow) {
      return
    }

    commitRows(
      normalizedRows.filter((_, currentIndex) => currentIndex !== rowIndex),
      normalizedCellStyles.filter((_, currentIndex) => currentIndex !== rowIndex),
    )
    setActiveMenu(null)
  }

  function deleteColumn(cellIndex: number) {
    if (!canDeleteColumn) {
      return
    }

    commitRows(
      normalizedRows.map((row) => row.filter((_, currentIndex) => currentIndex !== cellIndex)),
      normalizedCellStyles.map((row) => row.filter((_, currentIndex) => currentIndex !== cellIndex)),
    )
    setActiveMenu(null)
  }

  function clearScopeContent(scope: ActiveMenu) {
    const nextRows = normalizedRows.map((row, rowIndex) =>
      row.map((cell, cellIndex) => (isScopeCell(scope, rowIndex, cellIndex) ? '' : cell)),
    )
    commitRows(nextRows, normalizedCellStyles)
    setActiveMenu(null)
  }

  function updateScopeStyles(
    scope: ActiveMenu,
    updater: (style: TableCellStyle | null) => TableCellStyle | null,
  ) {
    const nextCellStyles = normalizedCellStyles.map((row, rowIndex) =>
      row.map((style, cellIndex) =>
        isScopeCell(scope, rowIndex, cellIndex) ? cleanCellStyle(updater(style)) : style,
      ),
    )
    commitCellStyles(nextCellStyles)
  }

  function toggleScopeTextAlign(scope: ActiveMenu) {
    const shouldClear = scopeEvery(
      normalizedCellStyles,
      scope,
      (style) => style?.textAlign === 'center',
    )

    updateScopeStyles(scope, (style) => ({
      ...(style ?? {}),
      textAlign: shouldClear ? undefined : 'center',
    }))
  }

  function toggleScopeVerticalAlign(scope: ActiveMenu) {
    const shouldClear = scopeEvery(
      normalizedCellStyles,
      scope,
      (style) => style?.verticalAlign === 'middle',
    )

    updateScopeStyles(scope, (style) => ({
      ...(style ?? {}),
      verticalAlign: shouldClear ? undefined : 'middle',
    }))
  }

  function setScopeBackgroundColor(scope: ActiveMenu, backgroundColor?: BlockBackgroundColor) {
    updateScopeStyles(scope, (style) => ({
      ...(style ?? {}),
      backgroundColor,
    }))
  }

  function toggleHeaderRow() {
    const details: TableBlockChangeDetails = { hasHeaderRow: !hasHeaderRow }
    const compactedCellStyles = compactCellStyles(normalizedCellStyles)
    if (cellStyles || compactedCellStyles) {
      details.cellStyles = compactedCellStyles
    }
    if (columnWidths.some((width) => width > 0)) {
      details.columnWidths = columnWidths
    }
    if (rowHeights.some((height) => height > 0)) {
      details.rowHeights = rowHeights
    }
    onChange(normalizedRows, details)
    setActiveMenu(null)
  }

  function toggleFitToContent() {
    const details: TableBlockChangeDetails = { fitToContent: !fitToContent }
    const compactedCellStyles = compactCellStyles(normalizedCellStyles)
    if (cellStyles || compactedCellStyles) {
      details.cellStyles = compactedCellStyles
    }
    if (columnWidths.some((width) => width > 0)) {
      details.columnWidths = columnWidths
    }
    if (rowHeights.some((height) => height > 0)) {
      details.rowHeights = rowHeights
    }
    if (hasHeaderRow) {
      details.hasHeaderRow = true
    }
    onChange(normalizedRows, details)
    setActiveMenu(null)
  }

  function toggleMenu(nextMenu: ActiveMenu, anchor: HTMLElement) {
    setActiveMenu((current) =>
      current?.kind === nextMenu.kind && current.index === nextMenu.index ? null : nextMenu,
    )
    setMenuPosition(
      activeMenu?.kind === nextMenu.kind && activeMenu.index === nextMenu.index
        ? null
        : getMenuPosition(nextMenu.kind, anchor),
    )
  }

  function startColumnResize(event: React.MouseEvent, index: number) {
    event.preventDefault()
    event.stopPropagation()

    const startX = event.clientX
    const startWidth = controlTracks.columns[index]?.size ?? columnWidths[index] ?? 120

    function handleMouseMove(moveEvent: MouseEvent) {
      const delta = moveEvent.clientX - startX
      const newWidth = Math.max(120, startWidth + delta)
      setColumnWidths((prev) => {
        const next = [...prev]
        next[index] = newWidth
        return next
      })
    }

    function handleMouseUp() {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      setColumnWidths((prev) => {
        setTimeout(() => commitDimensions(prev, rowHeights), 0)
        return prev
      })
    }

    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
  }

  function resetColumnWidth(event: React.MouseEvent, index: number) {
    event.preventDefault()
    event.stopPropagation()
    setColumnWidths((previous) => {
      const next = [...previous]
      next[index] = 0
      setTimeout(() => commitDimensions(next, rowHeights), 0)
      return next
    })
  }

  function startRowResize(event: React.MouseEvent, index: number) {
    event.preventDefault()
    event.stopPropagation()

    const startY = event.clientY
    const startHeight = rowHeights[index] ?? 39

    function handleMouseMove(moveEvent: MouseEvent) {
      const delta = moveEvent.clientY - startY
      const newHeight = Math.max(39, startHeight + delta)
      setRowHeights((prev) => {
        const next = [...prev]
        next[index] = newHeight
        return next
      })
    }

    function handleMouseUp() {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      setRowHeights((prev) => {
        setTimeout(() => commitDimensions(columnWidths, prev), 0)
        return prev
      })
    }

    document.body.style.cursor = 'row-resize'
    document.body.style.userSelect = 'none'
    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
  }

  function resetRowHeight(event: React.MouseEvent, index: number) {
    event.preventDefault()
    event.stopPropagation()
    setRowHeights((previous) => {
      const next = [...previous]
      next[index] = 0
      setTimeout(() => commitDimensions(columnWidths, next), 0)
      return next
    })
  }

  function renderScopeMenuActions(scope: ActiveMenu) {
    const scopeName = scope.kind === 'row' ? '行' : '列'
    const isTextCentered = scopeEvery(
      normalizedCellStyles,
      scope,
      (style) => style?.textAlign === 'center',
    )
    const isVerticallyCentered = scopeEvery(
      normalizedCellStyles,
      scope,
      (style) => style?.verticalAlign === 'middle',
    )
    const hasDefaultBackground = scopeEvery(
      normalizedCellStyles,
      scope,
      (style) => !style?.backgroundColor,
    )

    return (
      <>
        <section className="table-control-menu-section">
          <div className="table-control-menu-label">内容</div>
          <button
            type="button"
            className="table-control-menu-item"
            onClick={() => clearScopeContent(scope)}
          >
            清空单元格内容
          </button>
        </section>
        <div className="table-control-menu-divider" />
        <section className="table-control-menu-section">
          <div className="table-control-menu-label">对齐</div>
          <button
            type="button"
            className="table-control-menu-item table-control-menu-toggle"
            aria-pressed={isTextCentered}
            onClick={() => toggleScopeTextAlign(scope)}
          >
            文字居中
          </button>
          <button
            type="button"
            className="table-control-menu-item table-control-menu-toggle"
            aria-pressed={isVerticallyCentered}
            onClick={() => toggleScopeVerticalAlign(scope)}
          >
            垂直居中
          </button>
        </section>
        <div className="table-control-menu-divider" />
        <section className="table-control-menu-section">
          <div className="table-control-menu-label">颜色</div>
          <div className="table-control-color-grid">
            <button
              type="button"
              className="table-control-color-button"
              aria-label={`${scopeName}颜色：默认`}
              aria-pressed={hasDefaultBackground}
              onClick={() => setScopeBackgroundColor(scope, undefined)}
            >
              <span
                className="table-control-background-swatch table-control-default-swatch"
                aria-hidden="true"
              />
            </button>
            {backgroundColorOptions.map((option) => (
              <button
                key={option.value}
                type="button"
                className="table-control-color-button"
                aria-label={`${scopeName}颜色：${option.label}`}
                aria-pressed={scopeEvery(
                  normalizedCellStyles,
                  scope,
                  (style) => style?.backgroundColor === option.value,
                )}
                onClick={() => setScopeBackgroundColor(scope, option.value)}
              >
                <span
                  className="table-control-background-swatch"
                  style={{ backgroundColor: blockBackgroundColorValues[option.value] }}
                  aria-hidden="true"
                />
              </button>
            ))}
          </div>
        </section>
      </>
    )
  }

  function renderColumnMenu(cellIndex: number) {
    if (activeMenu?.kind !== 'column' || activeMenu.index !== cellIndex) {
      return null
    }

    const scope: ActiveMenu = { kind: 'column', index: cellIndex }

    if (!menuPosition) {
      return null
    }

    return createPortal(
      <div
        ref={menuRef}
        className="table-control-menu"
        role="menu"
        aria-label={`第 ${cellIndex + 1} 列菜单`}
        style={{ top: menuPosition.top, left: menuPosition.left }}
      >
        {cellIndex === 0 && (
          <>
            <section className="table-control-menu-section">
              <div className="table-control-menu-label">表格布局</div>
              <button
                type="button"
                className="table-control-menu-item table-control-menu-toggle"
                aria-pressed={fitToContent}
                onClick={toggleFitToContent}
              >
                适应正文宽度
              </button>
            </section>
            <div className="table-control-menu-divider" />
          </>
        )}
        {renderScopeMenuActions(scope)}
        <div className="table-control-menu-divider" />
        <section className="table-control-menu-section">
          <div className="table-control-menu-label">列操作</div>
          <button type="button" className="table-control-menu-item" onClick={() => insertColumn(cellIndex, 'before')}>
            在左侧插入列
          </button>
          <button type="button" className="table-control-menu-item" onClick={() => insertColumn(cellIndex, 'after')}>
            在右侧插入列
          </button>
          <button
            type="button"
            className="table-control-menu-item table-control-menu-danger"
            disabled={!canDeleteColumn}
            onClick={() => deleteColumn(cellIndex)}
          >
            删除列
          </button>
        </section>
      </div>,
      document.body,
    )
  }

  function renderRowMenu(rowIndex: number) {
    if (activeMenu?.kind !== 'row' || activeMenu.index !== rowIndex) {
      return null
    }

    const scope: ActiveMenu = { kind: 'row', index: rowIndex }

    if (!menuPosition) {
      return null
    }

    return createPortal(
      <div
        ref={menuRef}
        className="table-control-menu"
        role="menu"
        aria-label={`第 ${rowIndex + 1} 行菜单`}
        style={{ top: menuPosition.top, left: menuPosition.left }}
      >
        {renderScopeMenuActions(scope)}
        <div className="table-control-menu-divider" />
        <section className="table-control-menu-section">
          <div className="table-control-menu-label">行操作</div>
          {rowIndex === 0 && (
            <button
              type="button"
              className="table-control-menu-item table-control-menu-toggle"
              aria-pressed={hasHeaderRow}
              onClick={toggleHeaderRow}
            >
              {hasHeaderRow ? '取消表头行' : '设为表头行'}
            </button>
          )}
          <button type="button" className="table-control-menu-item" onClick={() => insertRow(rowIndex, 'before')}>
            在上方插入行
          </button>
          <button type="button" className="table-control-menu-item" onClick={() => insertRow(rowIndex, 'after')}>
            在下方插入行
          </button>
          <button
            type="button"
            className="table-control-menu-item table-control-menu-danger"
            disabled={!canDeleteRow}
            onClick={() => deleteRow(rowIndex)}
          >
            删除行
          </button>
        </section>
      </div>,
      document.body,
    )
  }

  return (
    <div
      ref={tableRef}
      className={`table-block ${fitToContent ? 'table-layout-fit' : 'table-layout-content'}`}
    >
      <div className="table-scroll">
        <div className="table-stage">
          <div
            ref={gridRef}
            className="table-grid"
            role="grid"
            aria-label="简单表格"
            style={{
              '--table-column-count': columnCount,
              '--table-row-count': normalizedRows.length,
              gridTemplateColumns,
              gridTemplateRows,
            } as CSSProperties}
          >
            {normalizedRows.map((row, rowIndex) => (
              <div key={rowIndex} className="table-row" role="row">
                {row.map((cell, cellIndex) => {
                  const style = normalizedCellStyles[rowIndex]?.[cellIndex] ?? null

                  return (
                    <div
                      key={`${rowIndex}-${cellIndex}`}
                      className={[
                        'table-data-cell',
                        hasHeaderRow && rowIndex === 0 ? 'table-data-cell-header' : '',
                        selectedCell?.rowIndex === rowIndex && selectedCell.cellIndex === cellIndex
                          ? 'table-data-cell-selected'
                          : '',
                        hoveredRowIndex === rowIndex ? 'table-data-cell-row-hovered' : '',
                        hoveredColumnIndex === cellIndex ? 'table-data-cell-column-hovered' : '',
                      ]
                        .filter(Boolean)
                        .join(' ')}
                      role={hasHeaderRow && rowIndex === 0 ? 'columnheader' : 'gridcell'}
                      style={getCellSurfaceStyle(style)}
                    >
                      <textarea
                        ref={(input) => {
                          const key = getCellKey(rowIndex, cellIndex)
                          if (input) {
                            cellRefs.current.set(key, input)
                          } else {
                            cellRefs.current.delete(key)
                          }
                        }}
                        className="table-cell"
                        aria-label={`第 ${rowIndex + 1} 行第 ${cellIndex + 1} 列`}
                        value={cell}
                        style={getCellInputStyle(style)}
                        onChange={(event) => {
                          updateCell(rowIndex, cellIndex, event.target.value)
                        }}
                        onFocus={() => setSelectedCell({ rowIndex, cellIndex })}
                        onClick={() => setSelectedCell({ rowIndex, cellIndex })}
                        onInput={(event) => syncCellHeight(event.currentTarget)}
                        onKeyDown={(event) => handleCellKeyDown(event, rowIndex, cellIndex)}
                      />
                    </div>
                  )
                })}
              </div>
            ))}
          </div>

          <div
            className={[
              'table-column-controls',
              controlTracks.columns.length === columnCount
                ? 'table-controls-measured'
                : 'table-controls-pending',
            ]
              .filter(Boolean)
              .join(' ')}
          >
            {Array.from({ length: columnCount }, (_, cellIndex) => (
              <div
                key={cellIndex}
                className={[
                  'table-control-cell',
                  'table-column-control-cell',
                  hoveredColumnIndex === cellIndex ||
                  (activeMenu?.kind === 'column' && activeMenu.index === cellIndex)
                    ? 'table-control-cell-active'
                    : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                style={
                  controlTracks.columns[cellIndex]
                    ? {
                        left: controlTracks.columns[cellIndex].offset,
                        width: controlTracks.columns[cellIndex].size,
                      }
                    : undefined
                }
                onMouseEnter={() => setHoveredColumnIndex(cellIndex)}
                onMouseLeave={() =>
                  setHoveredColumnIndex((current) => (current === cellIndex ? null : current))
                }
              >
                <button
                  type="button"
                  className="table-control-trigger table-column-control-trigger"
                  aria-label={`第 ${cellIndex + 1} 列操作`}
                  aria-expanded={activeMenu?.kind === 'column' && activeMenu.index === cellIndex}
                  aria-haspopup="menu"
                  onClick={(event) => toggleMenu({ kind: 'column', index: cellIndex }, event.currentTarget)}
                >
                  <Ellipsis size={15} strokeWidth={2} aria-hidden="true" />
                </button>
                {renderColumnMenu(cellIndex)}
                <div
                  className="table-resize-handle table-column-resize-handle"
                  onMouseDown={(event) => startColumnResize(event, cellIndex)}
                  onDoubleClick={(event) => resetColumnWidth(event, cellIndex)}
                />
              </div>
            ))}
          </div>

          <div
            className={[
              'table-row-controls',
              controlTracks.rows.length === normalizedRows.length
                ? 'table-controls-measured'
                : 'table-controls-pending',
            ]
              .filter(Boolean)
              .join(' ')}
          >
            {normalizedRows.map((_, rowIndex) => (
              <div
                key={rowIndex}
                className={[
                  'table-control-cell',
                  'table-row-control-cell',
                  hoveredRowIndex === rowIndex ||
                  (activeMenu?.kind === 'row' && activeMenu.index === rowIndex)
                    ? 'table-control-cell-active'
                    : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                style={
                  controlTracks.rows[rowIndex]
                    ? {
                        top: controlTracks.rows[rowIndex].offset,
                        height: controlTracks.rows[rowIndex].size,
                      }
                    : undefined
                }
                onMouseEnter={() => setHoveredRowIndex(rowIndex)}
                onMouseLeave={() =>
                  setHoveredRowIndex((current) => (current === rowIndex ? null : current))
                }
              >
                <button
                  type="button"
                  className="table-control-trigger table-row-control-trigger"
                  aria-label={`第 ${rowIndex + 1} 行操作`}
                  aria-expanded={activeMenu?.kind === 'row' && activeMenu.index === rowIndex}
                  aria-haspopup="menu"
                  onClick={(event) => toggleMenu({ kind: 'row', index: rowIndex }, event.currentTarget)}
                >
                  <EllipsisVertical size={15} strokeWidth={2} aria-hidden="true" />
                </button>
                {renderRowMenu(rowIndex)}
                <div
                  className="table-resize-handle table-row-resize-handle"
                  onMouseDown={(event) => startRowResize(event, rowIndex)}
                  onDoubleClick={(event) => resetRowHeight(event, rowIndex)}
                />
              </div>
            ))}
          </div>

          <div className="table-add-column-cell">
            <button type="button" className="table-edge-add" aria-label="添加一列" onClick={addColumn}>
              ＋
            </button>
          </div>

          <div className="table-add-row-cell">
            <button type="button" className="table-edge-add table-edge-add-row" aria-label="添加一行" onClick={addRow}>
              ＋
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
