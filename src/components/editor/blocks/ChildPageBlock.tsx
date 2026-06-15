interface ChildPageBlockProps {
  title: string
}

export function ChildPageBlock({ title }: ChildPageBlockProps) {
  return (
    <div className="child-page-block">
      <span aria-hidden="true">📄</span>
      <span>{title}</span>
    </div>
  )
}
