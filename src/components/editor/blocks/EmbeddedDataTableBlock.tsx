import { useCallback } from 'react'
import type { DataTableRecord } from '../../../domain/types'
import { getDataTableInitialState } from '../../dataTable/domain/appState'
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

function getInitialState(dataTable: DataTableRecord) {
  return getDataTableInitialState(dataTable.snapshot, dataTable.title)
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
