import type { KeyboardEvent, ReactNode } from 'react'
import { useEffect, useRef, useState } from 'react'
import { getTextBlockStyle, isTextStyleableBlock } from '../../domain/blockTextStyle'
import type {
  BlockRecord,
  BlockType,
  BoardRecord,
  MindmapRecord,
  PageRecord,
  TextBlockStyle,
} from '../../domain/types'
import { uiCopy } from '../../ui/copy'
import { buildMindmapPreviewSvgDataUrl } from '../mindmap/mindmapPreview'
import { buildWhiteboardPreviewSvgDataUrl } from '../whiteboard/whiteboardPreview'
import { EmptyBlockRow } from './EmptyBlockRow'
import { BlockFrame } from './BlockFrame'
import { getBlockAnchorId } from './blockAnchors'
import { getTextBackgroundStyle, getTextInputStyle } from './blockTextStyle'
import { ChildPageBlock } from './blocks/ChildPageBlock'
import { CodeBlock } from './blocks/CodeBlock'
import { ListBlock } from './blocks/ListBlock'
import { MindmapBlock } from './blocks/MindmapBlock'
import { ParagraphBlock } from './blocks/ParagraphBlock'
import { TableBlock } from './blocks/TableBlock'
import { TodoBlock } from './blocks/TodoBlock'
import { WhiteboardBlock } from './blocks/WhiteboardBlock'
import type { ReorderPosition } from '../../utils/reorder'

interface DropTarget {
  blockId: string
  position: ReorderPosition
}

interface BlockEditorProps {
  page: PageRecord
  allPages: PageRecord[]
  boards?: BoardRecord[]
  mindmaps?: MindmapRecord[]
  onUpdateBlock: (blockId: string, nextBlock: BlockRecord) => void
  onInsert?: (type: BlockType) => void
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
  onOpenMindmap?: (mindmapId: string) => void
}

export function BlockEditor({
  page,
  allPages,
  boards = [],
  mindmaps = [],
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
  onOpenMindmap,
}: BlockEditorProps) {
  const childPageTitleMap = Object.fromEntries(allPages.map((item) => [item.id, item.title]))
  const boardMap = new Map(boards.map((board) => [board.id, board]))
  const mindmapMap = new Map(mindmaps.map((mindmap) => [mindmap.id, mindmap]))
  const draggingBlockId = useRef<string | null>(null)
  const pendingFocusBlockId = useRef<string | null>(null)
  const [draggingVisualBlockId, setDraggingVisualBlockId] = useState<string | null>(null)
  const [dropTarget, setDropTarget] = useState<DropTarget | null>(null)
  const [focusRequestVersion, setFocusRequestVersion] = useState(0)

  useEffect(() => {
    const blockId = pendingFocusBlockId.current

    if (!blockId) {
      return
    }

    const targetRow = Array.from(document.querySelectorAll<HTMLElement>('.editor-row')).find(
      (row) => row.dataset.blockId === blockId,
    )
    const targetInput = targetRow?.querySelector<HTMLElement>(
      '.block-frame-content [contenteditable="true"], .block-frame-content textarea, .block-frame-content input:not([type="checkbox"])',
    )

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
          onTurnInto={(type) => onTurnInto?.(blockId, type)}
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

  function requestBlockFocus(blockId: string) {
    pendingFocusBlockId.current = blockId
    setFocusRequestVersion((version) => version + 1)
  }

  async function insertBlockAfter(blockId: string, type: BlockType) {
    const nextBlockId = await onInsertBlockAfter?.(blockId, type)

    if (nextBlockId) {
      requestBlockFocus(nextBlockId)
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
    requestBlockFocus(blockId)
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
      ? block.items[0] ?? ''
      : block.text
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
      event.key === 'Enter' &&
      !event.shiftKey &&
      !event.altKey &&
      !event.ctrlKey &&
      !event.metaKey &&
      !event.nativeEvent.isComposing
    ) {
      event.preventDefault()
      if (block.type === 'bulleted_list' || block.type === 'numbered_list') {
        if (getEditableBlockText(block).trim().length === 0) {
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

    if (getEditableBlockText(block).trim().length === 0) {
      focusPreviousBlockAfterDelete(block.id)
      onDeleteBlock?.(block.id)
      return
    }

    void mergeBlockWithPrevious(block.id)
  }

  return (
    <section className="editor-surface">
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
                value={block.items[0] ?? ''}
                index={getListBlockIndex(block.id, block.type)}
                style={getTextInputStyle(textStyle)}
                onChange={(value) => onUpdateBlock(block.id, { ...block, items: [value] })}
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
                updatedLabel={board ? '刚刚更新' : '引用已丢失'}
                previewUrl={board ? buildWhiteboardPreviewSvgDataUrl(board.snapshot) : null}
                isMissing={!board}
                onOpen={() => onOpenWhiteboard?.(block.boardId)}
              />,
            )
          }
          case 'mindmap': {
            const mindmap = mindmapMap.get(block.mindmapId)

            return renderBlockRow(
              block,
              <MindmapBlock
                title={mindmap?.title ?? '思维导图不存在'}
                updatedLabel={mindmap ? '刚刚更新' : '引用已丢失'}
                previewUrl={mindmap ? buildMindmapPreviewSvgDataUrl(mindmap) : null}
                isMissing={!mindmap}
                onOpen={() => onOpenMindmap?.(block.mindmapId)}
              />,
            )
          }
          default:
            return null
        }
      })}
      <EmptyBlockRow
        onInsert={(type) => {
          onInsert?.(type)
        }}
        onInsertParagraph={(text) => {
          onInsertParagraph?.(text)
        }}
      />
    </section>
  )
}
