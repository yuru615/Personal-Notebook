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

  it.each(lessonTitles)('%s contains a complete reusable lesson structure', (title) => {
    const template = createHighSchoolChineseTeacherTemplate()
    const lesson = template.pages.find((page) => page.title === title)
    const text = lesson?.blocks.map(blockText).join('\n') ?? ''

    expect(text).toContain('学习目标')
    expect(text).toContain('教学重点与难点')
    expect(text).toContain('教学流程')
    expect(text).toContain('核心问题链')
    expect(text).toContain('作业设计')
    expect(text).toContain('课后复盘')
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

  it('keeps teaching text free of encoding and implementation artifacts', () => {
    const template = createHighSchoolChineseTeacherTemplate()
    const text = template.pages
      .flatMap((page) => page.blocks.map(blockText))
      .join('\n')

    expect(text).not.toContain('\uFFFD')
    expect(text).not.toContain('Task 1')
  })
})
