import type { PageRecord } from '../../domain/types'

interface PageHeaderProps {
  page: PageRecord
}

export function PageHeader({ page }: PageHeaderProps) {
  return (
    <header className="page-header">
      <div className="page-header-icon" aria-hidden="true">
        {page.icon ?? '📄'}
      </div>
      <h1 className="page-title">{page.title}</h1>
    </header>
  )
}
