interface ChildPageBlockProps {
  title: string
  onOpen?: () => void
}

export function ChildPageBlock({ title, onOpen }: ChildPageBlockProps) {
  return (
    <button type="button" className="child-page-block" aria-label={title} onClick={onOpen}>
      <span className="child-page-icon" aria-hidden="true">
        📄
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
