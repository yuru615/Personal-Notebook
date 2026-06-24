import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react'
import {
  BrowserRouter,
  MemoryRouter,
  Navigate,
  Route,
  Routes,
  useMatch,
  useNavigate,
  useParams,
} from 'react-router-dom'
import { BlockEditor } from '../components/editor/BlockEditor'
import { DataTablePage } from '../components/dataTable/DataTablePage'
import { PageHeader } from '../components/editor/PageHeader'
import { PageOutline } from '../components/editor/PageOutline'
import { MindmapPage } from '../components/mindmap/MindmapPage'
import { useDismissableLayer } from '../components/editor/useDismissableLayer'
import { ExportImportPanel } from '../components/export/ExportImportPanel'
import { AppShell } from '../components/layout/AppShell'
import { SearchDialog } from '../components/search/SearchDialog'
import { SidebarTree } from '../components/sidebar/SidebarTree'
import { AppErrorBoundary } from '../components/shared/AppErrorBoundary'
import {
  PageBreadcrumbs,
  type PageBreadcrumbItem,
} from '../components/shared/PageBreadcrumbs'
import { WhiteboardCanvas } from '../components/whiteboard/WhiteboardCanvas'
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
} from '../domain/types'
import {
  createDexieWorkspaceRepository,
  type WorkspaceRepository,
} from '../lib/workspaceRepository'
import { createWorkspaceStore } from '../store/createWorkspaceStore'
import { uiCopy } from '../ui/copy'
import { sanitizeFileNameSegment } from '../utils/fileName'
import type { ReorderPosition } from '../utils/reorder'

type WorkspaceStore = ReturnType<typeof createWorkspaceStore>
type AppState = ReturnType<WorkspaceStore['getState']>

const DUPLICATE_BOARD_LABEL = '创建副本'
const WHITEBOARD_MENU_LABEL = '白板菜单'

function isEditableShortcutTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) {
    return false
  }

  return Boolean(
    target.closest("input:not([readonly]):not([type='checkbox'])") ||
      target.closest('textarea:not([readonly])') ||
      target.closest("[contenteditable='true']"),
  )
}

interface AppProps {
  repository?: WorkspaceRepository
  store?: WorkspaceStore
  initialEntries?: string[]
}

export function App({ repository, store: injectedStore, initialEntries }: AppProps = {}) {
  const [store] = useState(
    () => injectedStore ?? createWorkspaceStore(repository ?? createDexieWorkspaceRepository()),
  )
  const state = useSyncExternalStore(store.subscribe, store.getState, store.getState)
  const [isBootstrapped, setIsBootstrapped] = useState(false)
  const [reversibleExport, setReversibleExport] = useState(false)
  const setCurrentPage = store.getState().setCurrentPage

  useEffect(() => {
    let isMounted = true

    void store.getState().bootstrap().finally(() => {
      if (isMounted) {
        setIsBootstrapped(true)
      }
    })

    return () => {
      isMounted = false
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

  if (!isBootstrapped) {
    return <div className="page-empty">{uiCopy.app.loading}</div>
  }

  const router = (
    <AppRoutes
      boards={state.boards}
      dataTables={state.dataTables}
      mindmaps={state.mindmaps}
      pages={state.pages}
      currentPageId={state.currentPageId}
      onCreatePage={() => store.getState().createPage()}
      onRoutePageChange={setCurrentPage}
      onRenamePage={(pageId, title) => store.getState().renamePage(pageId, title)}
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
      onUpdateMindmapSnapshot={(mindmapId, snapshot) =>
        store.getState().updateMindmapSnapshot(mindmapId, snapshot)
      }
      onRestoreMissingMindmap={(pageId, mindmapId) =>
        store.getState().restoreMissingMindmapReference(pageId, mindmapId)
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
      reversibleExport={reversibleExport}
      onToggleReversibleExport={setReversibleExport}
      onExportJson={async () => {
        const payload = await store.getState().exportJson()
        downloadBlob(
          new Blob([payload], { type: 'application/json;charset=utf-8' }),
          '鐭ヨ瘑搴撳浠?json',
        )
      }}
      onExportMarkdown={async (page) => {
        const { buildMarkdownZip } = await import('../domain/markdown')
        const blob = await buildMarkdownZip({
          rootPage: page,
          allPages: store.getState().pages,
          boards: store.getState().boards,
          reversible: reversibleExport,
        })

        downloadBlob(blob, `${sanitizeFileName(page.title)}.zip`)
      }}
      onImportJson={async (file) => {
        try {
          const payload = JSON.parse(await file.text()) as unknown
          await store.getState().importJson(payload)
          return store.getState().currentPageId
        } catch {
          window.alert(uiCopy.export.importError)
          return store.getState().currentPageId
        }
      }}
      onImportMarkdown={async (file) => {
        try {
          const { importMarkdownZip } = await import('../domain/markdown')
          const payload = await importMarkdownZip(file)
          return await store.getState().importPagePackage(payload)
        } catch {
          window.alert('导入失败，请检查页面包格式。')
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

  return <BrowserRouter>{router}</BrowserRouter>
}

interface AppRoutesProps {
  boards: BoardRecord[]
  dataTables: DataTableRecord[]
  mindmaps: MindmapRecord[]
  pages: AppState['pages']
  currentPageId: AppState['currentPageId']
  onCreatePage: () => Promise<PageRecord>
  onRoutePageChange: (pageId: string) => Promise<void>
  onRenamePage: (pageId: string, title: string) => Promise<void>
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
  onUpdateMindmapSnapshot: (mindmapId: string, snapshot: unknown) => Promise<void>
  onRestoreMissingMindmap: (pageId: string, mindmapId: string) => Promise<MindmapRecord | null>

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
  reversibleExport: boolean
  onToggleReversibleExport: (value: boolean) => void
  onExportJson: () => Promise<void>
  onExportMarkdown: (page: PageRecord) => Promise<void>
  onImportJson: (file: File) => Promise<string | null>
  onImportMarkdown: (file: File) => Promise<string | null>
  onCleanupOrphanBoards: () => Promise<void>
  onCleanupOrphanDataTables: () => Promise<void>
}

function AppRoutes({
  boards,
  dataTables,
  mindmaps,
  pages,
  currentPageId,
  onCreatePage,
  onRoutePageChange,
  onRenamePage,
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
  onUpdateMindmapSnapshot,
  onRestoreMissingMindmap,

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
  reversibleExport,
  onToggleReversibleExport,
  onExportJson,
  onExportMarkdown,
  onImportJson,
  onImportMarkdown,
  onCleanupOrphanBoards,
  onCleanupOrphanDataTables,
}: AppRoutesProps) {
  const navigate = useNavigate()
  const isWhiteboardRoute = useMatch('/pages/:pageId/boards/:boardId') !== null
  const isMindmapRoute = useMatch('/pages/:pageId/mindmaps/:mindmapId') !== null
  const [isSearchOpen, setIsSearchOpen] = useState(false)

  async function handleCreatePage() {
    const page = await onCreatePage()
    navigate(`/pages/${page.id}`)
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
      sidebar={
        <SidebarTree
          pages={pages}
          boards={boards}
          dataTables={dataTables}
          currentPageId={currentPageId}
          onCreatePage={() => {
            void handleCreatePage()
          }}
          onSearch={() => setIsSearchOpen(true)}
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
                onRoutePageChange={onRoutePageChange}
                onRenamePage={onRenamePage}
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
                reversibleExport={reversibleExport}
                onToggleReversibleExport={onToggleReversibleExport}
                onExportJson={onExportJson}
                onExportMarkdown={onExportMarkdown}
                onImportJson={onImportJson}
                onImportMarkdown={onImportMarkdown}
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
                route="table"
                onRoutePageChange={onRoutePageChange}
                onUpdateDataTableSnapshot={onUpdateDataTableSnapshot}
                onRenameDataTable={onRenameDataTable}
                onChangeDataTableIcon={onChangeDataTableIcon}
                onChangeDataTableCover={onChangeDataTableCover}
                onRestoreMissingDataTable={onRestoreMissingDataTable}
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
                route="record"
                onRoutePageChange={onRoutePageChange}
                onUpdateDataTableSnapshot={onUpdateDataTableSnapshot}
                onRenameDataTable={onRenameDataTable}
                onChangeDataTableIcon={onChangeDataTableIcon}
                onChangeDataTableCover={onChangeDataTableCover}
                onRestoreMissingDataTable={onRestoreMissingDataTable}
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
              />
            }
          />
        </Routes>
      </AppErrorBoundary>
    </AppShell>
  )
}

interface PageRouteProps {
  boards: BoardRecord[]
  dataTables: DataTableRecord[]
  mindmaps: MindmapRecord[]
  pages: PageRecord[]
  currentPageId: string | null
  onRoutePageChange: (pageId: string) => Promise<void>
  onRenamePage: (pageId: string, title: string) => Promise<void>
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
  reversibleExport: boolean
  onToggleReversibleExport: (value: boolean) => void
  onExportJson: () => Promise<void>
  onExportMarkdown: (page: PageRecord) => Promise<void>
  onImportJson: (file: File) => Promise<string | null>
  onImportMarkdown: (file: File) => Promise<string | null>
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
  onRoutePageChange,
  onRenamePage,
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
  reversibleExport,
  onToggleReversibleExport,
  onExportJson,
  onExportMarkdown,
  onImportJson,
  onImportMarkdown,
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

  useEffect(() => {
    if (!page || currentPageId === page.id) {
      return
    }

    void onRoutePageChange(page.id)
  }, [currentPageId, onRoutePageChange, page])

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

  return (
    <div
      className={
        outlineVisible ? 'page-with-outline' : 'page-with-outline page-with-outline-hidden'
      }
    >
      {breadcrumbs.length > 1 ? (
        <PageBreadcrumbs items={breadcrumbs} className={pageContentClassName} />
      ) : null}
      <PageHeader
        page={page}
        bodyClassName={pageContentClassName}
        onRename={(title) => {
          void onRenamePage(page.id, title)
        }}
        onChangeIcon={(icon) => {
          void onChangePageIcon(page.id, icon)
        }}
        onChangeCover={(cover) => {
          void onChangePageCover(page.id, cover)
        }}
        actions={
          <ExportImportPanel
            status={saveStatus}
            reversible={reversibleExport}
            adaptiveWidth={page.isFullWidth === true}
            smallText={page.isSmallText === true}
            fontFamily={page.fontFamily ?? 'default'}
            outlineVisible={outlineVisible}
            onToggleReversible={onToggleReversibleExport}
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
            onExportJson={() => void onExportJson()}
            onExportMarkdown={() => void onExportMarkdown(page)}
            onImportJson={async (file) => {
              const nextPageId = await onImportJson(file)
              navigate(nextPageId ? `/pages/${nextPageId}` : '/', { replace: true })
            }}
            onImportMarkdown={async (file) => {
              const nextPageId = await onImportMarkdown(file)
              navigate(nextPageId ? `/pages/${nextPageId}` : '/', { replace: true })
            }}
            onCleanupOrphanBoards={() => void onCleanupOrphanBoards()}
            onCleanupOrphanDataTables={() => void onCleanupOrphanDataTables()}
          />
        }
      />
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
      {outlineVisible ? <PageOutline blocks={page.blocks} /> : null}
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
  route: 'table' | 'record'
  onRoutePageChange: (pageId: string) => Promise<void>
  onUpdateDataTableSnapshot: (databaseId: string, snapshot: unknown) => Promise<void>
  onRenameDataTable: (databaseId: string, title: string) => Promise<void>
  onChangeDataTableIcon: (databaseId: string, icon: string | null) => Promise<void>
  onChangeDataTableCover: (databaseId: string, cover: string | null) => Promise<void>
  onRestoreMissingDataTable: (pageId: string, databaseId: string) => Promise<DataTableRecord | null>
}

function DataTableRoute({
  pages,
  dataTables,
  currentPageId,
  saveStatus,
  route,
  onRoutePageChange,
  onUpdateDataTableSnapshot,
  onRenameDataTable,
  onChangeDataTableIcon,
  onChangeDataTableCover,
  onRestoreMissingDataTable,
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
    <DataTablePage
      page={page}
      dataTable={dataTable}
      saveStatus={saveStatus}
      route={route}
      basePath={basePath}
      breadcrumbs={breadcrumbs}
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
  onDuplicate: () => void
  onExport: () => void
  onImport: (file: File) => void
}

function WhiteboardRouteMenu({ onDuplicate, onExport, onImport }: WhiteboardRouteMenuProps) {
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
              <label className="page-menu-action page-menu-file">
                <span className="page-menu-item-label">导入白板</span>
                <input
                  className="import-input"
                  type="file"
                  accept=".json,application/json"
                  aria-label="导入白板文件"
                  onChange={(event) => {
                    const file = event.target.files?.[0]
                    event.target.value = ''

                    if (!file) {
                      return
                    }

                    setOpen(false)
                    onImport(file)
                  }}
                />
              </label>
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

  async function handleImportBoard(file: File) {
    if (!board) {
      return
    }

    try {
      const payload = normalizeBoardImportPayload(JSON.parse(await file.text()) as unknown)
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
            onDuplicate={() => {
              void handleDuplicateBoard()
            }}
            onExport={() => {
              downloadBlob(
                new Blob(
                  [
                    JSON.stringify(
                      {
                        title: board.title,
                        snapshot: board.snapshot,
                      },
                      null,
                      2,
                    ),
                  ],
                  { type: 'application/json;charset=utf-8' },
                ),
                `${sanitizeFileName(board.title)}.whiteboard.json`,
              )
            }}
            onImport={(file) => {
              void handleImportBoard(file)
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
        <WhiteboardCanvas
          key={board.id}
          board={board}
          onChange={(snapshot) => {
            void onUpdateBoardSnapshot(board.id, snapshot)
          }}
        />
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
}

function MindmapRoute({
  pages,
  mindmaps,
  currentPageId,
  onRoutePageChange,
  onRestoreMissingMindmap,
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
        <div className="mindmap-route-surface" data-mindmap-id={mindmap.id} />
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



export default App

function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = fileName
  anchor.click()
  window.setTimeout(() => {
    URL.revokeObjectURL(url)
  }, 0)
}

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
