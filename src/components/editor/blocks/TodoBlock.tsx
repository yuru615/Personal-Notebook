import type { CSSProperties, KeyboardEventHandler } from 'react'
import type { ExternalLinkOpenMode, RichTextSegment } from '../../../domain/types'
import type { PageRelationAutocompleteItem } from '../PageRelationAutocomplete'
import {
  RichTextEditable,
  type DesktopPasteFallback,
  type PastedImageSource,
  type RichTextEditableChange,
} from '../RichTextEditable'

interface TodoBlockProps {
  text: string
  richText?: RichTextSegment[]
  checked: boolean
  style?: CSSProperties
  onChange: (next: RichTextEditableChange & { checked: boolean }) => void
  onKeyDown?: KeyboardEventHandler<HTMLDivElement>
  onPasteImage?: (source: PastedImageSource) => Promise<void> | void
  onPasteStructuredContent?: (clipboardData: DataTransfer) => boolean
  onPasteDesktopContent?: () => Promise<DesktopPasteFallback>
  relationPages?: PageRelationAutocompleteItem[]
  onOpenPageRelation?: (pageId: string) => void
  onCreatePageRelation?: (title: string) => Promise<PageRelationAutocompleteItem>
  linkOpenMode?: ExternalLinkOpenMode
}

export function TodoBlock({
  text,
  richText,
  checked,
  style,
  onChange,
  onKeyDown,
  onPasteImage,
  onPasteStructuredContent,
  onPasteDesktopContent,
  relationPages,
  onOpenPageRelation,
  onCreatePageRelation,
  linkOpenMode,
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
        onPasteImage={onPasteImage}
        onPasteStructuredContent={onPasteStructuredContent}
        onPasteDesktopContent={onPasteDesktopContent}
        relationPages={relationPages}
        onOpenPageRelation={onOpenPageRelation}
        onCreatePageRelation={onCreatePageRelation}
        linkOpenMode={linkOpenMode}
        placeholder="待办事项"
      />
    </div>
  )
}
