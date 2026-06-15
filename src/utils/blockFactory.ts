import type { BlockRecord, BlockType } from '../domain/types'
import { createId } from './id'

export function createBlock(type: BlockType): BlockRecord {
  switch (type) {
    case 'paragraph':
      return { id: createId('block'), type, text: '' }
    case 'todo':
      return { id: createId('block'), type, text: '', checked: false }
    case 'bulleted_list':
    case 'numbered_list':
      return { id: createId('block'), type, items: [''] }
    case 'child_page':
      return { id: createId('block'), type, pageId: '' }
    case 'code':
      return { id: createId('block'), type, language: 'text', text: '' }
    case 'table':
      return { id: createId('block'), type, rows: [['', '']] }
  }
}
