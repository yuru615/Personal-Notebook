import { CanvasEntryCard } from '../../shared/CanvasEntryCard'

interface DataTableBlockProps {
  title: string
  updatedLabel: string
  recordTitles?: string[]
  previewColumns?: string[]
  previewRows?: string[]
  isMissing: boolean
  onOpen: () => void
  onRecover?: () => void
}

function DataTablePreview({
  columns,
  rows,
}: {
  columns: string[]
  rows: string[]
}) {
  const previewColumns = columns.slice(0, 3)
  const previewRows = rows.slice(0, 2)

  while (previewColumns.length < 3) {
    previewColumns.push('')
  }

  while (previewRows.length < 2) {
    previewRows.push('')
  }

  return (
    <span className="data-table-card-preview-grid" aria-hidden="true">
      {previewColumns.map((column, index) => (
        <span key={`column-${index}`} className="data-table-card-preview-cell data-table-card-preview-heading">
          {column}
        </span>
      ))}
      {previewRows.flatMap((row, rowIndex) =>
        previewColumns.map((_, columnIndex) => (
          <span key={`row-${rowIndex}-${columnIndex}`} className="data-table-card-preview-cell">
            {columnIndex === 0 ? row : ''}
          </span>
        )),
      )}
    </span>
  )
}

export function DataTableBlock({
  title,
  updatedLabel,
  recordTitles = [],
  previewColumns = [],
  previewRows = [],
  isMissing,
  onOpen,
  onRecover,
}: DataTableBlockProps) {
  const card = (
    <CanvasEntryCard
      kindLabel="数据表格"
      title={title}
      meta={updatedLabel}
      emptyPreviewLabel="空白数据表格"
      openLabel="打开"
      isMissing={isMissing}
      onOpen={onOpen}
      className={isMissing ? 'data-table-card data-table-card-missing' : 'data-table-card'}
      previewClassName="data-table-card-preview"
      bodyClassName="data-table-card-body"
      titleClassName="data-table-card-title"
      metaClassName="data-table-card-meta"
      arrowClassName="data-table-card-arrow"
      emptyPreviewClassName="data-table-card-preview-empty"
      previewContent={<DataTablePreview columns={previewColumns} rows={previewRows} />}
      bodyContent={
        recordTitles.length > 0 ? (
          <span className="data-table-card-records" aria-label="数据表格记录预览">
            {recordTitles.map((recordTitle) => (
              <span key={recordTitle} className="data-table-card-record">
                {recordTitle}
              </span>
            ))}
          </span>
        ) : null
      }
    />
  )

  if (!isMissing || !onRecover) {
    return card
  }

  return (
    <div className="data-table-card-shell">
      {card}
      <button type="button" className="data-table-card-recover" onClick={onRecover}>
        重建数据表格
      </button>
    </div>
  )
}
