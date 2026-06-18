import type {
  BlockRecord,
  BlockType,
  BoardId,
  BoardRecord,
  MindmapBlock,
  MindmapId,
  MindmapRecord,
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

export function createMindmapRecord(now = new Date().toISOString()): MindmapRecord {
  const rootNodeId = createId('mindmap_node')

  return {
    id: createId('mindmap'),
    title: '未命名思维导图',
    rootNodeId,
    nodes: {
      [rootNodeId]: {
        id: rootNodeId,
        parentId: null,
        text: '中心主题',
        order: 0,
      },
    },
    viewport: {
      x: 0,
      y: 0,
      zoom: 1,
    },
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

export function createBlock(type: BlockType, options?: { boardId?: BoardId; mindmapId?: MindmapId }): BlockRecord {
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
    case 'mindmap':
      if (!options?.mindmapId) {
        throw new Error('Mindmap block requires mindmapId')
      }
      return createMindmapBlock(options.mindmapId)
  }
}
