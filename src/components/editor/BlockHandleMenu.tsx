import type { BlockType } from '../../domain/types'

interface BlockHandleMenuProps {
  onTurnInto: (type: BlockType) => void
  onDuplicate: () => void
  onDelete: () => void
}

const turnIntoOptions: Array<{ type: BlockType; label: string }> = [
  { type: 'paragraph', label: '转为文本' },
  { type: 'todo', label: '转为待办' },
  { type: 'bulleted_list', label: '转为无序列表' },
  { type: 'numbered_list', label: '转为有序列表' },
  { type: 'code', label: '转为代码块' },
]

export function BlockHandleMenu({ onTurnInto, onDuplicate, onDelete }: BlockHandleMenuProps) {
  return (
    <div className="block-menu">
      {turnIntoOptions.map((option) => (
        <button
          key={option.type}
          type="button"
          className="block-menu-action"
          onClick={() => onTurnInto(option.type)}
        >
          {option.label}
        </button>
      ))}
      <button type="button" className="block-menu-action" onClick={onDuplicate}>
        复制
      </button>
      <button type="button" className="block-menu-action block-menu-danger" onClick={onDelete}>
        删除
      </button>
    </div>
  )
}
