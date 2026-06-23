import type { KeyboardEvent, ReactNode } from 'react'
import { useEffect, useRef, useState } from 'react'
import { getTextBlockStyle, isTextStyleableBlock } from '../../domain/blockTextStyle'
import type {
  BlockRecord,
  BlockType,
  BoardRecord,
  DataTableRecord,
  PageRecord,
  TextBlockStyle,
} from '../../domain/types'
import { uiCopy } from '../../ui/copy'
import { buildWhiteboardPreviewSvgDataUrl } from '../whiteboard/whiteboardPreview'
import { EmptyBlockRow } from './EmptyBlockRow'
import { BlockFrame } from './BlockFrame'
import { getBlockAnchorId } from './blockAnchors'
import { getTextBackgroundStyle, getTextInputStyle } from './blockTextStyle'
import { ChildPageBlock } from './blocks/ChildPageBlock'
import { CodeBlock } from './blocks/CodeBlock'
import { DataTableBlock } from './blocks/DataTableBlock'
import { ListBlock } from './blocks/ListBlock'
import { ParagraphBlock } from './blocks/ParagraphBlock'
import { TableBlock } from './blocks/TableBlock'
import { TodoBlock } from './blocks/TodoBlock'
import { WhiteboardBlock } from './blocks/WhiteboardBlock'
import type { ReorderPosition } from '../../utils/reorder'

interface DropTarget {
  blockId: string
  position: ReorderPosition
}
interface FocusRequest {
  blockId: string
  mode: 'any' | 'rich_text' | 'textarea'
}

interface BlockEditorProps {
  page: PageRecord
  allPages: PageRecord[]
  boards?: BoardRecord[]
  dataTables?: DataTableRecord[]
  allowedBlockTypes?: BlockType[]
  onUpdateBlock: (blockId: string, nextBlock: BlockRecord) => void
  onInsert?: (type: BlockType) => Promise<string | null> | string | null | void
  onInsertParagraph?: (text: string) => void
  onInsertBlockAfter?: (blockId: string, type: BlockType) => Promise<string | null> | string | null
  onDeleteBlock?: (blockId: string) => void
  onMergeBlockWithPrevious?: (blockId: string) => Promise<string | null> | string | null
  onDuplicateBlock?: (blockId: string) => void
  onTurnInto?: (blockId: string, type: BlockType) => Promise<void> | void
  onReorderBlock?: (
    activeBlockId: string,
    overBlockId: string,
    position: ReorderPosition,
  ) => void
  onOpenChildPage?: (pageId: string) => void
  onOpenWhiteboard?: (boardId: string) => void
  onRestoreWhiteboard?: (boardId: string) => void
  onOpenDataTable?: (databaseId: string) => void
  onRestoreDataTable?: (databaseId: string) => void
}

export function BlockEditor({
  page,
  allPages,
  boards = [],
  dataTables = [],
  allowedBlockTypes,
  onUpdateBlock,
  onInsert,
  onInsertParagraph,
  onInsertBlockAfter,
  onDeleteBlock,
  onMergeBlockWithPrevious,
  onDuplicateBlock,
  onTurnInto,
  onReorderBlock,
  onOpenChildPage,
  onOpenWhiteboard,
  onRestoreWhiteboard,
  onOpenDataTable,
  onRestoreDataTable,
}: BlockEditorProps) {
  const childPageTitleMap = Object.fromEntries(allPages.map((item) => [item.id, item.title]))
  const boardMap = new Map(boards.map((board) => [board.id, board]))
  const dataTableMap = new Map(dataTables.map((dataTable) => [dataTable.id, dataTable]))
  const draggingBlockId = useRef<string | null>(null)
  const pendingFocusBlockId = useRef<FocusRequest | null>(null)
  const scrollFrameId = useRef<number | null>(null)
  const [draggingVisualBlockId, setDraggingVisualBlockId] = useState<string | null>(null)
  const [dropTarget, setDropTarget] = useState<DropTarget | null>(null)
  const [focusRequestVersion, setFocusRequestVersion] = useState(0)

  useEffect(() => {
    const focusRequest = pendingFocusBlockId.current

    if (!focusRequest) {
      return
    }

    const targetRow = Array.from(document.querySelectorAll<HTMLElement>('.editor-row')).find(
      (row) => row.dataset.blockId === focusRequest.blockId,
    )
    const targetInput = targetRow ? getFocusTargetForMode(targetRow, focusRequest.mode) : null

    if (!targetInput) {
      return
    }

    targetInput.focus()

    if (targetInput instanceof HTMLInputElement || targetInput instanceof HTMLTextAreaElement) {
      targetInput.setSelectionRange(targetInput.value.length, targetInput.value.length)
    } else {
      const range = document.createRange()
      range.selectNodeContents(targetInput)
      range.collapse(false)
      window.getSelection()?.removeAllRanges()
      window.getSelection()?.addRange(range)
    }

    pendingFocusBlockId.current = null
  }, [page.blocks, focusRequestVersion])

  useEffect(
    () => () => {
      if (scrollFrameId.current !== null) {
        cancelEditorFrame(scrollFrameId.current)
      }
    },
    [],
  )

  function clearDragState() {
    draggingBlockId.current = null
    setDraggingVisualBlockId(null)
    setDropTarget(null)
  }

  function getDropPosition(element: HTMLElement, clientY: number): ReorderPosition {
    const rect = element.getBoundingClientRect()
    return clientY < rect.top + rect.height / 2 ? 'before' : 'after'
  }

  function handleChangeTextStyle(
    block: Extract<
      BlockRecord,
      {
        type:
          | 'paragraph'
          | 'heading_1'
          | 'heading_2'
          | 'heading_3'
          | 'todo'
          | 'bulleted_list'
          | 'numbered_list'
      }
    >,
    nextStyle: TextBlockStyle,
  ) {
    onUpdateBlock(block.id, {
      ...block,
      textColor: nextStyle.textColor,
      backgroundColor: nextStyle.backgroundColor,
      textAlign: nextStyle.textAlign,
    })
  }

  function renderBlockRow(block: BlockRecord, children: ReactNode) {
    const blockId = block.id
    const textStyleableBlock = isTextStyleableBlock(block) ? block : null
    const textStyle = textStyleableBlock ? getTextBlockStyle(textStyleableBlock) : undefined
    const content = textStyle ? (
      <div className="block-style-surface" style={getTextBackgroundStyle(textStyle)}>
        {children}
      </div>
    ) : (
      children
    )
    const isDragging = draggingVisualBlockId === blockId
    const dropPosition = dropTarget?.blockId === blockId ? dropTarget.position : null
    const rowClassName = [
      'editor-row',
      isDragging ? 'editor-row-dragging' : '',
      dropPosition === 'before' ? 'editor-row-drop-target-before' : '',
      dropPosition === 'after' ? 'editor-row-drop-target-after' : '',
    ]
      .filter(Boolean)
      .join(' ')

    return (
      <div
        key={blockId}
        id={getBlockAnchorId(blockId)}
        data-block-id={blockId}
        className={rowClassName}
        onDragOver={(event) => {
          event.preventDefault()

          if (!draggingBlockId.current || draggingBlockId.current === blockId) {
            setDropTarget(null)
            return
          }

          const position = getDropPosition(event.currentTarget, event.clientY)
          setDropTarget((current) =>
            current?.blockId === blockId && current.position === position
              ? current
              : { blockId, position },
          )
        }}
        onDragLeave={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
            setDropTarget((current) => (current?.blockId === blockId ? null : current))
          }
        }}
        onDrop={(event) => {
          event.preventDefault()

          if (draggingBlockId.current && draggingBlockId.current !== blockId) {
            const position =
              dropTarget?.blockId === blockId
                ? dropTarget.position
                : getDropPosition(event.currentTarget, event.clientY)
            onReorderBlock?.(draggingBlockId.current, blockId, position)
          }
          clearDragState()
        }}
      >
        <BlockFrame
          textStyle={textStyle}
          allowedBlockTypes={allowedBlockTypes}
          onDragStart={() => {
            draggingBlockId.current = blockId
            setDraggingVisualBlockId(blockId)
            setDropTarget(null)
          }}
          onDragEnd={clearDragState}
          onChangeTextStyle={
            textStyleableBlock
              ? (nextStyle) => handleChangeTextStyle(textStyleableBlock, nextStyle)
              : undefined
          }
          onTurnInto={(type) => {
            void turnBlockInto(blockId, type)
          }}
          onDuplicate={() => onDuplicateBlock?.(blockId)}
          onDelete={() => onDeleteBlock?.(blockId)}
        >
          {content}
        </BlockFrame>
      </div>
    )
  }

  function getListBlockIndex(blockId: string, type: 'bulleted_list' | 'numbered_list') {
    const blockIndex = page.blocks.findIndex((block) => block.id === blockId)

    if (blockIndex < 0) {
      return 0
    }

    let listIndex = 0
    for (let index = blockIndex; index >= 0; index -= 1) {
      const currentBlock = page.blocks[index]

      if (currentBlock.type !== type) {
        break
      }

      listIndex += 1
    }

    return listIndex - 1
  }

  function requestBlockFocus(blockId: string, mode: FocusRequest['mode'] = 'any') {
    pendingFocusBlockId.current = { blockId, mode }
    setFocusRequestVersion((version) => version + 1)
  }

  async function insertBlockAfter(blockId: string, type: BlockType) {
    const nextBlockId = await onInsertBlockAfter?.(blockId, type)

    if (nextBlockId) {
      requestBlockFocus(nextBlockId)
    }
  }

  async function insertBlock(type: BlockType) {
    const nextBlockId = await onInsert?.(type)

    if (nextBlockId) {
      requestBlockFocus(nextBlockId, getFocusModeForBlockType(type))
    }
  }

  async function mergeBlockWithPrevious(blockId: string) {
    const targetBlockId = await onMergeBlockWithPrevious?.(blockId)

    if (targetBlockId) {
      requestBlockFocus(targetBlockId)
    }
  }

  async function turnBlockInto(blockId: string, type: BlockType) {
    await onTurnInto?.(blockId, type)
    requestBlockFocus(blockId, getFocusModeForBlockType(type))
  }

  function focusPreviousBlockAfterDelete(blockId: string) {
    const currentIndex = page.blocks.findIndex((block) => block.id === blockId)
    const previousBlockId = currentIndex > 0 ? page.blocks[currentIndex - 1]?.id : null

    if (previousBlockId) {
      requestBlockFocus(previousBlockId)
    }
  }

  function isAtInputStart(target: HTMLElement) {
    if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) {
      return target.selectionStart === 0 && target.selectionEnd === 0
    }

    const selection = window.getSelection()

    if (!selection || selection.rangeCount === 0 || !selection.isCollapsed) {
      return false
    }

    const range = selection.getRangeAt(0)
    if (!target.contains(range.commonAncestorContainer)) {
      return false
    }

    const beforeSelection = range.cloneRange()
    beforeSelection.selectNodeContents(target)
    beforeSelection.setEnd(range.startContainer, range.startOffset)

    return beforeSelection.toString().length === 0
  }

  function isAtInputEnd(target: HTMLElement) {
    if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) {
      return (
        target.selectionStart === target.value.length && target.selectionEnd === target.value.length
      )
    }

    const selection = window.getSelection()

    if (!selection || selection.rangeCount === 0 || !selection.isCollapsed) {
      return false
    }

    const range = selection.getRangeAt(0)
    if (!target.contains(range.commonAncestorContainer)) {
      return false
    }

    const afterSelection = range.cloneRange()
    afterSelection.selectNodeContents(target)
    afterSelection.setStart(range.endContainer, range.endOffset)

    return afterSelection.toString().length === 0
  }

  function focusEmptyBlockRow() {
    const input = document.querySelector<HTMLInputElement>('.empty-block-input')
    input?.focus()

    if (input) {
      scheduleInputScroll(input)
    }
  }

  function isFinalBlock(blockId: string) {
    return page.blocks[page.blocks.length - 1]?.id === blockId
  }

  function keepInputInView(event: { target: EventTarget | null }) {
    if (!(event.target instanceof HTMLElement)) {
      return
    }

    const input = event.target.closest<HTMLElement>('.block-input, .empty-block-input')

    if (!input) {
      return
    }

    scheduleInputScroll(input)
  }

  function scheduleInputScroll(input: HTMLElement) {
    if (scrollFrameId.current !== null) {
      cancelEditorFrame(scrollFrameId.current)
    }

    scrollFrameId.current = requestEditorFrame(() => {
      const bottomPadding = 300
      const overflowBottom = input.getBoundingClientRect().bottom - window.innerHeight + bottomPadding

      if (overflowBottom > 0) {
        window.scrollBy({ top: overflowBottom, behavior: 'auto' })
      }

      scrollFrameId.current = null
    })
  }

  useEffect(() => {
    if (!(document.activeElement instanceof HTMLElement)) {
      return
    }

    const input = document.activeElement.closest<HTMLElement>('.block-input, .empty-block-input')

    if (input) {
      scheduleInputScroll(input)
    }
  }, [page.blocks])

  function getEditableBlockText(block: Extract<
    BlockRecord,
    {
      type:
        | 'paragraph'
        | 'heading_1'
        | 'heading_2'
        | 'heading_3'
        | 'todo'
        | 'bulleted_list'
        | 'numbered_list'
    }
  >) {
    return block.type === 'bulleted_list' || block.type === 'numbered_list'
      ? normalizeListItemText(block.items[0] ?? '')
      : block.text
  }

  function getLiveEditableBlockText(
    target: HTMLElement,
    block: Extract<
      BlockRecord,
      {
        type:
          | 'paragraph'
          | 'heading_1'
          | 'heading_2'
          | 'heading_3'
          | 'todo'
          | 'bulleted_list'
          | 'numbered_list'
      }
    >,
  ) {
    if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) {
      return block.type === 'bulleted_list' || block.type === 'numbered_list'
        ? normalizeListItemText(target.value)
        : target.value
    }

    return target.isContentEditable ? target.textContent ?? '' : getEditableBlockText(block)
  }

  function handleEditableBlockKeyDown(
    event: KeyboardEvent<HTMLElement>,
    block: Extract<
      BlockRecord,
      {
        type:
          | 'paragraph'
          | 'heading_1'
          | 'heading_2'
          | 'heading_3'
          | 'todo'
          | 'bulleted_list'
          | 'numbered_list'
      }
    >,
  ) {
    if (
      event.key === 'ArrowDown' &&
      !event.shiftKey &&
      !event.altKey &&
      !event.ctrlKey &&
      !event.metaKey &&
      !event.nativeEvent.isComposing &&
      isFinalBlock(block.id) &&
      isAtInputEnd(event.currentTarget)
    ) {
      event.preventDefault()
      focusEmptyBlockRow()
      return
    }

    if (
      event.key === 'Enter' &&
      !event.shiftKey &&
      !event.altKey &&
      !event.ctrlKey &&
      !event.metaKey &&
      !event.nativeEvent.isComposing
    ) {
      event.preventDefault()
      if (block.type === 'bulleted_list' || block.type === 'numbered_list') {
        if (getLiveEditableBlockText(event.currentTarget, block).trim().length === 0) {
          void turnBlockInto(block.id, 'paragraph')
        } else {
          void insertBlockAfter(block.id, block.type)
        }
        return
      }

      void insertBlockAfter(block.id, block.type === 'todo' ? 'todo' : 'paragraph')
      return
    }

    if (event.key !== 'Backspace' || event.nativeEvent.isComposing) {
      return
    }

    const target = event.currentTarget

    if (!isAtInputStart(target)) {
      return
    }

    event.preventDefault()

    if (getLiveEditableBlockText(target, block).trim().length === 0) {
      focusPreviousBlockAfterDelete(block.id)
      onDeleteBlock?.(block.id)
      return
    }

    void mergeBlockWithPrevious(block.id)
  }

  return (
    <section className="editor-surface" onInput={keepInputInView}>
      {page.blocks.map((block) => {
        switch (block.type) {
          case 'paragraph':
          case 'heading_1':
          case 'heading_2':
          case 'heading_3': {
            const textStyle = getTextBlockStyle(block)
            return renderBlockRow(
              block,
              <ParagraphBlock
                variant={block.type}
                value={block.text}
                richText={block.richText}
                style={getTextInputStyle(textStyle)}
                onChange={({ text, richText }) => onUpdateBlock(block.id, { ...block, text, richText })}
                onKeyDown={(event) => handleEditableBlockKeyDown(event, block)}
              />,
            )
          }
          case 'todo': {
            const textStyle = getTextBlockStyle(block)
            return renderBlockRow(
              block,
              <TodoBlock
                text={block.text}
                richText={block.richText}
                checked={block.checked}
                style={getTextInputStyle(textStyle)}
                onChange={({ text, richText, checked }) =>
                  onUpdateBlock(block.id, { ...block, text, richText, checked })
                }
                onKeyDown={(event) => handleEditableBlockKeyDown(event, block)}
              />,
            )
          }
          case 'bulleted_list':
          case 'numbered_list': {
            const textStyle = getTextBlockStyle(block)
            return renderBlockRow(
              block,
              <ListBlock
                type={block.type}
                value={normalizeListItemText(block.items[0] ?? '')}
                index={getListBlockIndex(block.id, block.type)}
                style={getTextInputStyle(textStyle)}
                onChange={(value) =>
                  onUpdateBlock(block.id, {
                    ...block,
                    items: [normalizeListItemText(value)],
                  })
                }
                onKeyDown={(event) => handleEditableBlockKeyDown(event, block)}
              />,
            )
          }
          case 'code':
            return renderBlockRow(
              block,
              <CodeBlock
                language={block.language}
                text={block.text}
                onChange={({ language, text }) => onUpdateBlock(block.id, { ...block, language, text })}
              />,
            )
          case 'table':
            return renderBlockRow(
              block,
              <TableBlock
                rows={block.rows}
                cellStyles={block.cellStyles}
                columnWidths={block.columnWidths}
                rowHeights={block.rowHeights}
                onChange={(rows, details) =>
                  onUpdateBlock(block.id, {
                    ...block,
                    rows,
                    cellStyles: details ? details.cellStyles : block.cellStyles,
                    columnWidths: details ? details.columnWidths : block.columnWidths,
                    rowHeights: details ? details.rowHeights : block.rowHeights,
                  })
                }
              />,
            )
          case 'child_page':
            return renderBlockRow(
              block,
              <ChildPageBlock
                title={childPageTitleMap[block.pageId] ?? uiCopy.page.untitled}
                onOpen={() => onOpenChildPage?.(block.pageId)}
              />,
            )
          case 'whiteboard': {
            const board = boardMap.get(block.boardId)

            return renderBlockRow(
              block,
              <WhiteboardBlock
                title={board?.title ?? '白板不存在'}
                updatedLabel={board ? formatCanvasUpdatedLabel(board.updatedAt) : '\u5f15\u7528\u5df2\u4e22\u5931'}
                previewUrl={board ? buildWhiteboardPreviewSvgDataUrl(board.snapshot) : null}
                isMissing={!board}
                onOpen={() => onOpenWhiteboard?.(block.boardId)}
                onRecover={!board ? () => onRestoreWhiteboard?.(block.boardId) : undefined}
              />,
            )
          }
          case 'data_table': {
            const dataTable = dataTableMap.get(block.databaseId)

            return renderBlockRow(
              block,
              <DataTableBlock
                title={dataTable?.title ?? '数据表格不存在'}
                updatedLabel={dataTable ? formatDataTableMeta(dataTable) : '引用已丢失'}
                recordTitles={dataTable ? getDataTableRecordTitles(dataTable) : []}
                isMissing={!dataTable}
                onOpen={() => onOpenDataTable?.(block.databaseId)}
                onRecover={!dataTable ? () => onRestoreDataTable?.(block.databaseId) : undefined}
              />,
            )
          }

          default:
            return null
        }
      })}
      <EmptyBlockRow
        allowedBlockTypes={allowedBlockTypes}
        onInsert={(type) => {
          void insertBlock(type)
        }}
        onInsertParagraph={(text) => {
          onInsertParagraph?.(text)
        }}
      />
    </section>
  )
}

function getFocusTargetForMode(row: HTMLElement, mode: FocusRequest['mode']) {
  switch (mode) {
    case 'rich_text':
      return row.querySelector<HTMLElement>('.block-frame-content [contenteditable="true"]')
    case 'textarea':
      return row.querySelector<HTMLElement>('.block-frame-content textarea')
    case 'any':
      return row.querySelector<HTMLElement>(
        '.block-frame-content [contenteditable="true"], .block-frame-content textarea, .block-frame-content input:not([type="checkbox"])',
      )
  }
}

function getFocusModeForBlockType(type: BlockType): FocusRequest['mode'] {
  switch (type) {
    case 'paragraph':
    case 'heading_1':
    case 'heading_2':
    case 'heading_3':
    case 'todo':
      return 'rich_text'
    case 'bulleted_list':
    case 'numbered_list':
    case 'code':
      return 'textarea'
    default:
      return 'any'
  }
}

function normalizeListItemText(value: string) {
  return value.replace(/\r\n?/g, '\n').replace(/\n+/g, ' ')
}

function requestEditorFrame(callback: () => void) {
  if (typeof window.requestAnimationFrame === 'function') {
    return window.requestAnimationFrame(callback)
  }

  return window.setTimeout(callback, 0)
}

function cancelEditorFrame(frameId: number) {
  if (typeof window.cancelAnimationFrame === 'function') {
    window.cancelAnimationFrame(frameId)
    return
  }

  window.clearTimeout(frameId)
}

function formatCanvasUpdatedLabel(updatedAt: string) {
  const timestamp = Date.parse(updatedAt)

  if (Number.isNaN(timestamp)) {
    return '\u5df2\u66f4\u65b0'
  }

  const elapsedMinutes = Math.max(0, Math.floor((Date.now() - timestamp) / 60000))

  if (elapsedMinutes < 1) {
    return '\u521a\u521a\u66f4\u65b0'
  }

  if (elapsedMinutes < 60) {
    return `${elapsedMinutes} \u5206\u949f\u524d\u66f4\u65b0`
  }

  const elapsedHours = Math.floor(elapsedMinutes / 60)

  if (elapsedHours < 24) {
    return `${elapsedHours} \u5c0f\u65f6\u524d\u66f4\u65b0`
  }

  const date = new Date(timestamp)
  return `${date.getMonth() + 1}\u6708${date.getDate()}\u65e5\u66f4\u65b0`
}

function formatDataTableMeta(dataTable: DataTableRecord) {
  const updatedLabel = formatCanvasUpdatedLabel(dataTable.updatedAt)
  const snapshot = dataTable.snapshot

  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) {
    return updatedLabel
  }

  const { records, properties } = snapshot as {
    records?: unknown
    properties?: unknown
  }

  if (!records || typeof records !== 'object' || Array.isArray(records)) {
    return updatedLabel
  }

  if (!properties || typeof properties !== 'object' || Array.isArray(properties)) {
    return updatedLabel
  }

  return `${Object.keys(records).length} 条记录 · ${Object.keys(properties).length} 个字段 · ${updatedLabel}`
}

function getDataTableRecordTitles(dataTable: DataTableRecord) {
  const snapshot = dataTable.snapshot

  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) {
    return []
  }

  const records = (snapshot as { records?: unknown }).records

  if (!records || typeof records !== 'object' || Array.isArray(records)) {
    return []
  }

  return Object.values(records)
    .flatMap((record) => {
      if (!record || typeof record !== 'object' || Array.isArray(record)) {
        return []
      }

      const title = (record as { title?: unknown }).title
      return typeof title === 'string' && title.trim() ? [title.trim()] : []
    })
    .slice(0, 3)
}
