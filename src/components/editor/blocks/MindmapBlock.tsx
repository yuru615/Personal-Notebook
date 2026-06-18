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
    <button
      type="button"
      className={isMissing ? 'mindmap-card mindmap-card-missing' : 'mindmap-card'}
      aria-label={`打开思维导图 ${title}`}
      onClick={onOpen}
    >
      <span className="mindmap-card-preview" aria-hidden="true">
        {previewUrl ? (
          <img className="mindmap-card-preview-image" src={previewUrl} alt="" />
        ) : (
          <span className="mindmap-card-preview-empty">空白导图</span>
        )}
      </span>
      <span className="mindmap-card-body">
        <span className="mindmap-card-title">{title}</span>
        <span className="mindmap-card-meta">{updatedLabel}</span>
      </span>
      <span className="mindmap-card-arrow" aria-hidden="true">
        打开
      </span>
    </button>
  )
}
