import { createDefaultPagePropertyDefinitions } from './pageProperties'
import { createId } from '../utils/id'
import type { PageDisplayDefaults, PageRecord, WorkspaceSnapshot } from './types'

export const INBOX_PAGE_TITLE = '\u6536\u4ef6\u7bb1'
export const INBOX_PAGE_ICON = '\u{1F4E5}'
export const DEFAULT_PAGE_DISPLAY_DEFAULTS: PageDisplayDefaults = {
  isFullWidth: false,
  isSmallText: false,
  fontFamily: 'default',
  showOutline: true,
  showProperties: false,
}

export function createInboxPage(now = new Date().toISOString()): PageRecord {
  return {
    id: createId('page'),
    parentId: null,
    title: INBOX_PAGE_TITLE,
    icon: INBOX_PAGE_ICON,
    cover: null,
    properties: {},
    ...DEFAULT_PAGE_DISPLAY_DEFAULTS,
    blocks: [],
    createdAt: now,
    updatedAt: now,
  }
}

export function createSeedPage(now = new Date().toISOString()): PageRecord {

  return {
    id: createId('page'),
    parentId: null,
    title: '快速开始',
    icon: '📄',
    cover: null,
    properties: {},
    ...DEFAULT_PAGE_DISPLAY_DEFAULTS,
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
  const inboxPage = createInboxPage(now)
  const page = createSeedPage(now)

  return {
    boards: [],
    dataTables: [],
    mindmaps: [],
    pages: [inboxPage, page],
    pageProperties: createDefaultPagePropertyDefinitions(now),
    settings: {
      lastOpenedPageId: page.id,
      inboxPageId: inboxPage.id,
      sidebarLayout: 'compact',
      sidebarWidth: 272,
      pinnedSidebarItems: [],
      clipboardCaptureMode: 'off',
      pageDefaults: DEFAULT_PAGE_DISPLAY_DEFAULTS,
    },
  }
}
