import type { DataTableRecord, PageRecord, SaveStatus } from '../../domain/types'
import {
  PageBreadcrumbs,
  type PageBreadcrumbItem,
} from '../shared/PageBreadcrumbs'
import { AppStoreProvider, type SaveStatus as DataTableSaveStatus } from './store/AppStore'
import TablePage from './components/table/TablePage'
import RecordPage from './components/record/RecordPage'
import { createDefaultAppState } from './domain/factory'
import type { AppState } from './domain/types'
import './styles.css'

interface DataTablePageProps {
  page: PageRecord
  dataTable: DataTableRecord | null
  saveStatus: SaveStatus
  route: 'table' | 'record'
  basePath: string
  breadcrumbs?: PageBreadcrumbItem[]
  onBack: () => void
  onChange: (snapshot: AppState) => void
}

function isDataTableState(value: unknown): value is AppState {
  if (!value || typeof value !== 'object') {
    return false
  }

  const state = value as Partial<AppState>

  return (
    state.version === 1 &&
    !!state.database &&
    typeof state.database === 'object' &&
    !!state.properties &&
    typeof state.properties === 'object' &&
    !!state.records &&
    typeof state.records === 'object'
  )
}

function toDataTableSaveStatus(status: SaveStatus): DataTableSaveStatus {
  return status === 'error' ? 'failed' : status
}

export function DataTablePage({
  page,
  dataTable,
  saveStatus,
  route,
  basePath,
  breadcrumbs = [],
  onBack,
  onChange,
}: DataTablePageProps) {
  const initialState = dataTable && isDataTableState(dataTable.snapshot) ? dataTable.snapshot : createDefaultAppState()

  return (
    <section className="data-table-route-page">
      <div className="data-table-route-topbar">
        <button
          type="button"
          className="data-table-route-back"
          aria-label="返回页面"
          onClick={onBack}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M15 18l-6-6 6-6" />
            <path d="M9 12h8" />
          </svg>
        </button>
      </div>
      <div className="data-table-route-breadcrumb-row">
        <PageBreadcrumbs items={breadcrumbs} />
      </div>
      {dataTable ? (
        <AppStoreProvider
          key={dataTable.id}
          initialState={initialState}
          saveStatus={toDataTableSaveStatus(saveStatus)}
          onChange={onChange}
        >
          {route === 'record' ? (
            <RecordPage basePath={basePath} showSidebar={false} />
          ) : (
            <TablePage basePath={basePath} showSidebar={false} />
          )}
        </AppStoreProvider>
      ) : (
        <div className="data-table-route-missing">
          <h1>数据表格不存在</h1>
          <p>来源：{page.title}</p>
        </div>
      )}
    </section>
  )
}
