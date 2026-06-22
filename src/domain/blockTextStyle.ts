import type { BlockRecord, TextBlockStyle } from './types'

export type TextStyleableBlock = Extract<
  BlockRecord,
  {
    type:
      | 'paragraph'
      | 'heading_1'
      | 'heading_2'
      | 'heading_3'
      | 'todo'
      | 'bulleted_list'
      | 'numbered_list'
  }
>

export function isTextStyleableBlock(block: BlockRecord): block is TextStyleableBlock {
  return (
    block.type === 'paragraph' ||
    block.type === 'heading_1' ||
    block.type === 'heading_2' ||
    block.type === 'heading_3' ||
    block.type === 'todo' ||
    block.type === 'bulleted_list' ||
    block.type === 'numbered_list'
  )
}

export function getTextBlockStyle(block: TextStyleableBlock): TextBlockStyle {
  return {
    textColor: block.textColor,
    backgroundColor: block.backgroundColor,
    textAlign: block.textAlign,
  }
}
