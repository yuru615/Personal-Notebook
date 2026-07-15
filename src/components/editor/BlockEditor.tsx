import type { KeyboardEvent, ReactNode } from 'react'
import type { RefObject } from 'react'
import { useEffect, useRef, useState } from 'react'
import { Suspense, lazy } from 'react'
import { getTextBlockStyle, isTextStyleableBlock } from '../../domain/blockTextStyle'
import type {
  BlockRecord,
  BlockSelectionStartMode,
  BlockType,
  BoardRecord,
  DataTableRecord,
  ExternalLinkOpenMode,
  MindmapRecord,
  PageRecord,
  SyncedBlockGroupRecord,
  SyncedBlockMode,
  TextBlockStyle,
} from '../../domain/types'
import {
  clipboardHtmlToStructuredPasteItems,
  type ClipboardStructuredPasteItem,
} from '../../domain/clipboardCapture'
import { parseMarkdownBlocks } from '../../domain/markdownImport'
import {
  buildSyncedPickerItems,
  collectSyncedGroupInstances,
  findPrimaryInstanceLocation,
} from '../../domain/syncedBlocks'
import type { AssetMeta } from '../../lib/storageClient'
import { importImageAssetFromPath, writeAssetBytes } from '../../lib/assets'
import { readDesktopClipboardCandidate } from '../../lib/desktopLifecycle'
import { uiCopy } from '../../ui/copy'
import { buildMindmapPreviewSvgDataUrl } from '../mindmap/mindmapPreview'
import { buildWhiteboardPreviewSvgDataUrl } from '../whiteboard/whiteboardPreview'
import { EmptyBlockRow } from './EmptyBlockRow'
import { BlockFrame } from './BlockFrame'
import { getBlockAnchorId } from './blockAnchors'
import { getTextBackgroundStyle, getTextInputStyle } from './blockTextStyle'
import { useFloatingMenuLayout } from './floatingMenu'
import { ChildPageBlock } from './blocks/ChildPageBlock'
import { CodeBlock } from './blocks/CodeBlock'
import { DataTableBlock } from './blocks/DataTableBlock'
import { ListBlock } from './blocks/ListBlock'
import { ParagraphBlock } from './blocks/ParagraphBlock'
import { SyncedBlockContainer } from './blocks/SyncedBlockContainer'
import { TableBlock } from './blocks/TableBlock'
import { TodoBlock } from './blocks/TodoBlock'
import { MediaBlock } from './blocks/MediaBlock'
import { FileBlock } from './blocks/FileBlock'
import { openAssetFile } from '../../lib/assetFiles'
import { MindmapBlock } from './blocks/MindmapBlock'
import { WhiteboardBlock } from './blocks/WhiteboardBlock'
import type { DesktopPasteFallback, PastedImageSource } from './RichTextEditable'
import { SyncedBlockPickerDialog } from './SyncedBlockPickerDialog'
import { getSlashMenuOptions, SlashMenu, type SlashMenuCommand } from './SlashMenu'
import type { ReorderPosition } from '../../utils/reorder'
import type { PageRelationAutocompleteItem } from './PageRelationAutocomplete'
import { createBlock } from '../../utils/blockFactory'
import { createId } from '../../utils/id'

const BLOCK_CLIPBOARD_MIME_TYPE = 'application/x-zhiqi-blocks+json'
const blockTypes = new Set<BlockType>([
  'paragraph',
  'heading_1',
  'heading_2',
  'heading_3',
  'todo',
  'bulleted_list',
  'numbered_list',
  'child_page',
  'code',
  'table',
  'image',
  'video',
  'audio',
  'file',
  'whiteboard',
  'data_table',
  'mindmap',
  'synced_block',
])

function parseCopiedBlocks(rawValue: string): BlockRecord[] | null {
  if (!rawValue) {
    return null
  }

  try {
    const parsed = JSON.parse(rawValue) as unknown
    if (
      !Array.isArray(parsed) ||
      parsed.length === 0 ||
      !parsed.every(
        (block) =>
          typeof block === 'object' &&
          block !== null &&
          typeof (block as { id?: unknown }).id === 'string' &&
          typeof (block as { type?: unknown }).type === 'string' &&
          blockTypes.has((block as { type: BlockType }).type),
      )
    ) {
      return null
    }

    return parsed as BlockRecord[]
  } catch {
    return null
  }
}

function createPastedBlockCopies(blocks: BlockRecord[]): BlockRecord[] {
  return blocks.map((block) => {
    const copy = structuredClone(block)
    if (copy.type === 'synced_block') {
      return { ...copy, id: createId('block'), instanceId: createId('synced-instance') }
    }

    return { ...copy, id: createId('block') }
  })
}

function copiedBlocksToPlainText(blocks: BlockRecord[]) {
  return blocks
    .map((block) => {
      if ('text' in block) {
        return block.text
      }
      if ('items' in block) {
        return block.items.join('\n')
      }
      if (block.type === 'table') {
        return block.rows.map((row) => row.join('\t')).join('\n')
      }
      return ''
    })
    .filter(Boolean)
    .join('\n\n')
}

const EmbeddedDataTableBlock = lazy(() =>
  import('./blocks/EmbeddedDataTableBlock').then((module) => ({
    default: module.EmbeddedDataTableBlock,
  })),
)

interface DropTarget {
  blockId: string
  position: ReorderPosition
}
interface FocusRequest {
  blockId: string
  mode: 'any' | 'rich_text' | 'textarea' | 'delete_target'
}
interface BlockSlashCommand {
  blockId: string
  query: string
  activeOptionIndex: number
}

interface PendingSyncedPicker {
  mode: SyncedBlockMode
  target: { kind: 'replace'; blockId: string } | { kind: 'append' }
}

interface SelectionRect {
  left: number
  top: number
  width: number
  height: number
}

interface MarqueePoint {
  x: number
  y: number
  documentY: number
}

function getCaretRangeAtPoint(clientX: number, clientY: number) {
  const documentWithCaretRange = document as Document & {
    caretRangeFromPoint?: (x: number, y: number) => Range | null
  }

  return documentWithCaretRange.caretRangeFromPoint?.(clientX, clientY) ?? null
}

const MARQUEE_START_THRESHOLD = 6
const SAFE_SELECTION_ZONE_WIDTH = 44

type PasteTargetBlock = Extract<
  BlockRecord,
  {
    type: 'paragraph' | 'heading_1' | 'heading_2' | 'heading_3' | 'todo'
  }
>

function isPlainEmptyParagraphBlock(block: BlockRecord) {
  return (
    block.type === 'paragraph' &&
    block.text.trim().length === 0 &&
    (!block.richText || block.richText.every((segment) => segment.text.length === 0)) &&
    !block.textColor &&
    !block.backgroundColor &&
    !block.textAlign
  )
}

function isEmptyPasteTargetBlock(block: PasteTargetBlock) {
  return (
    block.text.trim().length === 0 &&
    (!block.richText || block.richText.every((segment) => segment.text.trim().length === 0))
  )
}

function isMarkdownClipboardText(value: string) {
  return (
    /(^|\n)\s{0,3}(?:#{1,3}\s+|[-*+]\s+(?:\[[ xX]\]\s+)?|\d+[.)]\s+|`{3,}|~{3,}|\|.+\|\s*\n\s*\|\s*:?-{3,})/.test(
      value,
    ) || /\*\*[^*]+\*\*|~~[^~]+~~|`[^`]+`|\*[^*\n]+\*|\[[^\]]+\]\(https?:\/\//.test(value)
  )
}

interface BlockEditorProps {
  page: PageRecord
  allPages: PageRecord[]
  boards?: BoardRecord[]
  dataTables?: DataTableRecord[]
  mindmaps?: MindmapRecord[]
  syncedBlockGroups?: SyncedBlockGroupRecord[]
  allowedBlockTypes?: BlockType[]
  onUpdateBlock: (blockId: string, nextBlock: BlockRecord) => void
  onPasteBlocks?: (
    targetBlockId: string | null,
    blocks: BlockRecord[],
    replaceTarget?: boolean,
  ) => Promise<void> | void
  onInsert?: (type: BlockType) => Promise<string | null> | string | null | void
  onInsertParagraph?: (text: string) => void
  onInsertBlockAfter?: (
    blockId: string,
    type: BlockType,
    position?: 'before' | 'after',
  ) => Promise<string | null> | string | null
  onDeleteBlock?: (blockId: string) => void
  onDeleteBlocks?: (blockIds: string[]) => Promise<void> | void
  onMergeBlockWithPrevious?: (blockId: string) => Promise<string | null> | string | null
  onDuplicateBlock?: (blockId: string) => void
  onTurnInto?: (blockId: string, type: BlockType) => Promise<void> | void
  blockSelectionStartMode?: BlockSelectionStartMode
  linkOpenMode?: ExternalLinkOpenMode
  selectionHostRef?: RefObject<HTMLElement | null>
  onReorderBlock?: (
    activeBlockId: string,
    overBlockId: string,
    position: ReorderPosition,
  ) => void
  onReorderBlockGroup?: (
    activeBlockIds: string[],
    overBlockId: string,
    position: ReorderPosition,
  ) => Promise<void> | void
  onOpenChildPage?: (pageId: string) => void
  onOpenWhiteboard?: (boardId: string) => void
  onRestoreWhiteboard?: (boardId: string) => void
  onOpenDataTable?: (databaseId: string) => void
  onRestoreDataTable?: (databaseId: string) => void
  onUpdateDataTableSnapshot?: (databaseId: string, snapshot: unknown) => void
  onOpenMindmap?: (mindmapId: string) => void
  onRestoreMindmap?: (mindmapId: string) => void
  onCreatePageRelation?: (title: string) => Promise<PageRelationAutocompleteItem>
  onCreateSyncedBlockFromRange?: (
    startBlockId: string,
    endBlockId: string,
  ) => Promise<unknown> | unknown
  onCreateSyncedBlockFromExistingBlock?: (
    sourcePageId: string,
    sourceBlockId: string,
    targetBlockId: string,
    mode: SyncedBlockMode,
  ) => Promise<unknown> | unknown
  onReplaceBlockWithSyncedInstance?: (
    blockId: string,
    groupId: string,
    mode: SyncedBlockMode,
  ) => Promise<unknown> | unknown
  onUpdateSyncedGroupBlock?: (groupId: string, blockId: string, nextBlock: BlockRecord) => void
  onUnsyncBlockInstance?: (blockId: string) => void
  onOpenPrimarySyncedBlock?: (pageId: string, blockId: string) => void
}

export function BlockEditor({
  page,
  allPages,
  boards = [],
  dataTables = [],
  mindmaps = [],
  syncedBlockGroups = [],
  allowedBlockTypes,
  onUpdateBlock,
  onPasteBlocks,
  onInsert,
  onInsertParagraph,
  onInsertBlockAfter,
  onDeleteBlock,
  onDeleteBlocks,
  onMergeBlockWithPrevious,
  onDuplicateBlock,
  onTurnInto,
  blockSelectionStartMode,
  linkOpenMode = 'modifier',
  selectionHostRef,
  onReorderBlock,
  onReorderBlockGroup,
  onOpenChildPage,
  onOpenWhiteboard,
  onRestoreWhiteboard,
  onOpenDataTable,
  onRestoreDataTable,
  onUpdateDataTableSnapshot,
  onOpenMindmap,
  onRestoreMindmap,
  onCreatePageRelation,
  onCreateSyncedBlockFromRange,
  onCreateSyncedBlockFromExistingBlock,
  onReplaceBlockWithSyncedInstance,
  onUpdateSyncedGroupBlock,
  onUnsyncBlockInstance,
  onOpenPrimarySyncedBlock,
}: BlockEditorProps) {
  const pageById = new Map(allPages.map((item) => [item.id, item]))
  const relationPages = allPages.map(({ id, title, icon, parentId }) => ({
    id,
    title,
    icon,
    parentId,
    pathLabel: buildPageRelationPathLabel(pageById, id),
  }))
  const childPageMap = pageById
  const boardMap = new Map(boards.map((board) => [board.id, board]))
  const dataTableMap = new Map(dataTables.map((dataTable) => [dataTable.id, dataTable]))
  const mindmapMap = new Map(mindmaps.map((mindmap) => [mindmap.id, mindmap]))
  const syncedBlockGroupMap = new Map(syncedBlockGroups.map((group) => [group.id, group]))
  const draggingBlockId = useRef<string | null>(null)
  const pendingFocusBlockId = useRef<FocusRequest | null>(null)
  const scrollFrameId = useRef<number | null>(null)
  const surfaceRef = useRef<HTMLElement | null>(null)
  const slashMenuAnchorRef = useRef<HTMLDivElement | null>(null)
  const slashMenuRef = useRef<HTMLDivElement | null>(null)
  const marqueeStartRef = useRef<MarqueePoint | null>(null)
  const editableMarqueeCandidateRef = useRef<{
    row: HTMLElement
    start: MarqueePoint
  } | null>(null)
  const marqueePointerRef = useRef<{ x: number; y: number } | null>(null)
  const trailingSurfaceMarqueeCandidateRef = useRef(false)
  const textSelectionStartRef = useRef<{ range: Range; root: HTMLElement } | null>(null)
  const marqueeActiveRef = useRef(false)
  const [draggingVisualBlockId, setDraggingVisualBlockId] = useState<string | null>(null)
  const [dropTarget, setDropTarget] = useState<DropTarget | null>(null)
  const [blockSlashCommand, setBlockSlashCommand] = useState<BlockSlashCommand | null>(null)
  const [syncedRangeStartBlockId, setSyncedRangeStartBlockId] = useState<string | null>(null)
  const [pendingSyncedPicker, setPendingSyncedPicker] = useState<PendingSyncedPicker | null>(null)
  const [selectedBlockIds, setSelectedBlockIds] = useState<string[]>([])
  const [selectionRect, setSelectionRect] = useState<SelectionRect | null>(null)
  const [draggingSelectionBlockIds, setDraggingSelectionBlockIds] = useState<string[] | null>(null)
  const [focusRequestVersion, setFocusRequestVersion] = useState(0)
  const blockSlashMenuOptions = blockSlashCommand
    ? getSlashMenuOptions(blockSlashCommand.query, allowedBlockTypes)
    : []
  const activeBlockSlashOption =
    blockSlashCommand &&
    blockSlashCommand.activeOptionIndex >= 0 &&
    blockSlashCommand.activeOptionIndex < blockSlashMenuOptions.length
      ? blockSlashMenuOptions[blockSlashCommand.activeOptionIndex]
      : null
  const blockSlashMenuLayout = useFloatingMenuLayout({
    open: blockSlashCommand !== null,
    anchorRef: slashMenuAnchorRef,
    menuRef: slashMenuRef,
  })
  const trailingBlock = page.blocks.length > 0 ? page.blocks[page.blocks.length - 1] : null
  const orderedSelectedBlockIds = page.blocks
    .map((block) => block.id)
    .filter((id) => selectedBlockIds.includes(id))
  const syncedPickerItems = buildSyncedPickerItems(allPages, syncedBlockGroups)

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

  useEffect(() => {
    marqueeStartRef.current = null
    editableMarqueeCandidateRef.current = null
    marqueePointerRef.current = null
    trailingSurfaceMarqueeCandidateRef.current = false
    marqueeActiveRef.current = false
    setSelectedBlockIds([])
    setSelectionRect(null)
    setDraggingSelectionBlockIds(null)
    setSyncedRangeStartBlockId(null)
    setPendingSyncedPicker(null)
    setBlockSlashCommand(null)
  }, [page.id])

  useEffect(() => {
    setSelectedBlockIds((current) => current.filter((id) => page.blocks.some((block) => block.id === id)))
  }, [page.blocks])

  useEffect(() => {
    function handlePointerMove(event: PointerEvent) {
      marqueePointerRef.current = { x: event.clientX, y: event.clientY }
      if (
        updateMarqueeSelection(event.clientX, event.clientY) ||
        updateCrossBlockTextSelection(event.clientX, event.clientY)
      ) {
        event.preventDefault()
      }
    }

    function handlePointerUp() {
      finishMarqueeSelection()
    }

    function handleWindowScroll() {
      const pointer = marqueePointerRef.current

      if (pointer && marqueeStartRef.current) {
        updateMarqueeSelection(pointer.x, pointer.y)
      }
    }

    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', handlePointerUp)
    window.addEventListener('scroll', handleWindowScroll, true)

    return () => {
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', handlePointerUp)
      window.removeEventListener('scroll', handleWindowScroll, true)
    }
  }, [])

  useEffect(() => {
    const selectionHost = selectionHostRef?.current

    if (!selectionHost) {
      return
    }

    function handleSelectionHostPointerDown(event: PointerEvent) {
      const target = event.target
      const surface = surfaceRef.current

      if (!(target instanceof Element) || !surface || surface.contains(target)) {
        return
      }

      const surfaceRect = surface.getBoundingClientRect()
      const startsBesideBody = event.clientX < surfaceRect.left || event.clientX > surfaceRect.right
      const isWithinEditorHeight =
        event.clientY >= surfaceRect.top && event.clientY <= surfaceRect.bottom

      if (event.button !== 0 || !startsBesideBody || !isWithinEditorHeight) {
        return
      }

      event.preventDefault()
      clearBlockSelection()
      marqueeStartRef.current = createMarqueePoint(event.clientX, event.clientY)
    }

    selectionHost.addEventListener('pointerdown', handleSelectionHostPointerDown, true)

    return () => {
      selectionHost.removeEventListener('pointerdown', handleSelectionHostPointerDown, true)
    }
  }, [page.id, selectionHostRef])

  function clearDragState() {
    draggingBlockId.current = null
    setDraggingVisualBlockId(null)
    setDropTarget(null)
  }

  function clearBlockSelection() {
    marqueeStartRef.current = null
    editableMarqueeCandidateRef.current = null
    marqueePointerRef.current = null
    trailingSurfaceMarqueeCandidateRef.current = false
    textSelectionStartRef.current = null
    marqueeActiveRef.current = false
    setSelectionRect(null)
    setSelectedBlockIds([])
  }

  function canStartMarqueeFrom(surface: HTMLElement, clientX: number) {
    if (blockSelectionStartMode === 'content_allowed') {
      return true
    }

    const surfaceRect = surface.getBoundingClientRect()
    return clientX - surfaceRect.left <= SAFE_SELECTION_ZONE_WIDTH
  }

  function createMarqueePoint(clientX: number, clientY: number): MarqueePoint {
    return {
      x: clientX,
      y: clientY,
      documentY: clientY + window.scrollY,
    }
  }

  function updateMarqueeSelection(clientX: number, clientY: number) {
    marqueePointerRef.current = { x: clientX, y: clientY }

    if (!marqueeStartRef.current && editableMarqueeCandidateRef.current) {
      const { row, start } = editableMarqueeCandidateRef.current
      const rowRect = row.getBoundingClientRect()

      if (clientY >= rowRect.top && clientY <= rowRect.bottom) {
        return false
      }

      marqueeStartRef.current = start
      editableMarqueeCandidateRef.current = null
    }

    const start = marqueeStartRef.current
    const surface = surfaceRef.current

    if (!start || !surface) {
      return false
    }

    if (!marqueeActiveRef.current) {
      const distance = Math.hypot(
        clientX - start.x,
        clientY + window.scrollY - start.documentY,
      )
      if (distance < MARQUEE_START_THRESHOLD) {
        return false
      }
      marqueeActiveRef.current = true
      trailingSurfaceMarqueeCandidateRef.current = false
      window.getSelection()?.removeAllRanges()
    }

    const left = Math.min(start.x, clientX)
    const startViewportY = start.documentY - window.scrollY
    const top = Math.min(startViewportY, clientY)
    const right = Math.max(start.x, clientX)
    const bottom = Math.max(startViewportY, clientY)
    const documentTop = Math.min(start.documentY, clientY + window.scrollY)
    const documentBottom = Math.max(start.documentY, clientY + window.scrollY)

    setSelectionRect({
      left,
      top: Math.max(0, top),
      width: right - left,
      height: Math.max(0, Math.min(window.innerHeight, bottom) - Math.max(0, top)),
    })

    const nextSelected = Array.from(surface.querySelectorAll<HTMLElement>('.editor-row[data-block-id]'))
      .filter((row) => {
        const rect = row.getBoundingClientRect()
        const rowTop = rect.top + window.scrollY
        const rowBottom = rect.bottom + window.scrollY
        return !(
          rect.right < left ||
          rect.left > right ||
          rowBottom < documentTop ||
          rowTop > documentBottom
        )
      })
      .map((row) => row.dataset.blockId)
      .filter((value): value is string => Boolean(value))

    setSelectedBlockIds(nextSelected)
    return true
  }

  function updateCrossBlockTextSelection(clientX: number, clientY: number) {
    const start = textSelectionStartRef.current

    if (!start) {
      return false
    }

    const target = document.elementFromPoint?.(clientX, clientY)
    const targetEditable = target?.closest<HTMLElement>('[contenteditable="true"]')

    if (!targetEditable || targetEditable === start.root) {
      return false
    }

    const end = getCaretRangeAtPoint(clientX, clientY)
    const selection = window.getSelection()

    if (!end || !selection) {
      return false
    }

    const range = document.createRange()
    range.setStart(start.range.startContainer, start.range.startOffset)
    range.setEnd(end.startContainer, end.startOffset)

    if (range.collapsed) {
      range.setStart(end.startContainer, end.startOffset)
      range.setEnd(start.range.startContainer, start.range.startOffset)
    }

    selection.removeAllRanges()
    selection.addRange(range)
    return true
  }

  function finishMarqueeSelection() {
    const didSelectBlocks = marqueeActiveRef.current
    const shouldFocusTrailingInsertTarget =
      trailingSurfaceMarqueeCandidateRef.current && !didSelectBlocks
    marqueeStartRef.current = null
    editableMarqueeCandidateRef.current = null
    textSelectionStartRef.current = null
    marqueePointerRef.current = null
    trailingSurfaceMarqueeCandidateRef.current = false
    marqueeActiveRef.current = false
    setSelectionRect(null)

    if (didSelectBlocks) {
      surfaceRef.current?.focus({ preventScroll: true })
    } else if (shouldFocusTrailingInsertTarget) {
      focusTrailingInsertTarget()
    }
  }

  function handleSurfacePress(
    surface: HTMLElement,
    target: Element,
    clientX: number,
    clientY: number,
    button: number | undefined,
    preventDefault: () => void,
  ) {
    editableMarqueeCandidateRef.current = null
    textSelectionStartRef.current = null
    trailingSurfaceMarqueeCandidateRef.current = false

    if (blockSlashCommand) {
      const targetRow = target.closest<HTMLElement>('.editor-row')
      if (
        !slashMenuRef.current?.contains(target) &&
        targetRow?.dataset.blockId !== blockSlashCommand.blockId
      ) {
        setBlockSlashCommand(null)
      }
    }

    if (target.closest('.table-resize-handle')) {
      return
    }

    if (target === surface && isPointerInTrailingSurfaceGap(surface, clientY)) {
      preventDefault()
      clearBlockSelection()
      if (blockSelectionStartMode === 'content_allowed' && button === 0) {
        trailingSurfaceMarqueeCandidateRef.current = true
        marqueeStartRef.current = createMarqueePoint(clientX, clientY)
      } else {
        focusTrailingInsertTarget()
      }
      return
    }

    if (target.closest('.block-handle')) {
      return
    }

    if (target.closest('.editor-row')) {
      clearBlockSelection()
    }

    if (target.closest('.empty-block-row')) {
      return
    }

    const editableRow = target.closest<HTMLElement>('.editor-row')
    if (target.closest('[contenteditable="true"], input, textarea, button, a, select')) {
      if (blockSelectionStartMode === 'content_allowed' && button === 0 && editableRow) {
        editableMarqueeCandidateRef.current = {
          row: editableRow,
          start: createMarqueePoint(clientX, clientY),
        }
      } else if (blockSelectionStartMode !== 'content_allowed' && button === 0) {
        const editable = target.closest<HTMLElement>('[contenteditable="true"]')
        const range = getCaretRangeAtPoint(clientX, clientY)

        if (editable && range) {
          textSelectionStartRef.current = { root: editable, range }
        }
      }
      return
    }

    if ((typeof button === 'number' && button > 0) || !canStartMarqueeFrom(surface, clientX)) {
      return
    }

    if (blockSelectionStartMode !== 'content_allowed') {
      preventDefault()
    }

    marqueeStartRef.current = createMarqueePoint(clientX, clientY)
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

  function renderBlockRow(
    block: BlockRecord,
    children: ReactNode,
    options: {
      menuAllowedBlockTypes?: BlockType[]
      extraMenuActions?: Array<{ key: string; label: string; danger?: boolean; onSelect: () => void }>
      badge?: string | null
    } = {},
  ) {
    const blockId = block.id
    const textStyleableBlock = isTextStyleableBlock(block) ? block : null
    const isInsertMenuBlock = isPlainEmptyParagraphBlock(block)
    const textStyle = textStyleableBlock ? getTextBlockStyle(textStyleableBlock) : undefined
    const content = textStyle ? (
      <div className="block-style-surface" style={getTextBackgroundStyle(textStyle)}>
        {children}
      </div>
    ) : (
      children
    )
    const isDragging = draggingVisualBlockId === blockId
    const isSelected = selectedBlockIds.includes(blockId)
    const dropPosition = dropTarget?.blockId === blockId ? dropTarget.position : null
    const rowKindClassName =
      block.type === 'heading_1' || block.type === 'heading_2' || block.type === 'heading_3'
        ? 'editor-row-kind-heading'
        : block.type === 'child_page' ||
            block.type === 'whiteboard' ||
            block.type === 'mindmap' ||
            block.type === 'data_table' ||
            block.type === 'synced_block'
          ? 'editor-row-kind-feature-card'
          : ''
    const rowClassName = [
      'editor-row',
      rowKindClassName,
      isSelected ? 'editor-row-selected' : '',
      isDragging ? 'editor-row-dragging' : '',
      dropPosition === 'before' ? 'editor-row-drop-target-before' : '',
      dropPosition === 'after' ? 'editor-row-drop-target-after' : '',
    ]
      .filter(Boolean)
      .join(' ')
    const syncSelectionActions =
      block.type !== 'synced_block' && onCreateSyncedBlockFromRange
        ? syncedRangeStartBlockId
          ? [
              {
                key: 'finish-sync-range',
                label: '同步到这里',
                onSelect: () => {
                  void finishSyncedRange(blockId)
                },
              },
              ...(syncedRangeStartBlockId === blockId
                ? [
                    {
                      key: 'cancel-sync-range',
                      label: '取消同步选区',
                      onSelect: () => {
                        setSyncedRangeStartBlockId(null)
                      },
                    },
                  ]
                : []),
            ]
          : [
              {
                key: 'start-sync-range',
                label: '开始同步选区',
                onSelect: () => {
                  setSyncedRangeStartBlockId(blockId)
                },
              },
            ]
        : []
    const extraMenuActions = [...syncSelectionActions, ...(options.extraMenuActions ?? [])]

    return (
      <div
        key={blockId}
        id={getBlockAnchorId(blockId)}
        data-block-id={blockId}
        className={rowClassName}
        ref={(element) => {
          if (blockSlashCommand?.blockId === blockId) {
            slashMenuAnchorRef.current = element
          }
        }}
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

          if (draggingSelectionBlockIds && draggingSelectionBlockIds.length > 0) {
            const position =
              dropTarget?.blockId === blockId
                ? dropTarget.position
                : getDropPosition(event.currentTarget, event.clientY)
            void onReorderBlockGroup?.(draggingSelectionBlockIds, blockId, position)
            setDraggingSelectionBlockIds(null)
            clearBlockSelection()
            clearDragState()
            return
          }

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
          badge={options.badge ?? null}
          textStyle={textStyle}
          allowedBlockTypes={options.menuAllowedBlockTypes ?? allowedBlockTypes}
          menuMode={isInsertMenuBlock ? 'insert' : 'block'}
          extraMenuActions={extraMenuActions}
          onDragStart={() => {
            draggingBlockId.current = blockId
            setDraggingVisualBlockId(blockId)
            setDraggingSelectionBlockIds(
              orderedSelectedBlockIds.includes(blockId) && orderedSelectedBlockIds.length > 1
                ? orderedSelectedBlockIds
                : null,
            )
            setDropTarget(null)
          }}
          onDragEnd={() => {
            setDraggingSelectionBlockIds(null)
            clearDragState()
          }}
          onChangeTextStyle={
            textStyleableBlock
              ? (nextStyle) => handleChangeTextStyle(textStyleableBlock, nextStyle)
              : undefined
          }
          onInsertPick={(type) => {
            void handleInsertMenuCommand(blockId, type)
          }}
          onInsertAbove={() => {
            void insertBlockAfter(blockId, 'paragraph', 'before')
          }}
          onInsertBelow={() => {
            void insertBlockAfter(blockId, 'paragraph')
          }}
          onTurnInto={(type) => {
            void turnBlockInto(blockId, type)
          }}
          onDuplicate={() => onDuplicateBlock?.(blockId)}
          onDelete={() => {
            focusPreviousBlockAfterDelete(blockId)
            onDeleteBlock?.(blockId)
          }}
        >
          {content}
        </BlockFrame>
        {blockSlashCommand?.blockId === blockId ? (
          <SlashMenu
            query={blockSlashCommand.query}
            activeType={activeBlockSlashOption?.type ?? null}
            allowedBlockTypes={allowedBlockTypes}
            menuRef={slashMenuRef}
            placement={blockSlashMenuLayout.placement}
            maxHeight={blockSlashMenuLayout.maxHeight}
            onPick={(type) => {
              void pickBlockSlashCommand(type)
            }}
          />
        ) : null}
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

  async function insertBlockAfter(
    blockId: string,
    type: BlockType,
    position: 'before' | 'after' = 'after',
  ) {
    const nextBlockId =
      position === 'after'
        ? await onInsertBlockAfter?.(blockId, type)
        : await onInsertBlockAfter?.(blockId, type, position)

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

  async function insertParagraphFromTrailingRow() {
    const currentBlockId = await onInsert?.('paragraph')

    if (!currentBlockId) {
      return
    }

    const nextBlockId = await onInsert?.('paragraph')

    if (nextBlockId) {
      requestBlockFocus(nextBlockId, 'rich_text')
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

  async function createImageBlockFromPasteSource(source: PastedImageSource, blockId: string) {
    if (source instanceof File) {
      try {
        const bytes = new Uint8Array(await source.arrayBuffer())
        if (bytes.byteLength > 0) {
          const mimeType = source.type || 'image/png'
          const asset = await writeAssetBytes({
            name: getPastedImageName(source, mimeType),
            mimeType,
            bytes,
          })

          return createImageBlock(blockId, asset)
        }
      } catch {
        // Fall through to the desktop clipboard fallback below.
      }

      const fallbackCandidate = await readDesktopClipboardCandidate()
      if (fallbackCandidate?.kind === 'image_file') {
        const asset = await importImageAssetFromPath(fallbackCandidate.path)
        if (!asset) {
          throw new Error('pasted image path could not be imported')
        }

        return createImageBlock(blockId, asset)
      }

      if (fallbackCandidate?.kind === 'image_bytes') {
        const asset = await writeAssetBytes({
          name: 'pasted-image.png',
          mimeType: 'image/png',
          bytes: fallbackCandidate.bytes,
        })
        return createImageBlock(blockId, asset)
      }

      throw new Error('pasted image could not be read')
    }

    if (source.kind === 'image_file') {
      const asset = await importImageAssetFromPath(source.path)
      if (!asset) {
        throw new Error('pasted image path could not be imported')
      }

      return createImageBlock(blockId, asset)
    }

    const asset = await writeAssetBytes({
      name: 'pasted-image.png',
      mimeType: 'image/png',
      bytes: source.bytes,
    })

    return createImageBlock(blockId, asset)
  }

  async function handlePasteImageIntoBlock(block: PasteTargetBlock, source: PastedImageSource) {
    if (isEmptyPasteTargetBlock(block)) {
      if (onTurnInto) {
        await onTurnInto(block.id, 'image')
      }
      onUpdateBlock(block.id, await createImageBlockFromPasteSource(source, block.id))
      return
    }

    const nextBlockId = await onInsertBlockAfter?.(block.id, 'image')
    if (!nextBlockId) {
      return
    }

    onUpdateBlock(nextBlockId, await createImageBlockFromPasteSource(source, nextBlockId))
  }

  async function handlePasteImageIntoTrailingRow(source: PastedImageSource) {
    const nextBlockId = await onInsert?.('image')
    if (!nextBlockId) {
      return
    }

    onUpdateBlock(nextBlockId, await createImageBlockFromPasteSource(source, nextBlockId))
  }

  function getPastedImageSourceFromHtml(source: string): PastedImageSource | null {
    const dataUrlMatch = source.match(/^data:(image\/[\w.+-]+);base64,([\s\S]+)$/i)
    if (dataUrlMatch) {
      try {
        const encoded = dataUrlMatch[2].replace(/\s/g, '')
        const decoded = atob(encoded)
        return {
          kind: 'image_bytes',
          bytes: Uint8Array.from(decoded, (character) => character.charCodeAt(0)),
        }
      } catch {
        return null
      }
    }

    if (!source.startsWith('file:///')) {
      return null
    }

    try {
      const path = decodeURIComponent(source.replace(/^file:\/\//i, ''))
        .replace(/^\/([a-z]:)/i, '$1')
        .replace(/\//g, '\\')
      return path ? { kind: 'image_file', path } : null
    } catch {
      return null
    }
  }

  async function materializePastedStructuredItems(items: ClipboardStructuredPasteItem[]) {
    const blocks: BlockRecord[] = []

    for (const item of items) {
      if (item.kind === 'block') {
        blocks.push(item.block)
        continue
      }

      const source = getPastedImageSourceFromHtml(item.source)
      if (!source) {
        continue
      }

      try {
        const imageBlock = await createImageBlockFromPasteSource(source, createId('block'))
        blocks.push({ ...imageBlock, ...(item.alt ? { alt: item.alt } : {}) })
      } catch {
        // Keep the surrounding document content when Word exposes an unreadable image source.
      }
    }

    return blocks
  }

  function getPastedStructuredItems(clipboardData: DataTransfer): ClipboardStructuredPasteItem[] | null {
    if (typeof clipboardData.getData !== 'function') {
      return null
    }

    const copiedBlocks = parseCopiedBlocks(clipboardData.getData(BLOCK_CLIPBOARD_MIME_TYPE))
    if (copiedBlocks) {
      return createPastedBlockCopies(copiedBlocks).map((block) => ({ kind: 'block', block }))
    }

    return getPastedStructuredItemsFromText(
      clipboardData.getData('text/markdown'),
      clipboardData.getData('text/plain') || clipboardData.getData('Text'),
      clipboardData.getData('text/html'),
    )
  }

  function getPastedStructuredItemsFromText(
    markdown: string,
    text: string,
    html: string | null | undefined,
  ): ClipboardStructuredPasteItem[] | null {
    const htmlItems = clipboardHtmlToStructuredPasteItems(html ?? '')
    if (htmlItems?.length) {
      return htmlItems
    }

    if (isMarkdownClipboardText(markdown)) {
      return parseMarkdownBlocks(markdown).map((block) => ({ kind: 'block', block }))
    }

    if (isMarkdownClipboardText(text)) {
      return parseMarkdownBlocks(text).map((block) => ({ kind: 'block', block }))
    }

    return null
  }

  async function insertStructuredBlocksAfter(blockId: string, blocks: BlockRecord[]) {
    let previousBlockId = blockId

    for (const block of blocks) {
      const nextBlockId = await onInsertBlockAfter?.(previousBlockId, block.type)
      if (!nextBlockId) {
        return
      }

      onUpdateBlock(nextBlockId, { ...block, id: nextBlockId })
      previousBlockId = nextBlockId
    }
  }

  function applyPastedStructuredBlocks(target: PasteTargetBlock, blocks: BlockRecord[]) {
    const [firstBlock, ...remainingBlocks] = blocks
    if (onPasteBlocks) {
      void onPasteBlocks(target.id, blocks, isEmptyPasteTargetBlock(target))
      return true
    }

    if (isEmptyPasteTargetBlock(target)) {
      onUpdateBlock(target.id, { ...firstBlock, id: target.id })
      void insertStructuredBlocksAfter(target.id, remainingBlocks)
    } else {
      void insertStructuredBlocksAfter(target.id, blocks)
    }

    return true
  }

  function applyPastedStructuredBlocksIntoTrailingRow(blocks: BlockRecord[]) {
    const [firstBlock, ...remainingBlocks] = blocks
    if (onPasteBlocks) {
      void onPasteBlocks(null, blocks)
      return true
    }

    void Promise.resolve(onInsert?.(firstBlock.type)).then((firstBlockId) => {
      if (!firstBlockId) {
        return
      }

      onUpdateBlock(firstBlockId, { ...firstBlock, id: firstBlockId })
      return insertStructuredBlocksAfter(firstBlockId, remainingBlocks)
    })
    return true
  }

  function handlePasteStructuredContent(target: PasteTargetBlock, clipboardData: DataTransfer) {
    const items = getPastedStructuredItems(clipboardData)
    if (!items || items.length === 0) {
      return false
    }

    void materializePastedStructuredItems(items).then((blocks) => {
      if (blocks.length > 0) {
        applyPastedStructuredBlocks(target, blocks)
      }
    })
    return true
  }

  async function handleDesktopPasteStructuredContent(target: PasteTargetBlock) {
    const candidate = await readDesktopClipboardCandidate()
    if (candidate?.kind !== 'text') {
      return {
        handled: false,
        imageSource:
          candidate?.kind === 'image_bytes' || candidate?.kind === 'image_file' ? candidate : undefined,
      } satisfies DesktopPasteFallback
    }

    const items = getPastedStructuredItemsFromText('', candidate.text, candidate.html)
    if (!items || items.length === 0) {
      return { handled: false } satisfies DesktopPasteFallback
    }

    const blocks = await materializePastedStructuredItems(items)
    return {
      handled: blocks.length > 0 && applyPastedStructuredBlocks(target, blocks),
    } satisfies DesktopPasteFallback
  }

  function handlePasteStructuredContentIntoTrailingRow(clipboardData: DataTransfer) {
    const items = getPastedStructuredItems(clipboardData)
    if (!items || items.length === 0) {
      return false
    }

    void materializePastedStructuredItems(items).then((blocks) => {
      if (blocks.length > 0) {
        applyPastedStructuredBlocksIntoTrailingRow(blocks)
      }
    })
    return true
  }

  async function handleDesktopPasteStructuredContentIntoTrailingRow() {
    const candidate = await readDesktopClipboardCandidate()
    if (candidate?.kind !== 'text') {
      return {
        handled: false,
        imageSource:
          candidate?.kind === 'image_bytes' || candidate?.kind === 'image_file' ? candidate : undefined,
      } satisfies DesktopPasteFallback
    }

    const items = getPastedStructuredItemsFromText('', candidate.text, candidate.html)
    if (!items || items.length === 0) {
      return { handled: false } satisfies DesktopPasteFallback
    }

    const blocks = await materializePastedStructuredItems(items)
    return {
      handled: blocks.length > 0 && applyPastedStructuredBlocksIntoTrailingRow(blocks),
    } satisfies DesktopPasteFallback
  }

  function openSyncedPicker(mode: SyncedBlockMode, target: PendingSyncedPicker['target']) {
    setPendingSyncedPicker({ mode, target })
  }

  async function handleInsertMenuCommand(blockId: string, command: SlashMenuCommand) {
    if (command === 'synced_block_sync') {
      openSyncedPicker('sync', { kind: 'replace', blockId })
      return
    }

    if (command === 'synced_block_reference') {
      openSyncedPicker('reference', { kind: 'replace', blockId })
      return
    }

    await turnBlockInto(blockId, command)
  }

  async function handleAppendSlashCommand(command: SlashMenuCommand) {
    if (command === 'synced_block_sync') {
      openSyncedPicker('sync', { kind: 'append' })
      return
    }

    if (command === 'synced_block_reference') {
      openSyncedPicker('reference', { kind: 'append' })
      return
    }

    await insertBlock(command)
  }

  async function pickBlockSlashCommand(type: SlashMenuCommand) {
    const command = blockSlashCommand

    if (!command) {
      return
    }

    setBlockSlashCommand(null)
    await handleInsertMenuCommand(command.blockId, type)
  }

  async function handlePickSyncedItem(itemId: string) {
    const picker = pendingSyncedPicker

    if (!picker) {
      return
    }

    setPendingSyncedPicker(null)

    if (itemId.startsWith('block:')) {
      const [, sourcePageId, sourceBlockId] = itemId.split(':')
      if (!sourcePageId || !sourceBlockId) {
        return
      }

      if (picker.target.kind === 'replace') {
        await onCreateSyncedBlockFromExistingBlock?.(
          sourcePageId,
          sourceBlockId,
          picker.target.blockId,
          picker.mode,
        )
        return
      }

      const placeholderBlockId = await onInsert?.('paragraph')
      if (placeholderBlockId) {
        await onCreateSyncedBlockFromExistingBlock?.(
          sourcePageId,
          sourceBlockId,
          placeholderBlockId,
          picker.mode,
        )
      }
      return
    }

    const groupId = itemId.startsWith('group:') ? itemId.slice('group:'.length) : itemId
    if (picker.target.kind === 'replace') {
      await onReplaceBlockWithSyncedInstance?.(picker.target.blockId, groupId, picker.mode)
      return
    }

    const placeholderBlockId = await onInsert?.('paragraph')
    if (placeholderBlockId) {
      await onReplaceBlockWithSyncedInstance?.(placeholderBlockId, groupId, picker.mode)
    }
  }

  async function finishSyncedRange(endBlockId: string) {
    const startBlockId = syncedRangeStartBlockId

    if (!startBlockId) {
      return
    }

    setSyncedRangeStartBlockId(null)
    await onCreateSyncedBlockFromRange?.(startBlockId, endBlockId)
  }

  function focusPreviousBlockAfterDelete(blockId: string) {
    const currentIndex = page.blocks.findIndex((block) => block.id === blockId)
    const previousBlockId = currentIndex > 0 ? page.blocks[currentIndex - 1]?.id : null

    if (previousBlockId) {
      requestBlockFocus(previousBlockId, 'delete_target')
    }
  }

  function focusAfterBatchDelete(blockIds: string[]) {
    const firstIndex = page.blocks.findIndex((block) => block.id === blockIds[0])
    const previousBlockId = firstIndex > 0 ? page.blocks[firstIndex - 1]?.id : null

    if (previousBlockId) {
      requestBlockFocus(previousBlockId, 'delete_target')
      return
    }

    window.setTimeout(() => {
      focusTrailingInsertTarget()
    }, 0)
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
    focusEditorTargetAtEnd(input)

    if (input) {
      scheduleInputScroll(input)
    }
  }

  function focusTrailingInsertTarget() {
    if (trailingBlock && isPlainEmptyParagraphBlock(trailingBlock)) {
      const targetRow = document.querySelector<HTMLElement>(`.editor-row[data-block-id="${trailingBlock.id}"]`)
      const targetInput = targetRow ? getFocusTargetForMode(targetRow, 'rich_text') : null

      if (targetInput) {
        focusEditorTargetAtEnd(targetInput)
        scheduleInputScroll(targetInput)
        return
      }
    }

    focusEmptyBlockRow()
  }

  function isPointerInTrailingSurfaceGap(surface: HTMLElement, clientY: number) {
    const lastChild = surface.lastElementChild

    if (!(lastChild instanceof HTMLElement)) {
      return true
    }

    const lastChildRect = lastChild.getBoundingClientRect()

    if (lastChildRect.bottom <= lastChildRect.top) {
      return false
    }

    return clientY >= lastChildRect.bottom
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

    return target.isContentEditable || target.getAttribute('contenteditable') === 'true'
      ? target.textContent ?? ''
      : getEditableBlockText(block)
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
    if (blockSlashCommand?.blockId === block.id) {
      if (event.key === 'Escape') {
        event.preventDefault()
        setBlockSlashCommand(null)
        return
      }

      if (event.key === 'ArrowDown') {
        event.preventDefault()
        setBlockSlashCommand((current) =>
          current?.blockId === block.id
            ? {
                ...current,
                activeOptionIndex:
                  blockSlashMenuOptions.length === 0
                    ? -1
                    : current.activeOptionIndex < 0
                      ? 0
                      : (current.activeOptionIndex + 1) % blockSlashMenuOptions.length,
              }
            : current,
        )
        return
      }

      if (event.key === 'ArrowUp') {
        event.preventDefault()
        setBlockSlashCommand((current) =>
          current?.blockId === block.id
            ? {
                ...current,
                activeOptionIndex:
                  blockSlashMenuOptions.length === 0
                    ? -1
                    : current.activeOptionIndex <= 0
                      ? blockSlashMenuOptions.length - 1
                      : current.activeOptionIndex - 1,
              }
            : current,
        )
        return
      }

      if (event.key === 'Enter') {
        event.preventDefault()

        if (activeBlockSlashOption) {
          void pickBlockSlashCommand(activeBlockSlashOption.type)
        }

        return
      }

      if (event.key === 'Backspace') {
        event.preventDefault()
        setBlockSlashCommand((current) =>
          current?.blockId === block.id && current.query.length > 1
            ? { ...current, query: current.query.slice(0, -1), activeOptionIndex: -1 }
            : null,
        )
        return
      }

      if (
        event.key.length === 1 &&
        !event.altKey &&
        !event.ctrlKey &&
        !event.metaKey &&
        !event.nativeEvent.isComposing
      ) {
        event.preventDefault()
        setBlockSlashCommand((current) =>
          current?.blockId === block.id
            ? { ...current, query: `${current.query}${event.key}`, activeOptionIndex: -1 }
            : current,
        )
        return
      }
    }

    if (
      event.key === '/' &&
      !event.shiftKey &&
      !event.altKey &&
      !event.ctrlKey &&
      !event.metaKey &&
      !event.nativeEvent.isComposing &&
      getLiveEditableBlockText(event.currentTarget, block).trim().length === 0
    ) {
      event.preventDefault()
      setBlockSlashCommand({ blockId: block.id, query: '/', activeOptionIndex: -1 })
      return
    }

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
    <section
      ref={surfaceRef}
      className="editor-surface"
      tabIndex={-1}
      onInput={keepInputInView}
      onCopyCapture={(event) => {
        if (orderedSelectedBlockIds.length === 0) {
          return
        }

        const selectedBlocks = page.blocks.filter((block) => orderedSelectedBlockIds.includes(block.id))
        if (selectedBlocks.length === 0) {
          return
        }

        event.preventDefault()
        event.clipboardData.setData(BLOCK_CLIPBOARD_MIME_TYPE, JSON.stringify(selectedBlocks))
        event.clipboardData.setData('text/plain', copiedBlocksToPlainText(selectedBlocks))
      }}
      onKeyDownCapture={(event) => {
        if (event.key === 'Escape' && selectedBlockIds.length > 0) {
          event.preventDefault()
          clearBlockSelection()
          return
        }

        if (
          orderedSelectedBlockIds.length > 0 &&
          !event.nativeEvent.isComposing &&
          (event.key === 'Backspace' || event.key === 'Delete')
        ) {
          event.preventDefault()
          const deletingIds = orderedSelectedBlockIds
          clearBlockSelection()
          void Promise.resolve(onDeleteBlocks?.(deletingIds)).then(() => {
            focusAfterBatchDelete(deletingIds)
          })
        }
      }}
      onPointerDownCapture={(event) => {
        if (!(event.target instanceof Element)) {
          return
        }

        handleSurfacePress(
          event.currentTarget,
          event.target,
          event.clientX,
          event.clientY,
          event.button,
          () => event.preventDefault(),
        )
      }}
      onPointerMoveCapture={(event) => {
        if (
          updateMarqueeSelection(event.clientX, event.clientY) ||
          updateCrossBlockTextSelection(event.clientX, event.clientY)
        ) {
          event.preventDefault()
        }
      }}
      onPointerUpCapture={() => {
        finishMarqueeSelection()
      }}
    >
      {page.blocks.map((block) => {
        switch (block.type) {
          case 'paragraph':
          case 'heading_1':
          case 'heading_2':
          case 'heading_3': {
            const textStyle = getTextBlockStyle(block)
            const isInsertPlaceholderBlock =
              block.type === 'paragraph' && isPlainEmptyParagraphBlock(block)
            return renderBlockRow(
              block,
              <ParagraphBlock
                variant={block.type}
                value={block.text}
                richText={block.richText}
                style={getTextInputStyle(textStyle)}
                placeholder={isInsertPlaceholderBlock ? uiCopy.page.typeSlash : '输入正文'}
                insertMode={isInsertPlaceholderBlock}
                onPasteImage={(source) => handlePasteImageIntoBlock(block, source)}
                onPasteStructuredContent={(clipboardData) => handlePasteStructuredContent(block, clipboardData)}
                onPasteDesktopContent={() => handleDesktopPasteStructuredContent(block)}
                relationPages={relationPages}
                linkOpenMode={linkOpenMode}
                onOpenPageRelation={onOpenChildPage}
                onCreatePageRelation={onCreatePageRelation}
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
                onPasteImage={(source) => handlePasteImageIntoBlock(block, source)}
                onPasteStructuredContent={(clipboardData) => handlePasteStructuredContent(block, clipboardData)}
                onPasteDesktopContent={() => handleDesktopPasteStructuredContent(block)}
                relationPages={relationPages}
                linkOpenMode={linkOpenMode}
                onOpenPageRelation={onOpenChildPage}
                onCreatePageRelation={onCreatePageRelation}
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
                richText={block.richText}
                index={getListBlockIndex(block.id, block.type)}
                style={getTextInputStyle(textStyle)}
                relationPages={relationPages}
                onOpenPageRelation={onOpenChildPage}
                onCreatePageRelation={onCreatePageRelation}
                linkOpenMode={linkOpenMode}
                onChange={({ text, richText }) =>
                  onUpdateBlock(block.id, {
                    ...block,
                    items: [normalizeListItemText(text)],
                    richText,
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
                hasHeaderRow={block.hasHeaderRow}
                fitToContent={block.fitToContent}
                cellStyles={block.cellStyles}
                columnWidths={block.columnWidths}
                rowHeights={block.rowHeights}
                onChange={(rows, details) =>
                  onUpdateBlock(block.id, {
                    ...block,
                    rows,
                    hasHeaderRow: details ? details.hasHeaderRow : block.hasHeaderRow,
                    fitToContent: details ? details.fitToContent : block.fitToContent,
                    cellStyles: details ? details.cellStyles : block.cellStyles,
                    columnWidths: details ? details.columnWidths : block.columnWidths,
                    rowHeights: details ? details.rowHeights : block.rowHeights,
                  })
                }
              />,
            )
          case 'image':
          case 'video':
          case 'audio':
            return renderBlockRow(
              block,
              <MediaBlock
                block={block}
                onChange={(nextBlock) => onUpdateBlock(block.id, nextBlock)}
                onDelete={() => {
                  focusPreviousBlockAfterDelete(block.id)
                  onDeleteBlock?.(block.id)
                }}
              />,
            )
          case 'file': {
            const assetId = block.assetId
            return renderBlockRow(
              block,
              <FileBlock
                block={block}
                onOpen={assetId ? () => void openAssetFile(assetId) : undefined}
              />,
            )
          }
          case 'child_page': {
            const childPage = childPageMap.get(block.pageId)
            return renderBlockRow(
              block,
              <ChildPageBlock
                title={childPage?.title ?? uiCopy.page.untitled}
                icon={childPage?.icon ?? null}
                iconHidden={childPage?.iconHidden}
                onOpen={() => onOpenChildPage?.(block.pageId)}
              />,
            )
          }
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
            const recordTitles = dataTable ? getDataTableRecordTitles(dataTable) : []
            const menuAllowedBlockTypes: BlockType[] = [
              block.displayMode === 'inline' ? 'data_table' : 'data_table_inline',
            ]

            if (block.displayMode === 'inline' && dataTable) {
              return renderBlockRow(
                block,
                <Suspense
                  fallback={<div className="data-table-embed" aria-busy="true" />}
                >
                  <EmbeddedDataTableBlock
                    dataTable={dataTable}
                    basePath={`/pages/${page.id}/data-tables/${block.databaseId}`}
                    onOpen={() => onOpenDataTable?.(block.databaseId)}
                    onChange={(snapshot) => {
                      onUpdateDataTableSnapshot?.(block.databaseId, snapshot)
                    }}
                  />
                </Suspense>,
                { menuAllowedBlockTypes },
              )
            }

            return renderBlockRow(
              block,
              <DataTableBlock
                title={dataTable?.title ?? '数据表格不存在'}
                updatedLabel={dataTable ? formatDataTableMeta(dataTable) : '引用已丢失'}
                recordTitles={recordTitles}
                previewColumns={dataTable ? getDataTablePropertyNames(dataTable) : []}
                previewRows={recordTitles}
                isMissing={!dataTable}
                onOpen={() => onOpenDataTable?.(block.databaseId)}
                onRecover={!dataTable ? () => onRestoreDataTable?.(block.databaseId) : undefined}
              />,
              { menuAllowedBlockTypes },
            )
          }
          case 'mindmap': {
            const mindmap = mindmapMap.get(block.mindmapId)

            return renderBlockRow(
              block,
              <MindmapBlock
                title={mindmap?.title ?? '导图不存在'}
                updatedLabel={mindmap ? formatCanvasUpdatedLabel(mindmap.updatedAt) : '引用已丢失'}
                previewUrl={mindmap ? buildMindmapPreviewSvgDataUrl(mindmap.snapshot) : null}
                isMissing={!mindmap}
                onOpen={() => onOpenMindmap?.(block.mindmapId)}
                onRecover={!mindmap ? () => onRestoreMindmap?.(block.mindmapId) : undefined}
              />,
            )
          }
          case 'synced_block': {
            const group = syncedBlockGroupMap.get(block.groupId) ?? null
            const isPrimaryInstance = group?.primaryInstanceId === block.instanceId
            const primaryLocation = group ? findPrimaryInstanceLocation(allPages, group) : null
            const canOpenPrimary =
              primaryLocation !== null &&
              (block.mode === 'reference' || group?.primaryInstanceId !== block.instanceId)
            const usageCount =
              group && isPrimaryInstance
                ? Math.max(
                    0,
                    collectSyncedGroupInstances(allPages, group.id).filter(
                      (instance) => instance.instanceId !== group.primaryInstanceId,
                    ).length,
                  )
                : 0

            return renderBlockRow(
              block,
              <SyncedBlockContainer
                containerBlock={block}
                group={group}
                isPrimary={isPrimaryInstance}
                canOpenPrimary={canOpenPrimary}
                allPages={allPages}
                relationPages={relationPages}
                linkOpenMode={linkOpenMode}
                onOpenPageRelation={onOpenChildPage}
                onCreatePageRelation={onCreatePageRelation}
                onUpdateGroupBlock={(groupId, blockId, nextBlock) => {
                  onUpdateSyncedGroupBlock?.(groupId, blockId, nextBlock)
                }}
                onUnsync={() => {
                  onUnsyncBlockInstance?.(block.id)
                }}
                onOpenPrimary={() => {
                  if (primaryLocation) {
                    onOpenPrimarySyncedBlock?.(
                      primaryLocation.pageId,
                      primaryLocation.containerBlockId,
                    )
                  }
                }}
                onDeleteContainer={() => {
                  focusPreviousBlockAfterDelete(block.id)
                  onDeleteBlock?.(block.id)
                }}
              />,
              {
                badge: usageCount > 0 ? formatSyncedUsageBadge(usageCount) : null,
                menuAllowedBlockTypes: [],
                extraMenuActions: [
                  ...(canOpenPrimary
                    ? [
                        {
                          key: 'open-primary',
                          label: '前往原位置',
                          onSelect: () => {
                            onOpenPrimarySyncedBlock?.(
                              primaryLocation.pageId,
                              primaryLocation.containerBlockId,
                            )
                          },
                        },
                      ]
                    : []),
                  {
                    key: 'unsync',
                    label: '取消同步',
                    onSelect: () => {
                      onUnsyncBlockInstance?.(block.id)
                    },
                  },
                ],
              },
            )
          }

          default:
            return null
        }
      })}
      {selectionRect ? (
        <div
          className="editor-selection-marquee"
          style={{
            left: `${selectionRect.left}px`,
            top: `${selectionRect.top}px`,
            width: `${selectionRect.width}px`,
            height: `${selectionRect.height}px`,
          }}
        />
      ) : null}
      {!trailingBlock || !isPlainEmptyParagraphBlock(trailingBlock) ? (
        <EmptyBlockRow
          allowedBlockTypes={allowedBlockTypes}
          onInsert={(type) => {
            void handleAppendSlashCommand(type)
          }}
          onSubmitEmpty={() => {
            void insertParagraphFromTrailingRow()
          }}
          onInsertParagraph={(text) => {
            onInsertParagraph?.(text)
          }}
          onPasteImage={(source) => handlePasteImageIntoTrailingRow(source)}
          onPasteStructuredContent={handlePasteStructuredContentIntoTrailingRow}
          onPasteDesktopContent={handleDesktopPasteStructuredContentIntoTrailingRow}
        />
      ) : null}
      <SyncedBlockPickerDialog
        open={pendingSyncedPicker !== null}
        mode={pendingSyncedPicker?.mode ?? 'sync'}
        items={syncedPickerItems}
        onPick={(itemId) => {
          void handlePickSyncedItem(itemId)
        }}
        onClose={() => setPendingSyncedPicker(null)}
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
    case 'delete_target':
      return (
        row.querySelector<HTMLElement>(
          '.block-frame-content [contenteditable="true"], .block-frame-content textarea',
        ) ??
        row.querySelector<HTMLElement>('.block-frame-content .media-block') ??
        row.querySelector<HTMLElement>('.block-handle')
      )
    case 'any':
      return row.querySelector<HTMLElement>(
        '.block-frame-content [contenteditable="true"], .block-frame-content textarea, .block-frame-content input:not([type="checkbox"])',
      )
  }
}

function focusEditorTargetAtEnd(targetInput: HTMLElement | null) {
  if (!targetInput) {
    return
  }

  targetInput.focus()

  if (targetInput instanceof HTMLInputElement || targetInput instanceof HTMLTextAreaElement) {
    targetInput.setSelectionRange(targetInput.value.length, targetInput.value.length)
    return
  }

  const range = document.createRange()
  range.selectNodeContents(targetInput)
  range.collapse(false)
  window.getSelection()?.removeAllRanges()
  window.getSelection()?.addRange(range)
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
      return 'rich_text'
    case 'code':
      return 'textarea'
    default:
      return 'any'
  }
}

function normalizeListItemText(value: string) {
  return value.replace(/\r\n?/g, '\n').replace(/\n+/g, ' ')
}

function getPastedImageName(file: File, mimeType: string) {
  const trimmedName = file.name.trim()
  if (trimmedName.length > 0) {
    return trimmedName
  }

  return `pasted-image.${getMimeTypeExtension(mimeType)}`
}

function getMimeTypeExtension(mimeType: string) {
  switch (mimeType) {
    case 'image/jpeg':
      return 'jpg'
    case 'image/gif':
      return 'gif'
    case 'image/webp':
      return 'webp'
    case 'image/svg+xml':
      return 'svg'
    default:
      return 'png'
  }
}

function createImageBlock(blockId: string, asset: Pick<AssetMeta, 'id' | 'name' | 'mimeType'>) {
  const block = createBlock('image')

  if (block.type !== 'image') {
    throw new Error('Image block factory returned an unexpected block type')
  }

  return {
    ...block,
    id: blockId,
    assetId: asset.id,
    name: asset.name,
    mimeType: asset.mimeType,
    alt: asset.name,
  }
}

function buildPageRelationPathLabel(
  pageById: Map<string, PageRecord>,
  pageId: string,
) {
  const chain: string[] = []
  const seen = new Set<string>()
  let current = pageById.get(pageId)

  while (current && !seen.has(current.id)) {
    const title = current.title.trim() || uiCopy.page.untitled
    chain.push(title)
    seen.add(current.id)
    current = current.parentId ? pageById.get(current.parentId) : undefined
  }

  const orderedChain = chain.reverse()
  const pathLabel = orderedChain.slice(0, -1).join(' / ')
  return pathLabel.length > 0 ? pathLabel : undefined
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

function formatSyncedUsageBadge(count: number) {
  return count > 99 ? '99+' : String(count)
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

function getDataTablePropertyNames(dataTable: DataTableRecord) {
  const snapshot = dataTable.snapshot

  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) {
    return []
  }

  const { database, properties } = snapshot as {
    database?: unknown
    properties?: unknown
  }

  if (!properties || typeof properties !== 'object' || Array.isArray(properties)) {
    return []
  }

  const propertyRecord = properties as Record<string, unknown>
  const propertyIds =
    database &&
    typeof database === 'object' &&
    !Array.isArray(database) &&
    Array.isArray((database as { propertyOrder?: unknown }).propertyOrder)
      ? (database as { propertyOrder: unknown[] }).propertyOrder.map(String)
      : Object.keys(propertyRecord)

  return propertyIds
    .flatMap((propertyId) => {
      const property = propertyRecord[propertyId]

      if (!property || typeof property !== 'object' || Array.isArray(property)) {
        return []
      }

      const name = (property as { name?: unknown }).name
      return typeof name === 'string' && name.trim() ? [name.trim()] : []
    })
    .slice(0, 3)
}
