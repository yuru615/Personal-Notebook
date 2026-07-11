import type { CSSProperties, KeyboardEventHandler } from 'react'
import type { BlockType, ExternalLinkOpenMode, RichTextSegment } from '../../../domain/types'
import type { PageRelationAutocompleteItem } from '../PageRelationAutocomplete'
import { RichTextEditable, type RichTextEditableChange } from '../RichTextEditable'

interface ListBlockProps {
  type: Extract<BlockType, 'bulleted_list' | 'numbered_list'>
  value: string
  richText?: RichTextSegment[]
  index?: number
  style?: CSSProperties
  onChange: (next: RichTextEditableChange) => void
  onKeyDown?: KeyboardEventHandler<HTMLDivElement>
  relationPages?: PageRelationAutocompleteItem[]
  onOpenPageRelation?: (pageId: string) => void
  onCreatePageRelation?: (title: string) => Promise<PageRelationAutocompleteItem>
  linkOpenMode?: ExternalLinkOpenMode
}

export function ListBlock({
  type,
  value,
  richText,
  index = 0,
  style,
  onChange,
  onKeyDown,
  relationPages,
  onOpenPageRelation,
  onCreatePageRelation,
  linkOpenMode,
}: ListBlockProps) {
  return (
    <div className="list-block-shell">
      <div className="list-block-row">
        <div className="list-block-marker" aria-hidden="true">
          {type === 'bulleted_list' ? '•' : `${index + 1}.`}
        </div>
        <RichTextEditable
          ariaLabel="每行一个列表项"
          className="block-input list-block list-block-editor"
          value={value}
          richText={richText}
          style={style}
          onChange={onChange}
          onKeyDown={onKeyDown}
          relationPages={relationPages}
          onOpenPageRelation={onOpenPageRelation}
          onCreatePageRelation={onCreatePageRelation}
          linkOpenMode={linkOpenMode}
          placeholder="每行一个列表项"
        />
      </div>
    </div>
  )
}
