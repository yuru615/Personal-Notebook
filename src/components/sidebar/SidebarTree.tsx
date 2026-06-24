import { useMemo, useRef } from 'react'
import { NavLink } from 'react-router-dom'
import type { BoardRecord, DataTableRecord, PageId, PageRecord } from '../../domain/types'
import { uiCopy } from '../../ui/copy'
import { buildVisiblePageItems } from '../../utils/pageTree'

const RECENT_WHITEBOARDS_LABEL = '\u6700\u8fd1\u767d\u677f'
const DATA_TABLE_ICON = '\u25a6'

interface SidebarTreeProps {
  pages: PageRecord[]
  boards?: BoardRecord[]
  dataTables?: DataTableRecord[]
  currentPageId: PageId | null
  onCreatePage: () => void
  onSearch?: () => void
  onReorderPage?: (activePageId: PageId, overPageId: PageId) => void
}

export function SidebarTree({
  pages,
  boards = [],
  dataTables = [],
  currentPageId,
  onCreatePage,
  onSearch,
  onReorderPage,
}: SidebarTreeProps) {
  const visiblePages = useMemo(() => buildVisiblePageItems(pages, {}), [pages])
  const recentBoards = useMemo(() => buildRecentBoards(pages, boards), [boards, pages])
  const dataTablesByPageId = useMemo(
    () => buildDataTablesByPageId(pages, dataTables),
    [dataTables, pages],
  )
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
            {(dataTablesByPageId.get(page.id) ?? []).map((dataTable) => (
              <div key={`${page.id}-${dataTable.id}`} className="sidebar-tree-row">
                <NavLink
                  to={`/pages/${page.id}/data-tables/${dataTable.id}`}
                  className={({ isActive }) => getSidebarItemClassName(isActive)}
                  style={{ paddingLeft: `${10 + (depth + 1) * 16}px` }}
                >
                  <span className="sidebar-tree-icon" aria-hidden="true">
                    {dataTable.icon ?? DATA_TABLE_ICON}
                  </span>
                  <span className="sidebar-tree-label">{dataTable.title}</span>
                </NavLink>
              </div>
            ))}
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

function buildDataTablesByPageId(pages: PageRecord[], dataTables: DataTableRecord[]) {
  const dataTableById = new Map(dataTables.map((dataTable) => [dataTable.id, dataTable]))
  const result = new Map<PageId, DataTableRecord[]>()

  for (const page of pages) {
    const seenOnPage = new Set<string>()

    for (const block of page.blocks) {
      if (block.type !== 'data_table' || seenOnPage.has(block.databaseId)) {
        continue
      }

      const dataTable = dataTableById.get(block.databaseId)

      if (!dataTable) {
        continue
      }

      seenOnPage.add(block.databaseId)
      result.set(page.id, [...(result.get(page.id) ?? []), dataTable])
    }
  }

  return result
}

function getUpdatedAt(value: string) {
  const timestamp = Date.parse(value)
  return Number.isFinite(timestamp) ? timestamp : 0
}
