import { useMemo, useRef } from 'react'
import { NavLink } from 'react-router-dom'
import type { BoardRecord, PageId, PageRecord } from '../../domain/types'
import { uiCopy } from '../../ui/copy'
import { buildVisiblePageItems } from '../../utils/pageTree'

const RECENT_WHITEBOARDS_LABEL = '\u6700\u8fd1\u767d\u677f'

interface SidebarTreeProps {
  pages: PageRecord[]
  boards?: BoardRecord[]
  currentPageId: PageId | null
  onCreatePage: () => void
  onSearch?: () => void
  onReorderPage?: (activePageId: PageId, overPageId: PageId) => void
}

export function SidebarTree({
  pages,
  boards = [],
  currentPageId,
  onCreatePage,
  onSearch,
  onReorderPage,
}: SidebarTreeProps) {
  const visiblePages = useMemo(() => buildVisiblePageItems(pages, {}), [pages])
  const recentBoards = useMemo(() => buildRecentBoards(pages, boards), [boards, pages])
  const draggingPageId = useRef<string | null>(null)

  return (
    <>
      <div className="sidebar-group">
        <button type="button" className="sidebar-link" onClick={onSearch}>
          {uiCopy.sidebar.search}
        </button>
        <NavLink
          to={currentPageId ? `/pages/${currentPageId}` : '/'}
          className={({ isActive }) => getSidebarItemClassName(isActive)}
        >
          {uiCopy.sidebar.home}
        </NavLink>
      </div>

      <div className="sidebar-group">
        <button type="button" className="sidebar-link" onClick={onCreatePage}>
          {uiCopy.sidebar.newPage}
        </button>
      </div>

      {recentBoards.length > 0 ? (
        <div className="sidebar-group">
          <div className="sidebar-section-title">{RECENT_WHITEBOARDS_LABEL}</div>
          <div className="sidebar-tree" aria-label={RECENT_WHITEBOARDS_LABEL}>
            {recentBoards.map(({ board, pageId }) => (
              <NavLink
                key={board.id}
                to={`/pages/${pageId}/boards/${board.id}`}
                className={({ isActive }) => getSidebarItemClassName(isActive)}
              >
                <span className="sidebar-tree-icon" aria-hidden="true">
                  {'\u25a1'}
                </span>
                <span className="sidebar-tree-label">{board.title}</span>
              </NavLink>
            ))}
          </div>
        </div>
      ) : null}

      <nav className="sidebar-tree" aria-label={uiCopy.sidebar.pageTree}>
        {visiblePages.map(({ page, depth }) => (
          <div
            key={page.id}
            className="sidebar-tree-row"
            onDragOver={(event) => event.preventDefault()}
            onDrop={() => {
              if (draggingPageId.current && draggingPageId.current !== page.id) {
                onReorderPage?.(draggingPageId.current, page.id)
              }
              draggingPageId.current = null
            }}
          >
            <NavLink
              to={`/pages/${page.id}`}
              className={({ isActive }) => getSidebarItemClassName(isActive)}
              style={{ paddingLeft: `${10 + depth * 16}px` }}
              draggable
              onDragStart={() => {
                draggingPageId.current = page.id
              }}
            >
              <span className="sidebar-tree-icon" aria-hidden="true">
                {page.icon ?? '📄'}
              </span>
              <span className="sidebar-tree-label">{page.title}</span>
            </NavLink>
          </div>
        ))}
      </nav>
    </>
  )
}

function getSidebarItemClassName(isActive: boolean) {
  return isActive ? 'sidebar-link sidebar-link-active' : 'sidebar-link'
}

function buildRecentBoards(pages: PageRecord[], boards: BoardRecord[]) {
  const pageIdsByBoardId = new Map<string, string>()

  for (const page of pages) {
    for (const block of page.blocks) {
      if (block.type === 'whiteboard' && !pageIdsByBoardId.has(block.boardId)) {
        pageIdsByBoardId.set(block.boardId, page.id)
      }
    }
  }

  return boards
    .filter((board) => pageIdsByBoardId.has(board.id))
    .sort((left, right) => getUpdatedAt(right.updatedAt) - getUpdatedAt(left.updatedAt))
    .map((board) => ({
      board,
      pageId: pageIdsByBoardId.get(board.id) ?? pages[0]?.id ?? '',
    }))
}

function getUpdatedAt(value: string) {
  const timestamp = Date.parse(value)
  return Number.isFinite(timestamp) ? timestamp : 0
}
