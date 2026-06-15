import { NavLink } from 'react-router-dom'
import type { PageId, PageRecord } from '../../domain/types'
import { uiCopy } from '../../ui/copy'

interface SidebarTreeProps {
  pages: PageRecord[]
  currentPageId: PageId | null
  onCreatePage: () => void
}

export function SidebarTree({ pages, currentPageId, onCreatePage }: SidebarTreeProps) {
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
        {pages.map((page) => (
          <NavLink
            key={page.id}
            to={`/pages/${page.id}`}
            className={({ isActive }) => getSidebarItemClassName(isActive)}
          >
            <span className="sidebar-tree-icon" aria-hidden="true">
              {page.icon ?? '📄'}
            </span>
            <span className="sidebar-tree-label">{page.title}</span>
          </NavLink>
        ))}
      </nav>
    </>
  )
}

function getSidebarItemClassName(isActive: boolean) {
  return isActive ? 'sidebar-link sidebar-link-active' : 'sidebar-link'
}
