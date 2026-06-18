import { useEffect, useLayoutEffect, useState, useSyncExternalStore } from 'react'
import {
  BrowserRouter,
  MemoryRouter,
  Navigate,
  Route,
  Routes,
  useNavigate,
  useParams,
} from 'react-router-dom'
import { BlockEditor } from '../components/editor/BlockEditor'
import { PageHeader } from '../components/editor/PageHeader'
import { PageOutline } from '../components/editor/PageOutline'
import { ExportImportPanel } from '../components/export/ExportImportPanel'
import { MindmapCanvas } from '../components/mindmap/MindmapCanvas'
import { AppShell } from '../components/layout/AppShell'
import { MindmapPage } from '../components/mindmap/MindmapPage'
import { SearchDialog } from '../components/search/SearchDialog'
import { SidebarTree } from '../components/sidebar/SidebarTree'
import { AppErrorBoundary } from '../components/shared/AppErrorBoundary'
import { WhiteboardCanvas } from '../components/whiteboard/WhiteboardCanvas'
import { WhiteboardPage } from '../components/whiteboard/WhiteboardPage'
import type { BoardRecord, MindmapRecord, PageFontFamily, PageRecord, SaveStatus } from '../domain/types'
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
      if (
        event.isComposing ||
        event.altKey ||
        event.shiftKey ||
        !(event.ctrlKey || event.metaKey) ||
        event.key.toLowerCase() !== 'z'
      ) {
        return
      }

      event.preventDefault()
      void store.getState().undo()
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
      onRenameMindmap={(mindmapId, title) => store.getState().renameMindmap(mindmapId, title)}
      onAddMindmapChildNode={(mindmapId, parentNodeId) =>
        store.getState().addMindmapChildNode(mindmapId, parentNodeId)
      }
      onRenameMindmapNode={(mindmapId, nodeId, text) =>
        store.getState().renameMindmapNode(mindmapId, nodeId, text)
      }
      onAddMindmapSiblingNode={(mindmapId, nodeId) =>
        store.getState().addMindmapSiblingNode(mindmapId, nodeId)
      }
      onDeleteMindmapNode={(mindmapId, nodeId) =>
        store.getState().deleteMindmapNode(mindmapId, nodeId)
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
      onInsertBlock={(pageId, type) => store.getState().insertBlock(pageId, type)}
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
          '知识库备份.json',
        )
      }}
      onExportMarkdown={async (page) => {
        const { buildMarkdownZip } = await import('../domain/markdown')
        const blob = await buildMarkdownZip({
          rootPage: page,
          allPages: store.getState().pages,
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
    />
  )

  if (initialEntries) {
    return <MemoryRouter initialEntries={initialEntries}>{router}</MemoryRouter>
  }

  return <BrowserRouter>{router}</BrowserRouter>
}

interface AppRoutesProps {
  boards: BoardRecord[]
  mindmaps: MindmapRecord[]
  pages: AppState['pages']
  currentPageId: AppState['currentPageId']
  onCreatePage: () => Promise<PageRecord>
  onRoutePageChange: (pageId: string) => Promise<void>
  onRenamePage: (pageId: string, title: string) => Promise<void>
  onRenameBoard: (boardId: string, title: string) => Promise<void>
  onUpdateBoardSnapshot: (boardId: string, snapshot: unknown) => Promise<void>
  onRenameMindmap: (mindmapId: string, title: string) => Promise<void>
  onAddMindmapChildNode: (mindmapId: string, parentNodeId: string) => Promise<void>
  onRenameMindmapNode: (mindmapId: string, nodeId: string, text: string) => Promise<void>
  onAddMindmapSiblingNode: (mindmapId: string, nodeId: string) => Promise<void>
  onDeleteMindmapNode: (mindmapId: string, nodeId: string) => Promise<void>
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
  onInsertBlock: (pageId: string, type: PageRecord['blocks'][number]['type']) => Promise<void>
  onInsertParagraphBlock: (pageId: string, text: string) => Promise<void>
  onInsertBlockAfter: (
    pageId: string,
    blockId: string,
    type: PageRecord['blocks'][number]['type'],
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
    type: PageRecord['blocks'][number]['type'],
  ) => Promise<void>
  saveStatus: SaveStatus
  reversibleExport: boolean
  onToggleReversibleExport: (value: boolean) => void
  onExportJson: () => Promise<void>
  onExportMarkdown: (page: PageRecord) => Promise<void>
  onImportJson: (file: File) => Promise<string | null>
}

function AppRoutes({
  boards,
  mindmaps,
  pages,
  currentPageId,
  onCreatePage,
  onRoutePageChange,
  onRenamePage,
  onRenameBoard,
  onUpdateBoardSnapshot,
  onRenameMindmap,
  onAddMindmapChildNode,
  onRenameMindmapNode,
  onAddMindmapSiblingNode,
  onDeleteMindmapNode,
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
}: AppRoutesProps) {
  const navigate = useNavigate()
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
      sidebar={
        <SidebarTree
          pages={pages}
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
        onClose={() => setIsSearchOpen(false)}
        onOpenPage={(pageId) => navigate(`/pages/${pageId}`)}
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
                onRenameMindmap={onRenameMindmap}
                onAddMindmapChildNode={onAddMindmapChildNode}
                onRenameMindmapNode={onRenameMindmapNode}
                onAddMindmapSiblingNode={onAddMindmapSiblingNode}
                onDeleteMindmapNode={onDeleteMindmapNode}
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
  onInsertBlock: (pageId: string, type: PageRecord['blocks'][number]['type']) => Promise<void>
  onInsertParagraphBlock: (pageId: string, text: string) => Promise<void>
  onInsertBlockAfter: (
    pageId: string,
    blockId: string,
    type: PageRecord['blocks'][number]['type'],
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
    type: PageRecord['blocks'][number]['type'],
  ) => Promise<void>
  saveStatus: SaveStatus
  reversibleExport: boolean
  onToggleReversibleExport: (value: boolean) => void
  onExportJson: () => Promise<void>
  onExportMarkdown: (page: PageRecord) => Promise<void>
  onImportJson: (file: File) => Promise<string | null>
}

function PageRoute({
  boards,
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

  return (
    <div className={outlineVisible ? 'page-with-outline' : 'page-with-outline page-with-outline-hidden'}>
      <div
        className={[
          'page-content',
          `page-content-font-${page.fontFamily ?? 'default'}`,
          page.isFullWidth ? 'page-content-adaptive' : '',
          page.isSmallText ? 'page-content-small-text' : '',
        ]
          .filter(Boolean)
          .join(' ')}
      >
        <PageHeader
          page={page}
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
            />
          }
        />
        <BlockEditor
          page={page}
          allPages={pages}
          boards={boards}
          mindmaps={mindmaps}
          onUpdateBlock={(blockId, nextBlock) => {
            void onUpdateBlock(page.id, blockId, nextBlock)
          }}
          onInsert={(type) => {
            void onInsertBlock(page.id, type)
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
          onTurnInto={(blockId, type) => {
            void onTurnBlockInto(page.id, blockId, type)
          }}
          onOpenChildPage={(childPageId) => {
            navigate(`/pages/${childPageId}`)
          }}
          onOpenWhiteboard={(boardId) => {
            navigate(`/pages/${page.id}/boards/${boardId}`)
          }}
          onOpenMindmap={(mindmapId) => {
            navigate(`/pages/${page.id}/mindmaps/${mindmapId}`)
          }}
        />
      </div>
      {outlineVisible ? <PageOutline blocks={page.blocks} /> : null}
    </div>
  )
}

interface BoardRouteProps {
  pages: PageRecord[]
  boards: BoardRecord[]
  currentPageId: string | null
  onRoutePageChange: (pageId: string) => Promise<void>
  onRenameBoard: (boardId: string, title: string) => Promise<void>
  onUpdateBoardSnapshot: (boardId: string, snapshot: unknown) => Promise<void>
}

function BoardRoute({
  pages,
  boards,
  currentPageId,
  onRoutePageChange,
  onRenameBoard,
  onUpdateBoardSnapshot,
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

  return (
    <WhiteboardPage
      page={page}
      board={board}
      onBack={() => navigate(`/pages/${page.id}`)}
      onRename={(title) => {
        if (board) {
          void onRenameBoard(board.id, title)
        }
      }}
    >
      {board ? (
        <WhiteboardCanvas
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
  onRenameMindmap: (mindmapId: string, title: string) => Promise<void>
  onAddMindmapChildNode: (mindmapId: string, parentNodeId: string) => Promise<void>
  onRenameMindmapNode: (mindmapId: string, nodeId: string, text: string) => Promise<void>
  onAddMindmapSiblingNode: (mindmapId: string, nodeId: string) => Promise<void>
  onDeleteMindmapNode: (mindmapId: string, nodeId: string) => Promise<void>
}

function MindmapRoute({
  pages,
  mindmaps,
  currentPageId,
  onRoutePageChange,
  onRenameMindmap,
  onAddMindmapChildNode,
  onRenameMindmapNode,
  onAddMindmapSiblingNode,
  onDeleteMindmapNode,
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

  return (
    <MindmapPage
      page={page}
      mindmap={mindmap}
      onBack={() => navigate(`/pages/${page.id}`)}
      onRename={(title) => {
        if (mindmap) {
          void onRenameMindmap(mindmap.id, title)
        }
      }}
    >
      {mindmap ? (
        <MindmapCanvas
          mindmap={mindmap}
          onRenameNode={(nodeId, text) => {
            void onRenameMindmapNode(mindmap.id, nodeId, text)
          }}
          onAddChildNode={(nodeId) => {
            void onAddMindmapChildNode(mindmap.id, nodeId)
          }}
          onAddSiblingNode={(nodeId) => {
            void onAddMindmapSiblingNode(mindmap.id, nodeId)
          }}
          onDeleteNode={(nodeId) => {
            void onDeleteMindmapNode(mindmap.id, nodeId)
          }}
        />
      ) : (
        <div className="mindmap-page-empty">思维导图编辑器即将接入</div>
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
