import { useEffect, useState, useSyncExternalStore } from 'react'
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
import { AppShell } from '../components/layout/AppShell'
import { SidebarTree } from '../components/sidebar/SidebarTree'
import type { PageRecord } from '../domain/types'
import {
  createDexieWorkspaceRepository,
  type WorkspaceRepository,
} from '../lib/workspaceRepository'
import { createWorkspaceStore } from '../store/createWorkspaceStore'
import { uiCopy } from '../ui/copy'

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

  if (!isBootstrapped) {
    return <div className="page-empty">{uiCopy.app.loading}</div>
  }

  const router = (
    <AppRoutes
      pages={state.pages}
      currentPageId={state.currentPageId}
      onCreatePage={() => store.getState().createPage()}
      onRoutePageChange={setCurrentPage}
      onRenamePage={(pageId, title) => store.getState().renamePage(pageId, title)}
      onUpdateBlock={(pageId, blockId, nextBlock) => store.getState().updateBlock(pageId, blockId, nextBlock)}
      onInsertBlock={(pageId, type) => store.getState().insertBlock(pageId, type)}
      onReorderPage={(activePageId, overPageId) =>
        store.getState().reorderPages(activePageId, overPageId)
      }
      onReorderBlock={(pageId, activeBlockId, overBlockId) =>
        store.getState().reorderBlocks(pageId, activeBlockId, overBlockId)
      }
      onDeleteBlock={(pageId, blockId) => store.getState().deleteBlock(pageId, blockId)}
      onDuplicateBlock={(pageId, blockId) => store.getState().duplicateBlock(pageId, blockId)}
      onTurnBlockInto={(pageId, blockId, type) =>
        store.getState().turnBlockInto(pageId, blockId, type)
      }
    />
  )

  if (initialEntries) {
    return <MemoryRouter initialEntries={initialEntries}>{router}</MemoryRouter>
  }

  return <BrowserRouter>{router}</BrowserRouter>
}

interface AppRoutesProps {
  pages: AppState['pages']
  currentPageId: AppState['currentPageId']
  onCreatePage: () => Promise<PageRecord>
  onRoutePageChange: (pageId: string) => Promise<void>
  onRenamePage: (pageId: string, title: string) => Promise<void>
  onUpdateBlock: (pageId: string, blockId: string, nextBlock: PageRecord['blocks'][number]) => Promise<void>
  onInsertBlock: (pageId: string, type: PageRecord['blocks'][number]['type']) => Promise<void>
  onReorderPage: (activePageId: string, overPageId: string) => Promise<void>
  onReorderBlock: (pageId: string, activeBlockId: string, overBlockId: string) => Promise<void>
  onDeleteBlock: (pageId: string, blockId: string) => Promise<void>
  onDuplicateBlock: (pageId: string, blockId: string) => Promise<void>
  onTurnBlockInto: (
    pageId: string,
    blockId: string,
    type: PageRecord['blocks'][number]['type'],
  ) => Promise<void>
}

function AppRoutes({
  pages,
  currentPageId,
  onCreatePage,
  onRoutePageChange,
  onRenamePage,
  onUpdateBlock,
  onInsertBlock,
  onReorderPage,
  onReorderBlock,
  onDeleteBlock,
  onDuplicateBlock,
  onTurnBlockInto,
}: AppRoutesProps) {
  const navigate = useNavigate()

  async function handleCreatePage() {
    const page = await onCreatePage()
    navigate(`/pages/${page.id}`)
  }

  return (
    <AppShell
      sidebar={
        <SidebarTree
          pages={pages}
          currentPageId={currentPageId}
          onCreatePage={() => {
            void handleCreatePage()
          }}
          onReorderPage={(activePageId, overPageId) => {
            void onReorderPage(activePageId, overPageId)
          }}
        />
      }
    >
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
              pages={pages}
              currentPageId={currentPageId}
              onRoutePageChange={onRoutePageChange}
              onRenamePage={onRenamePage}
              onUpdateBlock={onUpdateBlock}
              onInsertBlock={onInsertBlock}
              onReorderBlock={onReorderBlock}
              onDeleteBlock={onDeleteBlock}
              onDuplicateBlock={onDuplicateBlock}
              onTurnBlockInto={onTurnBlockInto}
            />
          }
        />
      </Routes>
    </AppShell>
  )
}

interface PageRouteProps {
  pages: PageRecord[]
  currentPageId: string | null
  onRoutePageChange: (pageId: string) => Promise<void>
  onRenamePage: (pageId: string, title: string) => Promise<void>
  onUpdateBlock: (pageId: string, blockId: string, nextBlock: PageRecord['blocks'][number]) => Promise<void>
  onInsertBlock: (pageId: string, type: PageRecord['blocks'][number]['type']) => Promise<void>
  onReorderBlock: (pageId: string, activeBlockId: string, overBlockId: string) => Promise<void>
  onDeleteBlock: (pageId: string, blockId: string) => Promise<void>
  onDuplicateBlock: (pageId: string, blockId: string) => Promise<void>
  onTurnBlockInto: (
    pageId: string,
    blockId: string,
    type: PageRecord['blocks'][number]['type'],
  ) => Promise<void>
}

function PageRoute({
  pages,
  currentPageId,
  onRoutePageChange,
  onRenamePage,
  onUpdateBlock,
  onInsertBlock,
  onReorderBlock,
  onDeleteBlock,
  onDuplicateBlock,
  onTurnBlockInto,
}: PageRouteProps) {
  const { pageId } = useParams()
  const page = pages.find((item) => item.id === pageId)

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
    <div className="page-content">
      <PageHeader
        page={page}
        onRename={(title) => {
          void onRenamePage(page.id, title)
        }}
      />
      <BlockEditor
        page={page}
        allPages={pages}
        onUpdateBlock={(blockId, nextBlock) => {
          void onUpdateBlock(page.id, blockId, nextBlock)
        }}
        onInsert={(type) => {
          void onInsertBlock(page.id, type)
        }}
        onReorderBlock={(activeBlockId, overBlockId) => {
          void onReorderBlock(page.id, activeBlockId, overBlockId)
        }}
        onDeleteBlock={(blockId) => {
          void onDeleteBlock(page.id, blockId)
        }}
        onDuplicateBlock={(blockId) => {
          void onDuplicateBlock(page.id, blockId)
        }}
        onTurnInto={(blockId, type) => {
          void onTurnBlockInto(page.id, blockId, type)
        }}
      />
    </div>
  )
}

export default App
