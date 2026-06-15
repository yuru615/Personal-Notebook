interface CodeBlockProps {
  language: string
  text: string
  onChange: (next: { language: string; text: string }) => void
}

export function CodeBlock({ language, text, onChange }: CodeBlockProps) {
  return (
    <div className="code-block">
      <input
        className="code-language"
        value={language}
        onChange={(event) => onChange({ language: event.target.value, text })}
      />
      <textarea
        className="block-input code-text"
        value={text}
        onChange={(event) => onChange({ language, text: event.target.value })}
      />
    </div>
  )
}
