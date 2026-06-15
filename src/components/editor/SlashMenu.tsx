import type { BlockType } from '../../domain/types'

const options: Array<{ type: BlockType; label: string }> = [
  { type: 'paragraph', label: '文本' },
  { type: 'todo', label: '待办列表' },
  { type: 'bulleted_list', label: '无序列表' },
  { type: 'numbered_list', label: '有序列表' },
  { type: 'child_page', label: '子页面' },
  { type: 'code', label: '代码块' },
  { type: 'table', label: '普通表格' },
]

interface SlashMenuProps {
  query: string
  onPick: (type: BlockType) => void
}

export function SlashMenu({ query, onPick }: SlashMenuProps) {
  const keyword = query.replace('/', '')
  const filtered = options.filter((option) => option.label.includes(keyword))

  return (
    <div className="slash-menu">
      {filtered.map((option) => (
        <button
          key={option.type}
          type="button"
          className="slash-option"
          onClick={() => onPick(option.type)}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}
