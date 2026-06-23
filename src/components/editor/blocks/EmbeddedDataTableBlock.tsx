import { useCallback } from 'react'
import type { DataTableRecord } from '../../../domain/types'
import { createDefaultAppState } from '../../dataTable/domain/factory'
import type { AppState } from '../../dataTable/domain/types'
import TablePage from '../../dataTable/components/table/TablePage'
import { AppStoreProvider } from '../../dataTable/store/AppStore'
import '../../dataTable/styles.css'

interface EmbeddedDataTableBlockProps {
  dataTable: DataTableRecord
  basePath: string
  onOpen?: () => void
  onChange?: (snapshot: AppState) => void
}

function isDataTableState(value: unknown): value is AppState {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
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

function getInitialState(dataTable: DataTableRecord) {
  if (isDataTableState(dataTable.snapshot)) {
    return dataTable.snapshot
  }

  const fallback = createDefaultAppState()
  fallback.database.name = dataTable.title
  return fallback
}

export function EmbeddedDataTableBlock({
  dataTable,
  basePath,
  onOpen,
  onChange,
}: EmbeddedDataTableBlockProps) {
  const handleChange = useCallback(
    (snapshot: AppState) => {
      onChange?.(snapshot)
    },
    [onChange],
  )

  return (
    <div className="data-table-embed">
      <div className="data-table-embed-actions">
        <button type="button" className="data-table-embed-open" onClick={onOpen}>
          打开整页
        </button>
      </div>
      <AppStoreProvider
        key={dataTable.id}
        initialState={getInitialState(dataTable)}
        saveStatus="saved"
        onChange={handleChange}
      >
        <TablePage basePath={basePath} showSidebar={false} isEmbedded />
      </AppStoreProvider>
    </div>
  )
}
