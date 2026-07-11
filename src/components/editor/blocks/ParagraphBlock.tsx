import type { CSSProperties, KeyboardEventHandler } from 'react'
import type { ExternalLinkOpenMode, RichTextSegment } from '../../../domain/types'
import type { PageRelationAutocompleteItem } from '../PageRelationAutocomplete'
import {
  RichTextEditable,
  type DesktopPasteFallback,
  type PastedImageSource,
  type RichTextEditableChange,
} from '../RichTextEditable'

interface ParagraphBlockProps {
  value: string
  richText?: RichTextSegment[]
  variant?: 'paragraph' | 'heading_1' | 'heading_2' | 'heading_3'
  style?: CSSProperties
  placeholder?: string
  insertMode?: boolean
  onChange: (next: RichTextEditableChange) => void
  onKeyDown?: KeyboardEventHandler<HTMLDivElement>
  onPasteImage?: (source: PastedImageSource) => Promise<void> | void
  onPasteStructuredContent?: (clipboardData: DataTransfer) => boolean
  onPasteDesktopContent?: () => Promise<DesktopPasteFallback>
  relationPages?: PageRelationAutocompleteItem[]
  onOpenPageRelation?: (pageId: string) => void
  onCreatePageRelation?: (title: string) => Promise<PageRelationAutocompleteItem>
  linkOpenMode?: ExternalLinkOpenMode
}

export function ParagraphBlock({
  value,
  richText,
  variant = 'paragraph',
  style,
  placeholder = '输入正文',
  insertMode = false,
  onChange,
  onKeyDown,
  onPasteImage,
  onPasteStructuredContent,
  onPasteDesktopContent,
  relationPages,
  onOpenPageRelation,
  onCreatePageRelation,
  linkOpenMode,
}: ParagraphBlockProps) {
  const blockClassName =
    variant === 'paragraph' ? 'paragraph-block' : `paragraph-block ${variant}-block`

  return (
    <RichTextEditable
      ariaLabel="输入正文"
      className={`block-input ${blockClassName}${insertMode ? ' block-input-insert' : ''}`}
      value={value}
      richText={richText}
      style={style}
      onChange={onChange}
      onKeyDown={onKeyDown}
      onPasteImage={onPasteImage}
      onPasteStructuredContent={onPasteStructuredContent}
      onPasteDesktopContent={onPasteDesktopContent}
      relationPages={relationPages}
      onOpenPageRelation={onOpenPageRelation}
      onCreatePageRelation={onCreatePageRelation}
      linkOpenMode={linkOpenMode}
      placeholder={placeholder}
    />
  )
}
