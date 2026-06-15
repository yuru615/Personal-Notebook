import { useMemo, useState } from 'react'
import { NavLink } from 'react-router-dom'
import type { PageId, PageRecord } from '../../domain/types'
import { uiCopy } from '../../ui/copy'
import { buildVisiblePageItems } from '../../utils/pageTree'

interface SidebarTreeProps {
  pages: PageRecord[]
  currentPageId: PageId | null
  onCreatePage: () => void
}

export function SidebarTree({ pages, currentPageId, onCreatePage }: SidebarTreeProps) {
  const [expandedIds, setExpandedIds] = useState<Record<string, boolean>>({})
  const visiblePages = useMemo(
    () => buildVisiblePageItems(pages, expandedIds),
    [expandedIds, pages],
  )

  return (
    <>
      <div className="sidebar-group">
        <button type="button" className="sidebar-link">
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

      <nav className="sidebar-tree" aria-label={uiCopy.sidebar.pageTree}>
        {visiblePages.map(({ page, depth, hasChildren }) => (
          <div key={page.id} className="sidebar-tree-row">
            <button
              type="button"
              className={`sidebar-tree-toggle ${hasChildren ? '' : 'sidebar-tree-toggle-hidden'}`}
              aria-label={
                hasChildren
                  ? (expandedIds[page.id] ?? true)
                    ? uiCopy.sidebar.collapsePage
                    : uiCopy.sidebar.expandPage
                  : undefined
              }
              tabIndex={hasChildren ? 0 : -1}
              onClick={() =>
                setExpandedIds((current) => ({
                  ...current,
                  [page.id]: !(current[page.id] ?? true),
                }))
              }
            >
              {hasChildren ? ((expandedIds[page.id] ?? true) ? '⌄' : '›') : ''}
            </button>
            <NavLink
              to={`/pages/${page.id}`}
              className={({ isActive }) => getSidebarItemClassName(isActive)}
              style={{ paddingLeft: `${10 + depth * 16}px` }}
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
