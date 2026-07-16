import { describe, expect, it } from 'vitest'
import type { BlockRecord } from '../types'
import { createHighSchoolChineseTeacherTemplate } from './highSchoolChineseTeacher'

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

function blockText(block: BlockRecord) {
  const text = 'text' in block ? block.text : ''
  const items = 'items' in block ? block.items : []
  const rows = 'rows' in block ? block.rows.flat() : []

  return [text, ...items, ...rows]
    .filter((value): value is string => typeof value === 'string')
    .join('\n')
}

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
})
