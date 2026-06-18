import type { PropsWithChildren } from 'react'
import { useEffect, useState } from 'react'

interface StructuredCanvasPageProps extends PropsWithChildren {
  backLabel: string
  sourceLabel: string
  titleLabel: string
  sourcePageTitle: string
  title: string | null
  missingTitle: string
  missingMessage: string
  onBack: () => void
  onRename: (title: string) => void
  rootClassName?: string
  headerClassName?: string
  headerMainClassName?: string
  backButtonClassName?: string
  headingClassName?: string
  titleInputClassName?: string
  titleTextClassName?: string
  metaClassName?: string
  surfaceClassName?: string
  emptyClassName?: string
}

export function StructuredCanvasPage({
  backLabel,
  sourceLabel,
  titleLabel,
  sourcePageTitle,
  title,
  missingTitle,
  missingMessage,
  onBack,
  onRename,
  children,
  rootClassName = 'structured-canvas-page',
  headerClassName = 'structured-canvas-page-header',
  headerMainClassName = 'structured-canvas-page-header-main',
  backButtonClassName = 'structured-canvas-page-back',
  headingClassName = 'structured-canvas-page-heading',
  titleInputClassName = 'structured-canvas-page-title-input',
  titleTextClassName = 'structured-canvas-page-title-text',
  metaClassName = 'structured-canvas-page-meta',
  surfaceClassName = 'structured-canvas-page-surface',
  emptyClassName = 'structured-canvas-page-empty',
}: StructuredCanvasPageProps) {
  const [draftTitle, setDraftTitle] = useState(title ?? '')

  useEffect(() => {
    setDraftTitle(title ?? '')
  }, [title])

  return (
    <section className={rootClassName}>
      <header className={headerClassName}>
        <div className={headerMainClassName}>
          <button type="button" className={backButtonClassName} onClick={onBack}>
            {backLabel}
          </button>
          <div className={headingClassName}>
            {title !== null ? (
              <input
                aria-label={titleLabel}
                className={titleInputClassName}
                value={draftTitle}
                onChange={(event) => {
                  const nextTitle = event.target.value
                  setDraftTitle(nextTitle)
                  onRename(nextTitle)
                }}
              />
            ) : (
              <h1 className={titleTextClassName}>{missingTitle}</h1>
            )}
            <p className={metaClassName}>
              {sourceLabel}：{sourcePageTitle}
            </p>
          </div>
        </div>
      </header>
      <div className={surfaceClassName}>
        {title !== null ? children : <div className={emptyClassName}>{missingMessage}</div>}
      </div>
    </section>
  )
}
