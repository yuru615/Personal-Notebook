import { createDefaultAppState, createProperty } from '../components/dataTable/domain/factory'
import { createEmptyMindmapSnapshot } from '../components/mindmap/mindmapModel'
import { createEmptyBoardSnapshot } from '../components/whiteboard/whiteboardModel'
import { createDefaultPagePropertyDefinitions } from './pageProperties'
import { createId } from '../utils/id'
import type {
  BoardRecord,
  DataTableRecord,
  MindmapRecord,
  PageDisplayDefaults,
  PageRecord,
  WorkspaceSnapshot,
} from './types'

export const INBOX_PAGE_TITLE = '收件箱'
export const INBOX_PAGE_ICON = '📥'
export const WELCOME_PAGE_TITLE = '欢迎使用知栖'
export const CURRENT_WELCOME_GUIDE_VERSION = 2
export const DEFAULT_PAGE_DISPLAY_DEFAULTS: PageDisplayDefaults = {
  isFullWidth: false,
  isSmallText: false,
  fontFamily: 'default',
  showOutline: true,
  showProperties: false,
}

interface WelcomeGuideBundle {
  page: PageRecord
  board: BoardRecord
  dataTable: DataTableRecord
  mindmap: MindmapRecord
}

interface GuideMindmapNode {
  id: string
  parentId: string | null
  childIds: string[]
  text: string
  collapsed: boolean
  style: {
    nodeColor?: string
    branchColor?: string
  }
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

function createGuideBoard(now: string): BoardRecord {
  const snapshot = createEmptyBoardSnapshot()
  const collectNoteId = createId('note')
  const organizeNoteId = createId('note')
  const actNoteId = createId('note')

  snapshot.notes = [
    {
      id: collectNoteId,
      x: 40,
      y: 120,
      w: 230,
      h: 130,
      text: '收集\n把灵感、图片和链接先放进收件箱。',
      color: '#fef3c7',
      z: 2,
    },
    {
      id: organizeNoteId,
      x: 370,
      y: 120,
      w: 230,
      h: 130,
      text: '整理\n拖动便签、图形和文字，按关系连线。',
      color: '#dbeafe',
      z: 2,
    },
    {
      id: actNoteId,
      x: 700,
      y: 120,
      w: 230,
      h: 130,
      text: '行动\n缩放、框选，随时撤销或重做。',
      color: '#dcfce7',
      z: 2,
    },
  ]
  snapshot.texts = [
    {
      id: createId('text'),
      x: 40,
      y: 40,
      w: 700,
      h: 44,
      text: '白板示例：选择、拖动、连线与缩放',
      color: '#17202a',
      fontFamily: snapshot.textFontFamily,
      fontSize: 28,
      fontWeight: '700',
      fontStyle: 'normal',
      autoSize: false,
      z: 3,
    },
  ]
  snapshot.shapes = [
    {
      id: createId('shape'),
      type: 'rect',
      x: 18,
      y: 96,
      w: 945,
      h: 180,
      color: '#0f766e',
      size: 2,
      text: '',
      z: 1,
    },
  ]
  snapshot.connections = [
    {
      id: createId('connection'),
      from: collectNoteId,
      to: organizeNoteId,
      fromSide: 'e',
      toSide: 'w',
      fromMarker: 'none',
      toMarker: 'arrow',
      mode: 'straight',
      color: '#0f766e',
      size: 3,
    },
    {
      id: createId('connection'),
      from: organizeNoteId,
      to: actNoteId,
      fromSide: 'e',
      toSide: 'w',
      fromMarker: 'none',
      toMarker: 'arrow',
      mode: 'straight',
      color: '#0f766e',
      size: 3,
    },
  ]

  return {
    id: createId('board'),
    title: '白板示例',
    snapshot,
    createdAt: now,
    updatedAt: now,
  }
}

function createGuideMindmap(now: string): MindmapRecord {
  const snapshot = createEmptyMindmapSnapshot({ themeId: 'mint' })
  const rootId = 'node-root'
  const goalId = 'guide-goal'
  const tasksId = 'guide-tasks'
  const reviewId = 'guide-review'
  const goalDetailId = 'guide-goal-detail'
  const tasksDetailId = 'guide-tasks-detail'
  const reviewDetailId = 'guide-review-detail'

  snapshot.title = '项目规划导图'
  const nodes: Record<string, GuideMindmapNode> = {
    [rootId]: {
      id: rootId,
      parentId: null,
      childIds: [goalId, tasksId, reviewId],
      text: '项目规划',
      collapsed: false,
      style: { nodeColor: '#ffffff', branchColor: '#138a72' },
    },
    [goalId]: {
      id: goalId,
      parentId: rootId,
      childIds: [goalDetailId],
      text: '目标',
      collapsed: false,
      style: { branchColor: '#138a72' },
    },
    [goalDetailId]: {
      id: goalDetailId,
      parentId: goalId,
      childIds: [],
      text: '明确完成标准',
      collapsed: false,
      style: { branchColor: '#138a72' },
    },
    [tasksId]: {
      id: tasksId,
      parentId: rootId,
      childIds: [tasksDetailId],
      text: '任务',
      collapsed: false,
      style: { branchColor: '#138a72' },
    },
    [tasksDetailId]: {
      id: tasksDetailId,
      parentId: tasksId,
      childIds: [],
      text: '拆成下一步行动',
      collapsed: false,
      style: { branchColor: '#138a72' },
    },
    [reviewId]: {
      id: reviewId,
      parentId: rootId,
      childIds: [reviewDetailId],
      text: '复盘',
      collapsed: false,
      style: { branchColor: '#138a72' },
    },
    [reviewDetailId]: {
      id: reviewDetailId,
      parentId: reviewId,
      childIds: [],
      text: '记录经验与下一次调整',
      collapsed: false,
      style: { branchColor: '#138a72' },
    },
  }
  snapshot.nodes = nodes as unknown as typeof snapshot.nodes

  return {
    id: createId('mindmap'),
    title: snapshot.title,
    snapshot,
    createdAt: now,
    updatedAt: now,
  }
}

function createGuideDataTable(now: string): DataTableRecord {
  const snapshot = createDefaultAppState()
  const titlePropertyId = snapshot.database.propertyOrder[0]!
  const titleProperty = snapshot.properties[titlePropertyId]!
  const statusProperty = createProperty({ key: 'status', name: '状态', type: 'select' })
  const dateProperty = createProperty({ key: 'date', name: '日期', type: 'date' })
  const notesProperty = createProperty({ key: 'notes', name: '备注', type: 'text' })

  titleProperty.name = '任务'
  statusProperty.config.options = [
    { id: createId('option'), label: '未开始', color: '#64748b' },
    { id: createId('option'), label: '进行中', color: '#2563eb' },
    { id: createId('option'), label: '已完成', color: '#16a34a' },
  ]
  snapshot.database.name = '任务数据表'
  snapshot.database.propertyOrder = [
    titlePropertyId,
    statusProperty.id,
    dateProperty.id,
    notesProperty.id,
  ]
  snapshot.properties = {
    ...snapshot.properties,
    [statusProperty.id]: statusProperty,
    [dateProperty.id]: dateProperty,
    [notesProperty.id]: notesProperty,
  }

  const rows = [
    ['收集资料', '未开始', '2026-07-14', '先把资料放进收件箱。'],
    ['整理思路', '进行中', '2026-07-16', '用白板或导图梳理关系。'],
    ['完成复盘', '已完成', '2026-07-18', '沉淀结论并更新下一步。'],
  ]

  for (const [title, status, date, notes] of rows) {
    const recordId = createId('record')
    snapshot.records[recordId] = {
      id: recordId,
      title,
      values: {
        [titlePropertyId]: title,
        [statusProperty.id]: status,
        [dateProperty.id]: date,
        [notesProperty.id]: notes,
      },
      createdAt: now,
      updatedAt: now,
    }
    snapshot.recordPages[recordId] = { recordId, blockIds: [], updatedAt: now }
  }

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

function createWelcomeGuidePage(
  now: string,
  boardId: string,
  dataTableId: string,
  mindmapId: string,
  title = WELCOME_PAGE_TITLE,
): PageRecord {
  return {
    id: createId('page'),
    parentId: null,
    title,
    icon: '🌿',
    cover: null,
    properties: {},
    ...DEFAULT_PAGE_DISPLAY_DEFAULTS,
    blocks: [
      { id: createId('block'), type: 'heading_1', text: '知栖使用手册' },
      {
        id: createId('block'),
        type: 'paragraph',
        text: '知栖是本地优先的个人知识库。页面、块、数据表、白板和导图都保存在你的设备上；这页既是说明书，也是可以直接改动的练习空间。',
      },
      { id: createId('block'), type: 'heading_2', text: '开始记录' },
      {
        id: createId('block'),
        type: 'bulleted_list',
        items: [
          '从左侧“新建页面”开始，输入标题和正文；页面图标、封面和显示方式可在右上角调整。',
          '暂时没有归属的内容先放进收件箱，之后再拖入或整理到正式页面。',
        ],
      },
      { id: createId('block'), type: 'heading_2', text: '页面与块' },
      {
        id: createId('block'),
        type: 'paragraph',
        text: '在空白行输入 / 打开插入菜单，可创建段落、标题、待办、列表、表格、代码、媒体、子页面、白板、数据表和导图。块左侧手柄可插入、转换、复制、移动或删除；文本选中后可设置加粗、颜色和链接。',
      },
      { id: createId('block'), type: 'heading_2', text: '组织与搜索' },
      {
        id: createId('block'),
        type: 'paragraph',
        text: '左侧页面树可展开、折叠和星标置顶；页面属性适合记录标签、状态、日期和备注。全局搜索会查找页面、正文、媒体文件名与说明、白板文字、导图节点和数据表记录。页面提及、双向链接、引用块与同步块用于建立知识关系。',
      },
      { id: createId('block'), type: 'heading_2', text: '媒体与导入' },
      {
        id: createId('block'),
        type: 'paragraph',
        text: '可直接粘贴图片、把文件拖进窗口收进收件箱，或导入 Markdown 生成页面。需要迁移或备份时，可导出当前页面、页面包或完整工作区，再通过导入恢复。',
      },
      { id: createId('block'), type: 'heading_2', text: '数据表实操' },
      {
        id: createId('block'),
        type: 'paragraph',
        text: '下面是一份可编辑的任务数据表。你可以新增属性、筛选和排序，并切换表格、看板、日历或甘特图视图。',
      },
      { id: createId('block'), type: 'data_table', databaseId: dataTableId },
      { id: createId('block'), type: 'heading_2', text: '白板实操' },
      {
        id: createId('block'),
        type: 'paragraph',
        text: '下面的白板用“收集、整理、行动”演示便签、文本、图形和连线。试着拖动元素、编辑便签、拖拽连线，或使用滚轮缩放画布。',
      },
      { id: createId('block'), type: 'whiteboard', boardId },
      { id: createId('block'), type: 'heading_2', text: '思维导图实操' },
      {
        id: createId('block'),
        type: 'paragraph',
        text: '下面的项目规划导图包含目标、任务和复盘三个分支。双击节点编辑文字，使用 Tab 新增子节点、Enter 新增同级节点，并可拖动调整结构。',
      },
      { id: createId('block'), type: 'mindmap', mindmapId },
      { id: createId('block'), type: 'heading_2', text: '设置与备份' },
      {
        id: createId('block'),
        type: 'paragraph',
        text: '设置中心可调整主题色、侧边栏、编辑习惯、链接打开方式、导入导出和桌面端行为。工作区保存在本机，建议定期使用“导出全部”建立完整备份。',
      },
    ],
    createdAt: now,
    updatedAt: now,
  }
}

export function createWelcomeGuideBundle(now = new Date().toISOString()): WelcomeGuideBundle {
  const board = createGuideBoard(now)
  const dataTable = createGuideDataTable(now)
  const mindmap = createGuideMindmap(now)

  return {
    board,
    dataTable,
    mindmap,
    page: createWelcomeGuidePage(now, board.id, dataTable.id, mindmap.id),
  }
}

export function createSeedPage(now = new Date().toISOString()): PageRecord {
  return createWelcomeGuideBundle(now).page
}

export function createSeedWorkspace(): WorkspaceSnapshot {
  const now = new Date().toISOString()
  const inboxPage = createInboxPage(now)
  const guide = createWelcomeGuideBundle(now)

  return {
    boards: [guide.board],
    dataTables: [guide.dataTable],
    mindmaps: [guide.mindmap],
    pages: [inboxPage, guide.page],
    pageProperties: createDefaultPagePropertyDefinitions(now),
    settings: {
      lastOpenedPageId: guide.page.id,
      inboxPageId: inboxPage.id,
      welcomePageId: guide.page.id,
      welcomeGuideVersion: CURRENT_WELCOME_GUIDE_VERSION,
      sidebarLayout: 'compact',
      sidebarWidth: 272,
      pinnedSidebarItems: [],
      clipboardCaptureMode: 'off',
      pageDefaults: DEFAULT_PAGE_DISPLAY_DEFAULTS,
    },
  }
}
