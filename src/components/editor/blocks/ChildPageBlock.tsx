import { DEFAULT_PAGE_ICON } from '../../../domain/pageIcons'

interface ChildPageBlockProps {
  title: string
  icon?: string | null
  onOpen?: () => void
}

export function ChildPageBlock({ title, icon, onOpen }: ChildPageBlockProps) {
  return (
    <button type="button" className="child-page-block" aria-label={title} onClick={onOpen}>
      <span className="child-page-icon" aria-hidden="true">
        {icon ?? DEFAULT_PAGE_ICON}
      </span>
      <span className="child-page-content">
        <span className="child-page-title">{title}</span>
        <span className="child-page-meta" aria-hidden="true">
          子页面
        </span>
      </span>
      <span className="child-page-arrow" aria-hidden="true">
        ›
      </span>
    </button>
  )
}
