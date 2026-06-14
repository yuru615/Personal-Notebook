import type { ReactNode } from 'react'
import { uiCopy } from '../../ui/copy'

interface AppShellProps {
  sidebar: ReactNode
  children: ReactNode
}

export function AppShell({ sidebar, children }: AppShellProps) {
  return (
    <div className="app-shell">
      <aside className="sidebar" aria-label={uiCopy.sidebar.ariaLabel}>
        {sidebar}
      </aside>
      <main className="page-panel">{children}</main>
    </div>
  )
}
