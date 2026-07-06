import type { CSSProperties, KeyboardEventHandler } from 'react'
import type { RichTextSegment } from '../../../domain/types'
import type { PageRelationAutocompleteItem } from '../PageRelationAutocomplete'
import { RichTextEditable, type RichTextEditableChange } from '../RichTextEditable'

interface TodoBlockProps {
  text: string
  richText?: RichTextSegment[]
  checked: boolean
  style?: CSSProperties
  onChange: (next: RichTextEditableChange & { checked: boolean }) => void
  onKeyDown?: KeyboardEventHandler<HTMLDivElement>
  relationPages?: PageRelationAutocompleteItem[]
  onOpenPageRelation?: (pageId: string) => void
  onCreatePageRelation?: (title: string) => Promise<PageRelationAutocompleteItem>
}

export function TodoBlock({
  text,
  richText,
  checked,
  style,
  onChange,
  onKeyDown,
  relationPages,
  onOpenPageRelation,
  onCreatePageRelation,
}: TodoBlockProps) {
  return (
    <div className="todo-row">
      <input
        type="checkbox"
        aria-label={text || '待办事项'}
        checked={checked}
        onChange={(event) => onChange({ text, richText, checked: event.target.checked })}
      />
      <RichTextEditable
        ariaLabel="待办事项"
        className={checked ? 'block-input todo-input todo-input-checked' : 'block-input todo-input'}
        value={text}
        richText={richText}
        style={style}
        onChange={(next) => onChange({ ...next, checked })}
        onKeyDown={onKeyDown}
        relationPages={relationPages}
        onOpenPageRelation={onOpenPageRelation}
        onCreatePageRelation={onCreatePageRelation}
        placeholder="待办事项"
      />
    </div>
  )
}
