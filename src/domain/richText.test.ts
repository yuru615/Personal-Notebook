import { describe, expect, it } from 'vitest'
import { applyRichTextMark, richTextToMarkdown, richTextToPlainText } from './richText'

describe('richText', () => {
  it('applies a mark to a selected text range', () => {
    expect(applyRichTextMark([{ text: 'hello world' }], 0, 5, { bold: true })).toEqual([
      { text: 'hello', bold: true },
      { text: ' world' },
    ])
  })

  it('adds a link to a selected text range', () => {
    expect(
      applyRichTextMark([{ text: '访问 OpenAI' }], 3, 9, {
        link: 'https://openai.com',
      }),
    ).toEqual([
      { text: '访问 ' },
      { text: 'OpenAI', link: 'https://openai.com' },
    ])
  })

  it('applies a text color to a selected text range', () => {
    expect(applyRichTextMark([{ text: 'hello world' }], 6, 11, { color: 'blue' })).toEqual([
      { text: 'hello ' },
      { text: 'world', color: 'blue' },
    ])
  })

  it('converts rich text to plain text and markdown', () => {
    const segments = [
      { text: '粗体', bold: true },
      { text: ' ' },
      { text: '斜体', italic: true },
      { text: ' ' },
      { text: '下划线', underline: true },
      { text: ' ' },
      { text: '删除线', strike: true },
      { text: ' ' },
      { text: '链接', link: 'https://example.com' },
    ]

    expect(richTextToPlainText(segments)).toBe('粗体 斜体 下划线 删除线 链接')
    expect(richTextToMarkdown(segments)).toBe(
      '**粗体** *斜体* <u>下划线</u> ~~删除线~~ [链接](https://example.com)',
    )
  })
  it('exports colored rich text as markdown-compatible html', () => {
    expect(richTextToMarkdown([{ text: 'blue', color: 'blue' }])).toBe(
      '<span style="color: #337ea9">blue</span>',
    )
  })
})
