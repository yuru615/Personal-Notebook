import { CanvasEntryCard } from '../../shared/CanvasEntryCard'

interface MindmapBlockProps {
  title: string
  updatedLabel: string
  previewUrl: string | null
  isMissing: boolean
  onOpen: () => void
  onRecover?: () => void
}

export function MindmapBlock({
  title,
  updatedLabel,
  previewUrl,
  isMissing,
  onOpen,
  onRecover,
}: MindmapBlockProps) {
  const card = (
    <CanvasEntryCard
      kindLabel="导图"
      title={title}
      meta={updatedLabel}
      emptyPreviewLabel="空白导图"
      openLabel="打开"
      previewUrl={previewUrl}
      isMissing={isMissing}
      onOpen={onOpen}
      className={isMissing ? 'mindmap-card mindmap-card-missing' : 'mindmap-card'}
      previewClassName="mindmap-card-preview"
      bodyClassName="mindmap-card-body"
      titleClassName="mindmap-card-title"
      metaClassName="mindmap-card-meta"
      arrowClassName="mindmap-card-arrow"
      emptyPreviewClassName="mindmap-card-preview-empty"
    />
  )

  if (!isMissing || !onRecover) {
    return card
  }

  return (
    <div className="mindmap-card-shell">
      {card}
      <button type="button" className="mindmap-card-recover" onClick={onRecover}>
        恢复导图
      </button>
    </div>
  )
}
