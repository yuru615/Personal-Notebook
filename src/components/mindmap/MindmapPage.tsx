import type { PropsWithChildren } from 'react'
import type { MindmapRecord, PageRecord } from '../../domain/types'

interface MindmapPageProps extends PropsWithChildren {
  page: PageRecord
  mindmap: MindmapRecord | null
  onBack: () => void
}

const backLabel = '返回页面'
const missingMindmapTitle = '导图不存在'
const missingMindmapDescription = '当前引用的导图已不存在'

export function MindmapPage({ page, mindmap, onBack, children }: MindmapPageProps) {
  return (
    <section className={mindmap ? 'mindmap-page mindmap-page-active' : 'mindmap-page'}>
      <div className="mindmap-page-topbar">
        <button type="button" className="mindmap-page-back" aria-label={backLabel} onClick={onBack}>
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M15 18l-6-6 6-6" />
            <path d="M9 12h8" />
          </svg>
        </button>
      </div>

      {mindmap ? (
        <div className="mindmap-page-surface" data-page-id={page.id}>
          {children}
        </div>
      ) : (
        <div className="mindmap-page-empty">
          <h1 className="mindmap-page-title-text">{missingMindmapTitle}</h1>
          <p className="mindmap-page-meta">{missingMindmapDescription}</p>
        </div>
      )}
    </section>
  )
}
