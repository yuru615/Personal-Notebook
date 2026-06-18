import type { PropsWithChildren } from 'react'
import type { MindmapRecord, PageRecord } from '../../domain/types'
import { StructuredCanvasPage } from '../shared/StructuredCanvasPage'

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
  return (
    <StructuredCanvasPage
      backLabel="返回页面"
      sourceLabel="来源"
      titleLabel="思维导图标题"
      sourcePageTitle={page.title}
      title={mindmap?.title ?? null}
      missingTitle="思维导图不存在"
      missingMessage="当前引用的思维导图已不存在"
      onBack={onBack}
      onRename={onRename}
      rootClassName="mindmap-page"
      headerClassName="mindmap-page-header"
      headerMainClassName="mindmap-page-header-main"
      backButtonClassName="mindmap-page-back"
      headingClassName="mindmap-page-heading"
      titleInputClassName="mindmap-page-title-input"
      titleTextClassName="mindmap-page-title-text"
      metaClassName="mindmap-page-meta"
      surfaceClassName="mindmap-page-surface"
      emptyClassName="mindmap-page-empty"
    >
      {children}
    </StructuredCanvasPage>
  )
}
