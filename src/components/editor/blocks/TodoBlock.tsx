interface TodoBlockProps {
  text: string
  checked: boolean
  onChange: (next: { text: string; checked: boolean }) => void
}

export function TodoBlock({ text, checked, onChange }: TodoBlockProps) {
  return (
    <label className="todo-row">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange({ text, checked: event.target.checked })}
      />
      <input
        className="block-input todo-input"
        value={text}
        onChange={(event) => onChange({ text: event.target.value, checked })}
        placeholder="待办事项"
      />
    </label>
  )
}
