import { describe, expect, it } from 'vitest'
import { pdfTextToBlocks, resolvePdfTitle } from './pdfImport'

describe('PDF import', () => {
  it('prefers a PDF metadata title and otherwise uses the file name', () => {
    expect(resolvePdfTitle('E:\\资料\\季度复盘.pdf', '2026 年第二季度复盘')).toBe('2026 年第二季度复盘')
    expect(resolvePdfTitle('E:\\资料\\季度复盘.pdf', '   ')).toBe('季度复盘')
  })

  it('maps positioned text into heading levels and grouped paragraph lines', () => {
    const blocks = pdfTextToBlocks([
      { text: '项目复盘', x: 72, y: 720, size: 24 },
      { text: '本季度完成了核心编辑器优化。', x: 72, y: 680, size: 12 },
      { text: '导入体验也得到改善。', x: 72, y: 664, size: 12 },
      { text: '主要成果', x: 72, y: 620, size: 18 },
      { text: '性能优化', x: 72, y: 580, size: 15 },
      { text: '页面切换速度明显提升。', x: 72, y: 544, size: 12 },
    ])

    expect(blocks).toMatchObject([
      { type: 'heading_1', text: '项目复盘' },
      { type: 'paragraph', text: '本季度完成了核心编辑器优化。\n导入体验也得到改善。' },
      { type: 'heading_2', text: '主要成果' },
      { type: 'heading_3', text: '性能优化' },
      { type: 'paragraph', text: '页面切换速度明显提升。' },
    ])
  })

  it('keeps word boundaries when a PDF splits a line into adjacent text items', () => {
    const blocks = pdfTextToBlocks([
      { text: 'Project', x: 72, y: 720, size: 12, width: 40 },
      { text: 'Review', x: 118, y: 720, size: 12, width: 38 },
    ])

    expect(blocks).toMatchObject([{ type: 'paragraph', text: 'Project Review' }])
  })

  it('rejects PDFs without extractable text instead of creating an empty page', () => {
    expect(() => pdfTextToBlocks([])).toThrow('未检测到可编辑文本')
  })
})
