import { CanvasEntryCard } from '../../shared/CanvasEntryCard'

interface WhiteboardBlockProps {
  title: string
  updatedLabel: string
  previewUrl: string | null
  isMissing: boolean
  onOpen: () => void
}

export function WhiteboardBlock({
  title,
  updatedLabel,
  previewUrl,
  isMissing,
  onOpen,
}: WhiteboardBlockProps) {
  return (
    <CanvasEntryCard
      kindLabel="白板"
      title={title}
      meta={updatedLabel}
      emptyPreviewLabel="空白白板"
      openLabel="打开"
      previewUrl={previewUrl}
      isMissing={isMissing}
      onOpen={onOpen}
      className={isMissing ? 'whiteboard-card whiteboard-card-missing' : 'whiteboard-card'}
      previewClassName="whiteboard-card-preview"
      bodyClassName="whiteboard-card-body"
      titleClassName="whiteboard-card-title"
      metaClassName="whiteboard-card-meta"
      arrowClassName="whiteboard-card-arrow"
      emptyPreviewClassName="whiteboard-card-preview-empty"
    />
  )
}
