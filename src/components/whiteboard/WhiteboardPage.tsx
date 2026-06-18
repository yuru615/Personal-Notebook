import type { PropsWithChildren } from 'react'
import type { BoardRecord, PageRecord } from '../../domain/types'
import { StructuredCanvasPage } from '../shared/StructuredCanvasPage'

interface WhiteboardPageProps extends PropsWithChildren {
  page: PageRecord
  board: BoardRecord | null
  onBack: () => void
  onRename: (title: string) => void
}

export function WhiteboardPage({
  page,
  board,
  onBack,
  onRename,
  children,
}: WhiteboardPageProps) {
  return (
    <StructuredCanvasPage
      backLabel="返回页面"
      sourceLabel="来源"
      titleLabel="白板标题"
      sourcePageTitle={page.title}
      title={board?.title ?? null}
      missingTitle="白板不存在"
      missingMessage="当前引用的白板已不存在"
      onBack={onBack}
      onRename={onRename}
      rootClassName="whiteboard-page"
      headerClassName="whiteboard-page-header"
      headerMainClassName="whiteboard-page-header-main"
      backButtonClassName="whiteboard-page-back"
      headingClassName="whiteboard-page-heading"
      titleInputClassName="whiteboard-page-title-input"
      titleTextClassName="whiteboard-page-title-text"
      metaClassName="whiteboard-page-meta"
      surfaceClassName="whiteboard-page-surface"
      emptyClassName="whiteboard-page-empty"
    >
      {children}
    </StructuredCanvasPage>
  )
}
