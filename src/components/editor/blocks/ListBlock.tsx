interface ListBlockProps {
  items: string[]
  onChange: (items: string[]) => void
}

export function ListBlock({ items, onChange }: ListBlockProps) {
  return (
    <textarea
      className="block-input list-block"
      value={items.join('\n')}
      onChange={(event) => onChange(event.target.value.split('\n'))}
      placeholder="每行一个列表项"
    />
  )
}
