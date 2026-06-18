import type { PropsWithChildren } from 'react'
import { useEffect, useState } from 'react'
import type { MindmapRecord, PageRecord } from '../../domain/types'

interface MindmapPageProps extends PropsWithChildren {
  page: PageRecord
  mindmap: MindmapRecord | null
  onBack: () => void
  onRename: (title: string) => void
}

export function MindmapPage({
  page,
  mindmap,
  onBack,
  onRename,
  children,
}: MindmapPageProps) {
  const [draftTitle, setDraftTitle] = useState(mindmap?.title ?? '')

  useEffect(() => {
    setDraftTitle(mindmap?.title ?? '')
  }, [mindmap?.title])

  return (
    <section className="mindmap-page">
      <header className="mindmap-page-header">
        <div className="mindmap-page-header-main">
          <button type="button" className="mindmap-page-back" onClick={onBack}>
            返回页面
          </button>
          <div className="mindmap-page-heading">
            {mindmap ? (
              <input
                aria-label="思维导图标题"
                className="mindmap-page-title-input"
                value={draftTitle}
                onChange={(event) => {
                  const nextTitle = event.target.value
                  setDraftTitle(nextTitle)
                  onRename(nextTitle)
                }}
              />
            ) : (
              <h1 className="mindmap-page-title-text">思维导图不存在</h1>
            )}
            <p className="mindmap-page-meta">来源：{page.title}</p>
          </div>
        </div>
      </header>
      <div className="mindmap-page-surface">
        {mindmap ? children : <div className="mindmap-page-empty">当前引用的思维导图已不存在</div>}
      </div>
    </section>
  )
}
