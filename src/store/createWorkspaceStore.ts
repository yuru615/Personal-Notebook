import { createStore } from 'zustand/vanilla'
import { extractMindmapTitle } from '../components/mindmap/mindmapModel'
import { normalizeWhiteboardSnapshot } from '../components/whiteboard/whiteboardModel'
import { getTextBlockStyle, isTextStyleableBlock } from '../domain/blockTextStyle'
import { normalizeRichText, richTextFromPlainText } from '../domain/richText'
import { createSeedWorkspace } from '../domain/seed'
import type {
  BlockRecord,
  BlockType,
  BoardRecord,
  DataTableRecord,
  MindmapRecord,
  PageFontFamily,
  PageId,
  PageRecord,
  RichTextSegment,
  SaveStatus,
  WorkspaceSnapshot,
  WorkspaceSettings,
} from '../domain/types'
import { ensureSnapshot, type WorkspaceRepository } from '../lib/workspaceRepository'
import {
  createBlock,
  createBoardRecord,
  createDataTableBlock,
  createDataTableRecord,
  createMindmapBlock,
  createMindmapRecord,
  createWhiteboardBlock,
} from '../utils/blockFactory'
import { createId } from '../utils/id'
import { deletePageBranch } from '../utils/pageTree'
import { reorderItems, type ReorderPosition } from '../utils/reorder'

const UNTITLED_PAGE_TITLE = '未命名'
const COPY_SUFFIX = ' \u526f\u672c'
const BLOCK_SAVE_DEBOUNCE_MS = 600

export interface WorkspaceState {
  boards: BoardRecord[]
  dataTables: DataTableRecord[]
  mindmaps: MindmapRecord[]
  pages: PageRecord[]
  settings: WorkspaceSettings
  currentPageId: PageId | null
  saveStatus: SaveStatus
  bootstrap: () => Promise<void>
  createPage: (parentId?: PageId) => Promise<PageRecord>
  setCurrentPage: (pageId: PageId) => Promise<void>
  setPageFullWidth: (pageId: PageId, isFullWidth: boolean) => Promise<void>
  setPageSmallText: (pageId: PageId, isSmallText: boolean) => Promise<void>
  setPageFontFamily: (pageId: PageId, fontFamily: PageFontFamily) => Promise<void>
  setPageIcon: (pageId: PageId, icon: string | null) => Promise<void>
  setPageCover: (pageId: PageId, cover: string | null) => Promise<void>
  setPageOutlineVisible: (pageId: PageId, showOutline: boolean) => Promise<void>
  renameBoard: (boardId: string, title: string) => Promise<void>
  updateBoardSnapshot: (boardId: string, snapshot: unknown) => Promise<void>
  importBoard: (boardId: string, payload: { title: string | null; snapshot: unknown }) => Promise<void>
  duplicateBoardToPage: (pageId: PageId, boardId: string) => Promise<BoardRecord | null>
  restoreMissingBoardReference: (pageId: PageId, boardId: string) => Promise<BoardRecord | null>
  cleanupOrphanBoards: () => Promise<void>
  renameDataTable: (databaseId: string, title: string) => Promise<void>
  setDataTableIcon: (databaseId: string, icon: string | null) => Promise<void>
  setDataTableCover: (databaseId: string, cover: string | null) => Promise<void>
  updateDataTableSnapshot: (databaseId: string, snapshot: unknown) => Promise<void>
  duplicateDataTableToPage: (pageId: PageId, databaseId: string) => Promise<DataTableRecord | null>
  restoreMissingDataTableReference: (pageId: PageId, databaseId: string) => Promise<DataTableRecord | null>
  cleanupOrphanDataTables: () => Promise<void>
  updateMindmapSnapshot: (mindmapId: string, snapshot: unknown) => Promise<void>
  restoreMissingMindmapReference: (pageId: PageId, mindmapId: string) => Promise<MindmapRecord | null>
  renamePage: (pageId: PageId, title: string) => Promise<void>
  deletePage: (pageId: PageId) => Promise<void>
  updateBlock: (pageId: PageId, blockId: string, nextBlock: BlockRecord) => Promise<void>
  flushPendingSaves: () => Promise<void>
  insertBlock: (pageId: PageId, type: BlockType) => Promise<BlockRecord | null>
  insertParagraphBlock: (pageId: PageId, text: string) => Promise<void>
  insertBlockAfter: (
    pageId: PageId,
    afterBlockId: string,
    type: BlockType,
  ) => Promise<BlockRecord | null>
  reorderPages: (
    activePageId: PageId,
    overPageId: PageId,
    position?: ReorderPosition,
  ) => Promise<void>
  reorderBlocks: (
    pageId: PageId,
    activeBlockId: string,
    overBlockId: string,
    position?: ReorderPosition,
  ) => Promise<void>
  deleteBlock: (pageId: PageId, blockId: string) => Promise<void>
  mergeBlockWithPrevious: (pageId: PageId, blockId: string) => Promise<string | null>
  duplicateBlock: (pageId: PageId, blockId: string) => Promise<void>
  turnBlockInto: (pageId: PageId, blockId: string, type: BlockType) => Promise<void>
  undo: () => Promise<void>
  redo: () => Promise<void>
}

function createEmptyState(): WorkspaceState {
  return {
    boards: [],
    dataTables: [],
    mindmaps: [],
    pages: [],
    settings: {
      lastOpenedPageId: null,
    },
    currentPageId: null,
    saveStatus: 'idle',
    bootstrap: async () => undefined,
    createPage: async () => {
      throw new Error('not implemented')
    },
    setCurrentPage: async () => {
      throw new Error('not implemented')
    },
    setPageFullWidth: async () => {
      throw new Error('not implemented')
    },
    setPageSmallText: async () => {
      throw new Error('not implemented')
    },
    setPageFontFamily: async () => {
      throw new Error('not implemented')
    },
    setPageIcon: async () => {
      throw new Error('not implemented')
    },
    setPageCover: async () => {
      throw new Error('not implemented')
    },
    setPageOutlineVisible: async () => {
      throw new Error('not implemented')
    },
    renameBoard: async () => {
      throw new Error('not implemented')
    },
    updateBoardSnapshot: async () => {
      throw new Error('not implemented')
    },
    importBoard: async () => {
      throw new Error('not implemented')
    },
    duplicateBoardToPage: async () => {
      throw new Error('not implemented')
    },
    restoreMissingBoardReference: async () => {
      throw new Error('not implemented')
    },
    cleanupOrphanBoards: async () => {
      throw new Error('not implemented')
    },
    renameDataTable: async () => {
      throw new Error('not implemented')
    },
    setDataTableIcon: async () => {
      throw new Error('not implemented')
    },
    setDataTableCover: async () => {
      throw new Error('not implemented')
    },
    updateDataTableSnapshot: async () => {
      throw new Error('not implemented')
    },
    duplicateDataTableToPage: async () => {
      throw new Error('not implemented')
    },
    restoreMissingDataTableReference: async () => {
      throw new Error('not implemented')
    },
    cleanupOrphanDataTables: async () => {
      throw new Error('not implemented')
    },
    updateMindmapSnapshot: async () => {
      throw new Error('not implemented')
    },
    restoreMissingMindmapReference: async () => {
      throw new Error('not implemented')
    },
    renamePage: async () => {
      throw new Error('not implemented')
    },
    deletePage: async () => {
      throw new Error('not implemented')
    },
    updateBlock: async () => {
      throw new Error('not implemented')
    },
    flushPendingSaves: async () => undefined,
    insertBlock: async () => {
      throw new Error('not implemented')
    },
    insertParagraphBlock: async () => {
      throw new Error('not implemented')
    },
    insertBlockAfter: async () => {
      throw new Error('not implemented')
    },
    reorderPages: async () => {
      throw new Error('not implemented')
    },
    reorderBlocks: async () => {
      throw new Error('not implemented')
    },
    deleteBlock: async () => {
      throw new Error('not implemented')
    },
    mergeBlockWithPrevious: async () => {
      throw new Error('not implemented')
    },
    duplicateBlock: async () => {
      throw new Error('not implemented')
    },
    turnBlockInto: async () => {
      throw new Error('not implemented')
    },
    undo: async () => {
      throw new Error('not implemented')
    },
    redo: async () => {
      throw new Error('not implemented')
    },
  }
}

function createPageRecord(parentId?: PageId): PageRecord {
  const now = new Date().toISOString()

  return {
    id: createId('page'),
    parentId: parentId ?? null,
    title: UNTITLED_PAGE_TITLE,
    icon: null,
    cover: null,
    isFullWidth: false,
    isSmallText: false,
    fontFamily: 'default',
    showOutline: true,
    blocks: [],
    createdAt: now,
    updatedAt: now,
  }
}

function createSettings(lastOpenedPageId: PageId | null): WorkspaceSettings {
  return {
    lastOpenedPageId,
  }
}

function normalizeListBlocks(blocks: BlockRecord[]) {
  let didChange = false
  const normalizedBlocks: BlockRecord[] = []

  for (const block of blocks) {
    if (block.type !== 'bulleted_list' && block.type !== 'numbered_list') {
      normalizedBlocks.push(block)
      continue
    }

    const items = block.items.length > 0 ? block.items : ['']

    if (items.length !== 1) {
      didChange = true
    } else if (block.items.length === 0) {
      didChange = true
    }

    items.forEach((item, index) => {
      normalizedBlocks.push({
        ...block,
        id: index === 0 ? block.id : createId('block'),
        items: [item],
      })
    })

  }

  return {
    blocks: didChange ? normalizedBlocks : blocks,
    didChange,
  }
}

function isLegacyBoardSnapshotLike(value: unknown) {
  if (!value || typeof value !== 'object') {
    return false
  }

  const snapshot = value as {
    camera?: unknown
    shapes?: unknown
    strokes?: unknown
    connections?: unknown
    notes?: unknown
    texts?: unknown
    images?: unknown
  }

  return (
    !!snapshot.camera &&
    Array.isArray(snapshot.shapes) &&
    Array.isArray(snapshot.strokes) &&
    Array.isArray(snapshot.connections) &&
    Array.isArray(snapshot.notes) &&
    Array.isArray(snapshot.texts) &&
    Array.isArray(snapshot.images)
  )
}

function normalizeBoards(boards: BoardRecord[]) {
  let didChange = false

  return {
    boards: boards.map((board) => {
      if (isLegacyBoardSnapshotLike(board.snapshot)) {
        return board
      }

      didChange = true
      return {
        ...board,
        snapshot: normalizeWhiteboardSnapshot(board.snapshot),
      }
    }),
    didChange,
  }
}

function normalizeDataTables(dataTables: DataTableRecord[]) {
  let didChange = false

  return {
    dataTables: dataTables.map((dataTable) => {
      const snapshot = structuredClone(dataTable.snapshot)

      if (!snapshot || typeof snapshot !== 'object') {
        return dataTable
      }

      const candidate = snapshot as {
        assets?: Record<
          string,
          {
            id?: unknown
            kind?: unknown
            name?: unknown
            mimeType?: unknown
            createdAt?: unknown
            dataUrl?: unknown
          }
        >
      }

      if (!candidate.assets || typeof candidate.assets !== 'object') {
        return dataTable
      }

      const nextAssets: NonNullable<typeof candidate.assets> = {}
      for (const [assetId, asset] of Object.entries(candidate.assets)) {
        if (!asset || typeof asset !== 'object') {
          didChange = true
          continue
        }

        if ('dataUrl' in asset) {
          didChange = true
        }

        nextAssets[assetId] = {
          id: typeof asset.id === 'string' ? asset.id : assetId,
          kind: 'image',
          name: typeof asset.name === 'string' ? asset.name : '',
          mimeType: typeof asset.mimeType === 'string' ? asset.mimeType : '',
          createdAt: typeof asset.createdAt === 'string' ? asset.createdAt : dataTable.createdAt,
        }
      }

      candidate.assets = nextAssets
      return {
        ...dataTable,
        snapshot,
      }
    }),
    didChange,
  }
}

function renameDataTableSnapshot(snapshot: unknown, title: string) {
  if (!snapshot || typeof snapshot !== 'object') {
    return snapshot
  }

  const nextSnapshot = structuredClone(snapshot) as {
    database?: Record<string, unknown>
  }

  if (!nextSnapshot.database || typeof nextSnapshot.database !== 'object') {
    return snapshot
  }

  nextSnapshot.database = {
    ...nextSnapshot.database,
    name: title,
  }

  return nextSnapshot
}

function normalizeWorkspaceSnapshot(snapshot: WorkspaceSnapshot) {
  let didChange = !Array.isArray((snapshot as WorkspaceSnapshot & { boards?: BoardRecord[] }).boards)
  const rawBoards = Array.isArray((snapshot as WorkspaceSnapshot & { boards?: BoardRecord[] }).boards)
    ? snapshot.boards
    : []
  const rawDataTables = Array.isArray(
    (snapshot as WorkspaceSnapshot & { dataTables?: DataTableRecord[] }).dataTables,
  )
    ? (snapshot.dataTables ?? [])
    : []
  const rawMindmaps = Array.isArray(
    (snapshot as WorkspaceSnapshot & { mindmaps?: MindmapRecord[] }).mindmaps,
  )
    ? snapshot.mindmaps
    : []
  const normalizedBoards = normalizeBoards(rawBoards)
  const boards = normalizedBoards.boards
  const normalizedDataTables = normalizeDataTables(rawDataTables)
  const dataTables = normalizedDataTables.dataTables
  const mindmaps = structuredClone(rawMindmaps)

  if (normalizedBoards.didChange) {
    didChange = true
  }
  if (normalizedDataTables.didChange) {
    didChange = true
  }

  if (!Array.isArray((snapshot as WorkspaceSnapshot & { dataTables?: DataTableRecord[] }).dataTables)) {
    didChange = true
  }
  if (!Array.isArray((snapshot as WorkspaceSnapshot & { mindmaps?: MindmapRecord[] }).mindmaps)) {
    didChange = true
  }


  const liveBlockTypes = new Set<BlockRecord['type']>([
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
    'whiteboard',
    'data_table',
    'mindmap',
  ])

  const pages = snapshot.pages.map((page) => {
    const supportedBlocks = page.blocks.filter((block) =>
      liveBlockTypes.has((block as BlockRecord | { type: string }).type as BlockRecord['type']),
    )
    const normalized = normalizeListBlocks(supportedBlocks)

    if (supportedBlocks.length !== page.blocks.length || normalized.didChange) {
      didChange = true
      return {
        ...page,
        blocks: normalized.blocks,
      }
    }

    return page
  })

  return {
    snapshot: didChange
      ? { boards, dataTables, mindmaps, pages, settings: snapshot.settings }
      : { ...snapshot, boards, dataTables, mindmaps },
    didChange,
  }
}

function resolveCurrentPageId(snapshot: Pick<WorkspaceSnapshot, 'pages' | 'settings'>): PageId | null {
  const preferredPageId = snapshot.settings.lastOpenedPageId

  if (preferredPageId && snapshot.pages.some((page) => page.id === preferredPageId)) {
    return preferredPageId
  }

  return snapshot.pages[0]?.id ?? null
}

function getPlainTextFromBlock(block: BlockRecord): string {
  switch (block.type) {
    case 'paragraph':
    case 'heading_1':
    case 'heading_2':
    case 'heading_3':
    case 'todo':
    case 'code':
      return block.text
    case 'bulleted_list':
    case 'numbered_list':
      return block.items.join('\n')
    case 'table':
      return block.rows.flat().join(' ').trim()
    case 'image':
    case 'video':
    case 'audio':
      return block.caption
    case 'child_page':
    case 'whiteboard':
    case 'data_table':
    case 'mindmap':
      return ''
  }
}

function preserveBlockContent(nextBlock: BlockRecord, currentBlock: BlockRecord): BlockRecord {
  const text = getPlainTextFromBlock(currentBlock)
  const textStyle = isTextStyleableBlock(currentBlock) ? getTextBlockStyle(currentBlock) : {}
  const richText = getEditableBlockRichText(currentBlock)

  switch (nextBlock.type) {
    case 'paragraph':
    case 'heading_1':
    case 'heading_2':
    case 'heading_3':
      return { ...nextBlock, text, ...textStyle, ...(richText ? { richText } : {}) }
    case 'todo':
      return { ...nextBlock, text, ...textStyle, ...(richText ? { richText } : {}) }
    case 'bulleted_list':
    case 'numbered_list':
      return { ...nextBlock, items: [text], ...textStyle }
    case 'code':
      return { ...nextBlock, text }
    case 'table':
    case 'image':
    case 'video':
    case 'audio':
    case 'child_page':
    case 'whiteboard':
    case 'data_table':
    case 'mindmap':
      return nextBlock
  }
}

function getEditableBlockText(block: BlockRecord): string | null {
  switch (block.type) {
    case 'paragraph':
    case 'heading_1':
    case 'heading_2':
    case 'heading_3':
    case 'todo':
      return block.text
    case 'bulleted_list':
    case 'numbered_list':
      return block.items[0] ?? ''
    default:
      return null
  }
}

function getEditableBlockRichText(block: BlockRecord): RichTextSegment[] | undefined {
  switch (block.type) {
    case 'paragraph':
    case 'heading_1':
    case 'heading_2':
    case 'heading_3':
    case 'todo':
      return block.richText
    default:
      return undefined
  }
}

function withEditableBlockText(
  block: BlockRecord,
  text: string,
  richText?: RichTextSegment[],
): BlockRecord {
  const nextRichText = richText && richText.length > 0 ? normalizeRichText(richText) : undefined

  switch (block.type) {
    case 'paragraph':
    case 'heading_1':
    case 'heading_2':
    case 'heading_3':
      return { ...block, text, richText: nextRichText }
    case 'todo':
      return { ...block, text, richText: nextRichText }
    case 'bulleted_list':
    case 'numbered_list':
      return { ...block, items: [text] }
    default:
      return block
  }
}

function isDataTableCommandType(type: BlockType) {
  return type === 'data_table' || type === 'data_table_inline'
}

function getDataTableDisplayMode(type: BlockType) {
  return type === 'data_table_inline' ? 'inline' : undefined
}

function mergeEditableBlockRichText(
  previousText: string,
  previousRichText: RichTextSegment[] | undefined,
  currentText: string,
  currentRichText: RichTextSegment[] | undefined,
): RichTextSegment[] | undefined {
  if (!previousRichText && !currentRichText) {
    return undefined
  }

  return normalizeRichText([
    ...(previousRichText ?? richTextFromPlainText(previousText)),
    ...(currentRichText ?? richTextFromPlainText(currentText)),
  ])
}

function collectReferencedBoardIds(pages: PageRecord[]) {
  const referencedBoardIds = new Set<string>()

  for (const page of pages) {
    for (const block of page.blocks) {
      if (block.type === 'whiteboard') {
        referencedBoardIds.add(block.boardId)
      }
    }
  }

  return referencedBoardIds
}

function collectReferencedDataTableIds(pages: PageRecord[]) {
  const referencedDataTableIds = new Set<string>()

  for (const page of pages) {
    for (const block of page.blocks) {
      if (block.type === 'data_table') {
        referencedDataTableIds.add(block.databaseId)
      }
    }
  }

  return referencedDataTableIds
}

export function createWorkspaceStore(repository: WorkspaceRepository) {
  const undoStack: WorkspaceSnapshot[] = []
  const redoStack: WorkspaceSnapshot[] = []
  let nonPageAssetsPersistQueue: Promise<void> = Promise.resolve()
  let nonPageAssetsPersistVersion = 0
  let pendingBlockSaveTimer: ReturnType<typeof setTimeout> | null = null
  let pendingBlockSaveTask: Promise<void> | null = null
  let pendingBlockSaveVersion = 0

  function createSnapshotFromState(
    state: Pick<WorkspaceState, 'boards' | 'dataTables' | 'mindmaps' | 'pages' | 'settings'>,
  ): WorkspaceSnapshot {
    return structuredClone({
      boards: state.boards,
      dataTables: state.dataTables,
      mindmaps: state.mindmaps,
      pages: state.pages,
      settings: state.settings,
    })
  }

  function pushUndoSnapshot(
    state: Pick<WorkspaceState, 'boards' | 'dataTables' | 'mindmaps' | 'pages' | 'settings'>,
  ) {
    undoStack.push(createSnapshotFromState(state))
    redoStack.length = 0

    if (undoStack.length > 100) {
      undoStack.shift()
    }
  }

  return createStore<WorkspaceState>()((set, get) => {
    function clearPendingBlockSaveTimer() {
      if (pendingBlockSaveTimer !== null) {
        clearTimeout(pendingBlockSaveTimer)
        pendingBlockSaveTimer = null
      }
    }

    function runPendingBlockSave(persistVersion: number) {
      clearPendingBlockSaveTimer()

      const previousTask = pendingBlockSaveTask ?? Promise.resolve()
      const persistTask = previousTask
        .then(async () => {
          const latestState = get()
          await repository.save({
            boards: latestState.boards,
            dataTables: latestState.dataTables,
            mindmaps: latestState.mindmaps,
            pages: latestState.pages,
            settings: latestState.settings,
          })

          if (persistVersion === pendingBlockSaveVersion) {
            set({ saveStatus: 'saved' })
          }
        })
        .catch((error) => {
          if (persistVersion === pendingBlockSaveVersion) {
            set({ saveStatus: 'error' })
          }
          throw error
        })
        .finally(() => {
          if (pendingBlockSaveTask === persistTask) {
            pendingBlockSaveTask = null
          }
        })

      pendingBlockSaveTask = persistTask
      return persistTask
    }

    function scheduleBlockSave() {
      const persistVersion = ++pendingBlockSaveVersion
      clearPendingBlockSaveTimer()
      pendingBlockSaveTimer = setTimeout(() => {
        void runPendingBlockSave(persistVersion).catch(() => undefined)
      }, BLOCK_SAVE_DEBOUNCE_MS)
    }

    async function flushPendingSaves() {
      if (pendingBlockSaveTimer !== null) {
        await runPendingBlockSave(pendingBlockSaveVersion)
      }

      await pendingBlockSaveTask
      await nonPageAssetsPersistQueue
    }

    async function persistNonPageAssets(
      state: Pick<WorkspaceState, 'boards' | 'dataTables' | 'mindmaps' | 'pages' | 'settings'>,
      nextAssets: Partial<Pick<WorkspaceState, 'boards' | 'dataTables' | 'mindmaps'>>,
    ) {
      const nextBoards = nextAssets.boards ?? state.boards
      const nextDataTables = nextAssets.dataTables ?? state.dataTables
      const nextMindmaps = nextAssets.mindmaps ?? state.mindmaps
      const persistVersion = ++nonPageAssetsPersistVersion
      set({
        boards: nextBoards,
        dataTables: nextDataTables,
        mindmaps: nextMindmaps,
        saveStatus: 'saving',
      })

      const persistTask = nonPageAssetsPersistQueue.then(() => {
        const latestState = get()
        return repository.save({
          boards: nextBoards,
          dataTables: nextDataTables,
          mindmaps: nextMindmaps,
          pages: latestState.pages,
          settings: latestState.settings,
        })
      })
      nonPageAssetsPersistQueue = persistTask.catch(() => undefined)

      try {
        await persistTask
        if (persistVersion === nonPageAssetsPersistVersion) {
          set({ saveStatus: 'saved' })
        }
      } catch {
        if (persistVersion === nonPageAssetsPersistVersion) {
          set({ saveStatus: 'error' })
        }
        throw new Error('Failed to persist workspace assets')
      }
    }

    return {
    ...createEmptyState(),

    bootstrap: async () => {
      const rawSnapshot = await ensureSnapshot(repository, createSeedWorkspace())
      const normalized = normalizeWorkspaceSnapshot(rawSnapshot)
      const snapshot = normalized.snapshot
      const currentPageId = resolveCurrentPageId(snapshot)
      undoStack.length = 0
      redoStack.length = 0

      if (normalized.didChange) {
        await repository.replace(snapshot)
      }

      set({
        boards: snapshot.boards,
        dataTables: snapshot.dataTables ?? [],
        mindmaps: snapshot.mindmaps ?? [],
        pages: snapshot.pages,
        settings: createSettings(currentPageId),
        currentPageId,
        saveStatus: 'saved',
      })
    },

    createPage: async (parentId?: PageId) => {
      const page = createPageRecord(parentId)
      const state = get()
      const nextSettings = createSettings(page.id)
      const nextSnapshot = {
        boards: state.boards,
        pages: [...state.pages, page],
        settings: nextSettings,
      }

      pushUndoSnapshot(state)
      set({ saveStatus: 'saving' })

      try {
        await repository.save(nextSnapshot)
        set({
          boards: nextSnapshot.boards,
          pages: nextSnapshot.pages,
          settings: nextSettings,
          currentPageId: page.id,
          saveStatus: 'saved',
        })
      } catch {
        set({ saveStatus: 'error' })
        throw new Error('Failed to create page')
      }

      return page
    },

    setCurrentPage: async (pageId: PageId) => {
      await flushPendingSaves()
      const state = get()

      if (!state.pages.some((page) => page.id === pageId)) {
        throw new Error('Page not found')
      }

      if (state.currentPageId === pageId && state.settings.lastOpenedPageId === pageId) {
        return
      }

      const nextSettings = createSettings(pageId)
      const nextSnapshot = {
        boards: state.boards,
        pages: state.pages,
        settings: nextSettings,
      }

      set({ saveStatus: 'saving' })

      try {
        await repository.save(nextSnapshot)
        set({
          boards: nextSnapshot.boards,
          currentPageId: pageId,
          settings: nextSettings,
          saveStatus: 'saved',
        })
      } catch {
        set({ saveStatus: 'error' })
        throw new Error('Failed to switch page')
      }
    },

    setPageFullWidth: async (pageId: PageId, isFullWidth: boolean) => {
      const state = get()
      const nextPages = state.pages.map((page) =>
        page.id === pageId
          ? {
              ...page,
              isFullWidth,
              updatedAt: new Date().toISOString(),
            }
          : page,
      )

      pushUndoSnapshot(state)
      set({ saveStatus: 'saving' })

      try {
        await repository.save({ boards: state.boards, pages: nextPages, settings: state.settings })
        set({
          boards: state.boards,
          pages: nextPages,
          saveStatus: 'saved',
        })
      } catch {
        set({ saveStatus: 'error' })
        throw new Error('Failed to update page width mode')
      }
    },

    setPageSmallText: async (pageId: PageId, isSmallText: boolean) => {
      const state = get()
      const nextPages = state.pages.map((page) =>
        page.id === pageId
          ? {
              ...page,
              isSmallText,
              updatedAt: new Date().toISOString(),
            }
          : page,
      )

      pushUndoSnapshot(state)
      set({ saveStatus: 'saving' })

      try {
        await repository.save({ boards: state.boards, pages: nextPages, settings: state.settings })
        set({
          boards: state.boards,
          pages: nextPages,
          saveStatus: 'saved',
        })
      } catch {
        set({ saveStatus: 'error' })
        throw new Error('Failed to update page text size mode')
      }
    },

    setPageFontFamily: async (pageId: PageId, fontFamily: PageFontFamily) => {
      const state = get()
      const nextPages = state.pages.map((page) =>
        page.id === pageId
          ? {
              ...page,
              fontFamily,
              updatedAt: new Date().toISOString(),
            }
          : page,
      )

      pushUndoSnapshot(state)
      set({ saveStatus: 'saving' })

      try {
        await repository.save({ boards: state.boards, pages: nextPages, settings: state.settings })
        set({
          boards: state.boards,
          pages: nextPages,
          saveStatus: 'saved',
        })
      } catch {
        set({ saveStatus: 'error' })
        throw new Error('Failed to update page font mode')
      }
    },

    setPageIcon: async (pageId: PageId, icon: string | null) => {
      const state = get()
      const nextPages = state.pages.map((page) =>
        page.id === pageId
          ? {
              ...page,
              icon,
              updatedAt: new Date().toISOString(),
            }
          : page,
      )

      pushUndoSnapshot(state)
      set({ saveStatus: 'saving' })

      try {
        await repository.save({ boards: state.boards, pages: nextPages, settings: state.settings })
        set({
          boards: state.boards,
          pages: nextPages,
          saveStatus: 'saved',
        })
      } catch {
        set({ saveStatus: 'error' })
        throw new Error('Failed to update page icon')
      }
    },

    setPageCover: async (pageId: PageId, cover: string | null) => {
      const state = get()
      const nextPages = state.pages.map((page) =>
        page.id === pageId
          ? {
              ...page,
              cover,
              updatedAt: new Date().toISOString(),
            }
          : page,
      )

      pushUndoSnapshot(state)
      set({ saveStatus: 'saving' })

      try {
        await repository.save({ boards: state.boards, pages: nextPages, settings: state.settings })
        set({
          boards: state.boards,
          pages: nextPages,
          saveStatus: 'saved',
        })
      } catch {
        set({ saveStatus: 'error' })
        throw new Error('Failed to update page cover')
      }
    },

    setPageOutlineVisible: async (pageId: PageId, showOutline: boolean) => {
      const state = get()
      const nextPages = state.pages.map((page) =>
        page.id === pageId
          ? {
              ...page,
              showOutline,
              updatedAt: new Date().toISOString(),
            }
          : page,
      )

      pushUndoSnapshot(state)
      set({ saveStatus: 'saving' })

      try {
        await repository.save({ boards: state.boards, pages: nextPages, settings: state.settings })
        set({
          boards: state.boards,
          pages: nextPages,
          saveStatus: 'saved',
        })
      } catch {
        set({ saveStatus: 'error' })
        throw new Error('Failed to update page outline visibility')
      }
    },

    renameBoard: async (boardId: string, title: string) => {
      const state = get()
      const nextTitle = title.trim() || '未命名白板'
      const nextBoards = state.boards.map((board) =>
        board.id === boardId
          ? {
              ...board,
              title: nextTitle,
              updatedAt: new Date().toISOString(),
            }
          : board,
      )

      pushUndoSnapshot(state)
      try {
        await persistNonPageAssets(state, { boards: nextBoards })
      } catch {
        throw new Error('Failed to rename board')
      }
    },

    updateBoardSnapshot: async (boardId: string, snapshot: unknown) => {
      const state = get()
      const currentBoard = state.boards.find((board) => board.id === boardId)
      if (!currentBoard) {
        return
      }

      const normalizedSnapshot = normalizeWhiteboardSnapshot(snapshot)
      const currentSerializedSnapshot = JSON.stringify(normalizeWhiteboardSnapshot(currentBoard.snapshot))
      const nextSerializedSnapshot = JSON.stringify(normalizedSnapshot)
      const isSameSnapshot = currentSerializedSnapshot === nextSerializedSnapshot

      if (isSameSnapshot) {
        return
      }

      const nextBoards = state.boards.map((board) =>
        board.id === boardId
          ? {
              ...board,
              snapshot: normalizedSnapshot,
              updatedAt: new Date().toISOString(),
            }
          : board,
      )

      pushUndoSnapshot(state)
      try {
        await persistNonPageAssets(state, { boards: nextBoards })
      } catch {
        throw new Error('Failed to update board snapshot')
      }
    },

    importBoard: async (boardId: string, payload: { title: string | null; snapshot: unknown }) => {
      const state = get()
      const normalizedSnapshot = normalizeWhiteboardSnapshot(payload.snapshot)
      const nextBoards = state.boards.map((board) =>
        board.id === boardId
          ? {
              ...board,
              title: payload.title?.trim() || board.title,
              snapshot: normalizedSnapshot,
              updatedAt: new Date().toISOString(),
            }
          : board,
      )

      pushUndoSnapshot(state)
      try {
        await persistNonPageAssets(state, { boards: nextBoards })
      } catch {
        throw new Error('Failed to import board')
      }
    },

    duplicateBoardToPage: async (pageId: PageId, boardId: string) => {
      const state = get()
      const sourceBoard = state.boards.find((board) => board.id === boardId)

      if (!sourceBoard || !state.pages.some((page) => page.id === pageId)) {
        return null
      }

      const now = new Date().toISOString()
      const nextBoard = {
        ...createBoardRecord(now),
        title: `${sourceBoard.title}${COPY_SUFFIX}`,
        snapshot: structuredClone(sourceBoard.snapshot),
      }
      const nextBoards = [...state.boards, nextBoard]
      let didInsert = false

      const nextPages = state.pages.map((page) => {
        if (page.id !== pageId) {
          return page
        }

        const sourceBlockIndex = page.blocks.findIndex(
          (block) => block.type === 'whiteboard' && block.boardId === boardId,
        )
        const blocks = [...page.blocks]
        blocks.splice(
          sourceBlockIndex >= 0 ? sourceBlockIndex + 1 : blocks.length,
          0,
          createWhiteboardBlock(nextBoard.id),
        )
        didInsert = true

        return {
          ...page,
          updatedAt: now,
          blocks,
        }
      })

      if (!didInsert) {
        return null
      }

      pushUndoSnapshot(state)
      set({ saveStatus: 'saving' })

      try {
        await repository.save({
          boards: nextBoards,
          pages: nextPages,
          settings: state.settings,
        })
        set({
          boards: nextBoards,
          pages: nextPages,
          saveStatus: 'saved',
        })
      } catch {
        set({ saveStatus: 'error' })
        throw new Error('Failed to duplicate board')
      }

      return nextBoard
    },

    restoreMissingBoardReference: async (pageId: PageId, boardId: string) => {
      const state = get()

      if (state.boards.some((board) => board.id === boardId)) {
        return state.boards.find((board) => board.id === boardId) ?? null
      }

      const page = state.pages.find((item) => item.id === pageId)
      const hasMissingReference = page?.blocks.some(
        (block) => block.type === 'whiteboard' && block.boardId === boardId,
      )

      if (!hasMissingReference) {
        return null
      }

      const now = new Date().toISOString()
      const nextBoard = createBoardRecord(now)
      const nextBoards = [...state.boards, nextBoard]
      const nextPages = state.pages.map((currentPage) => {
        if (currentPage.id !== pageId) {
          return currentPage
        }

        return {
          ...currentPage,
          updatedAt: now,
          blocks: currentPage.blocks.map((block) =>
            block.type === 'whiteboard' && block.boardId === boardId
              ? { ...block, boardId: nextBoard.id }
              : block,
          ),
        }
      })

      pushUndoSnapshot(state)
      set({ saveStatus: 'saving' })

      try {
        await repository.save({
          boards: nextBoards,
          pages: nextPages,
          settings: state.settings,
        })
        set({
          boards: nextBoards,
          pages: nextPages,
          saveStatus: 'saved',
        })
      } catch {
        set({ saveStatus: 'error' })
        throw new Error('Failed to restore missing board reference')
      }

      return nextBoard
    },

    cleanupOrphanBoards: async () => {
      const state = get()
      const referencedBoardIds = collectReferencedBoardIds(state.pages)
      const nextBoards = state.boards.filter((board) => referencedBoardIds.has(board.id))

      if (nextBoards.length === state.boards.length) {
        return
      }

      pushUndoSnapshot(state)
      try {
        await persistNonPageAssets(state, { boards: nextBoards })
      } catch {
        throw new Error('Failed to cleanup orphan boards')
      }
    },

    cleanupOrphanDataTables: async () => {
      const state = get()
      const referencedDataTableIds = collectReferencedDataTableIds(state.pages)
      const nextDataTables = state.dataTables.filter((dataTable) =>
        referencedDataTableIds.has(dataTable.id),
      )

      if (nextDataTables.length === state.dataTables.length) {
        return
      }

      pushUndoSnapshot(state)
      try {
        await persistNonPageAssets(state, { dataTables: nextDataTables })
      } catch {
        throw new Error('Failed to cleanup orphan data tables')
      }
    },

    renameDataTable: async (databaseId: string, title: string) => {
      const state = get()
      const nextTitle = title.trim() || '未命名数据表格'
      const nextDataTables = state.dataTables.map((dataTable) =>
        dataTable.id === databaseId
          ? {
              ...dataTable,
              title: nextTitle,
              snapshot: renameDataTableSnapshot(dataTable.snapshot, nextTitle),
              updatedAt: new Date().toISOString(),
            }
          : dataTable,
      )

      pushUndoSnapshot(state)
      try {
        await persistNonPageAssets(state, { dataTables: nextDataTables })
      } catch {
        throw new Error('Failed to rename data table')
      }
    },

    setDataTableIcon: async (databaseId: string, icon: string | null) => {
      const state = get()
      const nextDataTables = state.dataTables.map((dataTable) =>
        dataTable.id === databaseId
          ? {
              ...dataTable,
              icon,
              updatedAt: new Date().toISOString(),
            }
          : dataTable,
      )

      pushUndoSnapshot(state)
      try {
        await persistNonPageAssets(state, { dataTables: nextDataTables })
      } catch {
        throw new Error('Failed to update data table icon')
      }
    },

    setDataTableCover: async (databaseId: string, cover: string | null) => {
      const state = get()
      const nextDataTables = state.dataTables.map((dataTable) =>
        dataTable.id === databaseId
          ? {
              ...dataTable,
              cover,
              updatedAt: new Date().toISOString(),
            }
          : dataTable,
      )

      pushUndoSnapshot(state)
      try {
        await persistNonPageAssets(state, { dataTables: nextDataTables })
      } catch {
        throw new Error('Failed to update data table cover')
      }
    },

    updateDataTableSnapshot: async (databaseId: string, snapshot: unknown) => {
      const state = get()
      const currentDataTable = state.dataTables.find((dataTable) => dataTable.id === databaseId)
      if (!currentDataTable) {
        return
      }

      const nextSerializedSnapshot = JSON.stringify(snapshot)
      if (JSON.stringify(currentDataTable.snapshot) === nextSerializedSnapshot) {
        return
      }

      const nextTitle =
        snapshot &&
        typeof snapshot === 'object' &&
        'database' in snapshot &&
        snapshot.database &&
        typeof snapshot.database === 'object' &&
        'name' in snapshot.database &&
        typeof snapshot.database.name === 'string'
          ? snapshot.database.name
          : currentDataTable.title
      const nextDataTables = state.dataTables.map((dataTable) =>
        dataTable.id === databaseId
          ? {
              ...dataTable,
              title: nextTitle.trim() || dataTable.title,
              snapshot: structuredClone(snapshot),
              updatedAt: new Date().toISOString(),
            }
          : dataTable,
      )

      pushUndoSnapshot(state)
      try {
        await persistNonPageAssets(state, { dataTables: nextDataTables })
      } catch {
        throw new Error('Failed to update data table snapshot')
      }
    },

    duplicateDataTableToPage: async (pageId: PageId, databaseId: string) => {
      const state = get()
      const sourceDataTable = state.dataTables.find((dataTable) => dataTable.id === databaseId)

      if (!sourceDataTable || !state.pages.some((page) => page.id === pageId)) {
        return null
      }

      const now = new Date().toISOString()
      const nextDataTable = {
        ...createDataTableRecord(now),
        title: `${sourceDataTable.title}${COPY_SUFFIX}`,
        snapshot: structuredClone(sourceDataTable.snapshot),
      }
      const nextDataTables = [...state.dataTables, nextDataTable]
      let didInsert = false

      const nextPages = state.pages.map((page) => {
        if (page.id !== pageId) {
          return page
        }

        const sourceBlockIndex = page.blocks.findIndex(
          (block) => block.type === 'data_table' && block.databaseId === databaseId,
        )
        const blocks = [...page.blocks]
        blocks.splice(
          sourceBlockIndex >= 0 ? sourceBlockIndex + 1 : blocks.length,
          0,
          createDataTableBlock(nextDataTable.id),
        )
        didInsert = true

        return {
          ...page,
          updatedAt: now,
          blocks,
        }
      })

      if (!didInsert) {
        return null
      }

      pushUndoSnapshot(state)
      set({ saveStatus: 'saving' })

      try {
        await repository.save({
          boards: state.boards,
          dataTables: nextDataTables,
          pages: nextPages,
          settings: state.settings,
        })
        set({
          dataTables: nextDataTables,
          pages: nextPages,
          saveStatus: 'saved',
        })
      } catch {
        set({ saveStatus: 'error' })
        throw new Error('Failed to duplicate data table')
      }

      return nextDataTable
    },

    restoreMissingDataTableReference: async (pageId: PageId, databaseId: string) => {
      const state = get()

      if (state.dataTables.some((dataTable) => dataTable.id === databaseId)) {
        return state.dataTables.find((dataTable) => dataTable.id === databaseId) ?? null
      }

      const page = state.pages.find((item) => item.id === pageId)
      const hasMissingReference = page?.blocks.some(
        (block) => block.type === 'data_table' && block.databaseId === databaseId,
      )

      if (!hasMissingReference) {
        return null
      }

      const now = new Date().toISOString()
      const nextDataTable = createDataTableRecord(now)
      const nextDataTables = [...state.dataTables, nextDataTable]
      const nextPages = state.pages.map((currentPage) => {
        if (currentPage.id !== pageId) {
          return currentPage
        }

        return {
          ...currentPage,
          updatedAt: now,
          blocks: currentPage.blocks.map((block) =>
            block.type === 'data_table' && block.databaseId === databaseId
              ? { ...block, databaseId: nextDataTable.id }
              : block,
          ),
        }
      })

      pushUndoSnapshot(state)
      set({ saveStatus: 'saving' })

      try {
        await repository.save({
          boards: state.boards,
          dataTables: nextDataTables,
          pages: nextPages,
          settings: state.settings,
        })
        set({
          dataTables: nextDataTables,
          pages: nextPages,
          saveStatus: 'saved',
        })
      } catch {
        set({ saveStatus: 'error' })
        throw new Error('Failed to restore missing data table reference')
      }

      return nextDataTable
    },

    updateMindmapSnapshot: async (mindmapId: string, snapshot: unknown) => {
      const state = get()
      const currentMindmap = state.mindmaps.find((mindmap) => mindmap.id === mindmapId)

      if (!currentMindmap) {
        return
      }

      const nextTitle = extractMindmapTitle(snapshot as { title?: unknown })
      const nextSnapshot = structuredClone(snapshot)
      if (
        currentMindmap.title === nextTitle &&
        JSON.stringify(currentMindmap.snapshot) === JSON.stringify(nextSnapshot)
      ) {
        return
      }
      const now = new Date()
      const currentUpdatedAt = Date.parse(currentMindmap.updatedAt)
      const nextUpdatedAt =
        Number.isNaN(currentUpdatedAt) || now.getTime() > currentUpdatedAt
          ? now.toISOString()
          : new Date(currentUpdatedAt + 1).toISOString()

      const nextMindmaps = state.mindmaps.map((mindmap) =>
        mindmap.id === mindmapId
          ? {
              ...mindmap,
              title: nextTitle,
              snapshot: nextSnapshot,
              updatedAt: nextUpdatedAt,
            }
          : mindmap,
      )

      pushUndoSnapshot(state)
      try {
        await persistNonPageAssets(state, { mindmaps: nextMindmaps })
      } catch {
        throw new Error('Failed to update mindmap snapshot')
      }
    },

    restoreMissingMindmapReference: async (pageId: PageId, mindmapId: string) => {
      const state = get()
      const existingMindmap = state.mindmaps.find((mindmap) => mindmap.id === mindmapId)

      if (existingMindmap) {
        return existingMindmap
      }

      const page = state.pages.find((item) => item.id === pageId)
      const hasMissingReference = page?.blocks.some(
        (block) => block.type === 'mindmap' && block.mindmapId === mindmapId,
      )

      if (!hasMissingReference) {
        return null
      }

      const nextMindmap = {
        ...createMindmapRecord(new Date().toISOString()),
        id: mindmapId,
      }
      const nextMindmaps = [...state.mindmaps, nextMindmap]

      pushUndoSnapshot(state)
      try {
        await persistNonPageAssets(state, { mindmaps: nextMindmaps })
      } catch {
        throw new Error('Failed to restore missing mindmap reference')
      }

      return nextMindmap
    },

    renamePage: async (pageId: PageId, title: string) => {
      const state = get()
      const nextTitle = title.trim() || UNTITLED_PAGE_TITLE
      const nextPages = state.pages.map((page) =>
        page.id === pageId
          ? {
              ...page,
              title: nextTitle,
              updatedAt: new Date().toISOString(),
            }
          : page,
      )

      pushUndoSnapshot(state)
      set({ saveStatus: 'saving' })

      try {
        await repository.save({ boards: state.boards, pages: nextPages, settings: state.settings })
        set({
          boards: state.boards,
          pages: nextPages,
          saveStatus: 'saved',
        })
      } catch {
        set({ saveStatus: 'error' })
        throw new Error('Failed to rename page')
      }
    },

    deletePage: async (pageId: PageId) => {
      const state = get()
      const nextPages = deletePageBranch(state.pages, pageId)
      const currentPageDeleted =
        state.currentPageId !== null && !nextPages.some((page) => page.id === state.currentPageId)
      const nextCurrentPageId = currentPageDeleted ? (nextPages[0]?.id ?? null) : state.currentPageId
      const nextSettings = createSettings(nextCurrentPageId)

      pushUndoSnapshot(state)
      set({ saveStatus: 'saving' })

      try {
        await repository.save({ boards: state.boards, pages: nextPages, settings: nextSettings })
        set({
          boards: state.boards,
          pages: nextPages,
          currentPageId: nextCurrentPageId,
          settings: nextSettings,
          saveStatus: 'saved',
        })
      } catch {
        set({ saveStatus: 'error' })
        throw new Error('Failed to delete page')
      }
    },

    updateBlock: async (pageId: PageId, blockId: string, nextBlock: BlockRecord) => {
      const state = get()
      const nextPages = state.pages.map((page) =>
        page.id === pageId
          ? {
              ...page,
              updatedAt: new Date().toISOString(),
              blocks: page.blocks.map((block) => (block.id === blockId ? nextBlock : block)),
            }
          : page,
      )

      pushUndoSnapshot(state)
      set({
        boards: state.boards,
        pages: nextPages,
        saveStatus: 'saving',
      })
      scheduleBlockSave()
    },

    flushPendingSaves,

    insertBlock: async (pageId: PageId, type: BlockType) => {
      const state = get()
      const now = new Date().toISOString()
      let childPage: PageRecord | null = null
      let insertedBlock: BlockRecord | null = null
      let didInsert = false
      let nextBoards = state.boards
      let nextDataTables = state.dataTables
      let nextMindmaps = state.mindmaps

      const nextPages = state.pages.map((page) => {
        if (page.id !== pageId) {
          return page
        }

        if (type === 'child_page') {
          const childId = createId('page')
          childPage = {
            id: childId,
            title: UNTITLED_PAGE_TITLE,
            parentId: pageId,
            icon: null,
            cover: null,
            isFullWidth: false,
            isSmallText: false,
            fontFamily: 'default',
            showOutline: true,
            blocks: [],
            createdAt: now,
            updatedAt: now,
          }

          insertedBlock = {
            id: createId('block'),
            type: 'child_page' as const,
            pageId: childId,
          }
          didInsert = true

          return {
            ...page,
            updatedAt: now,
            blocks: [...page.blocks, insertedBlock],
          }
        }

        if (type === 'whiteboard') {
          const board = createBoardRecord(now)
          nextBoards = [...state.boards, board]
          insertedBlock = createWhiteboardBlock(board.id)
          didInsert = true

          return {
            ...page,
            updatedAt: now,
            blocks: [...page.blocks, insertedBlock],
          }
        }

        if (isDataTableCommandType(type)) {
          const dataTable = createDataTableRecord(now)
          nextDataTables = [...state.dataTables, dataTable]
          insertedBlock = createDataTableBlock(dataTable.id, getDataTableDisplayMode(type))
          didInsert = true

          return {
            ...page,
            updatedAt: now,
            blocks: [...page.blocks, insertedBlock],
          }
        }

        if (type === 'mindmap') {
          const mindmap = createMindmapRecord(now)
          nextMindmaps = [...state.mindmaps, mindmap]
          insertedBlock = createMindmapBlock(mindmap.id)
          didInsert = true

          return {
            ...page,
            updatedAt: now,
            blocks: [...page.blocks, insertedBlock],
          }
        }

        insertedBlock = createBlock(type)
        didInsert = true

        return {
          ...page,
          updatedAt: now,
          blocks: [...page.blocks, insertedBlock],
        }
      })

      if (!didInsert || !insertedBlock) {
        return null
      }

      const snapshotPages = childPage ? [...nextPages, childPage] : nextPages

      pushUndoSnapshot(state)
      set({ saveStatus: 'saving' })

      try {
        await repository.save({
          boards: nextBoards,
          dataTables: nextDataTables,
          mindmaps: nextMindmaps,
          pages: snapshotPages,
          settings: state.settings,
        })
        set({
          boards: nextBoards,
          dataTables: nextDataTables,
          mindmaps: nextMindmaps,
          pages: snapshotPages,
          saveStatus: 'saved',
        })
      } catch {
        set({ saveStatus: 'error' })
        throw new Error('Failed to insert block')
      }

      return insertedBlock
    },

    insertParagraphBlock: async (pageId: PageId, text: string) => {
      const state = get()
      const nextText = text.trim()

      if (!nextText) {
        return
      }

      const nextPages = state.pages.map((page) =>
        page.id === pageId
          ? {
              ...page,
              updatedAt: new Date().toISOString(),
              blocks: [
                ...page.blocks,
                {
                  id: createId('block'),
                  type: 'paragraph' as const,
                  text: nextText,
                },
              ],
            }
          : page,
      )

      pushUndoSnapshot(state)
      set({ saveStatus: 'saving' })

      try {
        await repository.save({ boards: state.boards, pages: nextPages, settings: state.settings })
        set({
          boards: state.boards,
          pages: nextPages,
          saveStatus: 'saved',
        })
      } catch {
        set({ saveStatus: 'error' })
        throw new Error('Failed to insert paragraph block')
      }
    },

    insertBlockAfter: async (pageId: PageId, afterBlockId: string, type: BlockType) => {
      const state = get()
      const now = new Date().toISOString()
      let childPage: PageRecord | null = null
      let insertedBlock: BlockRecord | null = null
      let didInsert = false
      let nextBoards = state.boards
      let nextDataTables = state.dataTables
      let nextMindmaps = state.mindmaps

      const nextPages = state.pages.map((page) => {
        if (page.id !== pageId) {
          return page
        }

        const afterIndex = page.blocks.findIndex((block) => block.id === afterBlockId)

        if (afterIndex < 0) {
          return page
        }

        if (type === 'child_page') {
          const childId = createId('page')
          childPage = {
            id: childId,
            title: UNTITLED_PAGE_TITLE,
            parentId: pageId,
            icon: null,
            cover: null,
            isFullWidth: false,
            isSmallText: false,
            fontFamily: 'default',
            showOutline: true,
            blocks: [],
            createdAt: now,
            updatedAt: now,
          }
          insertedBlock = {
            id: createId('block'),
            type: 'child_page' as const,
            pageId: childId,
          }
        } else if (type === 'whiteboard') {
          const board = createBoardRecord(now)
          nextBoards = [...state.boards, board]
          insertedBlock = createWhiteboardBlock(board.id)
        } else if (isDataTableCommandType(type)) {
          const dataTable = createDataTableRecord(now)
          nextDataTables = [...state.dataTables, dataTable]
          insertedBlock = createDataTableBlock(dataTable.id, getDataTableDisplayMode(type))
        } else if (type === 'mindmap') {
          const mindmap = createMindmapRecord(now)
          nextMindmaps = [...state.mindmaps, mindmap]
          insertedBlock = createMindmapBlock(mindmap.id)
        } else {
          insertedBlock = createBlock(type)
        }

        const blocks = [...page.blocks]
        blocks.splice(afterIndex + 1, 0, insertedBlock)
        didInsert = true

        return {
          ...page,
          updatedAt: now,
          blocks,
        }
      })

      if (!didInsert || !insertedBlock) {
        return null
      }

      const snapshotPages = childPage ? [...nextPages, childPage] : nextPages

      pushUndoSnapshot(state)
      set({ saveStatus: 'saving' })

      try {
        await repository.save({
          boards: nextBoards,
          dataTables: nextDataTables,
          mindmaps: nextMindmaps,
          pages: snapshotPages,
          settings: state.settings,
        })
        set({
          boards: nextBoards,
          dataTables: nextDataTables,
          mindmaps: nextMindmaps,
          pages: snapshotPages,
          saveStatus: 'saved',
        })
      } catch {
        set({ saveStatus: 'error' })
        throw new Error('Failed to insert block after current block')
      }

      return insertedBlock
    },

    reorderPages: async (
      activePageId: PageId,
      overPageId: PageId,
      position: ReorderPosition = 'before',
    ) => {
      const state = get()
      const activePage = state.pages.find((page) => page.id === activePageId)
      const overPage = state.pages.find((page) => page.id === overPageId)

      if (!activePage || !overPage || activePage.parentId !== overPage.parentId) {
        return
      }

      const siblings = state.pages.filter((page) => page.parentId === activePage.parentId)
      const reorderedSiblings = reorderItems(siblings, activePageId, overPageId, position)
      let siblingIndex = 0
      const nextPages = state.pages.map((page) =>
        page.parentId === activePage.parentId ? reorderedSiblings[siblingIndex++] : page,
      )

      pushUndoSnapshot(state)
      set({ saveStatus: 'saving' })

      try {
        await repository.save({ boards: state.boards, pages: nextPages, settings: state.settings })
        set({ boards: state.boards, pages: nextPages, saveStatus: 'saved' })
      } catch {
        set({ saveStatus: 'error' })
        throw new Error('Failed to reorder pages')
      }
    },

    reorderBlocks: async (
      pageId: PageId,
      activeBlockId: string,
      overBlockId: string,
      position: ReorderPosition = 'before',
    ) => {
      const state = get()
      const nextPages = state.pages.map((page) =>
        page.id === pageId
          ? {
              ...page,
              updatedAt: new Date().toISOString(),
              blocks: reorderItems(page.blocks, activeBlockId, overBlockId, position),
            }
          : page,
      )

      pushUndoSnapshot(state)
      set({ saveStatus: 'saving' })

      try {
        await repository.save({ boards: state.boards, pages: nextPages, settings: state.settings })
        set({ boards: state.boards, pages: nextPages, saveStatus: 'saved' })
      } catch {
        set({ saveStatus: 'error' })
        throw new Error('Failed to reorder blocks')
      }
    },

    deleteBlock: async (pageId: PageId, blockId: string) => {
      const state = get()
      const nextPages = state.pages.map((page) =>
        page.id === pageId
          ? {
              ...page,
              updatedAt: new Date().toISOString(),
              blocks: page.blocks.filter((block) => block.id !== blockId),
            }
          : page,
      )

      pushUndoSnapshot(state)
      set({ saveStatus: 'saving' })

      try {
        await repository.save({ boards: state.boards, pages: nextPages, settings: state.settings })
        set({ boards: state.boards, pages: nextPages, saveStatus: 'saved' })
      } catch {
        set({ saveStatus: 'error' })
        throw new Error('Failed to delete block')
      }
    },

    mergeBlockWithPrevious: async (pageId: PageId, blockId: string) => {
      const state = get()
      let targetBlockId: string | null = null
      let didMerge = false

      const nextPages = state.pages.map((page) => {
        if (page.id !== pageId) {
          return page
        }

        const blockIndex = page.blocks.findIndex((block) => block.id === blockId)

        if (blockIndex <= 0) {
          return page
        }

        const previousBlock = page.blocks[blockIndex - 1]
        const currentBlock = page.blocks[blockIndex]
        const previousText = getEditableBlockText(previousBlock)
        const currentText = getEditableBlockText(currentBlock)
        const richText = mergeEditableBlockRichText(
          previousText ?? '',
          getEditableBlockRichText(previousBlock),
          currentText ?? '',
          getEditableBlockRichText(currentBlock),
        )

        if (previousText === null || currentText === null) {
          return page
        }

        const blocks = [...page.blocks]
        targetBlockId = previousBlock.id
        blocks[blockIndex - 1] = withEditableBlockText(
          previousBlock,
          previousText + currentText,
          richText,
        )
        blocks.splice(blockIndex, 1)
        didMerge = true

        return {
          ...page,
          updatedAt: new Date().toISOString(),
          blocks,
        }
      })

      if (!didMerge) {
        return null
      }

      pushUndoSnapshot(state)
      set({ saveStatus: 'saving' })

      try {
        await repository.save({ boards: state.boards, pages: nextPages, settings: state.settings })
        set({ boards: state.boards, pages: nextPages, saveStatus: 'saved' })
      } catch {
        set({ saveStatus: 'error' })
        throw new Error('Failed to merge block with previous block')
      }

      return targetBlockId
    },

    duplicateBlock: async (pageId: PageId, blockId: string) => {
      const state = get()
      const now = new Date().toISOString()
      let nextBoards = state.boards
      let nextDataTables = state.dataTables
      let nextMindmaps = state.mindmaps
      const nextPages = state.pages.map((page) => {
        if (page.id !== pageId) {
          return page
        }

        const index = page.blocks.findIndex((block) => block.id === blockId)
        const source = page.blocks[index]
        if (!source) {
          return page
        }

        const blocks = [...page.blocks]

        if (source.type === 'whiteboard') {
          const sourceBoard = state.boards.find((board) => board.id === source.boardId)

          if (sourceBoard) {
            const nextBoard = {
              ...createBoardRecord(now),
              title: `${sourceBoard.title}${COPY_SUFFIX}`,
              snapshot: structuredClone(sourceBoard.snapshot),
            }

            nextBoards = [...state.boards, nextBoard]
            blocks.splice(index + 1, 0, createWhiteboardBlock(nextBoard.id))

            return {
              ...page,
              updatedAt: now,
              blocks,
            }
          }
        }

        if (source.type === 'data_table') {
          const sourceDataTable = state.dataTables.find(
            (dataTable) => dataTable.id === source.databaseId,
          )

          if (sourceDataTable) {
            const nextDataTable = {
              ...createDataTableRecord(now),
              title: `${sourceDataTable.title}${COPY_SUFFIX}`,
              snapshot: structuredClone(sourceDataTable.snapshot),
            }

            nextDataTables = [...state.dataTables, nextDataTable]
            blocks.splice(index + 1, 0, createDataTableBlock(nextDataTable.id, source.displayMode))

            return {
              ...page,
              updatedAt: now,
              blocks,
            }
          }
        }

        if (source.type === 'mindmap') {
          const sourceMindmap = state.mindmaps.find((mindmap) => mindmap.id === source.mindmapId)

          if (sourceMindmap) {
            const nextMindmap = {
              ...createMindmapRecord(now),
              title: `${sourceMindmap.title}${COPY_SUFFIX}`,
              snapshot: structuredClone(sourceMindmap.snapshot),
            }

            nextMindmaps = [...state.mindmaps, nextMindmap]
            blocks.splice(index + 1, 0, createMindmapBlock(nextMindmap.id))

            return {
              ...page,
              updatedAt: now,
              blocks,
            }
          }
        }

        const clone = { ...structuredClone(source), id: createId('block') }
        blocks.splice(index + 1, 0, clone)

        return {
          ...page,
          updatedAt: now,
          blocks,
        }
      })

      pushUndoSnapshot(state)
      set({ saveStatus: 'saving' })

      try {
        await repository.save({
          boards: nextBoards,
          dataTables: nextDataTables,
          mindmaps: nextMindmaps,
          pages: nextPages,
          settings: state.settings,
        })
        set({
          boards: nextBoards,
          dataTables: nextDataTables,
          mindmaps: nextMindmaps,
          pages: nextPages,
          saveStatus: 'saved',
        })
      } catch {
        set({ saveStatus: 'error' })
        throw new Error('Failed to duplicate block')
      }
    },

    turnBlockInto: async (pageId: PageId, blockId: string, type: BlockType) => {
      const state = get()
      const now = new Date().toISOString()
      let nextBoards = state.boards
      let nextDataTables = state.dataTables
      let nextMindmaps = state.mindmaps
      const nextPages = state.pages.map((page) => {
        if (page.id !== pageId) {
          return page
        }

        return {
          ...page,
          updatedAt: now,
          blocks: page.blocks.map((block) => {
            if (block.id !== blockId) {
              return block
            }

            if (block.type === type) {
              return block
            }

            const fresh =
              type === 'whiteboard'
                ? (() => {
                    const board = createBoardRecord(now)
                    nextBoards = [...state.boards, board]
                    return createWhiteboardBlock(board.id)
                  })()
                : isDataTableCommandType(type)
                  ? (() => {
                      const dataTable = createDataTableRecord(now)
                      nextDataTables = [...state.dataTables, dataTable]
                      return createDataTableBlock(dataTable.id, getDataTableDisplayMode(type))
                    })()
                : type === 'mindmap'
                  ? (() => {
                      const mindmap = createMindmapRecord(now)
                      nextMindmaps = [...state.mindmaps, mindmap]
                      return createMindmapBlock(mindmap.id)
                    })()
                : createBlock(type)
            return { ...preserveBlockContent(fresh, block), id: block.id }
          }),
        }
      })

      pushUndoSnapshot(state)
      set({ saveStatus: 'saving' })

      try {
        await repository.save({
          boards: nextBoards,
          dataTables: nextDataTables,
          mindmaps: nextMindmaps,
          pages: nextPages,
          settings: state.settings,
        })
        set({
          boards: nextBoards,
          dataTables: nextDataTables,
          mindmaps: nextMindmaps,
          pages: nextPages,
          saveStatus: 'saved',
        })
      } catch {
        set({ saveStatus: 'error' })
        throw new Error('Failed to turn block into another type')
      }
    },

    undo: async () => {
      const snapshot = undoStack.pop()

      if (!snapshot) {
        return
      }

      const currentSnapshot = createSnapshotFromState(get())
      const currentPageId = resolveCurrentPageId(snapshot)
      redoStack.push(currentSnapshot)
      if (redoStack.length > 100) {
        redoStack.shift()
      }

      set({ saveStatus: 'saving' })

      try {
        await repository.replace(snapshot)
        set({
          boards: snapshot.boards,
          dataTables: snapshot.dataTables ?? [],
          mindmaps: snapshot.mindmaps ?? [],
          pages: snapshot.pages,
          settings: snapshot.settings,
          currentPageId,
          saveStatus: 'saved',
        })
      } catch {
        redoStack.pop()
        undoStack.push(snapshot)
        set({ saveStatus: 'error' })
        throw new Error('Failed to undo last action')
      }
    },

    redo: async () => {
      const snapshot = redoStack.pop()

      if (!snapshot) {
        return
      }

      const currentSnapshot = createSnapshotFromState(get())
      const currentPageId = resolveCurrentPageId(snapshot)
      undoStack.push(currentSnapshot)
      if (undoStack.length > 100) {
        undoStack.shift()
      }

      set({ saveStatus: 'saving' })

      try {
        await repository.replace(snapshot)
        set({
          boards: snapshot.boards,
          dataTables: snapshot.dataTables ?? [],
          mindmaps: snapshot.mindmaps ?? [],
          pages: snapshot.pages,
          settings: snapshot.settings,
          currentPageId,
          saveStatus: 'saved',
        })
      } catch {
        undoStack.pop()
        redoStack.push(snapshot)
        set({ saveStatus: 'error' })
        throw new Error('Failed to redo last action')
      }
    },

    }
  })
}
