import type { PropsWithChildren, ReactNode } from 'react'
import { useEffect, useState } from 'react'
import type { MindmapRecord, PageRecord } from '../../domain/types'

interface MindmapPageProps extends PropsWithChildren {
  page: PageRecord
  mindmap: MindmapRecord | null
  onBack: () => void
  onRename: (title: string) => void
  actions?: ReactNode
}

const backLabel = '返回页面'
const mindmapTitleLabel = '思维导图标题'
const mindmapSourcePrefix = '来源：'
const missingMindmapTitle = '思维导图不存在'
const missingMindmapDescription = '当前引用的思维导图已不存在'

export function MindmapPage({
  page,
  mindmap,
  onBack,
  onRename,
  actions,
  children,
}: MindmapPageProps) {
  const [draftTitle, setDraftTitle] = useState(mindmap?.title ?? '')
  const overlayClassName = mindmap ? 'mindmap-page-overlay-hidden' : ''

  useEffect(() => {
    setDraftTitle(mindmap?.title ?? '')
  }, [mindmap?.title])

  return (
    <section className={mindmap ? 'mindmap-page mindmap-page-active' : 'mindmap-page'}>
      <div className="mindmap-page-topbar">
        <button
          type="button"
          className="mindmap-page-back"
          aria-label={backLabel}
          onClick={onBack}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M15 18l-6-6 6-6" />
            <path d="M9 12h8" />
          </svg>
        </button>
      </div>

      {actions ? (
        <div className="mindmap-page-actions-wrap mindmap-page-actions-visible">{actions}</div>
      ) : null}

      {mindmap ? (
        <>
          <div className={`mindmap-page-status ${overlayClassName}`.trim()}>
            <input
              aria-label={mindmapTitleLabel}
              className="mindmap-page-title-input"
              value={draftTitle}
              onChange={(event) => {
                const nextTitle = event.target.value
                setDraftTitle(nextTitle)
                onRename(nextTitle)
              }}
            />
            <p className="mindmap-page-meta">{mindmapSourcePrefix + page.title}</p>
          </div>

          <div className="mindmap-page-surface">{children}</div>
        </>
      ) : (
        <div className="mindmap-page-empty">
          <h1 className="mindmap-page-title-text">{missingMindmapTitle}</h1>
          <p className="mindmap-page-meta">{missingMindmapDescription}</p>
        </div>
      )}
    </section>
  )
}
