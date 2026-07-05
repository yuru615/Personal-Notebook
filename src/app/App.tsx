import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react'
import { Suspense, lazy } from 'react'
import {
  HashRouter,
  MemoryRouter,
  Navigate,
  Route,
  Routes,
  useMatch,
  useNavigate,
  useParams,
} from 'react-router-dom'
import { BlockEditor } from '../components/editor/BlockEditor'
import { PageHeader, PageHeaderToolbar } from '../components/editor/PageHeader'
import { PageOutline } from '../components/editor/PageOutline'
import { MindmapFrame } from '../components/mindmap/MindmapFrame'
import { MindmapPage } from '../components/mindmap/MindmapPage'
import { useDismissableLayer } from '../components/editor/useDismissableLayer'
import {
  ExportImportPanel,
  type ArchiveTaskStatus,
} from '../components/export/ExportImportPanel'
import { AppShell } from '../components/layout/AppShell'
import { SearchDialog } from '../components/search/SearchDialog'
import ConfirmDialog from '../components/dataTable/components/table/ConfirmDialog'
import { SidebarTree } from '../components/sidebar/SidebarTree'
import { AppErrorBoundary } from '../components/shared/AppErrorBoundary'
import {
  PageBreadcrumbs,
  type PageBreadcrumbItem,
} from '../components/shared/PageBreadcrumbs'
import { isWhiteboardSnapshot } from '../components/whiteboard/whiteboardModel'
import { WhiteboardPage } from '../components/whiteboard/WhiteboardPage'
import type {
  BlockType,
  BoardRecord,
  DataTableRecord,
  MindmapRecord,
  PageFontFamily,
  PageRecord,
  SaveStatus,
  SidebarPinnedItem,
  WorkspaceSettings,
  WorkspaceSnapshot,
} from '../domain/types'
import {
  createStorageWorkspaceRepository,
  type WorkspaceRepository,
} from '../lib/workspaceRepository'
import {
  exportPagePackageToPath,
  exportPagePackage,
  importPagePackageFromPath,
  importPagePackage,
} from '../lib/assets'
import { registerDesktopPendingSaveFlush } from '../lib/desktopLifecycle'
import {
  isDesktopRuntime,
  openBinaryFile,
  openLocalFilePath,
  openTextFile,
  pickSaveFilePath,
  saveBinaryFile,
  saveTextFile,
} from '../lib/fileAccess'
import { type WorkspaceArchiveProgress } from '../lib/storageClient'
import { createWorkspaceStore } from '../store/createWorkspaceStore'
import { uiCopy } from '../ui/copy'
import { sanitizeFileNameSegment } from '../utils/fileName'
import { deletePageBranch } from '../utils/pageTree'
import type { ReorderPosition } from '../utils/reorder'

type WorkspaceStore = ReturnType<typeof createWorkspaceStore>
type AppState = ReturnType<WorkspaceStore['getState']>

const DUPLICATE_BOARD_LABEL = '创建副本'
const WHITEBOARD_MENU_LABEL = '白板菜单'
const WHITEBOARD_RENAME_PROMPT = '重命名白板'
const DELETE_CURRENT_PAGE_LABEL = '\u5220\u9664\u5f53\u524d\u9875\u9762'
const DELETE_PAGE_CONFIRM_LABEL = '\u786e\u8ba4\u5220\u9664'
const CANCEL_DELETE_PAGE_LABEL = '\u53d6\u6d88'
const DELETE_PAGE_DESCRIPTION_PREFIX = '\u9875\u9762\u201c'
const DELETE_PAGE_DESCRIPTION_SUFFIX =
  '\u201d\u53ca\u5176\u6240\u6709\u5b50\u9875\u9762\u5c06\u88ab\u5220\u9664\u3002\u672a\u88ab\u5176\u4ed6\u9875\u9762\u6216\u8d44\u6e90\u4f7f\u7528\u7684\u5173\u8054\u6587\u4ef6\u3001\u767d\u677f\u3001\u6570\u636e\u8868\u683c\u548c\u601d\u7ef4\u5bfc\u56fe\u4e5f\u4f1a\u88ab\u6e05\u7406\u3002'
const JSON_FILE_FILTER = [{ name: 'JSON', extensions: ['json'] }]
const ZIP_FILE_FILTER = [{ name: 'ZIP', extensions: ['zip'] }]
const DataTablePage = lazy(() =>
  import('../components/dataTable/DataTablePage').then((module) => ({
    default: module.DataTablePage,
  })),
)
const WhiteboardCanvas = lazy(() =>
  import('../components/whiteboard/WhiteboardCanvas').then((module) => ({
    default: module.WhiteboardCanvas,
  })),
)

function isEditableShortcutTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) {
    return false
  }

  return Boolean(
    target.closest("input:not([readonly]):not([type='checkbox'])") ||
      target.closest('textarea:not([readonly])'),
  )
}

function progressToPercent(progress: WorkspaceArchiveProgress) {
  if (progress.phase === 'complete') {
    return 100
  }

  if (progress.bytesTotal > 0) {
    return (progress.bytesProcessed / progress.bytesTotal) * 100
  }

  if (progress.total > 0) {
    return (progress.current / progress.total) * 100
  }

  return undefined
}

function formatArchiveItemCount(progress: WorkspaceArchiveProgress) {
  if (progress.total <= 0) {
    return undefined
  }

  return `${progress.current}/${progress.total}`
}

interface AppProps {
  repository?: WorkspaceRepository
  store?: WorkspaceStore
  initialEntries?: string[]
}

const repositoryStoreCache = new WeakMap<WorkspaceRepository, WorkspaceStore>()
let defaultWorkspaceStore: WorkspaceStore | null = null

function createAppStore(repository?: WorkspaceRepository) {
  if (repository) {
    const cachedStore = repositoryStoreCache.get(repository)
    if (cachedStore) {
      return cachedStore
    }

    const store = createWorkspaceStore(repository)
    repositoryStoreCache.set(repository, store)
    return store
  }

  defaultWorkspaceStore ??= createWorkspaceStore(createStorageWorkspaceRepository())
  return defaultWorkspaceStore
}

export function App({ repository, store: injectedStore, initialEntries }: AppProps = {}) {
  const [store] = useState(() => injectedStore ?? createAppStore(repository))
  const state = useSyncExternalStore(store.subscribe, store.getState, store.getState)
  const [isBootstrapped, setIsBootstrapped] = useState(false)
  const [bootstrapError, setBootstrapError] = useState<unknown>(null)
  const [archiveTask, setArchiveTask] = useState<ArchiveTaskStatus | null>(null)
  const bootstrapPromiseRef = useRef<Promise<void> | null>(null)
  const archiveTaskClearTimerRef = useRef<number | null>(null)
  const setCurrentPage = store.getState().setCurrentPage

  useEffect(() => {
    let isActive = true

    bootstrapPromiseRef.current ??= store.getState().bootstrap()

    void bootstrapPromiseRef.current
      .then(() => {
        if (isActive) {
          setBootstrapError(null)
        }
      })
      .catch((error) => {
        if (isActive) {
          setBootstrapError(error)
        }
      })
      .finally(() => {
        if (isActive) {
          setIsBootstrapped(true)
        }
      })

    return () => {
      isActive = false
    }
  }, [store])

  useLayoutEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.isComposing || event.altKey || !(event.ctrlKey || event.metaKey)) {
        return
      }

      if (isEditableShortcutTarget(event.target)) {
        return
      }

      const key = event.key.toLowerCase()

      if (key === 'z') {
        event.preventDefault()
        if (event.shiftKey) {
          void store.getState().redo()
          return
        }

        void store.getState().undo()
        return
      }

      if (!event.shiftKey && key === 'y') {
        event.preventDefault()
        void store.getState().redo()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [store])

  useEffect(() => {
    let isActive = true
    let unlistenDesktopFlush: (() => void) | null = null

    function flushPendingSaves() {
      return store.getState().flushPendingSaves()
    }

    function flushPendingSavesSilently() {
      void flushPendingSaves().catch(() => undefined)
    }

    function handleVisibilityChange() {
      if (document.visibilityState === 'hidden') {
        flushPendingSavesSilently()
      }
    }

    window.addEventListener('pagehide', flushPendingSavesSilently)
    window.addEventListener('beforeunload', flushPendingSavesSilently)
    document.addEventListener('visibilitychange', handleVisibilityChange)
    void registerDesktopPendingSaveFlush(flushPendingSaves)
      .then((unlisten) => {
        if (isActive) {
          unlistenDesktopFlush = unlisten
          return
        }

        unlisten()
      })
      .catch(() => undefined)

    return () => {
      isActive = false
      unlistenDesktopFlush?.()
      window.removeEventListener('pagehide', flushPendingSavesSilently)
      window.removeEventListener('beforeunload', flushPendingSavesSilently)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [store])

  useEffect(() => {
    return () => {
      if (archiveTaskClearTimerRef.current !== null) {
        window.clearTimeout(archiveTaskClearTimerRef.current)
      }
    }
  }, [])

  function showArchiveTask(nextTask: ArchiveTaskStatus) {
    if (archiveTaskClearTimerRef.current !== null) {
      window.clearTimeout(archiveTaskClearTimerRef.current)
      archiveTaskClearTimerRef.current = null
    }

    setArchiveTask(nextTask)
  }

  function finishArchiveTask(label: string) {
    showArchiveTask({ label, percent: 100 })
    archiveTaskClearTimerRef.current = window.setTimeout(() => {
      setArchiveTask(null)
      archiveTaskClearTimerRef.current = null
    }, 2200)
  }

  function failArchiveTask(label: string) {
    showArchiveTask({ label })
    archiveTaskClearTimerRef.current = window.setTimeout(() => {
      setArchiveTask(null)
      archiveTaskClearTimerRef.current = null
    }, 3200)
  }

  function showArchiveProgress(label: string, progress: WorkspaceArchiveProgress) {
    showArchiveTask({
      label,
      detail: progress.itemName ?? formatArchiveItemCount(progress),
      percent: progressToPercent(progress),
    })
  }

  async function exportPageArchive(pageId: string) {
    const latestState = store.getState()
    const page = latestState.pages.find((item) => item.id === pageId)

    if (!page) {
      return
    }

    const defaultPath = `${sanitizeFileName(page.title ?? '')}.zip`

    if (isDesktopRuntime()) {
      const path = await pickSaveFilePath({
        defaultPath,
        filters: ZIP_FILE_FILTER,
      })

      if (!path) {
        return
      }

      showArchiveTask({ label: uiCopy.export.exportingArchive, percent: 0 })
      try {
        await exportPagePackageToPath(pageId, path, (progress) => {
          showArchiveProgress(uiCopy.export.exportingArchive, progress)
        })
        finishArchiveTask(uiCopy.export.exportComplete)
      } catch {
        failArchiveTask(uiCopy.export.exportError)
        window.alert(uiCopy.export.exportError)
      }
      return
    }

    showArchiveTask({ label: uiCopy.export.exportingArchive, percent: 5 })
    try {
      const contents = await exportPagePackage(pageId)
      showArchiveTask({ label: uiCopy.export.exportingArchive, percent: 85 })
      await saveBinaryFile({
        defaultPath,
        contents,
        filters: ZIP_FILE_FILTER,
      })
      finishArchiveTask(uiCopy.export.exportComplete)
    } catch {
      failArchiveTask(uiCopy.export.exportError)
      window.alert(uiCopy.export.exportError)
    }
  }

  async function exportWorkspaceSnapshot() {
    showArchiveTask({ label: uiCopy.export.exportingWorkspace, percent: 12 })

    try {
      const snapshot = createWorkspaceBackupSnapshot(store.getState())
      showArchiveTask({ label: uiCopy.export.exportingWorkspace, percent: 72 })
      await saveTextFile({
        defaultPath: '知栖工作区备份.json',
        contents: JSON.stringify(snapshot, null, 2),
        filters: JSON_FILE_FILTER,
      })
      finishArchiveTask(uiCopy.export.workspaceExportComplete)
    } catch {
      failArchiveTask(uiCopy.export.exportError)
      window.alert(uiCopy.export.exportError)
    }
  }

  if (!isBootstrapped) {
    return <div className="page-empty">{uiCopy.app.loading}</div>
  }

  if (bootstrapError) {
    return <div className="page-empty">{uiCopy.app.bootstrapError}</div>
  }

  const router = (
    <AppRoutes
      boards={state.boards}
      dataTables={state.dataTables}
      mindmaps={state.mindmaps}
      pages={state.pages}
      currentPageId={state.currentPageId}
      sidebarLayout={state.settings.sidebarLayout ?? 'compact'}
      sidebarWidth={state.settings.sidebarWidth ?? 272}
      pinnedSidebarItems={state.settings.pinnedSidebarItems ?? []}
      archiveTask={archiveTask}
      onCreatePage={() => store.getState().createPage()}
      onSetSidebarLayout={(layout) => store.getState().setSidebarLayout(layout)}
      onSetSidebarWidth={(width) => store.getState().setSidebarWidth(width)}
      onTogglePinnedSidebarItem={(item) => store.getState().togglePinnedSidebarItem(item)}
      onRoutePageChange={setCurrentPage}
      onRenamePage={(pageId, title) => store.getState().renamePage(pageId, title)}
      onDuplicatePage={(pageId) => store.getState().duplicatePage(pageId)}
      onDeletePage={(pageId) => store.getState().deletePage(pageId)}
      onRenameBoard={(boardId, title) => store.getState().renameBoard(boardId, title)}
      onUpdateBoardSnapshot={(boardId, snapshot) =>
        store.getState().updateBoardSnapshot(boardId, snapshot)
      }
      onImportBoard={(boardId, payload) => store.getState().importBoard(boardId, payload)}
      onDuplicateBoard={async (pageId, boardId) => {
        const board = await store.getState().duplicateBoardToPage(pageId, boardId)
        return board?.id ?? null
      }}
      onRestoreMissingBoard={(pageId, boardId) =>
        store.getState().restoreMissingBoardReference(pageId, boardId)
      }
      onUpdateDataTableSnapshot={(databaseId, snapshot) =>
        store.getState().updateDataTableSnapshot(databaseId, snapshot)
      }
      onRenameDataTable={(databaseId, title) =>
        store.getState().renameDataTable(databaseId, title)
      }
      onChangeDataTableIcon={(databaseId, icon) =>
        store.getState().setDataTableIcon(databaseId, icon)
      }
      onChangeDataTableCover={(databaseId, cover) =>
        store.getState().setDataTableCover(databaseId, cover)
      }
      onRestoreMissingDataTable={(pageId, databaseId) =>
        store.getState().restoreMissingDataTableReference(pageId, databaseId)
      }
      onRestoreMissingMindmap={(pageId, mindmapId) =>
        store.getState().restoreMissingMindmapReference(pageId, mindmapId)
      }
      onUpdateMindmapSnapshot={(mindmapId, snapshot) =>
        store.getState().updateMindmapSnapshot(mindmapId, snapshot)
      }

      onTogglePageFullWidth={(pageId, isFullWidth) =>
        store.getState().setPageFullWidth(pageId, isFullWidth)
      }
      onTogglePageSmallText={(pageId, isSmallText) =>
        store.getState().setPageSmallText(pageId, isSmallText)
      }
      onTogglePageFontFamily={(pageId, fontFamily) =>
        store.getState().setPageFontFamily(pageId, fontFamily)
      }
      onChangePageIcon={(pageId, icon) => store.getState().setPageIcon(pageId, icon)}
      onChangePageCover={(pageId, cover) => store.getState().setPageCover(pageId, cover)}
      onTogglePageOutlineVisible={(pageId, showOutline) =>
        store.getState().setPageOutlineVisible(pageId, showOutline)
      }
      onUpdateBlock={(pageId, blockId, nextBlock) =>
        store.getState().updateBlock(pageId, blockId, nextBlock)
      }
      onInsertBlock={async (pageId, type) => {
        const block = await store.getState().insertBlock(pageId, type)
        return block?.id ?? null
      }}
      onInsertParagraphBlock={(pageId, text) => store.getState().insertParagraphBlock(pageId, text)}
      onInsertBlockAfter={async (pageId, blockId, type) => {
        const block = await store.getState().insertBlockAfter(pageId, blockId, type)
        return block?.id ?? null
      }}
      onReorderPage={(activePageId, overPageId) =>
        store.getState().reorderPages(activePageId, overPageId)
      }
      onReorderBlock={(pageId, activeBlockId, overBlockId, position) =>
        store.getState().reorderBlocks(pageId, activeBlockId, overBlockId, position)
      }
      onDeleteBlock={(pageId, blockId) => store.getState().deleteBlock(pageId, blockId)}
      onMergeBlockWithPrevious={(pageId, blockId) =>
        store.getState().mergeBlockWithPrevious(pageId, blockId)
      }
      onDuplicateBlock={(pageId, blockId) => store.getState().duplicateBlock(pageId, blockId)}
      onTurnBlockInto={(pageId, blockId, type) =>
        store.getState().turnBlockInto(pageId, blockId, type)
      }
      saveStatus={state.saveStatus}
      onExportArchive={async () => {
        const latestState = store.getState()
        const currentPageId = latestState.currentPageId

        if (!currentPageId) {
          return
        }

        await exportPageArchive(currentPageId)
      }}
      onExportPage={(pageId) => exportPageArchive(pageId)}
      onExportWorkspace={exportWorkspaceSnapshot}
      onImportArchive={async () => {
        if (isDesktopRuntime()) {
          const file = await openLocalFilePath({ filters: ZIP_FILE_FILTER })

          if (!file) {
            return store.getState().currentPageId
          }

          if (!window.confirm(uiCopy.export.importConfirm)) {
            return store.getState().currentPageId
          }

          try {
            showArchiveTask({ label: uiCopy.export.preparingImport, percent: 0 })
            await store.getState().flushPendingSaves()
            showArchiveTask({ label: uiCopy.export.importingArchive, percent: 0 })
            const result = await importPagePackageFromPath(file.path, (progress) => {
              showArchiveProgress(uiCopy.export.importingArchive, progress)
            })
            showArchiveTask({ label: uiCopy.export.refreshingWorkspace, percent: 95 })
            await store.getState().bootstrap()
            finishArchiveTask(uiCopy.export.importComplete)
            return result.rootPageId
          } catch {
            failArchiveTask(uiCopy.export.importError)
            window.alert(uiCopy.export.importError)
            return store.getState().currentPageId
          }
        }

        const file = await openBinaryFile({ filters: ZIP_FILE_FILTER })

        if (!file) {
          return store.getState().currentPageId
        }

        if (!window.confirm(uiCopy.export.importConfirm)) {
          return store.getState().currentPageId
        }

        try {
          showArchiveTask({ label: uiCopy.export.preparingImport, percent: 0 })
          await store.getState().flushPendingSaves()
          showArchiveTask({ label: uiCopy.export.importingArchive, percent: 20 })
          const result = await importPagePackage(file.contents)
          showArchiveTask({ label: uiCopy.export.refreshingWorkspace, percent: 95 })
          await store.getState().bootstrap()
          finishArchiveTask(uiCopy.export.importComplete)
          return result.rootPageId
        } catch {
          failArchiveTask(uiCopy.export.importError)
          window.alert(uiCopy.export.importError)
          return store.getState().currentPageId
        }
      }}
      onCleanupOrphanBoards={() => store.getState().cleanupOrphanBoards()}
      onCleanupOrphanDataTables={() => store.getState().cleanupOrphanDataTables()}
    />
  )

  if (initialEntries) {
    return <MemoryRouter initialEntries={initialEntries}>{router}</MemoryRouter>
  }

  return <HashRouter>{router}</HashRouter>
}

interface AppRoutesProps {
  boards: BoardRecord[]
  dataTables: DataTableRecord[]
  mindmaps: MindmapRecord[]
  pages: AppState['pages']
  currentPageId: AppState['currentPageId']
  sidebarLayout: NonNullable<WorkspaceSettings['sidebarLayout']>
  sidebarWidth: number
  pinnedSidebarItems: SidebarPinnedItem[]
  archiveTask: ArchiveTaskStatus | null
  onCreatePage: () => Promise<PageRecord>
  onSetSidebarLayout: (layout: NonNullable<WorkspaceSettings['sidebarLayout']>) => Promise<void>
  onSetSidebarWidth: (width: number) => Promise<void>
  onTogglePinnedSidebarItem: (item: SidebarPinnedItem) => Promise<void>
  onRoutePageChange: (pageId: string) => Promise<void>
  onRenamePage: (pageId: string, title: string) => Promise<void>
  onDuplicatePage: (pageId: string) => Promise<PageRecord | null>
  onDeletePage: (pageId: string) => Promise<void>
  onRenameBoard: (boardId: string, title: string) => Promise<void>
  onUpdateBoardSnapshot: (boardId: string, snapshot: unknown) => Promise<void>
  onImportBoard: (
    boardId: string,
    payload: { title: string | null; snapshot: unknown },
  ) => Promise<void>
  onDuplicateBoard: (pageId: string, boardId: string) => Promise<string | null>
  onRestoreMissingBoard: (pageId: string, boardId: string) => Promise<BoardRecord | null>
  onUpdateDataTableSnapshot: (databaseId: string, snapshot: unknown) => Promise<void>
  onRenameDataTable: (databaseId: string, title: string) => Promise<void>
  onChangeDataTableIcon: (databaseId: string, icon: string | null) => Promise<void>
  onChangeDataTableCover: (databaseId: string, cover: string | null) => Promise<void>
  onRestoreMissingDataTable: (pageId: string, databaseId: string) => Promise<DataTableRecord | null>
  onRestoreMissingMindmap: (pageId: string, mindmapId: string) => Promise<MindmapRecord | null>
  onUpdateMindmapSnapshot: (mindmapId: string, snapshot: unknown) => Promise<void>

  onTogglePageFullWidth: (pageId: string, isFullWidth: boolean) => Promise<void>
  onTogglePageSmallText: (pageId: string, isSmallText: boolean) => Promise<void>
  onTogglePageFontFamily: (pageId: string, fontFamily: PageFontFamily) => Promise<void>
  onChangePageIcon: (pageId: string, icon: string | null) => Promise<void>
  onChangePageCover: (pageId: string, cover: string | null) => Promise<void>
  onTogglePageOutlineVisible: (pageId: string, showOutline: boolean) => Promise<void>
  onUpdateBlock: (
    pageId: string,
    blockId: string,
    nextBlock: PageRecord['blocks'][number],
  ) => Promise<void>
  onInsertBlock: (
    pageId: string,
    type: BlockType,
  ) => Promise<string | null>
  onInsertParagraphBlock: (pageId: string, text: string) => Promise<void>
  onInsertBlockAfter: (
    pageId: string,
    blockId: string,
    type: BlockType,
  ) => Promise<string | null>
  onReorderPage: (activePageId: string, overPageId: string) => Promise<void>
  onReorderBlock: (
    pageId: string,
    activeBlockId: string,
    overBlockId: string,
    position?: ReorderPosition,
  ) => Promise<void>
  onDeleteBlock: (pageId: string, blockId: string) => Promise<void>
  onMergeBlockWithPrevious: (pageId: string, blockId: string) => Promise<string | null>
  onDuplicateBlock: (pageId: string, blockId: string) => Promise<void>
  onTurnBlockInto: (
    pageId: string,
    blockId: string,
    type: BlockType,
  ) => Promise<void>
  saveStatus: SaveStatus
  onExportArchive: () => Promise<void>
  onExportPage: (pageId: string) => Promise<void>
  onExportWorkspace: () => Promise<void>
  onImportArchive: () => Promise<string | null>
  onCleanupOrphanBoards: () => Promise<void>
  onCleanupOrphanDataTables: () => Promise<void>
}

function AppRoutes({
  boards,
  dataTables,
  mindmaps,
  pages,
  currentPageId,
  sidebarLayout,
  sidebarWidth,
  pinnedSidebarItems,
  archiveTask,
  onCreatePage,
  onSetSidebarLayout,
  onSetSidebarWidth,
  onTogglePinnedSidebarItem,
  onRoutePageChange,
  onRenamePage,
  onDuplicatePage,
  onDeletePage,
  onRenameBoard,
  onUpdateBoardSnapshot,
  onImportBoard,
  onDuplicateBoard,
  onRestoreMissingBoard,
  onUpdateDataTableSnapshot,
  onRenameDataTable,
  onChangeDataTableIcon,
  onChangeDataTableCover,
  onRestoreMissingDataTable,
  onRestoreMissingMindmap,
  onUpdateMindmapSnapshot,

  onTogglePageFullWidth,
  onTogglePageSmallText,
  onTogglePageFontFamily,
  onChangePageIcon,
  onChangePageCover,
  onTogglePageOutlineVisible,
  onUpdateBlock,
  onInsertBlock,
  onInsertParagraphBlock,
  onInsertBlockAfter,
  onReorderPage,
  onReorderBlock,
  onDeleteBlock,
  onMergeBlockWithPrevious,
  onDuplicateBlock,
  onTurnBlockInto,
  saveStatus,
  onExportArchive,
  onExportPage,
  onExportWorkspace,
  onImportArchive,
  onCleanupOrphanBoards,
  onCleanupOrphanDataTables,
}: AppRoutesProps) {
  const navigate = useNavigate()
  const isWhiteboardRoute = useMatch('/pages/:pageId/boards/:boardId') !== null
  const isMindmapRoute = useMatch('/pages/:pageId/mindmaps/:mindmapId') !== null
  const [isSearchOpen, setIsSearchOpen] = useState(false)
  const [pendingDeletePageId, setPendingDeletePageId] = useState<string | null>(null)
  const pendingDeletePage = pages.find((page) => page.id === pendingDeletePageId) ?? null

  async function handleCreatePage() {
    const page = await onCreatePage()
    navigate(`/pages/${page.id}`)
  }

  function handleRequestDeletePage(pageId: string) {
    if (!pages.some((page) => page.id === pageId)) {
      return
    }

    setPendingDeletePageId(pageId)
  }

  async function handleDuplicatePage(pageId: string) {
    const duplicatedPage = await onDuplicatePage(pageId)

    if (duplicatedPage) {
      navigate(`/pages/${duplicatedPage.id}`)
    }
  }

  async function handleImportArchiveFromSidebar() {
    const nextPageId = await onImportArchive()

    if (nextPageId) {
      navigate(`/pages/${nextPageId}`)
    }
  }

  async function handleConfirmDeletePage() {
    if (!pendingDeletePageId) {
      return
    }

    const nextPageId = resolvePageIdAfterDelete(pages, pendingDeletePageId, currentPageId)
    const pageId = pendingDeletePageId

    setPendingDeletePageId(null)
    await onDeletePage(pageId)

    if (nextPageId !== currentPageId) {
      navigate(nextPageId ? `/pages/${nextPageId}` : '/', { replace: true })
    }
  }

  useLayoutEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (
        event.isComposing ||
        event.altKey ||
        event.shiftKey ||
        !(event.ctrlKey || event.metaKey)
      ) {
        return
      }

      const key = event.key.toLowerCase()
      if (key !== 'k' && key !== 'p') {
        return
      }

      event.preventDefault()
      setIsSearchOpen(true)
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [])

  return (
    <AppShell
      hideSidebar={isWhiteboardRoute || isMindmapRoute}
      sidebarClassName={sidebarLayout === 'compact' ? 'sidebar sidebar-compact' : 'sidebar'}
      sidebarWidth={sidebarWidth}
      onSidebarWidthChange={(width) => {
        void onSetSidebarWidth(width)
      }}
      sidebar={
        <SidebarTree
          pages={pages}
          dataTables={dataTables}
          currentPageId={currentPageId}
          layout={sidebarLayout}
          pinnedSidebarItems={pinnedSidebarItems}
          onCreatePage={() => {
            void handleCreatePage()
          }}
          onSearch={() => setIsSearchOpen(true)}
          onImportArchive={() => {
            void handleImportArchiveFromSidebar()
          }}
          onExportWorkspace={() => {
            void onExportWorkspace()
          }}
          onSetSidebarLayout={(layout) => {
            void onSetSidebarLayout(layout)
          }}
          onTogglePinnedSidebarItem={(item) => {
            void onTogglePinnedSidebarItem(item)
          }}
          onRenamePage={(pageId, title) => {
            void onRenamePage(pageId, title)
          }}
          onExportPage={(pageId) => {
            void onExportPage(pageId)
          }}
          onDuplicatePage={(pageId) => {
            void handleDuplicatePage(pageId)
          }}
          onDeletePage={(pageId) => {
            handleRequestDeletePage(pageId)
          }}
          onReorderPage={(activePageId, overPageId) => {
            void onReorderPage(activePageId, overPageId)
          }}
        />
      }
    >
      <SearchDialog
        open={isSearchOpen}
        pages={pages}
        boards={boards}
        dataTables={dataTables}
        onClose={() => setIsSearchOpen(false)}
        onOpenPage={(pageId) => navigate(`/pages/${pageId}`)}
        onOpenBoard={(pageId, boardId) => navigate(`/pages/${pageId}/boards/${boardId}`)}
        onOpenDataTable={(pageId, databaseId, recordId) =>
          navigate(
            recordId
              ? `/pages/${pageId}/data-tables/${databaseId}/records/${recordId}`
              : `/pages/${pageId}/data-tables/${databaseId}`,
          )
        }
      />
      <AppErrorBoundary resetKey={currentPageId}>
        <Routes>
          <Route
            path="/"
            element={
              currentPageId ? (
                <Navigate to={`/pages/${currentPageId}`} replace />
              ) : (
                <div className="page-empty">{uiCopy.app.pageNotFound}</div>
              )
            }
          />
          <Route
            path="/pages/:pageId"
            element={
              <PageRoute
                boards={boards}
                dataTables={dataTables}
                mindmaps={mindmaps}
                pages={pages}
                currentPageId={currentPageId}
                archiveTask={archiveTask}
                onRoutePageChange={onRoutePageChange}
                onRenamePage={onRenamePage}
                onDeletePage={handleRequestDeletePage}
                onTogglePageFullWidth={onTogglePageFullWidth}
                onTogglePageSmallText={onTogglePageSmallText}
                onTogglePageFontFamily={onTogglePageFontFamily}
                onChangePageIcon={onChangePageIcon}
                onChangePageCover={onChangePageCover}
                onTogglePageOutlineVisible={onTogglePageOutlineVisible}
                onUpdateBlock={onUpdateBlock}
                onInsertBlock={onInsertBlock}
                onInsertParagraphBlock={onInsertParagraphBlock}
                onInsertBlockAfter={onInsertBlockAfter}
                onReorderBlock={onReorderBlock}
                onDeleteBlock={onDeleteBlock}
                onMergeBlockWithPrevious={onMergeBlockWithPrevious}
                onDuplicateBlock={onDuplicateBlock}
                onTurnBlockInto={onTurnBlockInto}
                saveStatus={saveStatus}
                onExportArchive={onExportArchive}
                onExportWorkspace={onExportWorkspace}
                onImportArchive={onImportArchive}
                onCleanupOrphanBoards={onCleanupOrphanBoards}
                onCleanupOrphanDataTables={onCleanupOrphanDataTables}
                onUpdateDataTableSnapshot={onUpdateDataTableSnapshot}
                onRestoreMissingBoard={onRestoreMissingBoard}
                onRestoreMissingDataTable={onRestoreMissingDataTable}
                onRestoreMissingMindmap={onRestoreMissingMindmap}
              />
            }
          />
          <Route
            path="/pages/:pageId/boards/:boardId"
            element={
              <BoardRoute
                pages={pages}
                boards={boards}
                currentPageId={currentPageId}
                onRoutePageChange={onRoutePageChange}
                onRenameBoard={onRenameBoard}
                onUpdateBoardSnapshot={onUpdateBoardSnapshot}
                onImportBoard={onImportBoard}
                onDuplicateBoard={onDuplicateBoard}
                onRestoreMissingBoard={onRestoreMissingBoard}
              />
            }
          />
          <Route
            path="/pages/:pageId/data-tables/:databaseId"
            element={
              <DataTableRoute
                pages={pages}
                dataTables={dataTables}
                currentPageId={currentPageId}
                saveStatus={saveStatus}
                archiveTask={archiveTask}
                route="table"
                onRoutePageChange={onRoutePageChange}
                onUpdateDataTableSnapshot={onUpdateDataTableSnapshot}
                onRenameDataTable={onRenameDataTable}
                onChangeDataTableIcon={onChangeDataTableIcon}
                onChangeDataTableCover={onChangeDataTableCover}
                onRestoreMissingDataTable={onRestoreMissingDataTable}
                onTogglePageFullWidth={onTogglePageFullWidth}
                onTogglePageSmallText={onTogglePageSmallText}
                onTogglePageFontFamily={onTogglePageFontFamily}
                onTogglePageOutlineVisible={onTogglePageOutlineVisible}
                onExportArchive={onExportArchive}
                onExportWorkspace={onExportWorkspace}
                onImportArchive={onImportArchive}
                onCleanupOrphanBoards={onCleanupOrphanBoards}
                onCleanupOrphanDataTables={onCleanupOrphanDataTables}
              />
            }
          />
          <Route
            path="/pages/:pageId/data-tables/:databaseId/records/:recordId"
            element={
              <DataTableRoute
                pages={pages}
                dataTables={dataTables}
                currentPageId={currentPageId}
                saveStatus={saveStatus}
                archiveTask={archiveTask}
                route="record"
                onRoutePageChange={onRoutePageChange}
                onUpdateDataTableSnapshot={onUpdateDataTableSnapshot}
                onRenameDataTable={onRenameDataTable}
                onChangeDataTableIcon={onChangeDataTableIcon}
                onChangeDataTableCover={onChangeDataTableCover}
                onRestoreMissingDataTable={onRestoreMissingDataTable}
                onTogglePageFullWidth={onTogglePageFullWidth}
                onTogglePageSmallText={onTogglePageSmallText}
                onTogglePageFontFamily={onTogglePageFontFamily}
                onTogglePageOutlineVisible={onTogglePageOutlineVisible}
                onExportArchive={onExportArchive}
                onExportWorkspace={onExportWorkspace}
                onImportArchive={onImportArchive}
                onCleanupOrphanBoards={onCleanupOrphanBoards}
                onCleanupOrphanDataTables={onCleanupOrphanDataTables}
              />
            }
          />
          <Route
            path="/pages/:pageId/mindmaps/:mindmapId"
            element={
              <MindmapRoute
                pages={pages}
                mindmaps={mindmaps}
                currentPageId={currentPageId}
                onRoutePageChange={onRoutePageChange}
                onRestoreMissingMindmap={onRestoreMissingMindmap}
                onUpdateMindmapSnapshot={onUpdateMindmapSnapshot}
              />
            }
          />
        </Routes>
      </AppErrorBoundary>
      {pendingDeletePage ? (
        <ConfirmDialog
          title={DELETE_CURRENT_PAGE_LABEL}
          description={buildDeletePageConfirmDescription(pendingDeletePage.title)}
          confirmLabel={DELETE_PAGE_CONFIRM_LABEL}
          cancelLabel={CANCEL_DELETE_PAGE_LABEL}
          danger
          onConfirm={() => {
            void handleConfirmDeletePage()
          }}
          onCancel={() => setPendingDeletePageId(null)}
        />
      ) : null}
    </AppShell>
  )
}

interface PageRouteProps {
  boards: BoardRecord[]
  dataTables: DataTableRecord[]
  mindmaps: MindmapRecord[]
  pages: PageRecord[]
  currentPageId: string | null
  archiveTask: ArchiveTaskStatus | null
  onRoutePageChange: (pageId: string) => Promise<void>
  onRenamePage: (pageId: string, title: string) => Promise<void>
  onDeletePage: (pageId: string) => void
  onTogglePageFullWidth: (pageId: string, isFullWidth: boolean) => Promise<void>
  onTogglePageSmallText: (pageId: string, isSmallText: boolean) => Promise<void>
  onTogglePageFontFamily: (pageId: string, fontFamily: PageFontFamily) => Promise<void>
  onChangePageIcon: (pageId: string, icon: string | null) => Promise<void>
  onChangePageCover: (pageId: string, cover: string | null) => Promise<void>
  onTogglePageOutlineVisible: (pageId: string, showOutline: boolean) => Promise<void>
  onUpdateBlock: (
    pageId: string,
    blockId: string,
    nextBlock: PageRecord['blocks'][number],
  ) => Promise<void>
  onInsertBlock: (
    pageId: string,
    type: BlockType,
  ) => Promise<string | null>
  onInsertParagraphBlock: (pageId: string, text: string) => Promise<void>
  onInsertBlockAfter: (
    pageId: string,
    blockId: string,
    type: BlockType,
  ) => Promise<string | null>
  onReorderBlock: (
    pageId: string,
    activeBlockId: string,
    overBlockId: string,
    position?: ReorderPosition,
  ) => Promise<void>
  onDeleteBlock: (pageId: string, blockId: string) => Promise<void>
  onMergeBlockWithPrevious: (pageId: string, blockId: string) => Promise<string | null>
  onDuplicateBlock: (pageId: string, blockId: string) => Promise<void>
  onTurnBlockInto: (
    pageId: string,
    blockId: string,
    type: BlockType,
  ) => Promise<void>
  saveStatus: SaveStatus
  onExportArchive: () => Promise<void>
  onExportWorkspace: () => Promise<void>
  onImportArchive: () => Promise<string | null>
  onCleanupOrphanBoards: () => Promise<void>
  onCleanupOrphanDataTables: () => Promise<void>
  onUpdateDataTableSnapshot: (databaseId: string, snapshot: unknown) => Promise<void>
  onRestoreMissingBoard: (pageId: string, boardId: string) => Promise<BoardRecord | null>
  onRestoreMissingDataTable: (pageId: string, databaseId: string) => Promise<DataTableRecord | null>
  onRestoreMissingMindmap: (pageId: string, mindmapId: string) => Promise<MindmapRecord | null>
}

function PageRoute({
  boards,
  dataTables,
  mindmaps,
  pages,
  currentPageId,
  archiveTask,
  onRoutePageChange,
  onRenamePage,
  onDeletePage,
  onTogglePageFullWidth,
  onTogglePageSmallText,
  onTogglePageFontFamily,
  onChangePageIcon,
  onChangePageCover,
  onTogglePageOutlineVisible,
  onUpdateBlock,
  onInsertBlock,
  onInsertParagraphBlock,
  onInsertBlockAfter,
  onReorderBlock,
  onDeleteBlock,
  onMergeBlockWithPrevious,
  onDuplicateBlock,
  onTurnBlockInto,
  saveStatus,
  onExportArchive,
  onExportWorkspace,
  onImportArchive,
  onCleanupOrphanBoards,
  onCleanupOrphanDataTables,
  onUpdateDataTableSnapshot,
  onRestoreMissingBoard,
  onRestoreMissingDataTable,
  onRestoreMissingMindmap,
}: PageRouteProps) {
  const { pageId } = useParams()
  const navigate = useNavigate()
  const page = pages.find((item) => item.id === pageId)
  const outlineVisible = page?.showOutline !== false
  const [topbarScrolled, setTopbarScrolled] = useState(false)

  useEffect(() => {
    if (!page || currentPageId === page.id) {
      return
    }

    void onRoutePageChange(page.id)
  }, [currentPageId, onRoutePageChange, page])

  useEffect(() => {
    const updateTopbarScrolled = () => {
      const nextScrolled = window.scrollY > 2
      setTopbarScrolled((current) => (current === nextScrolled ? current : nextScrolled))
    }

    updateTopbarScrolled()
    window.addEventListener('scroll', updateTopbarScrolled, { passive: true })

    return () => {
      window.removeEventListener('scroll', updateTopbarScrolled)
    }
  }, [page?.id])

  if (!page) {
    return <div className="page-empty">{uiCopy.app.pageNotFound}</div>
  }

  const pageContentClassName = [
    'page-content',
    `page-content-font-${page.fontFamily ?? 'default'}`,
    page.isFullWidth ? 'page-content-adaptive' : '',
    page.isSmallText ? 'page-content-small-text' : '',
  ]
    .filter(Boolean)
    .join(' ')
  const breadcrumbs = buildPageBreadcrumbs(pages, page)
  const headerActions = (
    <ExportImportPanel
      status={saveStatus}
      adaptiveWidth={page.isFullWidth === true}
      smallText={page.isSmallText === true}
      fontFamily={page.fontFamily ?? 'default'}
      outlineVisible={outlineVisible}
      archiveTask={archiveTask}
      onToggleAdaptiveWidth={(value) => {
        void onTogglePageFullWidth(page.id, value)
      }}
      onToggleSmallText={(value) => {
        void onTogglePageSmallText(page.id, value)
      }}
      onToggleFontFamily={(value) => {
        void onTogglePageFontFamily(page.id, value)
      }}
      onToggleOutlineVisible={(value) => {
        void onTogglePageOutlineVisible(page.id, value)
      }}
      onExportArchive={() => void onExportArchive()}
      onExportWorkspace={() => void onExportWorkspace()}
      onImportArchive={async () => {
        const nextPageId = await onImportArchive()
        navigate(nextPageId ? `/pages/${nextPageId}` : '/', { replace: true })
      }}
      onCleanupOrphanBoards={() => void onCleanupOrphanBoards()}
      onCleanupOrphanDataTables={() => void onCleanupOrphanDataTables()}
      onDeletePage={() => void onDeletePage(page.id)}
    />
  )

  return (
    <div
      className={
        outlineVisible
          ? 'page-with-outline page-with-outline-has-outline'
          : 'page-with-outline page-with-outline-hidden'
      }
    >
      <div className={topbarScrolled ? 'page-route-topbar page-route-topbar-scrolled' : 'page-route-topbar'}>
        {breadcrumbs.length > 1 ? (
          <PageBreadcrumbs items={breadcrumbs} />
        ) : (
          <div className="page-route-topbar-spacer" aria-hidden="true" />
        )}
        <PageHeaderToolbar
          page={page}
          onChangeIcon={(icon) => {
            void onChangePageIcon(page.id, icon)
          }}
          onChangeCover={(cover) => {
            void onChangePageCover(page.id, cover)
          }}
          actions={headerActions}
        />
      </div>
      {page.cover ? (
        <div
          className={`page-cover page-cover-${page.cover} page-route-cover`}
          aria-hidden="true"
        />
      ) : null}
      <PageHeader
        page={page}
        bodyClassName={pageContentClassName}
        showTopRow={false}
        showCover={false}
        onRename={(title) => {
          void onRenamePage(page.id, title)
        }}
        onChangeIcon={(icon) => {
          void onChangePageIcon(page.id, icon)
        }}
        onChangeCover={(cover) => {
          void onChangePageCover(page.id, cover)
        }}
        actions={headerActions}
      />
      <div
        className={
          outlineVisible ? 'page-body-with-outline page-body-with-outline-has-outline' : 'page-body-with-outline'
        }
      >
        {outlineVisible ? <PageOutline blocks={page.blocks} /> : null}
        <div className={pageContentClassName}>
          <BlockEditor
            page={page}
            allPages={pages}
            boards={boards}
            dataTables={dataTables}
            mindmaps={mindmaps}
            onUpdateBlock={(blockId, nextBlock) => {
              void onUpdateBlock(page.id, blockId, nextBlock)
            }}
            onInsert={(type) => {
              return onInsertBlock(page.id, type)
            }}
            onInsertParagraph={(text) => {
              void onInsertParagraphBlock(page.id, text)
            }}
            onInsertBlockAfter={(blockId, type) => onInsertBlockAfter(page.id, blockId, type)}
            onReorderBlock={(activeBlockId, overBlockId, position) => {
              void onReorderBlock(page.id, activeBlockId, overBlockId, position)
            }}
            onDeleteBlock={(blockId) => {
              void onDeleteBlock(page.id, blockId)
            }}
            onMergeBlockWithPrevious={(blockId) => onMergeBlockWithPrevious(page.id, blockId)}
            onDuplicateBlock={(blockId) => {
              void onDuplicateBlock(page.id, blockId)
            }}
            onTurnInto={(blockId, type) => onTurnBlockInto(page.id, blockId, type)}
            onOpenChildPage={(childPageId) => {
              navigate(`/pages/${childPageId}`)
            }}
            onOpenWhiteboard={(boardId) => {
              navigate(`/pages/${page.id}/boards/${boardId}`)
            }}
            onRestoreWhiteboard={async (boardId) => {
              const board = await onRestoreMissingBoard(page.id, boardId)
              if (board) {
                navigate(`/pages/${page.id}/boards/${board.id}`)
              }
            }}
            onOpenDataTable={(databaseId) => {
              navigate(`/pages/${page.id}/data-tables/${databaseId}`)
            }}
            onUpdateDataTableSnapshot={(databaseId, snapshot) => {
              void onUpdateDataTableSnapshot(databaseId, snapshot)
            }}
            onRestoreDataTable={async (databaseId) => {
              const dataTable = await onRestoreMissingDataTable(page.id, databaseId)
              if (dataTable) {
                navigate(`/pages/${page.id}/data-tables/${dataTable.id}`)
              }
            }}
            onOpenMindmap={(mindmapId) => {
              navigate(`/pages/${page.id}/mindmaps/${mindmapId}`)
            }}
            onRestoreMindmap={async (mindmapId) => {
              const mindmap = await onRestoreMissingMindmap(page.id, mindmapId)
              if (mindmap) {
                navigate(`/pages/${page.id}/mindmaps/${mindmap.id}`)
              }
            }}
          />
        </div>
      </div>
    </div>
  )
}

function buildPageBreadcrumbs(
  pages: PageRecord[],
  page: PageRecord,
  options: { linkCurrent?: boolean } = {},
): PageBreadcrumbItem[] {
  const pageById = new Map(pages.map((item) => [item.id, item]))
  const chain: PageRecord[] = []
  const seen = new Set<string>()
  let current: PageRecord | undefined = page

  while (current && !seen.has(current.id)) {
    chain.push(current)
    seen.add(current.id)
    current = current.parentId ? pageById.get(current.parentId) : undefined
  }

  const orderedChain = chain.reverse()
  return orderedChain.map((item, index) => {
    const isCurrent = index === orderedChain.length - 1
    return {
      label: item.title.trim() || uiCopy.page.untitled,
      icon: item.icon,
      to: options.linkCurrent || !isCurrent ? `/pages/${item.id}` : undefined,
    }
  })
}

function buildDeletePageConfirmDescription(title: string) {
  const pageTitle = title.trim() || uiCopy.page.untitled
  return `${DELETE_PAGE_DESCRIPTION_PREFIX}${pageTitle}${DELETE_PAGE_DESCRIPTION_SUFFIX}`
}

function resolvePageIdAfterDelete(
  pages: PageRecord[],
  pageId: string,
  currentPageId: string | null,
) {
  const nextPages = deletePageBranch(pages, pageId)
  const currentPageStillExists =
    currentPageId !== null && nextPages.some((page) => page.id === currentPageId)

  return currentPageStillExists ? currentPageId : (nextPages[0]?.id ?? null)
}

function getDataTableRecordTitle(
  dataTable: DataTableRecord | null,
  recordId: string | undefined,
) {
  if (!dataTable || !recordId || !dataTable.snapshot || typeof dataTable.snapshot !== 'object') {
    return null
  }

  const records = (dataTable.snapshot as { records?: unknown }).records
  if (!records || typeof records !== 'object') {
    return null
  }

  const record = (records as Record<string, unknown>)[recordId]
  if (!record || typeof record !== 'object') {
    return null
  }

  const title = (record as { title?: unknown }).title
  return typeof title === 'string' && title.trim() ? title : '未命名记录'
}

interface DataTableRouteProps {
  pages: PageRecord[]
  dataTables: DataTableRecord[]
  currentPageId: string | null
  saveStatus: SaveStatus
  archiveTask: ArchiveTaskStatus | null
  route: 'table' | 'record'
  onRoutePageChange: (pageId: string) => Promise<void>
  onUpdateDataTableSnapshot: (databaseId: string, snapshot: unknown) => Promise<void>
  onRenameDataTable: (databaseId: string, title: string) => Promise<void>
  onChangeDataTableIcon: (databaseId: string, icon: string | null) => Promise<void>
  onChangeDataTableCover: (databaseId: string, cover: string | null) => Promise<void>
  onRestoreMissingDataTable: (pageId: string, databaseId: string) => Promise<DataTableRecord | null>
  onTogglePageFullWidth: (pageId: string, isFullWidth: boolean) => Promise<void>
  onTogglePageSmallText: (pageId: string, isSmallText: boolean) => Promise<void>
  onTogglePageFontFamily: (pageId: string, fontFamily: PageFontFamily) => Promise<void>
  onTogglePageOutlineVisible: (pageId: string, showOutline: boolean) => Promise<void>
  onExportArchive: () => Promise<void>
  onExportWorkspace: () => Promise<void>
  onImportArchive: () => Promise<string | null>
  onCleanupOrphanBoards: () => Promise<void>
  onCleanupOrphanDataTables: () => Promise<void>
}

function DataTableRoute({
  pages,
  dataTables,
  currentPageId,
  saveStatus,
  archiveTask,
  route,
  onRoutePageChange,
  onUpdateDataTableSnapshot,
  onRenameDataTable,
  onChangeDataTableIcon,
  onChangeDataTableCover,
  onRestoreMissingDataTable,
  onTogglePageFullWidth,
  onTogglePageSmallText,
  onTogglePageFontFamily,
  onTogglePageOutlineVisible,
  onExportArchive,
  onExportWorkspace,
  onImportArchive,
  onCleanupOrphanBoards,
  onCleanupOrphanDataTables,
}: DataTableRouteProps) {
  const { pageId, databaseId, recordId } = useParams()
  const navigate = useNavigate()
  const page = pages.find((item) => item.id === pageId)
  const dataTable = dataTables.find((item) => item.id === databaseId) ?? null

  useEffect(() => {
    if (!page || currentPageId === page.id) {
      return
    }

    void onRoutePageChange(page.id)
  }, [currentPageId, onRoutePageChange, page])

  useEffect(() => {
    if (!page || dataTable || !databaseId) {
      return
    }

    void onRestoreMissingDataTable(page.id, databaseId).then((nextDataTable) => {
      if (nextDataTable) {
        navigate(`/pages/${page.id}/data-tables/${nextDataTable.id}`, { replace: true })
      }
    })
  }, [dataTable, databaseId, navigate, onRestoreMissingDataTable, page])

  if (!page || !databaseId) {
    return <div className="page-empty">{uiCopy.app.pageNotFound}</div>
  }

  const basePath = `/pages/${page.id}/data-tables/${databaseId}`
  const outlineVisible = page.showOutline !== false
  const breadcrumbs: PageBreadcrumbItem[] = [
    ...buildPageBreadcrumbs(pages, page, { linkCurrent: true }),
    {
      label: dataTable?.title.trim() || '数据表格',
      to: route === 'record' ? basePath : undefined,
    },
  ]

  if (route === 'record') {
    breadcrumbs.push({
      label: getDataTableRecordTitle(dataTable, recordId) ?? '记录详情',
    })
  }

  return (
    <Suspense fallback={<div className="page-empty">{uiCopy.app.loading}</div>}>
      <DataTablePage
        page={page}
        dataTable={dataTable}
        saveStatus={saveStatus}
        route={route}
        basePath={basePath}
        breadcrumbs={breadcrumbs}
        headerActions={
          <ExportImportPanel
            status={saveStatus}
            adaptiveWidth={page.isFullWidth === true}
            smallText={page.isSmallText === true}
            fontFamily={page.fontFamily ?? 'default'}
            outlineVisible={outlineVisible}
            archiveTask={archiveTask}
            onToggleAdaptiveWidth={(value) => {
              void onTogglePageFullWidth(page.id, value)
            }}
            onToggleSmallText={(value) => {
              void onTogglePageSmallText(page.id, value)
            }}
            onToggleFontFamily={(value) => {
              void onTogglePageFontFamily(page.id, value)
            }}
            onToggleOutlineVisible={(value) => {
              void onTogglePageOutlineVisible(page.id, value)
            }}
            onExportArchive={() => void onExportArchive()}
            onExportWorkspace={() => void onExportWorkspace()}
            onImportArchive={async () => {
              const nextPageId = await onImportArchive()
              navigate(nextPageId ? `/pages/${nextPageId}` : '/', { replace: true })
            }}
            onCleanupOrphanBoards={() => void onCleanupOrphanBoards()}
            onCleanupOrphanDataTables={() => void onCleanupOrphanDataTables()}
          />
        }
        onChange={(snapshot) => {
          if (dataTable) {
            void onUpdateDataTableSnapshot(dataTable.id, snapshot)
          }
        }}
        onRename={(title) => {
          if (dataTable) {
            void onRenameDataTable(dataTable.id, title)
          }
        }}
        onChangeIcon={(icon) => {
          if (dataTable) {
            void onChangeDataTableIcon(dataTable.id, icon)
          }
        }}
        onChangeCover={(cover) => {
          if (dataTable) {
            void onChangeDataTableCover(dataTable.id, cover)
          }
        }}
      />
    </Suspense>
  )
}

interface BoardRouteProps {
  pages: PageRecord[]
  boards: BoardRecord[]
  currentPageId: string | null
  onRoutePageChange: (pageId: string) => Promise<void>
  onRenameBoard: (boardId: string, title: string) => Promise<void>
  onUpdateBoardSnapshot: (boardId: string, snapshot: unknown) => Promise<void>
  onImportBoard: (boardId: string, payload: { title: string | null; snapshot: unknown }) => Promise<void>
  onDuplicateBoard: (pageId: string, boardId: string) => Promise<string | null>
  onRestoreMissingBoard: (pageId: string, boardId: string) => Promise<BoardRecord | null>
}

interface WhiteboardRouteMenuProps {
  onRename: () => void
  onDuplicate: () => void
  onExport: () => void
  onImport: () => void
}

function WhiteboardRouteMenu({ onRename, onDuplicate, onExport, onImport }: WhiteboardRouteMenuProps) {
  const [open, setOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement | null>(null)

  useDismissableLayer({
    open,
    refs: [menuRef],
    onDismiss: () => setOpen(false),
  })

  return (
    <>
      {open ? (
        <div
          className="whiteboard-route-menu-scrim"
          aria-hidden="true"
          onPointerDown={() => setOpen(false)}
        />
      ) : null}
      <div className="page-menu whiteboard-route-menu" ref={menuRef}>
        <button
          type="button"
          className="page-menu-button"
          aria-label={WHITEBOARD_MENU_LABEL}
          aria-expanded={open}
          aria-haspopup="menu"
          onClick={() => setOpen((value) => !value)}
        >
          <span aria-hidden="true">⋯</span>
        </button>
        {open ? (
          <div className="page-menu-popover whiteboard-route-menu-popover">
            <div className="page-menu-section">
              <button
                type="button"
                className="page-menu-action"
                onClick={() => {
                  setOpen(false)
                  onRename()
                }}
              >
                <span className="page-menu-item-label">重命名</span>
              </button>
              <button
                type="button"
                className="page-menu-action"
                onClick={() => {
                  setOpen(false)
                  onDuplicate()
                }}
              >
                <span className="page-menu-item-label">{DUPLICATE_BOARD_LABEL}</span>
              </button>
              <button
                type="button"
                className="page-menu-action"
                onClick={() => {
                  setOpen(false)
                  onExport()
                }}
              >
                <span className="page-menu-item-label">导出白板</span>
              </button>
              <button
                type="button"
                className="page-menu-action"
                onClick={() => {
                  setOpen(false)
                  onImport()
                }}
              >
                <span className="page-menu-item-label">导入白板</span>
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </>
  )
}

function BoardRoute({
  pages,
  boards,
  currentPageId,
  onRoutePageChange,
  onRenameBoard,
  onUpdateBoardSnapshot,
  onImportBoard,
  onDuplicateBoard,
  onRestoreMissingBoard,
}: BoardRouteProps) {
  const { pageId, boardId } = useParams()
  const navigate = useNavigate()
  const page = pages.find((item) => item.id === pageId)
  const board = boards.find((item) => item.id === boardId) ?? null

  useEffect(() => {
    if (!page || currentPageId === page.id) {
      return
    }

    void onRoutePageChange(page.id)
  }, [currentPageId, onRoutePageChange, page])

  if (!page) {
    return <div className="page-empty">{uiCopy.app.pageNotFound}</div>
  }

  const routePageId = page.id

  async function handleImportBoard() {
    if (!board) {
      return
    }

    const file = await openTextFile({ filters: JSON_FILE_FILTER })

    if (!file) {
      return
    }

    try {
      const payload = normalizeBoardImportPayload(JSON.parse(file.contents) as unknown)
      await onImportBoard(board.id, payload)
    } catch {
      window.alert('导入失败，请检查白板文件格式。')
    }
  }

  async function handleDuplicateBoard() {
    if (!board) {
      return
    }

    const nextBoardId = await onDuplicateBoard(routePageId, board.id)
    if (nextBoardId) {
      window.setTimeout(() => {
        navigate(`/pages/${routePageId}/boards/${nextBoardId}`)
      }, 0)
    }
  }

  async function handleRestoreMissingBoard() {
    if (!boardId) {
      return
    }

    const nextBoard = await onRestoreMissingBoard(routePageId, boardId)
    if (nextBoard) {
      navigate(`/pages/${routePageId}/boards/${nextBoard.id}`, { replace: true })
    }
  }

  function handleRenameBoardFromMenu() {
    if (!board) {
      return
    }

    const nextTitle = window.prompt(WHITEBOARD_RENAME_PROMPT, board.title)

    if (nextTitle !== null && nextTitle !== board.title) {
      void onRenameBoard(board.id, nextTitle)
    }
  }

  return (
    <WhiteboardPage
      page={page}
      board={board}
      onBack={() => navigate(`/pages/${routePageId}`)}
      onRename={(title) => {
        if (board) {
          void onRenameBoard(board.id, title)
        }
      }}
      actions={
        board ? (
          <WhiteboardRouteMenu
            onRename={handleRenameBoardFromMenu}
            onDuplicate={() => {
              void handleDuplicateBoard()
            }}
            onExport={() => {
              void saveTextFile({
                defaultPath: `${sanitizeFileName(board.title)}.whiteboard.json`,
                contents: JSON.stringify(
                  {
                    title: board.title,
                    snapshot: board.snapshot,
                  },
                  null,
                  2,
                ),
                filters: JSON_FILE_FILTER,
              })
            }}
            onImport={() => {
              void handleImportBoard()
            }}
          />
        ) : (
          <div className="page-header-actions">
            <button
              type="button"
              className="page-header-action"
              onClick={() => {
                void handleRestoreMissingBoard()
              }}
            >
              重新创建白板
            </button>
          </div>
        )
      }
    >
      {board ? (
        <Suspense fallback={<div className="page-empty">{uiCopy.app.loading}</div>}>
          <WhiteboardCanvas
            key={board.id}
            board={board}
            onChange={(snapshot) => {
              void onUpdateBoardSnapshot(board.id, snapshot)
            }}
          />
        </Suspense>
      ) : null}
    </WhiteboardPage>
  )
}

interface MindmapRouteProps {
  pages: PageRecord[]
  mindmaps: MindmapRecord[]
  currentPageId: string | null
  onRoutePageChange: (pageId: string) => Promise<void>
  onRestoreMissingMindmap: (pageId: string, mindmapId: string) => Promise<MindmapRecord | null>
  onUpdateMindmapSnapshot: (mindmapId: string, snapshot: unknown) => Promise<void>
}

function MindmapRoute({
  pages,
  mindmaps,
  currentPageId,
  onRoutePageChange,
  onRestoreMissingMindmap,
  onUpdateMindmapSnapshot,
}: MindmapRouteProps) {
  const { pageId, mindmapId } = useParams()
  const navigate = useNavigate()
  const page = pages.find((item) => item.id === pageId)
  const mindmap = mindmaps.find((item) => item.id === mindmapId) ?? null

  useEffect(() => {
    if (!page || currentPageId === page.id) {
      return
    }

    void onRoutePageChange(page.id)
  }, [currentPageId, onRoutePageChange, page])

  if (!page) {
    return <div className="page-empty">{uiCopy.app.pageNotFound}</div>
  }

  const routePageId = page.id

  async function handleRestoreMissingMindmap() {
    if (!mindmapId) {
      return
    }

    const nextMindmap = await onRestoreMissingMindmap(routePageId, mindmapId)
    if (nextMindmap) {
      navigate(`/pages/${routePageId}/mindmaps/${nextMindmap.id}`, { replace: true })
    }
  }

  return (
    <MindmapPage page={page} mindmap={mindmap} onBack={() => navigate(`/pages/${routePageId}`)}>
      {mindmap ? (
        <MindmapFrame
          mindmapId={mindmap.id}
          snapshot={mindmap.snapshot}
          onSnapshotChange={(snapshot) => {
            void onUpdateMindmapSnapshot(mindmap.id, snapshot)
          }}
        />
      ) : (
        <div className="mindmap-route-missing-actions">
          <button
            type="button"
            className="mindmap-route-recover"
            onClick={() => {
              void handleRestoreMissingMindmap()
            }}
          >
            恢复导图
          </button>
        </div>
      )}
    </MindmapPage>
  )
}



function createWorkspaceBackupSnapshot(state: AppState): WorkspaceSnapshot {
  return {
    boards: structuredClone(state.boards),
    dataTables: structuredClone(state.dataTables),
    mindmaps: structuredClone(state.mindmaps),
    pages: structuredClone(state.pages),
    settings: structuredClone(state.settings),
  }
}

export default App

function sanitizeFileName(value: string) {
  return sanitizeFileNameSegment(value, uiCopy.page.untitled)
}

function normalizeBoardImportPayload(payload: unknown): { title: string | null; snapshot: unknown } {
  if (isWhiteboardSnapshot(payload)) {
    return {
      title: null,
      snapshot: structuredClone(payload),
    }
  }

  if (!payload || typeof payload !== 'object') {
    throw new Error('Invalid board payload')
  }

  const candidate = payload as {
    title?: unknown
    snapshot?: unknown
  }

  if (!isWhiteboardSnapshot(candidate.snapshot)) {
    throw new Error('Invalid board snapshot')
  }

  return {
    title: typeof candidate.title === 'string' ? candidate.title : null,
    snapshot: structuredClone(candidate.snapshot),
  }
}
