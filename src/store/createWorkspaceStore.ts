import { createStore } from 'zustand/vanilla'
import { extractMindmapTitle } from '../components/mindmap/mindmapModel'
import { normalizeWhiteboardSnapshot } from '../components/whiteboard/whiteboardModel'
import { getTextBlockStyle, isTextStyleableBlock } from '../domain/blockTextStyle'
import {
  createDefaultPagePropertyDefinitions,
  normalizePagePropertyDefinitions,
  normalizePagePropertyOptions,
  normalizePagePropertyValues,
} from '../domain/pageProperties'
import {
  stripDeletedPageRelations,
  syncPageRelationTitles,
} from '../domain/pageRelations'
import { normalizeRichText, richTextFromPlainText } from '../domain/richText'
import { DEFAULT_PAGE_ICON } from '../domain/pageIcons'
import {
  createInboxPage,
  createSeedWorkspace,
  createWelcomeGuideBundle,
  CURRENT_WELCOME_GUIDE_VERSION,
  DEFAULT_PAGE_DISPLAY_DEFAULTS,
  INBOX_PAGE_ICON,
  INBOX_PAGE_TITLE,
  WELCOME_PAGE_TITLE,
} from '../domain/seed'
import {
  cloneBlocksForUnsync,
  reconcileSyncedBlockGroups,
  validateSyncedGroupBlocks,
} from '../domain/syncedBlocks'
import type {
  AppCloseAction,
  AppSettings,
  BlockRecord,
  BlockSelectionStartMode,
  BlockType,
  BoardRecord,
  ClipboardCaptureMode,
  DataTableRecord,
  ExternalLinkOpenMode,
  MindmapRecord,
  PageFontFamily,
  PageId,
  PageDisplayDefaults,
  PagePropertyDefinition,
  PagePropertyOption,
  PagePropertyValue,
  PageRecord,
  RichTextSegment,
  SaveStatus,
  SearchPreferences,
  SidebarPinnedItem,
  SyncedBlockGroupRecord,
  SyncedBlockInstanceBlock,
  SyncedBlockMode,
  WorkspaceSnapshot,
  WorkspaceSettings,
} from '../domain/types'
import { normalizeAppAccentTheme, type AppAccentTheme } from '../domain/theme'
import { type AppSettingsRepository } from '../lib/appSettingsRepository'
import { type WorkspaceRepository } from '../lib/workspaceRepository'
import {
  createBlock,
  createBoardRecord,
  createDataTableBlock,
  createDataTableRecord,
  createMindmapBlock,
  createMindmapRecord,
  createSyncedBlockInstanceBlock,
  createWhiteboardBlock,
} from '../utils/blockFactory'
import { createId } from '../utils/id'
import { deletePageBranch } from '../utils/pageTree'
import { reorderItemGroup, reorderItems, type ReorderPosition } from '../utils/reorder'

const UNTITLED_PAGE_TITLE = '未命名'
const COPY_SUFFIX = ' \u526f\u672c'
const BLOCK_SAVE_DEBOUNCE_MS = 600
const DEFAULT_SEARCH_PREFERENCES: SearchPreferences = {
  groupResults: true,
  showSourceLabels: true,
  excerptLength: 'medium',
}

interface CreatePageOptions {
  title?: string
  blocks?: BlockRecord[]
  setCurrent?: boolean
}

export interface WorkspaceState {
  boards: BoardRecord[]
  dataTables: DataTableRecord[]
  mindmaps: MindmapRecord[]
  syncedBlockGroups: SyncedBlockGroupRecord[]
  pages: PageRecord[]
  pageProperties: PagePropertyDefinition[]
  settings: WorkspaceSettings
  appSettings: AppSettings
  currentPageId: PageId | null
  saveStatus: SaveStatus
  bootstrap: () => Promise<void>
  ensureInboxPage: () => Promise<PageRecord>
  createPage: (parentId?: PageId, options?: CreatePageOptions) => Promise<PageRecord>
  setCurrentPage: (pageId: PageId) => Promise<void>
  setAppCloseAction: (closeAction: AppCloseAction) => Promise<void>
  setAppAccentTheme: (theme: AppAccentTheme) => Promise<void>
  setClipboardCaptureMode: (mode: ClipboardCaptureMode) => Promise<void>
  setBlockSelectionStartMode: (mode: BlockSelectionStartMode) => Promise<void>
  setLinkOpenMode: (mode: ExternalLinkOpenMode) => Promise<void>
  setPageDefaults: (defaults: Partial<PageDisplayDefaults>) => Promise<void>
  setSearchPreferences: (preferences: Partial<SearchPreferences>) => Promise<void>
  setSidebarLayout: (layout: NonNullable<WorkspaceSettings['sidebarLayout']>) => Promise<void>
  setSidebarWidth: (width: number) => Promise<void>
  togglePinnedSidebarItem: (item: SidebarPinnedItem) => Promise<void>
  setPageFullWidth: (pageId: PageId, isFullWidth: boolean) => Promise<void>
  setPageSmallText: (pageId: PageId, isSmallText: boolean) => Promise<void>
  setPageFontFamily: (pageId: PageId, fontFamily: PageFontFamily) => Promise<void>
  setPageIcon: (pageId: PageId, icon: string | null) => Promise<void>
  setPageCover: (pageId: PageId, cover: string | null) => Promise<void>
  setPageOutlineVisible: (pageId: PageId, showOutline: boolean) => Promise<void>
  setPagePropertiesVisible: (pageId: PageId, showProperties: boolean) => Promise<void>
  setPagePropertyValue: (
    pageId: PageId,
    propertyId: string,
    value: PagePropertyValue,
  ) => Promise<void>
  appendDefaultPageProperty: (key: 'tags' | 'status' | 'date' | 'notes') => Promise<void>
  renamePageProperty: (propertyId: string, name: string) => Promise<void>
  setPagePropertyOptions: (propertyId: string, options: PagePropertyOption[]) => Promise<void>
  renameBoard: (boardId: string, title: string) => Promise<void>
  updateBoardSnapshot: (boardId: string, snapshot: unknown) => Promise<void>
  importBoard: (boardId: string, payload: { title: string | null; snapshot: unknown }) => Promise<void>
  duplicateBoardToPage: (pageId: PageId, boardId: string) => Promise<BoardRecord | null>
  restoreMissingBoardReference: (pageId: PageId, boardId: string) => Promise<BoardRecord | null>
  cleanupOrphanBoards: () => Promise<void>
  cleanupOrphanAssets: () => Promise<void>
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
  duplicatePage: (pageId: PageId) => Promise<PageRecord | null>
  deletePage: (pageId: PageId) => Promise<void>
  createSyncedBlockFromRange: (
    pageId: PageId,
    startBlockId: string,
    endBlockId: string,
  ) => Promise<SyncedBlockInstanceBlock | null>
  createSyncedBlockFromExistingBlock: (
    sourcePageId: PageId,
    sourceBlockId: string,
    targetPageId: PageId,
    targetBlockId: string,
    mode: SyncedBlockMode,
  ) => Promise<SyncedBlockInstanceBlock | null>
  replaceBlockWithSyncedInstance: (
    pageId: PageId,
    blockId: string,
    groupId: string,
    mode: SyncedBlockMode,
  ) => Promise<SyncedBlockInstanceBlock | null>
  updateSyncedGroupBlock: (
    groupId: string,
    blockId: string,
    nextBlock: BlockRecord,
  ) => Promise<void>
  unsyncBlockInstance: (pageId: PageId, blockId: string) => Promise<void>
  updateBlock: (pageId: PageId, blockId: string, nextBlock: BlockRecord) => Promise<void>
  pasteBlocks: (
    pageId: PageId,
    targetBlockId: string | null,
    blocks: BlockRecord[],
    replaceTarget?: boolean,
  ) => Promise<void>
  flushPendingSaves: () => Promise<void>
  appendClipboardCaptureToInbox: (
    blocks: BlockRecord[],
    capturedAt?: string,
    sourceLabel?: string,
  ) => Promise<void>
  insertBlock: (pageId: PageId, type: BlockType) => Promise<BlockRecord | null>
  insertParagraphBlock: (pageId: PageId, text: string) => Promise<void>
  insertBlockAfter: (
    pageId: PageId,
    afterBlockId: string,
    type: BlockType,
    position?: 'before' | 'after',
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
  reorderBlockGroup: (
    pageId: PageId,
    activeBlockIds: string[],
    overBlockId: string,
    position?: ReorderPosition,
  ) => Promise<void>
  deleteBlocks: (pageId: PageId, blockIds: string[]) => Promise<void>
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
    syncedBlockGroups: [],
    pages: [],
    pageProperties: [],
    settings: {
      lastOpenedPageId: null,
      inboxPageId: null,
      sidebarLayout: 'compact',
      sidebarWidth: 272,
      pinnedSidebarItems: [],
      clipboardCaptureMode: 'off',
      blockSelectionStartMode: 'safe_zone_only',
      pageDefaults: DEFAULT_PAGE_DISPLAY_DEFAULTS,
      searchPreferences: DEFAULT_SEARCH_PREFERENCES,
    },
    appSettings: {
      closeAction: 'hide_to_tray',
      accentTheme: 'blue_gray',
    },
    currentPageId: null,
    saveStatus: 'idle',
    bootstrap: async () => undefined,
    ensureInboxPage: async () => {
      throw new Error('not implemented')
    },
    createPage: async () => {
      throw new Error('not implemented')
    },
    setCurrentPage: async () => {
      throw new Error('not implemented')
    },
    setAppCloseAction: async () => {
      throw new Error('not implemented')
    },
    setAppAccentTheme: async () => {
      throw new Error('not implemented')
    },
    setClipboardCaptureMode: async () => {
      throw new Error('not implemented')
    },
    setBlockSelectionStartMode: async () => {
      throw new Error('not implemented')
    },
    setLinkOpenMode: async () => {
      throw new Error('not implemented')
    },
    setPageDefaults: async () => {
      throw new Error('not implemented')
    },
    setPagePropertiesVisible: async () => {
      throw new Error('not implemented')
    },
    setSearchPreferences: async () => {
      throw new Error('not implemented')
    },
    setSidebarLayout: async () => {
      throw new Error('not implemented')
    },
    setSidebarWidth: async () => {
      throw new Error('not implemented')
    },
    togglePinnedSidebarItem: async () => {
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
    setPagePropertyValue: async () => {
      throw new Error('not implemented')
    },
    appendDefaultPageProperty: async () => {
      throw new Error('not implemented')
    },
    renamePageProperty: async () => {
      throw new Error('not implemented')
    },
    setPagePropertyOptions: async () => {
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
    cleanupOrphanAssets: async () => {
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
    duplicatePage: async () => {
      throw new Error('not implemented')
    },
    deletePage: async () => {
      throw new Error('not implemented')
    },
    createSyncedBlockFromRange: async () => {
      throw new Error('not implemented')
    },
    createSyncedBlockFromExistingBlock: async () => {
      throw new Error('not implemented')
    },
    replaceBlockWithSyncedInstance: async () => {
      throw new Error('not implemented')
    },
    updateSyncedGroupBlock: async () => {
      throw new Error('not implemented')
    },
    unsyncBlockInstance: async () => {
      throw new Error('not implemented')
    },
    updateBlock: async () => {
      throw new Error('not implemented')
    },
    pasteBlocks: async () => {
      throw new Error('not implemented')
    },
    flushPendingSaves: async () => undefined,
    appendClipboardCaptureToInbox: async () => {
      throw new Error('not implemented')
    },
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
    reorderBlockGroup: async () => {
      throw new Error('not implemented')
    },
    deleteBlocks: async () => {
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

function normalizeAppSettings(settings: AppSettings | null | undefined): AppSettings {
  return {
    closeAction: settings?.closeAction === 'quit' ? 'quit' : 'hide_to_tray',
    accentTheme: normalizeAppAccentTheme(settings?.accentTheme),
  }
}

function normalizePageDefaults(defaults: Partial<PageDisplayDefaults> | undefined): PageDisplayDefaults {
  return {
    isFullWidth: defaults?.isFullWidth === true,
    isSmallText: defaults?.isSmallText === true,
    fontFamily:
      defaults?.fontFamily === 'serif' || defaults?.fontFamily === 'mono'
        ? defaults.fontFamily
        : 'default',
    showOutline: defaults?.showOutline !== false,
    showProperties: defaults?.showProperties === true,
  }
}

function normalizeSearchPreferences(
  preferences: Partial<SearchPreferences> | undefined,
): SearchPreferences {
  return {
    groupResults: preferences?.groupResults !== false,
    showSourceLabels: preferences?.showSourceLabels !== false,
    excerptLength:
      preferences?.excerptLength === 'short' || preferences?.excerptLength === 'long'
        ? preferences.excerptLength
        : 'medium',
  }
}

function formatClipboardCaptureTimestamp(capturedAt?: string) {
  const date = capturedAt ? new Date(capturedAt) : new Date()
  const year = String(date.getFullYear())
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  const hours = String(date.getHours()).padStart(2, '0')
  const minutes = String(date.getMinutes()).padStart(2, '0')

  return `${year}-${month}-${day} ${hours}:${minutes}`
}

function createPageRecord(
  parentId?: PageId,
  title = UNTITLED_PAGE_TITLE,
  defaults: PageDisplayDefaults = DEFAULT_PAGE_DISPLAY_DEFAULTS,
): PageRecord {
  const now = new Date().toISOString()
  const nextTitle = title.trim() || UNTITLED_PAGE_TITLE

  return {
    id: createId('page'),
    parentId: parentId ?? null,
    title: nextTitle,
    icon: DEFAULT_PAGE_ICON,
    cover: null,
    properties: {},
    ...defaults,
    blocks: [],
    createdAt: now,
    updatedAt: now,
  }
}

function createSettings(
  lastOpenedPageId: PageId | null,
  sidebarLayout: NonNullable<WorkspaceSettings['sidebarLayout']> = 'compact',
  sidebarWidth = 272,
  pinnedSidebarItems: SidebarPinnedItem[] = [],
  inboxPageId: PageId | null = null,
  welcomePageId: PageId | null = null,
  clipboardCaptureMode: ClipboardCaptureMode = 'off',
  pageDefaults: PageDisplayDefaults = DEFAULT_PAGE_DISPLAY_DEFAULTS,
  searchPreferences: SearchPreferences = DEFAULT_SEARCH_PREFERENCES,
  blockSelectionStartMode: BlockSelectionStartMode = 'safe_zone_only',
  linkOpenMode: ExternalLinkOpenMode = 'modifier',
  welcomeGuideVersion: number | null = CURRENT_WELCOME_GUIDE_VERSION,
): WorkspaceSettings {
  return {
    lastOpenedPageId,
    inboxPageId,
    welcomePageId,
    sidebarLayout,
    sidebarWidth,
    pinnedSidebarItems,
    clipboardCaptureMode,
    pageDefaults,
    searchPreferences,
    blockSelectionStartMode,
    linkOpenMode,
    welcomeGuideVersion,
  }
}

function normalizeSettings(settings: WorkspaceSettings): {
  settings: WorkspaceSettings
  didChange: boolean
} {
  const sidebarLayout = settings.sidebarLayout === 'classic' ? 'classic' : 'compact'
  const sidebarWidth =
    typeof settings.sidebarWidth === 'number' && Number.isFinite(settings.sidebarWidth) && settings.sidebarWidth > 0
      ? Math.round(settings.sidebarWidth)
      : 272
  const pinnedSidebarItems = normalizePinnedSidebarItems(settings.pinnedSidebarItems)
  const inboxPageId = typeof settings.inboxPageId === 'string' ? settings.inboxPageId : null
  const welcomePageId = typeof settings.welcomePageId === 'string' ? settings.welcomePageId : null
  const welcomeGuideVersion =
    settings.welcomeGuideVersion === CURRENT_WELCOME_GUIDE_VERSION
      ? CURRENT_WELCOME_GUIDE_VERSION
      : null
  const clipboardCaptureMode =
    settings.clipboardCaptureMode === 'prompt_to_inbox' ? 'prompt_to_inbox' : 'off'
  const blockSelectionStartMode =
    settings.blockSelectionStartMode === 'content_allowed'
      ? 'content_allowed'
      : 'safe_zone_only'
  const linkOpenMode = settings.linkOpenMode === 'direct' ? 'direct' : 'modifier'
  const pageDefaults = normalizePageDefaults(settings.pageDefaults)
  const searchPreferences = normalizeSearchPreferences(settings.searchPreferences)
  const didChange =
    settings.inboxPageId !== inboxPageId ||
    settings.welcomePageId !== welcomePageId ||
    settings.welcomeGuideVersion !== welcomeGuideVersion ||
    settings.sidebarLayout !== sidebarLayout ||
    settings.sidebarWidth !== sidebarWidth ||
    JSON.stringify(settings.pinnedSidebarItems ?? []) !== JSON.stringify(pinnedSidebarItems) ||
    settings.clipboardCaptureMode !== clipboardCaptureMode ||
    settings.blockSelectionStartMode !== blockSelectionStartMode ||
    settings.linkOpenMode !== linkOpenMode ||
    JSON.stringify(settings.pageDefaults ?? null) !== JSON.stringify(pageDefaults) ||
    JSON.stringify(settings.searchPreferences ?? null) !== JSON.stringify(searchPreferences)

  return {
    settings: {
      lastOpenedPageId: settings.lastOpenedPageId,
      inboxPageId,
      welcomePageId,
      welcomeGuideVersion,
      sidebarLayout,
      sidebarWidth,
      pinnedSidebarItems,
      clipboardCaptureMode,
      pageDefaults,
      searchPreferences,
      blockSelectionStartMode,
      linkOpenMode,
    },
    didChange,
  }
}

function ensureInboxPageInSnapshot(snapshot: WorkspaceSnapshot): {
  snapshot: WorkspaceSnapshot
  didChange: boolean
} {
  const inboxPageId = snapshot.settings.inboxPageId
  const existingInbox =
    inboxPageId !== null && inboxPageId !== undefined
      ? snapshot.pages.find((page) => page.id === inboxPageId)
      : null

  if (existingInbox) {
    return { snapshot, didChange: false }
  }

  const reusableInbox = snapshot.pages.find(
    (page) => page.parentId === null && page.title === INBOX_PAGE_TITLE && page.icon === INBOX_PAGE_ICON,
  )

  if (reusableInbox) {
    return {
      snapshot: {
        ...snapshot,
        settings: {
          ...snapshot.settings,
          inboxPageId: reusableInbox.id,
        },
      },
      didChange: true,
    }
  }

  const inboxPage = createInboxPage()

  return {
    snapshot: {
      ...snapshot,
      pages: [inboxPage, ...snapshot.pages],
      settings: {
        ...snapshot.settings,
        inboxPageId: inboxPage.id,
      },
    },
    didChange: true,
  }
}

function ensureWelcomePageInSnapshot(snapshot: WorkspaceSnapshot): {
  snapshot: WorkspaceSnapshot
  didChange: boolean
} {
  if (snapshot.settings.welcomeGuideVersion === CURRENT_WELCOME_GUIDE_VERSION) {
    return { snapshot, didChange: false }
  }

  const existingWelcomePage =
    (typeof snapshot.settings.welcomePageId === 'string'
      ? snapshot.pages.find((page) => page.id === snapshot.settings.welcomePageId)
      : null) ?? snapshot.pages.find((page) => page.title === WELCOME_PAGE_TITLE)

  if (!existingWelcomePage && typeof snapshot.settings.welcomePageId === 'string') {
    return {
      snapshot: {
        ...snapshot,
        settings: {
          ...snapshot.settings,
          welcomeGuideVersion: CURRENT_WELCOME_GUIDE_VERSION,
        },
      },
      didChange: true,
    }
  }

  const guide = createWelcomeGuideBundle()
  const shouldReplaceWelcomePage = existingWelcomePage
    ? isLegacyWelcomePage(existingWelcomePage)
    : true
  const guidePage = existingWelcomePage && shouldReplaceWelcomePage
    ? {
        ...guide.page,
        id: existingWelcomePage.id,
        createdAt: existingWelcomePage.createdAt,
      }
    : existingWelcomePage
      ? { ...guide.page, title: '知栖使用手册' }
      : guide.page

  return {
    snapshot: {
      ...snapshot,
      boards: [...snapshot.boards, guide.board],
      dataTables: [...(snapshot.dataTables ?? []), guide.dataTable],
      mindmaps: [...(snapshot.mindmaps ?? []), guide.mindmap],
      pages: existingWelcomePage && shouldReplaceWelcomePage
        ? snapshot.pages.map((page) => (page.id === existingWelcomePage.id ? guidePage : page))
        : [...snapshot.pages, guidePage],
      settings: {
        ...snapshot.settings,
        welcomePageId: existingWelcomePage?.id ?? guidePage.id,
        welcomeGuideVersion: CURRENT_WELCOME_GUIDE_VERSION,
      },
    },
    didChange: true,
  }
}

function isLegacyWelcomePage(page: PageRecord) {
  const headings = page.blocks
    .filter((block): block is Extract<BlockRecord, { type: 'heading_1' | 'heading_2' }> =>
      block.type === 'heading_1' || block.type === 'heading_2',
    )
    .map((block) => block.text)

  return (
    page.title === WELCOME_PAGE_TITLE &&
    page.icon === '🌿' &&
    JSON.stringify(headings) === JSON.stringify(['知栖', '从这里开始', '常用操作', '本地优先'])
  )
}

function normalizePinnedSidebarItems(items: WorkspaceSettings['pinnedSidebarItems']): SidebarPinnedItem[] {
  if (!Array.isArray(items)) {
    return []
  }

  const seen = new Set<string>()
  const normalized: SidebarPinnedItem[] = []

  for (const item of items) {
    if (!item || typeof item !== 'object') {
      continue
    }

    if (item.kind === 'page' && typeof item.pageId === 'string') {
      const key = `page:${item.pageId}`
      if (!seen.has(key)) {
        seen.add(key)
        normalized.push({ kind: 'page', pageId: item.pageId })
      }
      continue
    }

    if (
      item.kind === 'data_table' &&
      typeof item.pageId === 'string' &&
      typeof item.dataTableId === 'string'
    ) {
      const key = `data_table:${item.pageId}:${item.dataTableId}`
      if (!seen.has(key)) {
        seen.add(key)
        normalized.push({
          kind: 'data_table',
          pageId: item.pageId,
          dataTableId: item.dataTableId,
        })
      }
    }
  }

  return normalized
}

function isSamePinnedSidebarItem(left: SidebarPinnedItem, right: SidebarPinnedItem) {
  return JSON.stringify(left) === JSON.stringify(right)
}

function collectPageBranch(pages: PageRecord[], targetId: PageId): PageRecord[] {
  const ids = new Set<PageId>([targetId])
  let changed = true

  while (changed) {
    changed = false

    for (const page of pages) {
      if (page.parentId && ids.has(page.parentId) && !ids.has(page.id)) {
        ids.add(page.id)
        changed = true
      }
    }
  }

  return pages.filter((page) => ids.has(page.id))
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
  const rawSyncedBlockGroups = Array.isArray(
    (snapshot as WorkspaceSnapshot & { syncedBlockGroups?: SyncedBlockGroupRecord[] }).syncedBlockGroups,
  )
    ? snapshot.syncedBlockGroups
    : []
  const normalizedBoards = normalizeBoards(rawBoards)
  const boards = normalizedBoards.boards
  const normalizedDataTables = normalizeDataTables(rawDataTables)
  const dataTables = normalizedDataTables.dataTables
  const mindmaps = structuredClone(rawMindmaps)
  const syncedBlockGroups = structuredClone(rawSyncedBlockGroups)

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
  if (
    !Array.isArray(
      (snapshot as WorkspaceSnapshot & { syncedBlockGroups?: SyncedBlockGroupRecord[] }).syncedBlockGroups,
    )
  ) {
    didChange = true
  }

  const normalizedSettings = normalizeSettings(snapshot.settings)
  const settings = normalizedSettings.settings

  if (normalizedSettings.didChange) {
    didChange = true
  }

  const now = new Date().toISOString()
  const normalizedPageProperties = normalizePagePropertyDefinitions(snapshot.pageProperties)
  const pageProperties =
    normalizedPageProperties.length > 0
      ? normalizedPageProperties
      : createDefaultPagePropertyDefinitions(now)

  if (JSON.stringify(snapshot.pageProperties ?? null) !== JSON.stringify(pageProperties)) {
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
    'file',
    'whiteboard',
    'data_table',
    'mindmap',
    'synced_block',
  ])

  const pages = snapshot.pages.map((page) => {
    const supportedBlocks = page.blocks.filter((block) =>
      liveBlockTypes.has((block as BlockRecord | { type: string }).type as BlockRecord['type']),
    )
    const normalized = normalizeListBlocks(supportedBlocks)
    const normalizedDisplay: PageDisplayDefaults = {
      isFullWidth: page.isFullWidth === true,
      isSmallText: page.isSmallText === true,
      fontFamily:
        page.fontFamily === 'serif' || page.fontFamily === 'mono' ? page.fontFamily : 'default',
      showOutline: page.showOutline !== false,
      showProperties: page.showProperties !== false,
    }
    const normalizedProperties = normalizePagePropertyValues(pageProperties, page.properties)
    const normalizedIcon = page.icon === null && page.iconHidden !== true ? DEFAULT_PAGE_ICON : page.icon

    if (
      supportedBlocks.length !== page.blocks.length ||
      normalized.didChange ||
      page.isFullWidth !== normalizedDisplay.isFullWidth ||
      page.isSmallText !== normalizedDisplay.isSmallText ||
      page.fontFamily !== normalizedDisplay.fontFamily ||
      page.showOutline !== normalizedDisplay.showOutline ||
      page.showProperties !== normalizedDisplay.showProperties ||
      page.icon !== normalizedIcon
    ) {
      didChange = true
      return {
        ...page,
        ...normalizedDisplay,
        icon: normalizedIcon,
        properties: normalizedProperties,
        blocks: normalized.blocks,
      }
    }

    if (JSON.stringify(page.properties ?? {}) !== JSON.stringify(normalizedProperties)) {
      didChange = true
      return {
        ...page,
        ...normalizedDisplay,
        properties: normalizedProperties,
      }
    }

    return {
      ...page,
      ...normalizedDisplay,
      properties: page.properties ?? normalizedProperties,
    }
  })

  const nextSnapshot = didChange
    ? { boards, dataTables, mindmaps, syncedBlockGroups, pages, pageProperties, settings }
    : { ...snapshot, boards, dataTables, mindmaps, syncedBlockGroups, pages, pageProperties, settings }
  const ensuredInbox = ensureInboxPageInSnapshot(nextSnapshot)
  const ensuredWelcome = ensureWelcomePageInSnapshot(ensuredInbox.snapshot)

  return {
    snapshot: ensuredWelcome.snapshot,
    didChange: didChange || ensuredInbox.didChange || ensuredWelcome.didChange,
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
    case 'file':
      return block.caption
    case 'child_page':
    case 'whiteboard':
    case 'data_table':
    case 'mindmap':
    case 'synced_block':
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
      return { ...nextBlock, items: [text], ...textStyle, ...(richText ? { richText } : {}) }
    case 'code':
      return { ...nextBlock, text }
    case 'table':
    case 'image':
    case 'video':
    case 'audio':
    case 'file':
    case 'child_page':
    case 'whiteboard':
    case 'data_table':
    case 'mindmap':
    case 'synced_block':
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
    case 'bulleted_list':
    case 'numbered_list':
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
      return { ...block, items: [text], richText: nextRichText }
    default:
      return block
  }
}

function remapBlockPageRelationTargets(
  block: BlockRecord,
  nextPageIdBySourceId: ReadonlyMap<string, string>,
): BlockRecord {
  const richText = getEditableBlockRichText(block)

  if (!richText) {
    return block
  }

  let didChange = false
  const nextRichText = richText.map((segment) => {
    if (!segment.pageId) {
      return segment
    }

    const nextPageId = nextPageIdBySourceId.get(segment.pageId)
    if (!nextPageId || nextPageId === segment.pageId) {
      return segment
    }

    didChange = true
    return {
      ...segment,
      pageId: nextPageId,
    }
  })

  if (!didChange) {
    return block
  }

  return withEditableBlockText(block, getEditableBlockText(block) ?? '', nextRichText)
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

function collectReferencedBoardIds(
  pages: PageRecord[],
  syncedBlockGroups: SyncedBlockGroupRecord[] = [],
) {
  const referencedBoardIds = new Set<string>()

  for (const page of pages) {
    for (const block of page.blocks) {
      if (block.type === 'whiteboard') {
        referencedBoardIds.add(block.boardId)
      }
    }
  }

  for (const group of syncedBlockGroups) {
    for (const block of group.blocks) {
      if (block.type === 'whiteboard') {
        referencedBoardIds.add(block.boardId)
      }
    }
  }

  return referencedBoardIds
}

function collectReferencedDataTableIds(
  pages: PageRecord[],
  syncedBlockGroups: SyncedBlockGroupRecord[] = [],
) {
  const referencedDataTableIds = new Set<string>()

  for (const page of pages) {
    for (const block of page.blocks) {
      if (block.type === 'data_table') {
        referencedDataTableIds.add(block.databaseId)
      }
    }
  }

  for (const group of syncedBlockGroups) {
    for (const block of group.blocks) {
      if (block.type === 'data_table') {
        referencedDataTableIds.add(block.databaseId)
      }
    }
  }

  return referencedDataTableIds
}

function collectReferencedMindmapIds(
  pages: PageRecord[],
  syncedBlockGroups: SyncedBlockGroupRecord[] = [],
) {
  const referencedMindmapIds = new Set<string>()

  for (const page of pages) {
    for (const block of page.blocks) {
      if (block.type === 'mindmap') {
        referencedMindmapIds.add(block.mindmapId)
      }
    }
  }

  for (const group of syncedBlockGroups) {
    for (const block of group.blocks) {
      if (block.type === 'mindmap') {
        referencedMindmapIds.add(block.mindmapId)
      }
    }
  }

  return referencedMindmapIds
}

function filterResourcesReferencedByPages(
  state: Pick<WorkspaceState, 'boards' | 'dataTables' | 'mindmaps' | 'syncedBlockGroups'>,
  pages: PageRecord[],
) {
  const referencedBoardIds = collectReferencedBoardIds(pages, state.syncedBlockGroups)
  const referencedDataTableIds = collectReferencedDataTableIds(pages, state.syncedBlockGroups)
  const referencedMindmapIds = collectReferencedMindmapIds(pages, state.syncedBlockGroups)

  return {
    boards: state.boards.filter((board) => referencedBoardIds.has(board.id)),
    dataTables: state.dataTables.filter((dataTable) => referencedDataTableIds.has(dataTable.id)),
    mindmaps: state.mindmaps.filter((mindmap) => referencedMindmapIds.has(mindmap.id)),
  }
}

function touchPagesWithChangedBlocks(
  previousPages: PageRecord[],
  nextPages: PageRecord[],
  updatedAt: string,
) {
  const previousPageById = new Map(previousPages.map((page) => [page.id, page]))

  return nextPages.map((page) => {
    const previousPage = previousPageById.get(page.id)

    if (!previousPage || page.updatedAt !== previousPage.updatedAt) {
      return page
    }

    return JSON.stringify(previousPage.blocks) === JSON.stringify(page.blocks)
      ? page
      : {
          ...page,
          updatedAt,
        }
  })
}

export function createWorkspaceStore(
  repository: WorkspaceRepository,
  appSettingsRepository: AppSettingsRepository = {
    async load() {
      return null
    },
    async save() {
      return undefined
    },
  },
) {
  const undoStack: WorkspaceSnapshot[] = []
  const redoStack: WorkspaceSnapshot[] = []
  let pagePropertyPersistQueue: Promise<void> = Promise.resolve()
  let pagePropertyPersistVersion = 0
  let nonPageAssetsPersistQueue: Promise<void> = Promise.resolve()
  let nonPageAssetsPersistVersion = 0
  let pendingBlockSaveTimer: ReturnType<typeof setTimeout> | null = null
  let pendingBlockSaveTask: Promise<void> | null = null
  let pendingBlockSaveVersion = 0
  let bootstrapTask: Promise<void> | null = null

  function getClipboardCaptureMode(settings: WorkspaceSettings) {
    return settings.clipboardCaptureMode === 'prompt_to_inbox' ? 'prompt_to_inbox' : 'off'
  }

  function getBlockSelectionStartMode(settings: WorkspaceSettings) {
    return settings.blockSelectionStartMode === 'content_allowed'
      ? 'content_allowed'
      : 'safe_zone_only'
  }

  function getLinkOpenMode(settings: WorkspaceSettings) {
    return settings.linkOpenMode === 'direct' ? 'direct' : 'modifier'
  }

  function getPageDefaults(settings: WorkspaceSettings) {
    return normalizePageDefaults(settings.pageDefaults)
  }

  function getSearchPreferences(settings: WorkspaceSettings) {
    return normalizeSearchPreferences(settings.searchPreferences)
  }

  function createSnapshotFromState(
    state: Pick<
      WorkspaceState,
      'boards' | 'dataTables' | 'mindmaps' | 'syncedBlockGroups' | 'pages' | 'pageProperties' | 'settings'
    >,
  ): WorkspaceSnapshot {
    return structuredClone({
      boards: state.boards,
      dataTables: state.dataTables,
      mindmaps: state.mindmaps,
      syncedBlockGroups: state.syncedBlockGroups,
      pages: state.pages,
      pageProperties: state.pageProperties,
      settings: state.settings,
    })
  }

  function pushUndoSnapshot(
    state: Pick<
      WorkspaceState,
      'boards' | 'dataTables' | 'mindmaps' | 'syncedBlockGroups' | 'pages' | 'pageProperties' | 'settings'
    >,
  ) {
    undoStack.push(createSnapshotFromState(state))
    redoStack.length = 0

    if (undoStack.length > 100) {
      undoStack.shift()
    }
  }

  function removeSyncedInstanceFromSnapshot(
    snapshot: WorkspaceSnapshot,
    pageId: PageId,
    blockId: string,
  ): WorkspaceSnapshot {
    const page = snapshot.pages.find((item) => item.id === pageId)
    const container = page?.blocks.find(
      (block): block is SyncedBlockInstanceBlock =>
        block.id === blockId && block.type === 'synced_block',
    )

    if (!page || !container) {
      return snapshot
    }

    const now = new Date().toISOString()
    const nextPages = snapshot.pages.map((currentPage) =>
      currentPage.id === pageId
        ? {
            ...currentPage,
            updatedAt: now,
            blocks: currentPage.blocks.filter((block) => block.id !== blockId),
          }
        : currentPage,
    )

    return {
      ...snapshot,
      pages: nextPages,
      syncedBlockGroups: reconcileSyncedBlockGroups(
        nextPages,
        snapshot.syncedBlockGroups ?? [],
        new Set([container.groupId]),
        now,
      ),
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
            syncedBlockGroups: latestState.syncedBlockGroups,
            pages: latestState.pages,
            pageProperties: latestState.pageProperties,
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
      await pagePropertyPersistQueue
      await nonPageAssetsPersistQueue
    }

    async function persistPagePropertyState(errorMessage: string) {
      const persistVersion = ++pagePropertyPersistVersion
      const persistTask = pagePropertyPersistQueue.then(() =>
        repository.save(createSnapshotFromState(get())),
      )
      pagePropertyPersistQueue = persistTask.catch(() => undefined)

      try {
        await persistTask
        if (persistVersion === pagePropertyPersistVersion) {
          set({ saveStatus: 'saved' })
        }
      } catch {
        if (persistVersion === pagePropertyPersistVersion) {
          set({ saveStatus: 'error' })
        }
        throw new Error(errorMessage)
      }
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
          syncedBlockGroups: latestState.syncedBlockGroups,
          pages: latestState.pages,
          pageProperties: latestState.pageProperties,
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
      if (bootstrapTask) {
        await bootstrapTask
        return
      }

      bootstrapTask = (async () => {
        const persistedSnapshot = await repository.load()
        const persistedAppSettings = await appSettingsRepository.load()
        const rawSnapshot = persistedSnapshot ?? createSeedWorkspace()
        const normalized = normalizeWorkspaceSnapshot(rawSnapshot)
        const snapshot = normalized.snapshot
        const currentPageId = resolveCurrentPageId(snapshot)
        const appSettings = normalizeAppSettings(persistedAppSettings)
        undoStack.length = 0
        redoStack.length = 0

        if (!persistedSnapshot || normalized.didChange) {
          await repository.replace(snapshot)
        }

        set({
          boards: snapshot.boards,
          dataTables: snapshot.dataTables ?? [],
          mindmaps: snapshot.mindmaps ?? [],
          syncedBlockGroups: snapshot.syncedBlockGroups ?? [],
          pages: snapshot.pages,
          pageProperties: snapshot.pageProperties ?? [],
          settings: createSettings(
            currentPageId,
            snapshot.settings.sidebarLayout ?? 'compact',
            snapshot.settings.sidebarWidth ?? 272,
            snapshot.settings.pinnedSidebarItems ?? [],
            snapshot.settings.inboxPageId ?? null,
            snapshot.settings.welcomePageId ?? null,
            getClipboardCaptureMode(snapshot.settings),
            getPageDefaults(snapshot.settings),
            getSearchPreferences(snapshot.settings),
            getBlockSelectionStartMode(snapshot.settings),
            getLinkOpenMode(snapshot.settings),
            snapshot.settings.welcomeGuideVersion ?? null,
          ),
          appSettings,
          currentPageId,
          saveStatus: 'saved',
        })
      })()

      try {
        await bootstrapTask
      } finally {
        bootstrapTask = null
      }
    },

    ensureInboxPage: async () => {
      const state = get()
      const existingInbox =
        state.settings.inboxPageId !== null && state.settings.inboxPageId !== undefined
          ? state.pages.find((page) => page.id === state.settings.inboxPageId)
          : null

      if (existingInbox) {
        return existingInbox
      }

      const inboxPage = createInboxPage()
      const nextSettings = createSettings(
        state.settings.lastOpenedPageId,
        state.settings.sidebarLayout ?? 'compact',
        state.settings.sidebarWidth ?? 272,
        state.settings.pinnedSidebarItems ?? [],
        inboxPage.id,
        state.settings.welcomePageId ?? null,
        getClipboardCaptureMode(state.settings),
        getPageDefaults(state.settings),
        getSearchPreferences(state.settings),
        getBlockSelectionStartMode(state.settings),
        getLinkOpenMode(state.settings),
      )
      const nextSnapshot = createSnapshotFromState({
        ...state,
        pages: [inboxPage, ...state.pages],
        settings: nextSettings,
      })

      pushUndoSnapshot(state)
      set({ saveStatus: 'saving' })

      try {
        await repository.save(nextSnapshot)
        set({
          pages: nextSnapshot.pages,
          settings: nextSettings,
          saveStatus: 'saved',
        })
      } catch {
        set({ saveStatus: 'error' })
        throw new Error('Failed to recreate inbox page')
      }

      return inboxPage
    },

    createPage: async (parentId?: PageId, options?: CreatePageOptions) => {
      const state = get()
      const page = {
        ...createPageRecord(parentId, options?.title, getPageDefaults(state.settings)),
        blocks: options?.blocks ?? [],
      }
      const nextCurrentPageId = options?.setCurrent === false ? state.currentPageId : page.id
      const nextSettings = createSettings(
        nextCurrentPageId,
        state.settings.sidebarLayout ?? 'compact',
        state.settings.sidebarWidth ?? 272,
        state.settings.pinnedSidebarItems ?? [],
        state.settings.inboxPageId ?? null,
        state.settings.welcomePageId ?? null,
        getClipboardCaptureMode(state.settings),
        getPageDefaults(state.settings),
        getSearchPreferences(state.settings),
        getBlockSelectionStartMode(state.settings),
        getLinkOpenMode(state.settings),
      )
      const nextSnapshot = createSnapshotFromState({
        ...state,
        pages: [...state.pages, page],
        settings: nextSettings,
      })

      pushUndoSnapshot(state)
      set({ saveStatus: 'saving' })

      try {
        await repository.save(nextSnapshot)
        set({
          boards: nextSnapshot.boards,
          pages: nextSnapshot.pages,
          settings: nextSettings,
          currentPageId: nextCurrentPageId,
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

      const nextSettings = createSettings(
        pageId,
        state.settings.sidebarLayout ?? 'compact',
        state.settings.sidebarWidth ?? 272,
        state.settings.pinnedSidebarItems ?? [],
        state.settings.inboxPageId ?? null,
        state.settings.welcomePageId ?? null,
        getClipboardCaptureMode(state.settings),
        getPageDefaults(state.settings),
        getSearchPreferences(state.settings),
        getBlockSelectionStartMode(state.settings),
        getLinkOpenMode(state.settings),
      )
      const nextSnapshot = createSnapshotFromState({
        ...state,
        settings: nextSettings,
      })

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

    setAppCloseAction: async (closeAction) => {
      const nextAppSettings = normalizeAppSettings({ ...get().appSettings, closeAction })
      set({
        appSettings: nextAppSettings,
      })
      await appSettingsRepository.save(nextAppSettings)
    },

    setAppAccentTheme: async (theme) => {
      const state = get()
      const nextAppSettings = normalizeAppSettings({ ...state.appSettings, accentTheme: theme })

      if (nextAppSettings.accentTheme === state.appSettings.accentTheme) {
        return
      }

      set({ appSettings: nextAppSettings })
      await appSettingsRepository.save(nextAppSettings)
    },

    setClipboardCaptureMode: async (mode) => {
      const state = get()
      const nextSettings = createSettings(
        state.settings.lastOpenedPageId,
        state.settings.sidebarLayout ?? 'compact',
        state.settings.sidebarWidth ?? 272,
        state.settings.pinnedSidebarItems ?? [],
        state.settings.inboxPageId ?? null,
        state.settings.welcomePageId ?? null,
        mode,
        getPageDefaults(state.settings),
        getSearchPreferences(state.settings),
        getBlockSelectionStartMode(state.settings),
        getLinkOpenMode(state.settings),
      )
      const nextSnapshot = createSnapshotFromState({
        ...state,
        settings: nextSettings,
      })

      set({ saveStatus: 'saving' })

      try {
        await repository.save(nextSnapshot)
        set({
          settings: nextSettings,
          saveStatus: 'saved',
        })
      } catch {
        set({ saveStatus: 'error' })
        throw new Error('Failed to update clipboard capture mode')
      }
    },

    setBlockSelectionStartMode: async (mode) => {
      const state = get()

      if (getBlockSelectionStartMode(state.settings) === mode) {
        return
      }

      const nextSettings = createSettings(
        state.settings.lastOpenedPageId,
        state.settings.sidebarLayout ?? 'compact',
        state.settings.sidebarWidth ?? 272,
        state.settings.pinnedSidebarItems ?? [],
        state.settings.inboxPageId ?? null,
        state.settings.welcomePageId ?? null,
        getClipboardCaptureMode(state.settings),
        getPageDefaults(state.settings),
        getSearchPreferences(state.settings),
        mode,
        getLinkOpenMode(state.settings),
      )
      const nextSnapshot = createSnapshotFromState({
        ...state,
        settings: nextSettings,
      })

      set({ saveStatus: 'saving' })

      try {
        await repository.save(nextSnapshot)
        set({
          settings: nextSettings,
          saveStatus: 'saved',
        })
      } catch {
        set({ saveStatus: 'error' })
        throw new Error('Failed to update block selection start mode')
      }
    },

    setLinkOpenMode: async (mode) => {
      const state = get()

      if (getLinkOpenMode(state.settings) === mode) {
        return
      }

      const nextSettings = createSettings(
        state.settings.lastOpenedPageId,
        state.settings.sidebarLayout ?? 'compact',
        state.settings.sidebarWidth ?? 272,
        state.settings.pinnedSidebarItems ?? [],
        state.settings.inboxPageId ?? null,
        state.settings.welcomePageId ?? null,
        getClipboardCaptureMode(state.settings),
        getPageDefaults(state.settings),
        getSearchPreferences(state.settings),
        getBlockSelectionStartMode(state.settings),
        mode,
      )
      const nextSnapshot = createSnapshotFromState({
        ...state,
        settings: nextSettings,
      })

      set({ saveStatus: 'saving' })

      try {
        await repository.save(nextSnapshot)
        set({
          settings: nextSettings,
          saveStatus: 'saved',
        })
      } catch {
        set({ saveStatus: 'error' })
        throw new Error('Failed to update link open mode')
      }
    },

    setPageDefaults: async (defaults) => {
      const state = get()
      const nextDefaults = normalizePageDefaults({
        ...state.settings.pageDefaults,
        ...defaults,
      })
      const nextSettings = createSettings(
        state.settings.lastOpenedPageId,
        state.settings.sidebarLayout ?? 'compact',
        state.settings.sidebarWidth ?? 272,
        state.settings.pinnedSidebarItems ?? [],
        state.settings.inboxPageId ?? null,
        state.settings.welcomePageId ?? null,
        getClipboardCaptureMode(state.settings),
        nextDefaults,
        getSearchPreferences(state.settings),
        getBlockSelectionStartMode(state.settings),
        getLinkOpenMode(state.settings),
      )
      const nextSnapshot = createSnapshotFromState({
        ...state,
        settings: nextSettings,
      })

      set({ saveStatus: 'saving' })

      try {
        await repository.save(nextSnapshot)
        set({
          settings: nextSettings,
          saveStatus: 'saved',
        })
      } catch {
        set({ saveStatus: 'error' })
        throw new Error('Failed to update page defaults')
      }
    },

    setSearchPreferences: async (preferences) => {
      const state = get()
      const nextSearchPreferences = normalizeSearchPreferences({
        ...state.settings.searchPreferences,
        ...preferences,
      })
      const nextSettings = createSettings(
        state.settings.lastOpenedPageId,
        state.settings.sidebarLayout ?? 'compact',
        state.settings.sidebarWidth ?? 272,
        state.settings.pinnedSidebarItems ?? [],
        state.settings.inboxPageId ?? null,
        state.settings.welcomePageId ?? null,
        getClipboardCaptureMode(state.settings),
        getPageDefaults(state.settings),
        nextSearchPreferences,
        getBlockSelectionStartMode(state.settings),
        getLinkOpenMode(state.settings),
      )
      const nextSnapshot = createSnapshotFromState({
        ...state,
        settings: nextSettings,
      })

      set({ saveStatus: 'saving' })

      try {
        await repository.save(nextSnapshot)
        set({
          settings: nextSettings,
          saveStatus: 'saved',
        })
      } catch {
        set({ saveStatus: 'error' })
        throw new Error('Failed to update search preferences')
      }
    },

    setSidebarLayout: async (layout) => {
      const state = get()

      if (state.settings.sidebarLayout === layout) {
        return
      }

      const nextSettings = createSettings(
        state.settings.lastOpenedPageId,
        layout,
        state.settings.sidebarWidth ?? 272,
        state.settings.pinnedSidebarItems ?? [],
        state.settings.inboxPageId ?? null,
        state.settings.welcomePageId ?? null,
        getClipboardCaptureMode(state.settings),
        getPageDefaults(state.settings),
        getSearchPreferences(state.settings),
        getBlockSelectionStartMode(state.settings),
        getLinkOpenMode(state.settings),
      )
      const nextSnapshot = createSnapshotFromState({
        ...state,
        settings: nextSettings,
      })

      set({ saveStatus: 'saving' })

      try {
        await repository.save(nextSnapshot)
        set({
          settings: nextSettings,
          saveStatus: 'saved',
        })
      } catch {
        set({ saveStatus: 'error' })
        throw new Error('Failed to update sidebar layout')
      }
    },

    setSidebarWidth: async (width) => {
      const state = get()
      const nextWidth = Math.max(1, Math.round(width))

      if (state.settings.sidebarWidth === nextWidth) {
        return
      }

      const nextSettings = createSettings(
        state.settings.lastOpenedPageId,
        state.settings.sidebarLayout ?? 'compact',
        nextWidth,
        state.settings.pinnedSidebarItems ?? [],
        state.settings.inboxPageId ?? null,
        state.settings.welcomePageId ?? null,
        getClipboardCaptureMode(state.settings),
        getPageDefaults(state.settings),
        getSearchPreferences(state.settings),
        getBlockSelectionStartMode(state.settings),
        getLinkOpenMode(state.settings),
      )
      const nextSnapshot = createSnapshotFromState({
        ...state,
        settings: nextSettings,
      })

      set({ saveStatus: 'saving' })

      try {
        await repository.save(nextSnapshot)
        set({
          settings: nextSettings,
          saveStatus: 'saved',
        })
      } catch {
        set({ saveStatus: 'error' })
        throw new Error('Failed to update sidebar width')
      }
    },

    togglePinnedSidebarItem: async (item) => {
      const state = get()
      const currentItems = state.settings.pinnedSidebarItems ?? []
      const nextPinnedSidebarItems = currentItems.some((currentItem) =>
        isSamePinnedSidebarItem(currentItem, item),
      )
        ? currentItems.filter((currentItem) => !isSamePinnedSidebarItem(currentItem, item))
        : [...currentItems, item]

      const nextSettings = createSettings(
        state.settings.lastOpenedPageId,
        state.settings.sidebarLayout ?? 'compact',
        state.settings.sidebarWidth ?? 272,
        nextPinnedSidebarItems,
        state.settings.inboxPageId ?? null,
        state.settings.welcomePageId ?? null,
        getClipboardCaptureMode(state.settings),
        getPageDefaults(state.settings),
        getSearchPreferences(state.settings),
        getBlockSelectionStartMode(state.settings),
        getLinkOpenMode(state.settings),
      )
      const nextSnapshot = createSnapshotFromState({
        ...state,
        settings: nextSettings,
      })

      set({ saveStatus: 'saving' })

      try {
        await repository.save(nextSnapshot)
        set({
          settings: nextSettings,
          saveStatus: 'saved',
        })
      } catch {
        set({ saveStatus: 'error' })
        throw new Error('Failed to update pinned sidebar items')
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
        await repository.save(createSnapshotFromState({ ...state, pages: nextPages }))
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
        await repository.save(createSnapshotFromState({ ...state, pages: nextPages }))
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
        await repository.save(createSnapshotFromState({ ...state, pages: nextPages }))
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
            iconHidden: icon === null,
            updatedAt: new Date().toISOString(),
            }
          : page,
      )

      pushUndoSnapshot(state)
      set({ saveStatus: 'saving' })

      try {
        await repository.save(createSnapshotFromState({ ...state, pages: nextPages }))
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
        await repository.save(createSnapshotFromState({ ...state, pages: nextPages }))
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
        await repository.save(createSnapshotFromState({ ...state, pages: nextPages }))
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

    setPagePropertiesVisible: async (pageId: PageId, showProperties: boolean) => {
      const state = get()
      const nextPages = state.pages.map((page) =>
        page.id === pageId
          ? {
              ...page,
              showProperties,
              updatedAt: new Date().toISOString(),
            }
          : page,
      )

      pushUndoSnapshot(state)
      set({ saveStatus: 'saving' })

      try {
        await repository.save(createSnapshotFromState({ ...state, pages: nextPages }))
        set({
          boards: state.boards,
          pages: nextPages,
          saveStatus: 'saved',
        })
      } catch {
        set({ saveStatus: 'error' })
        throw new Error('Failed to update page property visibility')
      }
    },

    setPagePropertyValue: async (pageId: PageId, propertyId: string, value: PagePropertyValue) => {
      const state = get()
      const nextPages = state.pages.map((page) =>
        page.id === pageId
          ? {
              ...page,
              updatedAt: new Date().toISOString(),
              properties: {
                ...(page.properties ?? {}),
                [propertyId]: value,
              },
            }
          : page,
      )

      pushUndoSnapshot(state)
      set({
        boards: state.boards,
        pages: nextPages,
        saveStatus: 'saving',
      })

      await persistPagePropertyState('Failed to update page property value')
    },

    appendDefaultPageProperty: async (key) => {
      const state = get()

      if (state.pageProperties.some((item) => item.key === key)) {
        return
      }

      const definition = createDefaultPagePropertyDefinitions(new Date().toISOString()).find(
        (item) => item.key === key,
      )

      if (!definition) {
        return
      }

      const nextPageProperties = [...state.pageProperties, definition]
      const nextPages = state.pages.map((page) => ({
        ...page,
        properties: normalizePagePropertyValues(nextPageProperties, page.properties),
      }))

      pushUndoSnapshot(state)
      set({ saveStatus: 'saving' })

      try {
        await repository.save(
          createSnapshotFromState({
            ...state,
            pageProperties: nextPageProperties,
            pages: nextPages,
          }),
        )
        set({
          boards: state.boards,
          pages: nextPages,
          pageProperties: nextPageProperties,
          saveStatus: 'saved',
        })
      } catch {
        set({ saveStatus: 'error' })
        throw new Error('Failed to append page property')
      }
    },

    renamePageProperty: async (propertyId, name) => {
      const state = get()
      const nextName = name.trim()

      if (!nextName) {
        return
      }

      const nextPageProperties = state.pageProperties.map((definition) =>
        definition.id === propertyId
          ? {
              ...definition,
              name: nextName,
              updatedAt: new Date().toISOString(),
            }
          : definition,
      )

      pushUndoSnapshot(state)
      set({ saveStatus: 'saving' })

      try {
        await repository.save(
          createSnapshotFromState({
            ...state,
            pageProperties: nextPageProperties,
          }),
        )
        set({
          boards: state.boards,
          pages: state.pages,
          pageProperties: nextPageProperties,
          saveStatus: 'saved',
        })
      } catch {
        set({ saveStatus: 'error' })
        throw new Error('Failed to rename page property')
      }
    },

    setPagePropertyOptions: async (propertyId, options) => {
      const state = get()
      const now = new Date().toISOString()
      const nextPageProperties = state.pageProperties.map((definition) =>
        definition.id === propertyId
          ? {
              ...definition,
              config: {
                ...definition.config,
                options: normalizePagePropertyOptions(definition.config.options, options),
              },
              updatedAt: now,
            }
          : definition,
      )
      const nextPages = state.pages.map((page) => {
        const nextProperties = normalizePagePropertyValues(nextPageProperties, page.properties)
        return JSON.stringify(page.properties ?? {}) === JSON.stringify(nextProperties)
          ? page
          : {
              ...page,
              properties: nextProperties,
              updatedAt: now,
            }
      })

      pushUndoSnapshot(state)
      set({
        pages: nextPages,
        pageProperties: nextPageProperties,
        saveStatus: 'saving',
      })

      await persistPagePropertyState('Failed to update page property options')
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
        await repository.save(
          createSnapshotFromState({ ...state, boards: nextBoards, pages: nextPages }),
        )
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
        await repository.save(
          createSnapshotFromState({ ...state, boards: nextBoards, pages: nextPages }),
        )
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
      const referencedBoardIds = collectReferencedBoardIds(state.pages, state.syncedBlockGroups)
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

    cleanupOrphanAssets: async () => {
      set({ saveStatus: 'saving' })

      try {
        await repository.cleanupOrphanAssets()
        set({ saveStatus: 'saved' })
      } catch {
        set({ saveStatus: 'error' })
        throw new Error('Failed to cleanup orphan assets')
      }
    },

    cleanupOrphanDataTables: async () => {
      const state = get()
      const referencedDataTableIds = collectReferencedDataTableIds(
        state.pages,
        state.syncedBlockGroups,
      )
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
          syncedBlockGroups: state.syncedBlockGroups,
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
          syncedBlockGroups: state.syncedBlockGroups,
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
      const updatedAt = new Date().toISOString()
      const nextPages = touchPagesWithChangedBlocks(
        state.pages,
        syncPageRelationTitles(
          state.pages.map((page) =>
            page.id === pageId
              ? {
                  ...page,
                  title: nextTitle,
                  updatedAt,
                }
              : page,
          ),
        ),
        updatedAt,
      )

      pushUndoSnapshot(state)
      set({ saveStatus: 'saving' })

      try {
        await repository.save(createSnapshotFromState({ ...state, pages: nextPages }))
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

    duplicatePage: async (pageId: PageId) => {
      const state = get()
      const sourcePage = state.pages.find((page) => page.id === pageId)

      if (!sourcePage) {
        return null
      }

      const now = new Date().toISOString()
      const sourceBranch = collectPageBranch(state.pages, pageId)
      const nextPageIdBySourceId = new Map(
        sourceBranch.map((page) => [page.id, createId('page')] as const),
      )
      const nextBoardIdBySourceId = new Map<string, string>()
      const nextDataTableIdBySourceId = new Map<string, string>()
      const nextMindmapIdBySourceId = new Map<string, string>()
      let nextBoards = state.boards
      let nextDataTables = state.dataTables
      let nextMindmaps = state.mindmaps

      const nextPages = syncPageRelationTitles([
        ...state.pages,
        ...sourceBranch.map((sourceBranchPage) => {
          const nextPageId = nextPageIdBySourceId.get(sourceBranchPage.id) ?? createId('page')
          const nextParentId = sourceBranchPage.parentId
            ? (nextPageIdBySourceId.get(sourceBranchPage.parentId) ?? sourceBranchPage.parentId)
            : sourceBranchPage.id === sourcePage.id
              ? sourceBranchPage.parentId
              : null

          const blocks = sourceBranchPage.blocks.map((block) => {
            if (block.type === 'child_page') {
              return {
                ...block,
                id: createId('block'),
                pageId: nextPageIdBySourceId.get(block.pageId) ?? block.pageId,
              }
            }

            if (block.type === 'whiteboard') {
              let nextBoardId = nextBoardIdBySourceId.get(block.boardId)

              if (!nextBoardId) {
                const sourceBoard = state.boards.find((board) => board.id === block.boardId)

                if (sourceBoard) {
                  const nextBoard = {
                    ...createBoardRecord(now),
                    title: `${sourceBoard.title}${COPY_SUFFIX}`,
                    snapshot: structuredClone(sourceBoard.snapshot),
                  }

                  nextBoards = [...nextBoards, nextBoard]
                  nextBoardIdBySourceId.set(block.boardId, nextBoard.id)
                  nextBoardId = nextBoard.id
                }
              }

              return createWhiteboardBlock(nextBoardId ?? block.boardId)
            }

            if (block.type === 'data_table') {
              let nextDataTableId = nextDataTableIdBySourceId.get(block.databaseId)

              if (!nextDataTableId) {
                const sourceDataTable = state.dataTables.find(
                  (dataTable) => dataTable.id === block.databaseId,
                )

                if (sourceDataTable) {
                  const nextDataTable = {
                    ...createDataTableRecord(now),
                    title: `${sourceDataTable.title}${COPY_SUFFIX}`,
                    icon: sourceDataTable.icon ?? null,
                    cover: sourceDataTable.cover ?? null,
                    snapshot: structuredClone(sourceDataTable.snapshot),
                  }

                  nextDataTables = [...nextDataTables, nextDataTable]
                  nextDataTableIdBySourceId.set(block.databaseId, nextDataTable.id)
                  nextDataTableId = nextDataTable.id
                }
              }

              return createDataTableBlock(nextDataTableId ?? block.databaseId, block.displayMode)
            }

            if (block.type === 'mindmap') {
              let nextMindmapId = nextMindmapIdBySourceId.get(block.mindmapId)

              if (!nextMindmapId) {
                const sourceMindmap = state.mindmaps.find((mindmap) => mindmap.id === block.mindmapId)

                if (sourceMindmap) {
                  const nextMindmap = {
                    ...createMindmapRecord(now),
                    title: `${sourceMindmap.title}${COPY_SUFFIX}`,
                    snapshot: structuredClone(sourceMindmap.snapshot),
                  }

                  nextMindmaps = [...nextMindmaps, nextMindmap]
                  nextMindmapIdBySourceId.set(block.mindmapId, nextMindmap.id)
                  nextMindmapId = nextMindmap.id
                }
              }

              return createMindmapBlock(nextMindmapId ?? block.mindmapId)
            }

            if (block.type === 'synced_block') {
              return {
                ...structuredClone(block),
                id: createId('block'),
                instanceId: createId('instance'),
              }
            }

            return remapBlockPageRelationTargets(
              {
                ...structuredClone(block),
                id: createId('block'),
              },
              nextPageIdBySourceId,
            )
          })

          return {
            ...structuredClone(sourceBranchPage),
            id: nextPageId,
            parentId: nextParentId,
            title:
              sourceBranchPage.id === sourcePage.id
                ? `${sourceBranchPage.title}${COPY_SUFFIX}`
                : sourceBranchPage.title,
            blocks,
            createdAt: now,
            updatedAt: now,
          }
        }),
      ])

      const duplicatedPage = nextPages.find((page) => page.id === nextPageIdBySourceId.get(pageId)) ?? null

      pushUndoSnapshot(state)
      set({ saveStatus: 'saving' })

      try {
        await repository.save({
          boards: nextBoards,
          dataTables: nextDataTables,
          mindmaps: nextMindmaps,
          syncedBlockGroups: state.syncedBlockGroups,
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
        throw new Error('Failed to duplicate page')
      }

      return duplicatedPage
    },

    deletePage: async (pageId: PageId) => {
      const state = get()
      const deletedBranch = collectPageBranch(state.pages, pageId)
      const deletedPageIds = new Set(deletedBranch.map((page) => page.id))
      const affectedSyncedGroupIds = new Set(
        deletedBranch.flatMap((page) =>
          page.blocks.flatMap((block) =>
            block.type === 'synced_block' ? [block.groupId] : [],
          ),
        ),
      )
      const updatedAt = new Date().toISOString()
      const nextPages = touchPagesWithChangedBlocks(
        state.pages,
        stripDeletedPageRelations(deletePageBranch(state.pages, pageId), deletedPageIds),
        updatedAt,
      )
      const nextSyncedBlockGroups = reconcileSyncedBlockGroups(
        nextPages,
        state.syncedBlockGroups,
        affectedSyncedGroupIds,
        updatedAt,
      )
      const nextResources = filterResourcesReferencedByPages(state, nextPages)
      const currentPageDeleted =
        state.currentPageId !== null && !nextPages.some((page) => page.id === state.currentPageId)
      const nextCurrentPageId = currentPageDeleted ? (nextPages[0]?.id ?? null) : state.currentPageId
      const nextPageIds = new Set(nextPages.map((page) => page.id))
      const nextPinnedSidebarItems = (state.settings.pinnedSidebarItems ?? []).filter((item) =>
        nextPageIds.has(item.pageId),
      )
      const nextInboxPageId =
        state.settings.inboxPageId !== null &&
        state.settings.inboxPageId !== undefined &&
        nextPageIds.has(state.settings.inboxPageId)
          ? state.settings.inboxPageId
          : null
      const nextSettings = createSettings(
        nextCurrentPageId,
        state.settings.sidebarLayout ?? 'compact',
        state.settings.sidebarWidth ?? 272,
        nextPinnedSidebarItems,
        nextInboxPageId,
        state.settings.welcomePageId ?? null,
        getClipboardCaptureMode(state.settings),
        getPageDefaults(state.settings),
        getSearchPreferences(state.settings),
        getBlockSelectionStartMode(state.settings),
        getLinkOpenMode(state.settings),
      )

      pushUndoSnapshot(state)
      set({ saveStatus: 'saving' })

      try {
        await repository.save({
          boards: nextResources.boards,
          dataTables: nextResources.dataTables,
          mindmaps: nextResources.mindmaps,
          syncedBlockGroups: nextSyncedBlockGroups,
          pages: nextPages,
          settings: nextSettings,
        })
        await repository.cleanupOrphanAssets()
        set({
          boards: nextResources.boards,
          dataTables: nextResources.dataTables,
          mindmaps: nextResources.mindmaps,
          syncedBlockGroups: nextSyncedBlockGroups,
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

    createSyncedBlockFromRange: async (pageId: PageId, startBlockId: string, endBlockId: string) => {
      const state = get()
      const page = state.pages.find((item) => item.id === pageId)

      if (!page) {
        return null
      }

      const startIndex = page.blocks.findIndex((block) => block.id === startBlockId)
      const endIndex = page.blocks.findIndex((block) => block.id === endBlockId)

      if (startIndex < 0 || endIndex < 0) {
        return null
      }

      const from = Math.min(startIndex, endIndex)
      const to = Math.max(startIndex, endIndex)
      const selectedBlocks = page.blocks.slice(from, to + 1)
      const validation = validateSyncedGroupBlocks(selectedBlocks)

      if (!validation.ok) {
        return null
      }

      const now = new Date().toISOString()
      const groupId = createId('group')
      const instanceId = createId('instance')
      const container = createSyncedBlockInstanceBlock(groupId, instanceId, 'sync')
      const nextPages = state.pages.map((currentPage) =>
        currentPage.id === pageId
          ? {
              ...currentPage,
              updatedAt: now,
              blocks: [
                ...currentPage.blocks.slice(0, from),
                container,
                ...currentPage.blocks.slice(to + 1),
              ],
            }
          : currentPage,
      )
      const nextSnapshot = createSnapshotFromState({
        ...state,
        pages: nextPages,
        syncedBlockGroups: [
          ...state.syncedBlockGroups,
          {
            id: groupId,
            blocks: structuredClone(selectedBlocks),
            primaryInstanceId: instanceId,
            createdAt: now,
            updatedAt: now,
          },
        ],
      })

      pushUndoSnapshot(state)
      set({
        pages: nextSnapshot.pages,
        syncedBlockGroups: nextSnapshot.syncedBlockGroups ?? [],
        saveStatus: 'saving',
      })

      try {
        await repository.save(nextSnapshot)
        set({
          pages: nextSnapshot.pages,
          syncedBlockGroups: nextSnapshot.syncedBlockGroups ?? [],
          saveStatus: 'saved',
        })
      } catch {
        set({ saveStatus: 'error' })
        throw new Error('Failed to create synced block')
      }

      return container
    },

    createSyncedBlockFromExistingBlock: async (
      sourcePageId: PageId,
      sourceBlockId: string,
      targetPageId: PageId,
      targetBlockId: string,
      mode: SyncedBlockMode,
    ) => {
      const state = get()
      const sourcePage = state.pages.find((page) => page.id === sourcePageId)
      const targetPage = state.pages.find((page) => page.id === targetPageId)
      const sourceBlock = sourcePage?.blocks.find((block) => block.id === sourceBlockId)
      const targetBlock = targetPage?.blocks.find((block) => block.id === targetBlockId)

      if (
        !sourcePage ||
        !targetPage ||
        !sourceBlock ||
        !targetBlock ||
        sourceBlock.type === 'synced_block'
      ) {
        return null
      }

      const now = new Date().toISOString()
      const groupId = createId('group')
      const primaryInstanceId = createId('instance')
      const primaryContainer = {
        ...createSyncedBlockInstanceBlock(groupId, primaryInstanceId, 'sync'),
        id: sourceBlockId,
      }
      const isSameLocation = sourcePageId === targetPageId && sourceBlockId === targetBlockId
      const insertedContainer = isSameLocation
        ? primaryContainer
        : {
            ...createSyncedBlockInstanceBlock(groupId, createId('instance'), mode),
            id: targetBlockId,
          }

      const nextPages = state.pages.map((page) => {
        if (page.id !== sourcePageId && page.id !== targetPageId) {
          return page
        }

        let didChange = false
        const blocks = page.blocks.map((block) => {
          if (page.id === sourcePageId && block.id === sourceBlockId) {
            didChange = true
            return primaryContainer
          }

          if (!isSameLocation && page.id === targetPageId && block.id === targetBlockId) {
            didChange = true
            return insertedContainer
          }

          return block
        })

        return didChange
          ? {
              ...page,
              updatedAt: now,
              blocks,
            }
          : page
      })

      const nextSnapshot = createSnapshotFromState({
        ...state,
        pages: nextPages,
        syncedBlockGroups: [
          ...state.syncedBlockGroups,
          {
            id: groupId,
            blocks: [structuredClone(sourceBlock)],
            primaryInstanceId,
            createdAt: now,
            updatedAt: now,
          },
        ],
      })

      pushUndoSnapshot(state)
      set({
        pages: nextSnapshot.pages,
        syncedBlockGroups: nextSnapshot.syncedBlockGroups ?? [],
        saveStatus: 'saving',
      })

      try {
        await repository.save(nextSnapshot)
        set({
          pages: nextSnapshot.pages,
          syncedBlockGroups: nextSnapshot.syncedBlockGroups ?? [],
          saveStatus: 'saved',
        })
      } catch {
        set({ saveStatus: 'error' })
        throw new Error('Failed to create synced block from existing block')
      }

      return insertedContainer
    },

    replaceBlockWithSyncedInstance: async (
      pageId: PageId,
      blockId: string,
      groupId: string,
      mode: SyncedBlockMode,
    ) => {
      const state = get()

      if (!state.syncedBlockGroups.some((group) => group.id === groupId)) {
        return null
      }

      const container = createSyncedBlockInstanceBlock(groupId, createId('instance'), mode)
      let didReplace = false
      const nextPages = state.pages.map((page) => {
        if (page.id !== pageId) {
          return page
        }

        const blocks = page.blocks.map((block) => {
          if (block.id !== blockId) {
            return block
          }

          didReplace = true
          return { ...container, id: blockId }
        })

        return didReplace
          ? {
              ...page,
              updatedAt: new Date().toISOString(),
              blocks,
            }
          : page
      })

      if (!didReplace) {
        return null
      }

      const nextSnapshot = createSnapshotFromState({ ...state, pages: nextPages })

      pushUndoSnapshot(state)
      set({
        pages: nextPages,
        saveStatus: 'saving',
      })

      try {
        await repository.save(nextSnapshot)
        set({
          pages: nextPages,
          saveStatus: 'saved',
        })
      } catch {
        set({ saveStatus: 'error' })
        throw new Error('Failed to insert synced block')
      }

      return { ...container, id: blockId }
    },

    updateSyncedGroupBlock: async (groupId: string, blockId: string, nextBlock: BlockRecord) => {
      const state = get()
      const nextSyncedBlockGroups = state.syncedBlockGroups.map((group) =>
        group.id === groupId
          ? {
              ...group,
              updatedAt: new Date().toISOString(),
              blocks: group.blocks.map((block) => (block.id === blockId ? nextBlock : block)),
            }
          : group,
      )

      pushUndoSnapshot(state)
      set({
        syncedBlockGroups: nextSyncedBlockGroups,
        saveStatus: 'saving',
      })
      scheduleBlockSave()
    },

    unsyncBlockInstance: async (pageId: PageId, blockId: string) => {
      const state = get()
      const page = state.pages.find((item) => item.id === pageId)
      const containerIndex =
        page?.blocks.findIndex((block) => block.id === blockId && block.type === 'synced_block') ?? -1
      const container =
        containerIndex >= 0 ? (page?.blocks[containerIndex] as SyncedBlockInstanceBlock) : null
      const group = state.syncedBlockGroups.find((item) => item.id === container?.groupId)

      if (!page || !container || !group || containerIndex < 0) {
        return
      }

      const localBlocks = cloneBlocksForUnsync(group.blocks, () => createId('block'))
      const nextSnapshotWithoutInstance = removeSyncedInstanceFromSnapshot(
        createSnapshotFromState(state),
        pageId,
        blockId,
      )
      const now = new Date().toISOString()
      const nextPages = nextSnapshotWithoutInstance.pages.map((currentPage) => {
        if (currentPage.id !== pageId) {
          return currentPage
        }

        const blocks = [...currentPage.blocks]
        blocks.splice(containerIndex, 0, ...localBlocks)

        return {
          ...currentPage,
          updatedAt: now,
          blocks,
        }
      })
      const nextSnapshot = {
        ...nextSnapshotWithoutInstance,
        pages: nextPages,
      }

      pushUndoSnapshot(state)
      set({
        pages: nextSnapshot.pages,
        syncedBlockGroups: nextSnapshot.syncedBlockGroups ?? [],
        saveStatus: 'saving',
      })

      try {
        await repository.save(nextSnapshot)
        set({
          pages: nextSnapshot.pages,
          syncedBlockGroups: nextSnapshot.syncedBlockGroups ?? [],
          saveStatus: 'saved',
        })
      } catch {
        set({ saveStatus: 'error' })
        throw new Error('Failed to unsync block instance')
      }
    },

    updateBlock: async (pageId: PageId, blockId: string, nextBlock: BlockRecord) => {
      const state = get()
      const now = new Date().toISOString()
      let didUpdate = false
      const nextPages = state.pages.map((page) => {
        if (page.id !== pageId) {
          return page
        }

        const blocks = page.blocks.map((block) => {
          if (block.id !== blockId) {
            return block
          }

          if (block.type !== nextBlock.type) {
            return block
          }

          didUpdate = true
          return nextBlock
        })

        return didUpdate
          ? {
              ...page,
              updatedAt: now,
              blocks,
            }
          : page
      })

      if (!didUpdate) {
        return
      }

      pushUndoSnapshot(state)
      set({
        boards: state.boards,
        pages: nextPages,
        saveStatus: 'saving',
      })
      scheduleBlockSave()
    },

    pasteBlocks: async (pageId, targetBlockId, blocks, replaceTarget = false) => {
      if (blocks.length === 0) {
        return
      }

      const state = get()
      const now = new Date().toISOString()
      let didPaste = false
      const nextPages = state.pages.map((page) => {
        if (page.id !== pageId) {
          return page
        }

        const nextBlocks = structuredClone(blocks)
        if (targetBlockId) {
          const targetIndex = page.blocks.findIndex((block) => block.id === targetBlockId)
          if (targetIndex < 0) {
            return page
          }

          if (replaceTarget) {
            nextBlocks[0] = { ...nextBlocks[0], id: targetBlockId }
          }

          const pageBlocks = [...page.blocks]
          pageBlocks.splice(targetIndex + (replaceTarget ? 0 : 1), replaceTarget ? 1 : 0, ...nextBlocks)
          didPaste = true
          return { ...page, updatedAt: now, blocks: pageBlocks }
        }

        didPaste = true
        return { ...page, updatedAt: now, blocks: [...page.blocks, ...nextBlocks] }
      })

      if (!didPaste) {
        return
      }

      const nextSnapshot = createSnapshotFromState({ ...state, pages: nextPages })
      pushUndoSnapshot(state)
      set({ saveStatus: 'saving' })

      try {
        await repository.save(nextSnapshot)
        set({ pages: nextPages, saveStatus: 'saved' })
      } catch {
        set({ saveStatus: 'error' })
        throw new Error('Failed to paste blocks')
      }
    },

    appendClipboardCaptureToInbox: async (blocks, capturedAt, sourceLabel = '剪贴板捕获') => {
      await get().ensureInboxPage()
      const state = get()
      const inboxPageId = state.settings.inboxPageId

      if (!inboxPageId) {
        throw new Error('Inbox page not found')
      }

      const timestamp = formatClipboardCaptureTimestamp(capturedAt)
      const nextPages = state.pages.map((page) =>
        page.id === inboxPageId
          ? {
              ...page,
              updatedAt: capturedAt ?? new Date().toISOString(),
              blocks: [
                ...page.blocks,
                {
                  id: createId('block'),
                  type: 'paragraph' as const,
                  text: `${sourceLabel} · ${timestamp}`,
                },
                ...structuredClone(blocks),
                {
                  id: createId('block'),
                  type: 'paragraph' as const,
                  text: '',
                },
              ],
            }
          : page,
      )

      const nextSnapshot = createSnapshotFromState({
        ...state,
        pages: nextPages,
      })

      pushUndoSnapshot(state)
      set({ saveStatus: 'saving' })

      try {
        await repository.save(nextSnapshot)
        set({
          pages: nextPages,
          saveStatus: 'saved',
        })
      } catch {
        set({ saveStatus: 'error' })
        throw new Error('Failed to append clipboard capture to inbox')
      }
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
            ...createPageRecord(pageId, UNTITLED_PAGE_TITLE, getPageDefaults(state.settings)),
            id: childId,
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
          syncedBlockGroups: state.syncedBlockGroups,
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
        await repository.save(createSnapshotFromState({ ...state, pages: nextPages }))
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

    insertBlockAfter: async (
      pageId: PageId,
      afterBlockId: string,
      type: BlockType,
      position: 'before' | 'after' = 'after',
    ) => {
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
            ...createPageRecord(pageId, UNTITLED_PAGE_TITLE, getPageDefaults(state.settings)),
            id: childId,
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
        blocks.splice(afterIndex + (position === 'after' ? 1 : 0), 0, insertedBlock)
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
          syncedBlockGroups: state.syncedBlockGroups,
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
        await repository.save(createSnapshotFromState({ ...state, pages: nextPages }))
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
        await repository.save(createSnapshotFromState({ ...state, pages: nextPages }))
        set({ boards: state.boards, pages: nextPages, saveStatus: 'saved' })
      } catch {
        set({ saveStatus: 'error' })
        throw new Error('Failed to reorder blocks')
      }
    },

    reorderBlockGroup: async (
      pageId: PageId,
      activeBlockIds: string[],
      overBlockId: string,
      position: ReorderPosition = 'before',
    ) => {
      const state = get()
      const nextPages = state.pages.map((page) =>
        page.id === pageId
          ? {
              ...page,
              updatedAt: new Date().toISOString(),
              blocks: reorderItemGroup(page.blocks, activeBlockIds, overBlockId, position),
            }
          : page,
      )

      pushUndoSnapshot(state)
      set({ saveStatus: 'saving' })

      try {
        await repository.save(createSnapshotFromState({ ...state, pages: nextPages }))
        set({ boards: state.boards, pages: nextPages, saveStatus: 'saved' })
      } catch {
        set({ saveStatus: 'error' })
        throw new Error('Failed to reorder block group')
      }
    },

    deleteBlocks: async (pageId: PageId, blockIds: string[]) => {
      const state = get()
      const selectedIdSet = new Set(blockIds)
      let nextSnapshot = createSnapshotFromState(state)

      for (const blockId of blockIds) {
        nextSnapshot = removeSyncedInstanceFromSnapshot(nextSnapshot, pageId, blockId)
      }

      const now = new Date().toISOString()
      nextSnapshot = {
        ...nextSnapshot,
        pages: nextSnapshot.pages.map((page) =>
          page.id === pageId
            ? {
                ...page,
                updatedAt: now,
                blocks: page.blocks.filter((block) => !selectedIdSet.has(block.id)),
              }
            : page,
        ),
      }

      pushUndoSnapshot(state)
      set({
        pages: nextSnapshot.pages,
        syncedBlockGroups: nextSnapshot.syncedBlockGroups ?? [],
        saveStatus: 'saving',
      })

      try {
        await repository.save(nextSnapshot)
        set({
          pages: nextSnapshot.pages,
          syncedBlockGroups: nextSnapshot.syncedBlockGroups ?? [],
          saveStatus: 'saved',
        })
      } catch {
        set({ saveStatus: 'error' })
        throw new Error('Failed to delete blocks')
      }
    },

    deleteBlock: async (pageId: PageId, blockId: string) => {
      const state = get()
      const syncedContainer = state.pages
        .find((page) => page.id === pageId)
        ?.blocks.find(
          (block): block is SyncedBlockInstanceBlock =>
            block.id === blockId && block.type === 'synced_block',
        )

      if (syncedContainer) {
        const nextSnapshot = removeSyncedInstanceFromSnapshot(createSnapshotFromState(state), pageId, blockId)

        pushUndoSnapshot(state)
        set({
          pages: nextSnapshot.pages,
          syncedBlockGroups: nextSnapshot.syncedBlockGroups ?? [],
          saveStatus: 'saving',
        })

        try {
          await repository.save(nextSnapshot)
          set({
            pages: nextSnapshot.pages,
            syncedBlockGroups: nextSnapshot.syncedBlockGroups ?? [],
            saveStatus: 'saved',
          })
        } catch {
          set({ saveStatus: 'error' })
          throw new Error('Failed to delete block')
        }

        return
      }

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
        await repository.save(createSnapshotFromState({ ...state, pages: nextPages }))
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
        await repository.save(createSnapshotFromState({ ...state, pages: nextPages }))
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

        if (source.type === 'synced_block') {
          const clone = {
            ...structuredClone(source),
            id: createId('block'),
            instanceId: createId('instance'),
          }
          blocks.splice(index + 1, 0, clone)

          return {
            ...page,
            updatedAt: now,
            blocks,
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
          syncedBlockGroups: state.syncedBlockGroups,
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
      const sourceBlock = state.pages
        .find((page) => page.id === pageId)
        ?.blocks.find((block) => block.id === blockId)

      if (
        sourceBlock?.type === 'data_table' &&
        (!isDataTableCommandType(type) || sourceBlock.displayMode === getDataTableDisplayMode(type))
      ) {
        return
      }

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

            if (block.type === 'data_table' && isDataTableCommandType(type)) {
              if (getDataTableDisplayMode(type) === 'inline') {
                return { ...block, displayMode: 'inline' as const }
              }

              const { displayMode: _displayMode, ...dataTableBlock } = block
              return dataTableBlock
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
          syncedBlockGroups: state.syncedBlockGroups,
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
          syncedBlockGroups: snapshot.syncedBlockGroups ?? [],
          pages: snapshot.pages,
          pageProperties: snapshot.pageProperties ?? [],
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
          syncedBlockGroups: snapshot.syncedBlockGroups ?? [],
          pages: snapshot.pages,
          pageProperties: snapshot.pageProperties ?? [],
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
