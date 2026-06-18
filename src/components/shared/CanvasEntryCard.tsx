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
}: CanvasEntryCardProps) {
  return (
    <button
      type="button"
      className={className}
      data-missing={isMissing ? 'true' : undefined}
      aria-label={`${openLabel}${kindLabel} ${title}`}
      onClick={onOpen}
    >
      <span className={previewClassName} aria-hidden="true">
        {previewContent ??
          (previewUrl ? (
            <img className="canvas-entry-preview-image" src={previewUrl} alt="" />
          ) : (
            <span className={emptyPreviewClassName}>{emptyPreviewLabel}</span>
          ))}
      </span>
      <span className={bodyClassName}>
        <span className={titleClassName}>{title}</span>
        <span className={metaClassName}>{meta}</span>
      </span>
      <span className={arrowClassName} aria-hidden="true">
        {openLabel}
      </span>
    </button>
  )
}
