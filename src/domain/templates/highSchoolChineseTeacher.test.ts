import { describe, expect, it } from 'vitest'
import type { AppState } from '../../components/dataTable/domain/types'
import type { WhiteboardSnapshot } from '../../components/whiteboard/whiteboardModel'
import type { BlockRecord } from '../types'
import {
  createHighSchoolChineseTeacherTemplate,
  type TeacherTemplateBundle,
  validateHighSchoolChineseTeacherTemplate,
} from './highSchoolChineseTeacher'

const lessonTitles = [
  '14-1《故都的秋》',
  '14-2《荷塘月色》',
  '15《我与地坛（节选）》',
  '16-1《赤壁赋》',
  '16-2《登泰山记》',
]

const lessonSectionTitles = [
  '教材定位',
  '学情分析',
  '学习目标',
  '教学重点与难点',
  '课前准备',
  '教学流程',
  '核心问题链',
  '板书设计',
  '作业设计',
  '课后复盘',
]

const taskTitles = [
  '完成第七单元整体设计',
  '整理单元学习任务单',
  '制作《故都的秋》课件',
  '高一（3）班《故都的秋》授课',
  '高一（6）班《故都的秋》授课',
  '完成《荷塘月色》第一课时备课',
  '高一（3）班《荷塘月色》第一课时',
  '高一（6）班《荷塘月色》第一课时',
  '完成《荷塘月色》第二课时备课',
  '高一（3）班《荷塘月色》第二课时',
  '高一（6）班《荷塘月色》第二课时',
  '完成《我与地坛（节选）》备课',
  '高一（3）班《我与地坛（节选）》授课',
  '高一（6）班《我与地坛（节选）》授课',
  '整理《赤壁赋》文言知识清单',
  '高一（3）班《赤壁赋》授课',
  '高一（6）班《赤壁赋》授课',
  '制作《登泰山记》游踪图',
  '高一（3）班《登泰山记》授课',
  '高一（6）班《登泰山记》授课',
  '批改单元微写作',
  '完成第七单元教学复盘',
]

const resourceTitles = [
  '第七单元整体教学设计',
  '第七单元比较阅读任务单',
  '《故都的秋》景物与色彩整理',
  '《故都的秋》南北秋景比较表',
  '《荷塘月色》教师朗读提示',
  '《荷塘月色》意象示意图',
  '通感知识卡片',
  '《我与地坛》关键语段研读提示',
  '史铁生生平背景资料入口',
  '《赤壁赋》重点实词与虚词清单',
  '《赤壁赋》主客问答结构图',
  '《登泰山记》游踪图',
  '《登泰山记》日出描写赏析表',
  '写景散文微写作提示',
  '单元写作评价量规',
  '单元复习与自测题',
]

const observationTitles = [
  '高一（3）班对通感和比喻辨析不清',
  '高一（6）班朗读能够感知节奏但缺少文本依据',
  '《故都的秋》景物特点概括停留在形容词罗列',
  '《我与地坛》母亲形象分析缺少细节证据',
  '《赤壁赋》主客问答结构理解困难',
  '文言虚词“而”的关系判断不稳定',
  '《登泰山记》游踪与时间线容易混淆',
  '写景练习存在景物堆砌且缺少情感线索',
]

const knowledgeCardTitles = [
  '情景交融',
  '通感',
  '比喻与拟人',
  '文言虚词“而”',
  '移步换景',
  '散文的情感线索',
]

interface TemplateMindmapSnapshot {
  title: string
  themeId: string
  rootId: string
  updatedAt: string
  nodes: Record<string, {
    id: string
    parentId: string | null
    childIds: string[]
    text: string
  }>
}

function blockText(block: BlockRecord) {
  const text = 'text' in block ? block.text : ''
  const items = 'items' in block ? block.items : []
  const rows = 'rows' in block ? block.rows.flat() : []

  return [text, ...items, ...rows]
    .filter((value): value is string => typeof value === 'string')
    .join('\n')
}

interface InvalidTeacherTemplateCase {
  name: string
  expectedError: string
  mutate: (template: TeacherTemplateBundle) => void
}

const invalidTeacherTemplateCases: InvalidTeacherTemplateCase[] = [
  {
    name: 'duplicate page ids',
    expectedError: 'duplicate page id: teacher-template-page-root',
    mutate: (template) => {
      template.pages.push(structuredClone(template.pages[0]!))
    },
  },
  {
    name: 'a missing page parent',
    expectedError: 'missing parent page: missing-parent',
    mutate: (template) => {
      template.pages[1]!.parentId = 'missing-parent'
    },
  },
  {
    name: 'a child page reference to a missing page',
    expectedError: 'missing page: missing-child-page',
    mutate: (template) => {
      const childPage = template.pages[0]!.blocks.find((block) => block.type === 'child_page')!
      childPage.pageId = 'missing-child-page'
    },
  },
  {
    name: 'a nested synced block in group content',
    expectedError: 'nested synced block: nested-synced-block',
    mutate: (template) => {
      const group = template.syncedBlockGroups[0]!
      group.blocks.push({
        id: 'nested-synced-block',
        type: 'synced_block',
        groupId: group.id,
        instanceId: 'nested-synced-instance',
        mode: 'reference',
      })
    },
  },
  {
    name: 'a data-table view property reference that is missing',
    expectedError: 'missing data table property: missing-view-property',
    mutate: (template) => {
      const state = template.dataTables[0]!.snapshot as AppState
      const view = state.database.views[state.database.viewOrder[0]!]!
      view.hiddenPropertyIds.push('missing-view-property')
    },
  },
  {
    name: 'duplicate asset relative paths',
    expectedError: 'duplicate asset relative path: teacher-template/lotus-pond.svg',
    mutate: (template) => {
      template.assets[1]!.relativePath = template.assets[0]!.relativePath
    },
  },
  {
    name: 'a whiteboard connection endpoint that is missing',
    expectedError: 'missing board connection endpoint: missing-board-endpoint',
    mutate: (template) => {
      const board = template.boards[0]!.snapshot as WhiteboardSnapshot
      board.connections[0]!.from = 'missing-board-endpoint'
    },
  },
  {
    name: 'a mindmap parent that does not list its child',
    expectedError: 'mindmap parent missing child:',
    mutate: (template) => {
      const snapshot = template.mindmaps[0]!.snapshot as TemplateMindmapSnapshot
      const root = snapshot.nodes[snapshot.rootId]!
      root.childIds = root.childIds.slice(1)
    },
  },
]

describe('validateHighSchoolChineseTeacherTemplate', () => {
  it('accepts the complete teacher template bundle', () => {
    expect(() => validateHighSchoolChineseTeacherTemplate(
      createHighSchoolChineseTeacherTemplate(),
    )).not.toThrow()
  })

  it('rejects a whiteboard block whose board is missing', () => {
    const template = structuredClone(createHighSchoolChineseTeacherTemplate())
    const root = template.pages.find((page) => page.id === template.rootPageId)!

    root.blocks.push({
      id: 'teacher-template-block-missing-board',
      type: 'whiteboard',
      boardId: 'missing-board',
    })

    expect(() => validateHighSchoolChineseTeacherTemplate(template))
      .toThrow('missing board: missing-board')
  })

  it('accepts hidden view groups that also occur in the group order', () => {
    const template = createHighSchoolChineseTeacherTemplate()
    const taskState = template.dataTables[0]!.snapshot as AppState
    const boardView = Object.values(taskState.database.views)
      .find((view) => view.layout === 'board')!

    boardView.boardHiddenColumnIds = [boardView.boardColumnOrder[0]!]

    expect(() => validateHighSchoolChineseTeacherTemplate(template)).not.toThrow()
  })

  it.each([
    'notes',
    'shapes',
    'strokes',
    'connections',
    'texts',
    'images',
  ] as const)('rejects a whiteboard snapshot with %s missing', (collection) => {
    const template = structuredClone(createHighSchoolChineseTeacherTemplate())
    const snapshot = template.boards[0]!.snapshot as WhiteboardSnapshot

    delete (snapshot as Partial<WhiteboardSnapshot>)[collection]

    expect(() => validateHighSchoolChineseTeacherTemplate(template))
      .toThrow(`invalid board snapshot: ${template.boards[0]!.id}`)
  })

  it('rejects a whiteboard snapshot with camera missing', () => {
    const template = structuredClone(createHighSchoolChineseTeacherTemplate())
    const snapshot = template.boards[0]!.snapshot as WhiteboardSnapshot

    delete (snapshot as Partial<WhiteboardSnapshot>).camera

    expect(() => validateHighSchoolChineseTeacherTemplate(template))
      .toThrow(`invalid board snapshot: ${template.boards[0]!.id}`)
  })

  it('accepts whiteboard connections from notes and shapes to texts and images', () => {
    const template = structuredClone(createHighSchoolChineseTeacherTemplate())
    const snapshot = template.boards[0]!.snapshot as WhiteboardSnapshot
    snapshot.images.push({
      id: 'teacher-template-board-image-endpoint',
      x: 0,
      y: 0,
      w: 100,
      h: 100,
      src: 'data:image/png;base64,',
      name: 'endpoint.png',
      z: 100,
    })
    snapshot.connections.push(
      {
        id: 'teacher-template-board-connection-note-text',
        from: snapshot.notes[0]!.id,
        to: snapshot.texts[0]!.id,
        fromSide: 'e',
        toSide: 'w',
        mode: 'straight',
        color: '#17202a',
        size: 2,
      },
      {
        id: 'teacher-template-board-connection-shape-image',
        from: snapshot.shapes[0]!.id,
        to: snapshot.images[0]!.id,
        fromSide: 'e',
        toSide: 'w',
        mode: 'straight',
        color: '#17202a',
        size: 2,
      },
    )

    expect(() => validateHighSchoolChineseTeacherTemplate(template)).not.toThrow()
  })

  it('rejects duplicate connectable whiteboard element ids', () => {
    const template = structuredClone(createHighSchoolChineseTeacherTemplate())
    const snapshot = template.boards[0]!.snapshot as WhiteboardSnapshot
    snapshot.texts[0]!.id = snapshot.notes[0]!.id

    expect(() => validateHighSchoolChineseTeacherTemplate(template))
      .toThrow(`duplicate board element id: ${snapshot.notes[0]!.id}`)
  })

  it('rejects a whiteboard stroke id that duplicates a note id', () => {
    const template = structuredClone(createHighSchoolChineseTeacherTemplate())
    const snapshot = template.boards[0]!.snapshot as WhiteboardSnapshot
    snapshot.strokes.push({
      id: snapshot.notes[0]!.id,
      color: '#17202a',
      size: 2,
      points: [{ x: 0, y: 0 }, { x: 10, y: 10 }],
    })

    expect(() => validateHighSchoolChineseTeacherTemplate(template))
      .toThrow(`duplicate board element id: ${snapshot.notes[0]!.id}`)
  })

  it('rejects a whiteboard connection id that duplicates a shape id', () => {
    const template = structuredClone(createHighSchoolChineseTeacherTemplate())
    const snapshot = template.boards[0]!.snapshot as WhiteboardSnapshot
    snapshot.connections[0]!.id = snapshot.shapes[0]!.id

    expect(() => validateHighSchoolChineseTeacherTemplate(template))
      .toThrow(`duplicate board element id: ${snapshot.shapes[0]!.id}`)
  })

  it('rejects a whiteboard stroke as a connection endpoint', () => {
    const template = structuredClone(createHighSchoolChineseTeacherTemplate())
    const snapshot = template.boards[0]!.snapshot as WhiteboardSnapshot
    snapshot.strokes.push({
      id: 'teacher-template-board-stroke-endpoint',
      color: '#17202a',
      size: 2,
      points: [{ x: 0, y: 0 }, { x: 10, y: 10 }],
    })
    snapshot.connections[0]!.from = snapshot.strokes[0]!.id

    expect(() => validateHighSchoolChineseTeacherTemplate(template))
      .toThrow(`missing board connection endpoint: ${snapshot.strokes[0]!.id}`)
  })

  it.each(invalidTeacherTemplateCases)('rejects $name', ({ expectedError, mutate }) => {
    const template = structuredClone(createHighSchoolChineseTeacherTemplate())

    mutate(template)

    expect(() => validateHighSchoolChineseTeacherTemplate(template)).toThrow(expectedError)
  })
})

describe('createHighSchoolChineseTeacherTemplate', () => {
  it('creates the approved single-root teacher page tree', () => {
    const template = createHighSchoolChineseTeacherTemplate()
    const root = template.pages.find((page) => page.id === template.rootPageId)
    const pageTitles = template.pages.map((page) => page.title)

    expect(template.pages).toHaveLength(36)
    expect(root).toMatchObject({
      parentId: null,
      title: '高中语文教师工作台｜高一上学期',
      icon: '📚',
      cover: 'forest',
    })
    expect(pageTitles).toEqual(expect.arrayContaining([
      '00 模板使用说明',
      '01 教师工作台',
      '02 教学规划',
      '第七单元｜自然情怀',
      '03 教学执行',
      '04 资源与知识库',
      '05 作业与学情',
      '06 复盘与成长',
      '情景交融',
      '通感',
      '比喻与拟人',
      '文言虚词“而”',
      '移步换景',
      '散文的情感线索',
      ...lessonTitles,
    ]))
  })

  it('keeps page and block ids unique and the full hierarchy connected', () => {
    const template = createHighSchoolChineseTeacherTemplate()
    const pageIds = template.pages.map((page) => page.id)
    const blockIds = template.pages.flatMap((page) => page.blocks.map((block) => block.id))
    const roots = template.pages.filter((page) => page.parentId === null)
    const pagesById = new Map(template.pages.map((page) => [page.id, page]))

    expect(new Set(pageIds).size).toBe(pageIds.length)
    expect(new Set(blockIds).size).toBe(blockIds.length)
    expect(roots.map((page) => page.id)).toEqual([template.rootPageId])

    for (const page of template.pages.filter((page) => page.parentId !== null)) {
      expect(pagesById.has(page.parentId!)).toBe(true)
    }

    const reachablePageIds = new Set([template.rootPageId])
    const queue = [template.rootPageId]

    while (queue.length > 0) {
      const parentId = queue.shift()!
      const directChildren = template.pages.filter((page) => page.parentId === parentId)

      for (const child of directChildren) {
        if (!reachablePageIds.has(child.id)) {
          reachablePageIds.add(child.id)
          queue.push(child.id)
        }
      }
    }

    expect(reachablePageIds.size).toBe(36)

    for (const page of template.pages) {
      const expectedChildIds = template.pages
        .filter((child) => child.parentId === page.id)
        .map((child) => child.id)
        .sort()
      const actualChildIds = page.blocks
        .filter((block) => block.type === 'child_page')
        .map((block) => block.pageId)
        .sort()

      expect(actualChildIds).toEqual(expectedChildIds)
    }
  })

  it.each(lessonTitles)('%s contains a complete reusable lesson structure', (title) => {
    const template = createHighSchoolChineseTeacherTemplate()
    const lesson = template.pages.find((page) => page.title === title)
    const headingTexts = lesson?.blocks
      .filter((block) => block.type === 'heading_2')
      .map((block) => block.text)

    expect(headingTexts).toEqual(lessonSectionTitles)
    expect(lesson?.blocks.some((block) => block.type === 'table')).toBe(true)
    expect(lesson?.blocks.some((block) => block.type === 'code')).toBe(true)
  })

  it('makes 荷塘月色 the complete two-period demonstration lesson', () => {
    const template = createHighSchoolChineseTeacherTemplate()
    const lesson = template.pages.find((page) => page.title === '14-2《荷塘月色》')
    const text = lesson?.blocks.map(blockText).join('\n') ?? ''

    expect(text).toContain('第一课时')
    expect(text).toContain('第二课时')
    expect(text).toContain('朗读设计')
    expect(text).toContain('通感')
    expect(text).toContain('微写作')
  })

  it('isolates lesson list and table content between template builds', () => {
    const firstTemplate = createHighSchoolChineseTeacherTemplate()
    const firstLesson = firstTemplate.pages.find((page) => page.title === lessonTitles[0])
    const firstObjectives = firstLesson?.blocks.find((block) => block.type === 'numbered_list')
    const firstFlow = firstLesson?.blocks.find((block) => block.type === 'table')

    if (firstObjectives?.type !== 'numbered_list' || firstFlow?.type !== 'table') {
      throw new Error('Expected lesson objectives and teaching-flow table')
    }

    const originalObjective = firstObjectives.items[0]
    const originalFlowCell = firstFlow.rows[1]?.[2]

    if (!originalObjective || !originalFlowCell || !firstFlow.rows[1]) {
      throw new Error('Expected populated lesson objectives and teaching-flow rows')
    }

    firstObjectives.items[0] = 'mutated objective'
    firstFlow.rows[1][2] = 'mutated teaching-flow cell'

    const freshTemplate = createHighSchoolChineseTeacherTemplate()
    const freshLesson = freshTemplate.pages.find((page) => page.title === lessonTitles[0])
    const freshObjectives = freshLesson?.blocks.find((block) => block.type === 'numbered_list')
    const freshFlow = freshLesson?.blocks.find((block) => block.type === 'table')

    if (freshObjectives?.type !== 'numbered_list' || freshFlow?.type !== 'table') {
      throw new Error('Expected fresh lesson objectives and teaching-flow table')
    }

    expect(freshObjectives.items[0]).toBe(originalObjective)
    expect(freshFlow.rows[1]?.[2]).toBe(originalFlowCell)
  })

  it('keeps teaching text free of encoding and implementation artifacts', () => {
    const template = createHighSchoolChineseTeacherTemplate()
    const text = template.pages
      .flatMap((page) => page.blocks.map(blockText))
      .join('\n')

    expect(text).not.toContain('\uFFFD')
    expect(text).not.toContain('Task 1')
  })

  it('contains the approved structured teaching records and task views', () => {
    const template = createHighSchoolChineseTeacherTemplate()

    expect(template.dataTables.map((dataTable) => dataTable.title)).toEqual([
      '教学任务库',
      '教学资源库',
      '学情观察库',
    ])
    if (template.dataTables.length !== 3) {
      return
    }

    const snapshots = template.dataTables.map((dataTable) => dataTable.snapshot as AppState)
    expect(snapshots.map((snapshot) => Object.keys(snapshot.records).length)).toEqual([22, 16, 8])
    expect(Object.values(snapshots[0]!.records).map((record) => record.title)).toEqual(taskTitles)
    expect(Object.values(snapshots[1]!.records).map((record) => record.title)).toEqual(resourceTitles)
    expect(Object.values(snapshots[2]!.records).map((record) => record.title)).toEqual(observationTitles)

    const taskState = snapshots[0]!
    expect(taskState.database.viewOrder.map((viewId) => taskState.database.views[viewId]?.layout)).toEqual([
      'table',
      'board',
      'calendar',
      'gantt',
      'table',
    ])
    expect(taskState.database.viewOrder.map((viewId) => taskState.database.views[viewId]?.name)).toEqual([
      '全部任务',
      '备课看板',
      '教学日历',
      '单元进度',
      '本周待办',
    ])

    const taskProperties = Object.values(taskState.properties)
    const dueDateProperty = taskProperties.find((property) => property.key === 'dueDate')
    const statusProperty = taskProperties.find((property) => property.key === 'status')
    const priorityProperty = taskProperties.find((property) => property.key === 'priority')
    expect(dueDateProperty).toBeDefined()
    expect(statusProperty?.config.options?.map((option) => option.label)).toEqual([
      '已完成',
      '进行中',
      '待反馈',
      '未开始',
    ])
    expect(priorityProperty?.config.options?.map(({ id, label }) => [id, label])).toEqual([
      ['high', '高'],
      ['medium', '中'],
      ['low', '低'],
    ])

    if (!dueDateProperty || !statusProperty) {
      return
    }

    const dueDates = Object.values(taskState.records).map((record) => String(record.values[dueDateProperty.id]))
    expect(dueDates[0]).toBe('2026-10-19')
    expect(dueDates.at(-1)).toBe('2026-11-13')
    expect(dueDates).toEqual([...dueDates].sort())
    const weekView = taskState.database.views[taskState.database.viewOrder[4]!]
    expect(weekView?.filters).toEqual([
      expect.objectContaining({
        propertyId: statusProperty.id,
        operator: 'isNot',
        value: '已完成',
      }),
    ])
  })

  it('uses table, follow-up board, and review calendar layouts for observations', () => {
    const template = createHighSchoolChineseTeacherTemplate()
    const observationTable = template.dataTables.find((dataTable) => dataTable.title === '学情观察库')

    expect(observationTable).toBeDefined()
    if (!observationTable) {
      return
    }

    const snapshot = observationTable.snapshot as AppState
    const statusProperty = Object.values(snapshot.properties).find((property) => property.key === 'status')
    const reviewDateProperty = Object.values(snapshot.properties).find((property) => property.key === 'reviewDate')
    const views = snapshot.database.viewOrder.map((viewId) => snapshot.database.views[viewId]!)

    expect(views.map((view) => view.layout)).toEqual(['table', 'board', 'calendar'])
    expect(views.map((view) => view.name)).toEqual(['全部观察', '跟进看板', '复查日历'])
    expect(views[1]?.boardGroupPropertyId).toBe(statusProperty?.id)
    expect(views[2]?.calendarDatePropertyId).toBe(reviewDateProperty?.id)
  })

  it('keeps every data-table property, record-page, and view reference valid', () => {
    const template = createHighSchoolChineseTeacherTemplate()

    expect(template.dataTables).toHaveLength(3)
    if (template.dataTables.length !== 3) {
      return
    }

    for (const dataTable of template.dataTables) {
      const snapshot = dataTable.snapshot as AppState
      const propertyIds = new Set(Object.keys(snapshot.properties))
      const recordIds = Object.keys(snapshot.records)

      expect(snapshot.database.id).toBe(dataTable.id)
      expect(snapshot.database.name).toBe(dataTable.title)
      expect(snapshot.database.propertyOrder.every((propertyId) => propertyIds.has(propertyId))).toBe(true)
      expect(Object.keys(snapshot.recordPages)).toEqual(recordIds)
      expect(snapshot.database.viewOrder.every((viewId) => Boolean(snapshot.database.views[viewId]))).toBe(true)

      for (const record of Object.values(snapshot.records)) {
        expect(Object.keys(record.values).every((propertyId) => propertyIds.has(propertyId))).toBe(true)
        expect(snapshot.recordPages[record.id]).toEqual({
          recordId: record.id,
          blockIds: [],
          updatedAt: record.updatedAt,
        })
      }

      for (const view of Object.values(snapshot.database.views)) {
        const propertyReferences = [
          view.sort?.propertyId,
          ...view.filters.map((filter) => filter.propertyId),
          view.tableGroupPropertyId,
          view.boardGroupPropertyId,
          view.ganttStartPropertyId,
          view.ganttEndPropertyId,
          view.calendarDatePropertyId,
          ...view.hiddenPropertyIds,
          ...Object.keys(view.columnWidths),
        ].filter((propertyId): propertyId is string => Boolean(propertyId))

        expect(propertyReferences.every((propertyId) => propertyIds.has(propertyId))).toBe(true)
      }
    }
  })

  it('configures unique options for every select and multi-select record value', () => {
    const template = createHighSchoolChineseTeacherTemplate()

    for (const dataTable of template.dataTables) {
      const snapshot = dataTable.snapshot as AppState
      for (const property of Object.values(snapshot.properties)) {
        if (property.type !== 'select' && property.type !== 'multiSelect') {
          continue
        }

        const options = property.config.options ?? []
        const optionIds = options.map((option) => option.id)
        const optionLabels = options.map((option) => option.label)
        const configuredLabels = new Set(optionLabels)
        const recordLabels = Object.values(snapshot.records).flatMap((record) => {
          const value = record.values[property.id]
          if (Array.isArray(value)) {
            return value
          }
          return value === null || value === undefined || value === '' ? [] : [String(value)]
        })

        expect(new Set(optionIds).size, `${dataTable.title}.${property.key} option ids`).toBe(optionIds.length)
        expect(new Set(optionLabels).size, `${dataTable.title}.${property.key} option labels`).toBe(optionLabels.length)
        expect(
          recordLabels.every((label) => configuredLabels.has(label)),
          `${dataTable.title}.${property.key} record labels`,
        ).toBe(true)
      }
    }
  })

  it('creates editable boards and fully connected mindmaps', () => {
    const template = createHighSchoolChineseTeacherTemplate()

    expect(template.boards.map((board) => board.title)).toEqual([
      '第七单元教学设计白板',
      '《荷塘月色》课堂流程白板',
    ])
    expect(template.mindmaps.map((mindmap) => mindmap.title)).toEqual([
      '第七单元知识导图',
      '《荷塘月色》文本细读导图',
    ])
    if (template.boards.length !== 2 || template.mindmaps.length !== 2) {
      return
    }

    const unitBoard = template.boards[0]!.snapshot as WhiteboardSnapshot
    const lotusBoard = template.boards[1]!.snapshot as WhiteboardSnapshot
    expect(unitBoard.shapes.map((shape) => shape.text)).toEqual([
      '单元主题',
      '核心问题',
      '文本研读',
      '学习活动',
      '学习成果',
      '评价与复盘',
    ])
    expect(unitBoard.notes).toHaveLength(6)
    expect(new Set(unitBoard.notes.slice(0, 5).map((note) => note.color)).size).toBe(2)
    expect(unitBoard.notes.some((note) => note.text.trim() === '课堂生成')).toBe(true)
    expect(unitBoard.texts.length).toBeGreaterThan(0)

    expect(lotusBoard.shapes.map((shape) => shape.text)).toEqual([
      '第一课时',
      '第二课时',
      '板书布局',
      '课堂生成',
    ])
    expect(lotusBoard.notes.length).toBeGreaterThanOrEqual(8)
    expect(lotusBoard.notes.every((note) => /\d+ 分钟/.test(note.text))).toBe(true)

    for (const board of [unitBoard, lotusBoard]) {
      const endpointIds = new Set([
        ...board.notes.map((note) => note.id),
        ...board.shapes.map((shape) => shape.id),
        ...board.texts.map((text) => text.id),
      ])
      expect(board.connections.length).toBeGreaterThan(0)
      expect(board.connections.every((connection) => (
        endpointIds.has(connection.from) && endpointIds.has(connection.to)
      ))).toBe(true)
    }

    const expectedMaps = [
      {
        snapshot: template.mindmaps[0]!.snapshot as TemplateMindmapSnapshot,
        themeId: 'mint',
        rootText: '自然情怀',
        branches: ['现代散文', '古代山水', '阅读方法', '表达知识', '单元成果'],
      },
      {
        snapshot: template.mindmaps[1]!.snapshot as TemplateMindmapSnapshot,
        themeId: 'dusk',
        rootText: '荷塘月色',
        branches: ['行文结构', '景物层次', '语言特点', '情感变化', '主题理解'],
      },
    ]

    for (const { snapshot, themeId, rootText, branches } of expectedMaps) {
      const root = snapshot.nodes[snapshot.rootId]
      expect(snapshot.themeId).toBe(themeId)
      expect(snapshot.updatedAt).toBe('2026-07-16T00:00:00.000Z')
      expect(root?.text).toBe(rootText)
      expect(root?.childIds.map((childId) => snapshot.nodes[childId]?.text)).toEqual(branches)
      expect(root?.childIds.every((childId) => (snapshot.nodes[childId]?.childIds.length ?? 0) > 0)).toBe(true)

      const reachable = new Set<string>()
      const queue = [snapshot.rootId]
      while (queue.length > 0) {
        const nodeId = queue.shift()!
        if (reachable.has(nodeId)) {
          continue
        }
        reachable.add(nodeId)
        const node = snapshot.nodes[nodeId]
        for (const childId of node?.childIds ?? []) {
          expect(snapshot.nodes[childId]?.parentId).toBe(nodeId)
          queue.push(childId)
        }
      }
      expect(reachable.size).toBe(Object.keys(snapshot.nodes).length)
    }
  })

  it('keeps template board visuals below the fixed toolbar top safe area', () => {
    const template = createHighSchoolChineseTeacherTemplate()
    const boardTopSafeY = 90
    const minimumVisualYs = template.boards.map((board) => {
      const snapshot = board.snapshot as WhiteboardSnapshot
      const visualYs = [
        ...snapshot.shapes.map((shape) => shape.y),
        ...snapshot.notes.map((note) => note.y),
        ...snapshot.texts.map((text) => text.y),
        ...snapshot.images.map((image) => image.y),
        ...snapshot.strokes.flatMap((stroke) => stroke.points.map((point) => point.y)),
      ]

      return { title: board.title, y: Math.min(...visualYs) }
    })

    expect(
      minimumVisualYs.every(({ y }) => y >= boardTopSafeY),
      `template board minimum visual y: ${JSON.stringify(minimumVisualYs)}`,
    ).toBe(true)
  })

  it('attaches valid structured references, synced instances, mentions, and assets to planned pages', () => {
    const template = createHighSchoolChineseTeacherTemplate()
    const pagesByTitle = new Map(template.pages.map((page) => [page.title, page]))
    const dataTablesByTitle = new Map(template.dataTables.map((dataTable) => [dataTable.title, dataTable]))
    const boardsByTitle = new Map(template.boards.map((board) => [board.title, board]))
    const mindmapsByTitle = new Map(template.mindmaps.map((mindmap) => [mindmap.title, mindmap]))
    const pageIds = new Set(template.pages.map((page) => page.id))
    const assetIds = new Set(template.assets.map((asset) => asset.id))

    expect(template.syncedBlockGroups.map((group) => group.id)).toEqual([
      'teacher-template-synced-group-unit-goals',
      'teacher-template-synced-group-reflection-questions',
    ])
    expect(template.assets.map((asset) => asset.name)).toEqual([
      '荷塘月色意象示意图.svg',
      '朗读停连标记示例.txt',
    ])
    if (
      template.dataTables.length !== 3 ||
      template.boards.length !== 2 ||
      template.mindmaps.length !== 2 ||
      template.syncedBlockGroups.length !== 2 ||
      template.assets.length !== 2
    ) {
      return
    }

    const expectedTablePages = [
      ['01 教师工作台', '教学任务库'],
      ['备课与教学任务', '教学任务库'],
      ['教学进度与日历', '教学任务库'],
      ['教学资源库', '教学资源库'],
      ['班级教学观察', '学情观察库'],
    ] as const
    for (const [pageTitle, dataTableTitle] of expectedTablePages) {
      const page = pagesByTitle.get(pageTitle)
      const dataTable = dataTablesByTitle.get(dataTableTitle)
      expect(page?.blocks.some((block) => (
        block.type === 'data_table' && block.databaseId === dataTable?.id
      ))).toBe(true)
    }

    expect(pagesByTitle.get('第七单元课堂流程白板')?.blocks.some((block) => (
      block.type === 'whiteboard' && block.boardId === boardsByTitle.get('第七单元教学设计白板')?.id
    ))).toBe(true)
    expect(pagesByTitle.get('14-2《荷塘月色》')?.blocks.some((block) => (
      block.type === 'whiteboard' && block.boardId === boardsByTitle.get('《荷塘月色》课堂流程白板')?.id
    ))).toBe(true)
    expect(pagesByTitle.get('第七单元知识导图')?.blocks.some((block) => (
      block.type === 'mindmap' && block.mindmapId === mindmapsByTitle.get('第七单元知识导图')?.id
    ))).toBe(true)
    expect(pagesByTitle.get('14-2《荷塘月色》')?.blocks.some((block) => (
      block.type === 'mindmap' && block.mindmapId === mindmapsByTitle.get('《荷塘月色》文本细读导图')?.id
    ))).toBe(true)

    const syncedInstances = template.pages.flatMap((page) => page.blocks
      .filter((block) => block.type === 'synced_block')
      .map((block) => ({ pageTitle: page.title, block })))
    const unitGoalInstances = syncedInstances.filter(({ block }) => (
      block.groupId === 'teacher-template-synced-group-unit-goals'
    ))
    const reflectionInstances = syncedInstances.filter(({ block }) => (
      block.groupId === 'teacher-template-synced-group-reflection-questions'
    ))
    expect(unitGoalInstances.map(({ pageTitle, block }) => [pageTitle, block.mode])).toEqual([
      ['01 教师工作台', 'sync'],
      ['单元总览', 'reference'],
      ...lessonTitles.map((title) => [title, 'reference']),
    ])
    expect(reflectionInstances.map(({ pageTitle, block }) => [pageTitle, block.mode])).toEqual([
      ...lessonTitles.map((title) => [title, 'reference']),
      ['课后复盘', 'sync'],
    ])
    for (const group of template.syncedBlockGroups) {
      expect(group.blocks.some((block) => block.type === 'synced_block')).toBe(false)
      expect(syncedInstances.some(({ block }) => block.instanceId === group.primaryInstanceId)).toBe(true)
    }

    const knowledgeCardIds = new Set(knowledgeCardTitles.map((title) => pagesByTitle.get(title)?.id))
    const mentionedCardIds = new Set<string>()
    for (const lessonTitle of lessonTitles) {
      const lesson = pagesByTitle.get(lessonTitle)
      const mentions = lesson?.blocks.flatMap((block) => (
        'richText' in block ? block.richText ?? [] : []
      )).filter((segment) => segment.relationKind === 'mention') ?? []
      expect(mentions.length).toBeGreaterThan(0)
      for (const mention of mentions) {
        expect(mention.pageId && pageIds.has(mention.pageId)).toBe(true)
        expect(mention.pageId && knowledgeCardIds.has(mention.pageId)).toBe(true)
        if (mention.pageId) {
          mentionedCardIds.add(mention.pageId)
        }
      }
    }
    expect(mentionedCardIds).toEqual(knowledgeCardIds)

    const lotusPage = pagesByTitle.get('14-2《荷塘月色》')
    const image = lotusPage?.blocks.find((block) => block.type === 'image')
    const file = lotusPage?.blocks.find((block) => block.type === 'file')
    expect(image?.type === 'image' && image.assetId && assetIds.has(image.assetId)).toBe(true)
    expect(file?.type === 'file' && file.assetId && assetIds.has(file.assetId)).toBe(true)
    if (image?.type === 'image') {
      expect(image.caption).not.toBe('')
      expect(image.alt).not.toBe('')
    }
  })

  it('builds deeply equal deterministic template output', () => {
    expect(createHighSchoolChineseTeacherTemplate()).toEqual(createHighSchoolChineseTeacherTemplate())
  })

  it('keeps examples anonymous, copyright-safe, and independently mutable', () => {
    const firstTemplate = createHighSchoolChineseTeacherTemplate()
    const serialized = JSON.stringify(firstTemplate)

    expect(serialized).not.toMatch(/张三|李四|王五|学号[：:]?\s*\d+/)
    expect(serialized).toContain('待补充')
    expect(serialized).not.toMatch(/(?:教材扫描件|商业课件附件).{0,20}(?:已包含|已附|随模板提供)/)
    expect(firstTemplate.assets.map(({ name, mimeType, relativePath }) => ({ name, mimeType, relativePath }))).toEqual([
      {
        name: '荷塘月色意象示意图.svg',
        mimeType: 'image/svg+xml',
        relativePath: 'teacher-template/lotus-pond.svg',
      },
      {
        name: '朗读停连标记示例.txt',
        mimeType: 'text/plain',
        relativePath: 'teacher-template/reading-pauses.txt',
      },
    ])
    if (firstTemplate.dataTables.length === 0 || firstTemplate.boards.length === 0 || firstTemplate.assets.length === 0) {
      return
    }

    const pristineTemplate = createHighSchoolChineseTeacherTemplate()
    const firstTaskState = firstTemplate.dataTables[0]!.snapshot as AppState
    const firstBoard = firstTemplate.boards[0]!.snapshot as WhiteboardSnapshot
    const firstMindmap = firstTemplate.mindmaps[0]!.snapshot as TemplateMindmapSnapshot
    const optionProperty = Object.values(firstTaskState.properties).find((property) => property.config.options?.length)
    const filteredView = Object.values(firstTaskState.database.views).find((view) => view.filters.length > 0)
    const classProperty = Object.values(firstTaskState.properties).find((property) => property.key === 'className')
    const classRecord = Object.values(firstTaskState.records).find((record) => (
      classProperty && Array.isArray(record.values[classProperty.id]) && record.values[classProperty.id].length > 0
    ))
    const recordPage = classRecord ? firstTaskState.recordPages[classRecord.id] : undefined
    const syncedContent = firstTemplate.syncedBlockGroups[0]?.blocks[0]
    const richTextBlock = firstTemplate.pages
      .flatMap((page) => page.blocks)
      .find((block) => 'richText' in block && (block.richText?.length ?? 0) > 0)

    if (
      !optionProperty?.config.options?.[0] ||
      !filteredView ||
      !classProperty ||
      !classRecord ||
      !recordPage ||
      syncedContent?.type !== 'numbered_list' ||
      !syncedContent.items[0] ||
      !richTextBlock ||
      !('richText' in richTextBlock) ||
      !richTextBlock.richText?.[0]
    ) {
      throw new Error('Expected nested structured template fixtures')
    }

    const classValues = classRecord.values[classProperty.id] as string[]

    firstTaskState.database.viewOrder.push('mutated-view')
    optionProperty.config.options[0].label = 'mutated option'
    filteredView.filters.push({ ...filteredView.filters[0]!, id: 'mutated-filter' })
    classValues.push('mutated class')
    recordPage.blockIds.push('mutated-block')
    firstBoard.notes[0]!.text = 'mutated note'
    firstMindmap.nodes[firstMindmap.rootId]!.text = 'mutated mindmap'
    syncedContent.items[0] = 'mutated synced text'
    richTextBlock.richText[0].text = 'mutated rich text'
    firstTemplate.assets[0]!.bytes[0] = 0

    expect(createHighSchoolChineseTeacherTemplate()).toEqual(pristineTemplate)
  })
})
