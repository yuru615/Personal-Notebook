import { describe, expect, it } from 'vitest'
import { parseMarkdownBlocks, parseMarkdownPage } from './markdownImport'

describe('parseMarkdownPage', () => {
  it('uses the first level-one heading as the page title and converts common block syntax', () => {
    const result = parseMarkdownPage(
      'guide.md',
      [
        '# 导入指南',
        '',
        '## 准备',
        '第一段 **重点** 和 [官网](https://example.com)。',
        '',
        '- [x] 已完成',
        '- [ ] 待完成',
        '',
        '- 第一项',
        '- 第二项',
        '',
        '1. 一',
        '2. 二',
        '',
        '```ts',
        'const answer = 42',
        '```',
      ].join('\n'),
    )

    expect(result.title).toBe('导入指南')
    expect(result.blocks).toMatchObject([
      { type: 'heading_2', text: '准备' },
      {
        type: 'paragraph',
        text: '第一段 重点 和 官网。',
        richText: [
          { text: '第一段 ' },
          { text: '重点', bold: true },
          { text: ' 和 ' },
          { text: '官网', link: 'https://example.com' },
          { text: '。' },
        ],
      },
      { type: 'todo', text: '已完成', checked: true },
      { type: 'todo', text: '待完成', checked: false },
      { type: 'bulleted_list', items: ['第一项'] },
      { type: 'bulleted_list', items: ['第二项'] },
      { type: 'numbered_list', items: ['一'] },
      { type: 'numbered_list', items: ['二'] },
      { type: 'code', language: 'ts', text: 'const answer = 42' },
    ])
  })

  it('converts tables and local image candidates while preserving a missing image fallback', () => {
    const result = parseMarkdownPage(
      'notes.markdown',
      [
        '| 名称 | 状态 |',
        '| --- | --- |',
        '| 知栖 | 进行中 |',
        '',
        '![封面](./images/cover.png)',
      ].join('\n'),
    )

    expect(result).toMatchObject({
      title: 'notes',
      blocks: [
        {
          type: 'table',
          rows: [
            ['名称', '状态'],
            ['知栖', '进行中'],
          ],
        },
        {
          type: 'image_candidate',
          alt: '封面',
          source: './images/cover.png',
          fallbackText: '![封面](./images/cover.png)',
        },
      ],
    })
  })

  it('keeps every consecutive unordered and ordered list item visible as its own editor block', () => {
    const result = parseMarkdownPage(
      'todo.md',
      [
        '- 状态：暂缓',
        '- 原因：避免第一版把多种规则揉在一起',
        '- 预期方向：补齐键盘选区能力',
        '',
        '1. 第一个步骤',
        '2. 第二个步骤',
      ].join('\n'),
    )

    expect(result.blocks).toMatchObject([
      { type: 'bulleted_list', items: ['状态：暂缓'] },
      { type: 'bulleted_list', items: ['原因：避免第一版把多种规则揉在一起'] },
      { type: 'bulleted_list', items: ['预期方向：补齐键盘选区能力'] },
      { type: 'numbered_list', items: ['第一个步骤'] },
      { type: 'numbered_list', items: ['第二个步骤'] },
    ])
  })

  it('keeps unsupported syntax as editable paragraph content', () => {
    expect(parseMarkdownPage('untitled.md', '> 保留这条引用').blocks).toMatchObject([
      { type: 'paragraph', text: '> 保留这条引用' },
    ])
  })

  it('keeps a copied level-one heading as an editor block', () => {
    expect(
      parseMarkdownBlocks(
        ['# 项目计划', '', '正文包含 **重点**。', '', '- [ ] 完成测试'].join('\n'),
      ),
    ).toMatchObject([
      { type: 'heading_1', text: '项目计划' },
      {
        type: 'paragraph',
        text: '正文包含 重点。',
        richText: [{ text: '正文包含 ' }, { text: '重点', bold: true }, { text: '。' }],
      },
      { type: 'todo', text: '完成测试', checked: false },
    ])
  })
})
