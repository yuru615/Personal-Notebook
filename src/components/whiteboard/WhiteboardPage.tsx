import type { PropsWithChildren, ReactNode } from 'react'
import { useEffect, useState } from 'react'
import type { BoardRecord, PageRecord } from '../../domain/types'

interface WhiteboardPageProps extends PropsWithChildren {
  page: PageRecord
  board: BoardRecord | null
  onBack: () => void
  onRename: (title: string) => void
  actions?: ReactNode
}

const backLabel = '返回页面'
const boardTitleLabel = '白板标题'
const boardSourcePrefix = '来源：'
const missingBoardTitle = '白板不存在'
const missingBoardDescription = '当前引用的白板已不存在'

export function WhiteboardPage({
  page,
  board,
  onBack,
  onRename,
  actions,
  children,
}: WhiteboardPageProps) {
  const [draftTitle, setDraftTitle] = useState(board?.title ?? '')
  const overlayClassName = board ? 'whiteboard-page-overlay-hidden' : ''

  useEffect(() => {
    setDraftTitle(board?.title ?? '')
  }, [board?.title])

  return (
    <section className={board ? 'whiteboard-page whiteboard-page-active' : 'whiteboard-page'}>
      <div className="whiteboard-page-topbar">
        <button
          type="button"
          className="whiteboard-page-back"
          aria-label={backLabel}
          onClick={onBack}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M15 18l-6-6 6-6" />
            <path d="M9 12h8" />
          </svg>
        </button>
      </div>

      {actions ? <div className="whiteboard-page-actions-wrap whiteboard-page-actions-visible">{actions}</div> : null}

      {board ? (
        <>
          <div className={`whiteboard-page-status ${overlayClassName}`.trim()}>
            <input
              aria-label={boardTitleLabel}
              className="whiteboard-page-title-input"
              value={draftTitle}
              onChange={(event) => {
                const nextTitle = event.target.value
                setDraftTitle(nextTitle)
                onRename(nextTitle)
              }}
            />
            <p className="whiteboard-page-meta">{boardSourcePrefix + page.title}</p>
          </div>

          <div className="whiteboard-page-surface">{children}</div>
        </>
      ) : (
        <div className="whiteboard-page-empty">
          <h1 className="whiteboard-page-title-text">{missingBoardTitle}</h1>
          <p className="whiteboard-page-meta">{missingBoardDescription}</p>
        </div>
      )}
    </section>
  )
}
