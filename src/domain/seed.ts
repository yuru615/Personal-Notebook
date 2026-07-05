import { createDefaultPagePropertyDefinitions } from './pageProperties'
import { createId } from '../utils/id'
import type { PageRecord, WorkspaceSnapshot } from './types'

export function createSeedPage(): PageRecord {
  const now = new Date().toISOString()

  return {
    id: createId('page'),
    parentId: null,
    title: '快速开始',
    icon: '📄',
    cover: null,
    properties: {},
    isFullWidth: false,
    isSmallText: false,
    fontFamily: 'default',
    showOutline: true,
    blocks: [
      {
        id: createId('block'),
        type: 'paragraph',
        text: '这是你的第一个页面，直接开始记录想法。',
      },
      {
        id: createId('block'),
        type: 'todo',
        text: '完成第一个待办',
        checked: false,
      },
    ],
    createdAt: now,
    updatedAt: now,
  }
}

export function createSeedWorkspace(): WorkspaceSnapshot {
  const now = new Date().toISOString()
  const page = createSeedPage()

  return {
    boards: [],
    dataTables: [],
    mindmaps: [],
    pages: [page],
    pageProperties: createDefaultPagePropertyDefinitions(now),
    settings: {
      lastOpenedPageId: page.id,
      sidebarLayout: 'compact',
    },
  }
}
