import { describe, expect, it } from 'vitest'
import { createSeedWorkspace } from './seed'

describe('createSeedWorkspace', () => {
  it('includes a welcome page that introduces Zhixi and its first-use workflow', () => {
    const workspace = createSeedWorkspace()
    const welcomePage = workspace.pages.find((page) => page.title === '欢迎使用知栖')

    expect(welcomePage).toBeDefined()
    expect(welcomePage?.blocks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'heading_1', text: '知栖使用手册' }),
        expect.objectContaining({ type: 'heading_2', text: '开始记录' }),
        expect.objectContaining({ type: 'heading_2', text: '页面与块' }),
        expect.objectContaining({ type: 'heading_2', text: '组织与搜索' }),
        expect.objectContaining({ type: 'heading_2', text: '媒体与导入' }),
        expect.objectContaining({ type: 'heading_2', text: '数据表实操' }),
        expect.objectContaining({ type: 'heading_2', text: '白板实操' }),
        expect.objectContaining({ type: 'heading_2', text: '思维导图实操' }),
        expect.objectContaining({ type: 'heading_2', text: '设置与备份' }),
      ]),
    )
    expect(welcomePage?.blocks.some((block) => block.type === 'bulleted_list')).toBe(true)
    expect(workspace.settings.lastOpenedPageId).toBe(welcomePage?.id)
  })

  it('includes editable data table, whiteboard, and mindmap examples in the welcome guide', () => {
    const workspace = createSeedWorkspace()
    const welcomePage = workspace.pages.find((page) => page.title === '\u6b22\u8fce\u4f7f\u7528\u77e5\u6816')
    const board = workspace.boards[0]
    const dataTable = workspace.dataTables?.[0]
    const mindmap = workspace.mindmaps?.[0]

    expect(board).toMatchObject({ title: '\u767d\u677f\u793a\u4f8b' })
    expect(dataTable).toMatchObject({ title: '\u4efb\u52a1\u6570\u636e\u8868' })
    expect(mindmap).toMatchObject({ title: '\u9879\u76ee\u89c4\u5212\u5bfc\u56fe' })
    expect(welcomePage?.blocks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'whiteboard', boardId: board?.id }),
        expect.objectContaining({ type: 'data_table', databaseId: dataTable?.id }),
        expect.objectContaining({ type: 'mindmap', mindmapId: mindmap?.id }),
      ]),
    )
    expect(board?.snapshot.notes).toHaveLength(3)
    expect(Object.keys(dataTable?.snapshot.records ?? {})).toHaveLength(3)
    expect(Object.keys((mindmap?.snapshot as { nodes?: Record<string, unknown> }).nodes ?? {})).toHaveLength(7)
  })
})
