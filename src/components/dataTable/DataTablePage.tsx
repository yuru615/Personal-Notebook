import { useEffect, type ReactNode } from 'react'
import type { DataTableRecord, PageRecord, SaveStatus } from '../../domain/types'
import {
  PageBreadcrumbs,
  type PageBreadcrumbItem,
} from '../shared/PageBreadcrumbs'
import { PageHeader } from '../editor/PageHeader'
import { AppStoreProvider, type SaveStatus as DataTableSaveStatus } from './store/AppStore'
import TablePage from './components/table/TablePage'
import RecordPage from './components/record/RecordPage'
import { getDataTableInitialState } from './domain/appState'
import type { AppState } from './domain/types'
import './styles.css'

interface DataTablePageProps {
  page: PageRecord
  dataTable: DataTableRecord | null
  saveStatus: SaveStatus
  route: 'table' | 'record'
  basePath: string
  breadcrumbs?: PageBreadcrumbItem[]
  headerActions?: ReactNode
  adaptiveWidth?: boolean
  onChange: (snapshot: AppState) => void
  onRename: (title: string) => void
  onChangeIcon: (icon: string | null) => void
  onChangeCover: (cover: string | null) => void
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
  headerActions,
  adaptiveWidth = false,
  onChange,
  onRename,
  onChangeIcon,
  onChangeCover,
}: DataTablePageProps) {
  const initialState = dataTable
    ? getDataTableInitialState(dataTable.snapshot, dataTable.title)
    : getDataTableInitialState(null, '')
  const dataTableHeaderPage: PageRecord | null = dataTable
    ? {
        id: dataTable.id,
        parentId: page.id,
        title: dataTable.title.trim() || '数据表格',
        icon: dataTable.icon ?? null,
        cover: dataTable.cover ?? null,
        blocks: [],
        createdAt: dataTable.createdAt,
        updatedAt: dataTable.updatedAt,
      }
    : null

  useEffect(() => {
    try {
      window.scrollTo({ top: 0, left: 0 })
    } catch {
      // jsdom exposes scrollTo but does not implement it.
    }
  }, [dataTable?.id, route])

  return (
    <section className={adaptiveWidth ? 'data-table-route-page data-table-route-page-adaptive' : 'data-table-route-page'}>
      <div className="data-table-route-breadcrumb-row">
        <PageBreadcrumbs items={breadcrumbs} />
      </div>
      {dataTable ? (
        <>
          {route === 'table' && dataTableHeaderPage ? (
            <div className="data-table-route-page-header">
              <PageHeader
                page={dataTableHeaderPage}
                bodyClassName="data-table-route-header-body"
                onRename={onRename}
                onChangeIcon={onChangeIcon}
                onChangeCover={onChangeCover}
                actions={headerActions}
              />
            </div>
          ) : null}
          <AppStoreProvider
            key={`${dataTable.id}:${dataTable.title}`}
            initialState={initialState}
            saveStatus={toDataTableSaveStatus(saveStatus)}
            onChange={onChange}
          >
            {route === 'record' ? (
              <RecordPage basePath={basePath} showSidebar={false} />
            ) : (
              <TablePage basePath={basePath} showSidebar={false} showHeader={false} />
            )}
          </AppStoreProvider>
        </>
      ) : (
        <div className="data-table-route-missing">
          <h1>数据表格不存在</h1>
          <p>来源：{page.title}</p>
        </div>
      )}
    </section>
  )
}
