import type { SaveStatus } from '../../domain/types'
import { uiCopy } from '../../ui/copy'

interface SaveStatusBadgeProps {
  status: SaveStatus
}

export function SaveStatusBadge({ status }: SaveStatusBadgeProps) {
  return (
    <div className={`save-status save-status-${status}`} aria-live="polite">
      {uiCopy.saveStatus[status]}
    </div>
  )
}
