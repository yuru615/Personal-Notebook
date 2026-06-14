import { createId } from '../utils/id'
import type { PageRecord, WorkspaceSnapshot } from './types'

export function createSeedPage(): PageRecord {
  const now = new Date().toISOString()

  return {
    id: createId('page'),
    parentId: null,
    title: '快速开始',
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
    pages: [page],
    settings: {
      workspaceName: '我的知识库',
      createdAt: now,
      updatedAt: now,
    },
    currentPageId: page.id,
  }
}
