import { CanvasEntryCard } from '../../shared/CanvasEntryCard'

interface MindmapBlockProps {
  title: string
  updatedLabel: string
  previewUrl: string | null
  isMissing: boolean
  onOpen: () => void
}

export function MindmapBlock({
  title,
  updatedLabel,
  previewUrl,
  isMissing,
  onOpen,
}: MindmapBlockProps) {
  return (
    <CanvasEntryCard
      kindLabel="思维导图"
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
}
