import type { PropsWithChildren, ReactNode } from 'react'
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
  actions?: ReactNode
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

function joinClassNames(...parts: Array<string | undefined>) {
  return parts.filter(Boolean).join(' ')
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
  actions,
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
    <section className={joinClassNames('structured-canvas-page', rootClassName)}>
      <header className={joinClassNames('structured-canvas-page-header', headerClassName)}>
        <div
          className={joinClassNames(
            'structured-canvas-page-header-main',
            headerMainClassName,
          )}
        >
          <button
            type="button"
            className={joinClassNames('structured-canvas-page-back', backButtonClassName)}
            onClick={onBack}
          >
            {backLabel}
          </button>
          <div className={joinClassNames('structured-canvas-page-heading', headingClassName)}>
            {title !== null ? (
              <input
                aria-label={titleLabel}
                className={joinClassNames(
                  'structured-canvas-page-title-input',
                  titleInputClassName,
                )}
                value={draftTitle}
                onChange={(event) => {
                  const nextTitle = event.target.value
                  setDraftTitle(nextTitle)
                  onRename(nextTitle)
                }}
              />
            ) : (
              <h1 className={joinClassNames('structured-canvas-page-title-text', titleTextClassName)}>
                {missingTitle}
              </h1>
            )}
            <p className={joinClassNames('structured-canvas-page-meta', metaClassName)}>
              {sourceLabel}：{sourcePageTitle}
            </p>
          </div>
        </div>
        {actions}
      </header>
      <div className={joinClassNames('structured-canvas-page-surface', surfaceClassName)}>
        {title !== null ? (
          children
        ) : (
          <div className={joinClassNames('structured-canvas-page-empty', emptyClassName)}>
            {missingMessage}
          </div>
        )}
      </div>
    </section>
  )
}
