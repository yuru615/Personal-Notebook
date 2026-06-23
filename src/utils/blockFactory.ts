import { createDefaultAppState } from '../components/dataTable/domain/factory'
import type {
  BlockRecord,
  BlockType,
  BoardId,
  BoardRecord,
  DataTableBlock,
  DataTableId,
  DataTableRecord,
  WhiteboardBlock,
} from '../domain/types'
import { createEmptyBoardSnapshot } from '../components/whiteboard/whiteboardModel'
import { createId } from './id'

export function createBoardRecord(now = new Date().toISOString()): BoardRecord {
  return {
    id: createId('board'),
    title: '未命名白板',
    snapshot: createEmptyBoardSnapshot(),
    createdAt: now,
    updatedAt: now,
  }
}

export function createWhiteboardBlock(boardId: BoardId): WhiteboardBlock {
  return {
    id: createId('block'),
    type: 'whiteboard',
    boardId,
  }
}

export function createDataTableRecord(now = new Date().toISOString()): DataTableRecord {
  const snapshot = createDefaultAppState()

  return {
    id: snapshot.database.id,
    title: snapshot.database.name,
    icon: null,
    cover: null,
    snapshot,
    createdAt: now,
    updatedAt: now,
  }
}

export function createDataTableBlock(
  databaseId: DataTableId,
  displayMode?: DataTableBlock['displayMode'],
): DataTableBlock {
  return {
    id: createId('block'),
    type: 'data_table',
    databaseId,
    ...(displayMode ? { displayMode } : {}),
  }
}

export function createBlock(
  type: BlockType,
  options?: {
    boardId?: BoardId
    databaseId?: DataTableId
    dataTableDisplayMode?: DataTableBlock['displayMode']
  },
): BlockRecord {
  switch (type) {
    case 'paragraph':
    case 'heading_1':
    case 'heading_2':
    case 'heading_3':
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
    case 'whiteboard':
      if (!options?.boardId) {
        throw new Error('Whiteboard block requires boardId')
      }

      return createWhiteboardBlock(options.boardId)
    case 'data_table':
    case 'data_table_inline':
      if (!options?.databaseId) {
        throw new Error('Data table block requires databaseId')
      }

      return createDataTableBlock(
        options.databaseId,
        type === 'data_table_inline' ? 'inline' : options.dataTableDisplayMode,
      )
  }
}
