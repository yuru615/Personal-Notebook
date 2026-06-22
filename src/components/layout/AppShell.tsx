import type { ReactNode } from 'react'
import { uiCopy } from '../../ui/copy'

interface AppShellProps {
  sidebar: ReactNode
  children: ReactNode
  hideSidebar?: boolean
}

export function AppShell({ sidebar, children, hideSidebar = false }: AppShellProps) {
  return (
    <div className={hideSidebar ? 'app-shell app-shell-focus' : 'app-shell'}>
      {hideSidebar ? null : (
        <aside className="sidebar" aria-label={uiCopy.sidebar.ariaLabel}>
          {sidebar}
        </aside>
      )}
      <main className={hideSidebar ? 'page-panel page-panel-focus' : 'page-panel'}>{children}</main>
    </div>
  )
}
