import { createDefaultAppState } from '../components/dataTable/domain/factory'
import { createEmptyMindmapSnapshot, extractMindmapTitle } from '../components/mindmap/mindmapModel'
import type {
  BlockRecord,
  BlockType,
  BoardId,
  BoardRecord,
  DataTableBlock,
  DataTableId,
  DataTableRecord,
  MindmapBlock,
  MindmapId,
  MindmapRecord,
  SyncedBlockInstanceBlock,
  SyncedBlockMode,
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

export function createMindmapRecord(now = new Date().toISOString()): MindmapRecord {
  const snapshot = createEmptyMindmapSnapshot()

  return {
    id: createId('mindmap'),
    title: extractMindmapTitle(snapshot),
    snapshot,
    createdAt: now,
    updatedAt: now,
  }
}

export function createMindmapBlock(mindmapId: MindmapId): MindmapBlock {
  return {
    id: createId('block'),
    type: 'mindmap',
    mindmapId,
  }
}

export function createSyncedBlockInstanceBlock(
  groupId: string,
  instanceId: string,
  mode: SyncedBlockMode,
): SyncedBlockInstanceBlock {
  return {
    id: createId('block'),
    type: 'synced_block',
    groupId,
    instanceId,
    mode,
  }
}

export function createBlock(
  type: BlockType,
  options?: {
    boardId?: BoardId
    databaseId?: DataTableId
    dataTableDisplayMode?: DataTableBlock['displayMode']
    mindmapId?: MindmapId
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
    case 'image':
      return {
        id: createId('block'),
        type: 'image',
        assetId: null,
        name: '',
        mimeType: '',
        caption: '',
        alt: '',
      }
    case 'video':
    case 'audio':
    case 'file':
      return {
        id: createId('block'),
        type,
        assetId: null,
        name: '',
        mimeType: '',
        caption: '',
      }
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
    case 'mindmap':
      if (!options?.mindmapId) {
        throw new Error('Mindmap block requires mindmapId')
      }

      return createMindmapBlock(options.mindmapId)
    case 'synced_block':
      throw new Error('Synced block requires group metadata')
  }
}
