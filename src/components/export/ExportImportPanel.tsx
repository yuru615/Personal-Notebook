import { uiCopy } from '../../ui/copy'

interface ExportImportPanelProps {
  reversible: boolean
  onToggleReversible: (value: boolean) => void
  onExportJson: () => void | Promise<void>
  onExportMarkdown: () => void | Promise<void>
  onImportJson: (file: File) => void | Promise<void>
}

export function ExportImportPanel({
  reversible,
  onToggleReversible,
  onExportJson,
  onExportMarkdown,
  onImportJson,
}: ExportImportPanelProps) {
  return (
    <div className="export-panel">
      <label className="reversible-toggle">
        <input
          type="checkbox"
          checked={reversible}
          onChange={(event) => onToggleReversible(event.target.checked)}
        />
        {uiCopy.export.reversible}
      </label>
      <button type="button" className="export-action" onClick={() => void onExportJson()}>
        {uiCopy.export.json}
      </button>
      <button type="button" className="export-action" onClick={() => void onExportMarkdown()}>
        {uiCopy.export.markdown}
      </button>
      <label className="export-action import-action">
        {uiCopy.export.import}
        <input
          type="file"
          accept=".json,application/json"
          className="import-input"
          onChange={(event) => {
            const file = event.target.files?.[0]

            if (!file) {
              return
            }

            if (window.confirm(uiCopy.export.importConfirm)) {
              void onImportJson(file)
            }

            event.target.value = ''
          }}
        />
      </label>
    </div>
  )
}
