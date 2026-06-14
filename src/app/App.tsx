import { useEffect, useState, useSyncExternalStore } from 'react'
import {
  BrowserRouter,
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
import { createDexieWorkspaceRepository } from '../lib/workspaceRepository'
import { createWorkspaceStore } from '../store/createWorkspaceStore'
import { uiCopy } from '../ui/copy'

type AppState = ReturnType<ReturnType<typeof createWorkspaceStore>['getState']>

export function App() {
  const [store] = useState(() => createWorkspaceStore(createDexieWorkspaceRepository()))
  const state = useSyncExternalStore(store.subscribe, store.getState, store.getState)
  const [isBootstrapped, setIsBootstrapped] = useState(false)

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

  return (
    <BrowserRouter>
      <AppRoutes
        pages={state.pages}
        currentPageId={state.currentPageId}
        onCreatePage={() => store.getState().createPage()}
      />
    </BrowserRouter>
  )
}

interface AppRoutesProps {
  pages: AppState['pages']
  currentPageId: AppState['currentPageId']
  onCreatePage: () => Promise<PageRecord>
}

function AppRoutes({ pages, currentPageId, onCreatePage }: AppRoutesProps) {
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
        <Route path="/pages/:pageId" element={<PageRoute pages={pages} />} />
      </Routes>
    </AppShell>
  )
}

function PageRoute({ pages }: { pages: PageRecord[] }) {
  const { pageId } = useParams()
  const page = pages.find((item) => item.id === pageId)

  if (!page) {
    return <div className="page-empty">{uiCopy.app.pageNotFound}</div>
  }

  return (
    <div className="page-content">
      <PageHeader page={page} />
      <BlockEditor blocks={page.blocks} />
    </div>
  )
}

export default App
