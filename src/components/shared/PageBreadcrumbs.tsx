import { Fragment } from 'react'
import { Link } from 'react-router-dom'

export interface PageBreadcrumbItem {
  label: string
  to?: string
  icon?: string | null
}

interface PageBreadcrumbsProps {
  items: PageBreadcrumbItem[]
  className?: string
}

export function PageBreadcrumbs({ items, className }: PageBreadcrumbsProps) {
  if (items.length === 0) {
    return null
  }

  return (
    <nav
      className={['page-breadcrumbs', className].filter(Boolean).join(' ')}
      aria-label="页面层级"
    >
      {items.map((item, index) => {
        const isLast = index === items.length - 1
        const accessibleName = [item.icon, item.label].filter(Boolean).join(' ')
        const content = (
          <>
            {item.icon ? <span className="page-breadcrumb-icon">{item.icon}</span> : null}
            <span className="page-breadcrumb-label">{item.label}</span>
          </>
        )

        return (
          <Fragment key={`${item.to ?? 'current'}:${item.label}:${index}`}>
            {index > 0 ? (
              <span className="page-breadcrumb-separator" aria-hidden="true">
                /
              </span>
            ) : null}
            {item.to ? (
              <Link className="page-breadcrumb-link" to={item.to} aria-label={accessibleName}>
                {content}
              </Link>
            ) : (
              <span className="page-breadcrumb-current" aria-current={isLast ? 'page' : undefined}>
                {content}
              </span>
            )}
          </Fragment>
        )
      })}
    </nav>
  )
}
