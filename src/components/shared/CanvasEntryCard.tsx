import type { ReactNode } from 'react'

interface CanvasEntryCardProps {
  kindLabel: string
  title: string
  meta: string
  emptyPreviewLabel: string
  openLabel: string
  onOpen: () => void
  previewUrl?: string | null
  isMissing?: boolean
  className?: string
  previewClassName?: string
  bodyClassName?: string
  titleClassName?: string
  metaClassName?: string
  arrowClassName?: string
  emptyPreviewClassName?: string
  previewContent?: ReactNode
  bodyContent?: ReactNode
}

function joinClassNames(...parts: Array<string | undefined | false>) {
  return parts.filter(Boolean).join(' ')
}

export function CanvasEntryCard({
  kindLabel,
  title,
  meta,
  emptyPreviewLabel,
  openLabel,
  onOpen,
  previewUrl = null,
  isMissing = false,
  className,
  previewClassName,
  bodyClassName,
  titleClassName,
  metaClassName,
  arrowClassName,
  emptyPreviewClassName,
  previewContent,
  bodyContent,
}: CanvasEntryCardProps) {
  return (
    <button
      type="button"
      className={joinClassNames('canvas-entry-card', className, isMissing && 'canvas-entry-card-missing')}
      data-missing={isMissing ? 'true' : undefined}
      aria-label={`${openLabel}${kindLabel} ${title}`}
      onClick={isMissing ? undefined : onOpen}
      disabled={isMissing}
    >
      <span className={joinClassNames('canvas-entry-card-preview', previewClassName)} aria-hidden="true">
        {previewContent ??
          (previewUrl ? (
            <img className="canvas-entry-preview-image" src={previewUrl} alt="" />
          ) : (
            <span
              className={joinClassNames('canvas-entry-card-preview-empty', emptyPreviewClassName)}
            >
              {emptyPreviewLabel}
            </span>
          ))}
      </span>
      <span className={joinClassNames('canvas-entry-card-body', bodyClassName)}>
        <span className={joinClassNames('canvas-entry-card-title', titleClassName)}>{title}</span>
        <span className={joinClassNames('canvas-entry-card-meta', metaClassName)}>{meta}</span>
        {bodyContent}
      </span>
      {isMissing ? null : (
        <span className={joinClassNames('canvas-entry-card-arrow', arrowClassName)} aria-hidden="true">
          {openLabel}
        </span>
      )}
    </button>
  )
}
