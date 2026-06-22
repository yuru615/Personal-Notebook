import type { CSSProperties, KeyboardEventHandler } from 'react'
import type { RichTextSegment } from '../../../domain/types'
import { RichTextEditable, type RichTextEditableChange } from '../RichTextEditable'

interface ParagraphBlockProps {
  value: string
  richText?: RichTextSegment[]
  variant?: 'paragraph' | 'heading_1' | 'heading_2' | 'heading_3'
  style?: CSSProperties
  onChange: (next: RichTextEditableChange) => void
  onKeyDown?: KeyboardEventHandler<HTMLDivElement>
}

export function ParagraphBlock({
  value,
  richText,
  variant = 'paragraph',
  style,
  onChange,
  onKeyDown,
}: ParagraphBlockProps) {
  const blockClassName =
    variant === 'paragraph' ? 'paragraph-block' : `paragraph-block ${variant}-block`

  return (
    <RichTextEditable
      ariaLabel="输入正文"
      className={`block-input ${blockClassName}`}
      value={value}
      richText={richText}
      style={style}
      onChange={onChange}
      onKeyDown={onKeyDown}
      placeholder="输入正文"
    />
  )
}
