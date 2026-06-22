import type { CSSProperties, KeyboardEventHandler } from 'react'
import type { BlockType } from '../../../domain/types'
import { AutoGrowTextarea } from '../AutoGrowTextarea'

interface ListBlockProps {
  type: Extract<BlockType, 'bulleted_list' | 'numbered_list'>
  value: string
  index?: number
  style?: CSSProperties
  onChange: (value: string) => void
  onKeyDown?: KeyboardEventHandler<HTMLTextAreaElement>
}

export function ListBlock({ type, value, index = 0, style, onChange, onKeyDown }: ListBlockProps) {
  return (
    <div className="list-block-shell">
      <div className="list-block-row">
        <div className="list-block-marker" aria-hidden="true">
          {type === 'bulleted_list' ? '•' : `${index + 1}.`}
        </div>
        <AutoGrowTextarea
          aria-label="每行一个列表项"
          className="block-input list-block list-block-editor"
          value={value}
          style={style}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={onKeyDown}
          placeholder="每行一个列表项"
        />
      </div>
    </div>
  )
}
