interface ParagraphBlockProps {
  value: string
  onChange: (value: string) => void
}

export function ParagraphBlock({ value, onChange }: ParagraphBlockProps) {
  return (
    <textarea
      className="block-input paragraph-block"
      value={value}
      onChange={(event) => onChange(event.target.value)}
      placeholder="输入正文"
    />
  )
}
