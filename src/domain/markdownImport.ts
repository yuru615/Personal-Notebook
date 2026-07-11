import { createId } from '../utils/id'
import type { BlockRecord, RichTextSegment } from './types'

export interface MarkdownImageCandidate {
  type: 'image_candidate'
  source: string
  alt: string
  fallbackText: string
}

export type MarkdownImportBlock = BlockRecord | MarkdownImageCandidate

export interface MarkdownPageImport {
  title: string
  blocks: MarkdownImportBlock[]
}

type MarkdownTextBlock = Extract<
  BlockRecord,
  { type: 'paragraph' | 'heading_1' | 'heading_2' | 'heading_3' | 'todo' }
>

interface ParsedInlineText {
  text: string
  richText: RichTextSegment[]
}

const headingPattern = /^\s{0,3}(#{1,3})\s+(.+?)(?:\s+#+\s*)?$/
const todoPattern = /^\s*[-*+]\s+\[([ xX])\]\s+(.*)$/
const bulletPattern = /^\s*[-*+]\s+(.*)$/
const numberedPattern = /^\s*\d+[.)]\s+(.*)$/
const imagePattern = /^!\[([^\]]*)\]\(([^\s)]+)(?:\s+['"][^'"]*['"])?\)$/
const inlinePattern = /(\*\*([^*]+)\*\*|~~([^~]+)~~|`([^`]+)`|\*([^*]+)\*|\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)|(https?:\/\/[^\s)]+))/g

function fileNameWithoutExtension(fileName: string) {
  const baseName = fileName.split(/[\\/]/).at(-1) ?? fileName
  return baseName.replace(/\.[^.]+$/, '') || baseName
}

function parseInlineText(value: string): ParsedInlineText {
  const richText: RichTextSegment[] = []
  let cursor = 0

  for (const match of value.matchAll(inlinePattern)) {
    const index = match.index ?? 0

    if (index > cursor) {
      richText.push({ text: value.slice(cursor, index) })
    }

    if (match[2] !== undefined) {
      richText.push({ text: match[2], bold: true })
    } else if (match[3] !== undefined) {
      richText.push({ text: match[3], strike: true })
    } else if (match[4] !== undefined) {
      richText.push({ text: match[4] })
    } else if (match[5] !== undefined) {
      richText.push({ text: match[5], italic: true })
    } else if (match[6] !== undefined) {
      richText.push({ text: match[6], link: match[7] })
    } else {
      richText.push({ text: match[8], link: match[8] })
    }

    cursor = index + match[0].length
  }

  if (cursor < value.length) {
    richText.push({ text: value.slice(cursor) })
  }

  return {
    text: richText.map((segment) => segment.text).join(''),
    richText,
  }
}

function toTextBlock(
  type: MarkdownTextBlock['type'],
  value: string,
  checked?: boolean,
): MarkdownTextBlock {
  const parsed = parseInlineText(value)
  const richText = parsed.richText.some((segment) => segment.bold || segment.italic || segment.strike || segment.link)

  if (type === 'todo') {
    return {
      id: createId('block'),
      type,
      text: parsed.text,
      checked: Boolean(checked),
      ...(richText ? { richText: parsed.richText } : {}),
    }
  }

  return {
    id: createId('block'),
    type,
    text: parsed.text,
    ...(richText ? { richText: parsed.richText } : {}),
  } as MarkdownTextBlock
}

function splitTableRow(line: string) {
  const trimmed = line.trim().replace(/^\||\|$/g, '')
  return trimmed.split('|').map((cell) => parseInlineText(cell.trim()).text)
}

function isTableSeparator(line: string) {
  const cells = splitTableRow(line)
  return cells.length > 1 && cells.every((cell) => /^:?-{3,}:?$/.test(cell))
}

function isTableRow(line: string) {
  return line.includes('|')
}

function findClosingFence(lines: string[], start: number, fence: string) {
  const closingPattern = new RegExp(`^\\s{0,3}${fence[0]}{${fence.length},}\\s*$`)

  for (let index = start + 1; index < lines.length; index += 1) {
    if (closingPattern.test(lines[index])) {
      return index
    }
  }

  return -1
}

function parseMarkdownDocument(
  fileName: string,
  contents: string,
  useFirstHeadingAsTitle: boolean,
): MarkdownPageImport {
  const lines = contents.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').split('\n')
  const blocks: MarkdownImportBlock[] = []
  let title = fileNameWithoutExtension(fileName)
  let usedFirstHeading = false
  let paragraphLines: string[] = []

  const flushParagraph = () => {
    if (paragraphLines.length > 0) {
      blocks.push(toTextBlock('paragraph', paragraphLines.join('\n')))
      paragraphLines = []
    }
  }

  for (let index = 0; index < lines.length; ) {
    const line = lines[index]
    const trimmed = line.trim()

    if (!trimmed) {
      flushParagraph()
      index += 1
      continue
    }

    const fenceMatch = line.match(/^\s{0,3}(`{3,}|~{3,})(.*)$/)
    if (fenceMatch) {
      const closingIndex = findClosingFence(lines, index, fenceMatch[1])

      if (closingIndex >= 0) {
        flushParagraph()
        blocks.push({
          id: createId('block'),
          type: 'code',
          language: fenceMatch[2].trim().split(/\s+/)[0] || 'text',
          text: lines.slice(index + 1, closingIndex).join('\n'),
        })
        index = closingIndex + 1
        continue
      }
    }

    const headingMatch = line.match(headingPattern)
    if (headingMatch) {
      flushParagraph()
      const headingType = `heading_${headingMatch[1].length}` as Extract<
        MarkdownTextBlock['type'],
        'heading_1' | 'heading_2' | 'heading_3'
      >

      if (useFirstHeadingAsTitle && headingType === 'heading_1' && !usedFirstHeading) {
        title = parseInlineText(headingMatch[2]).text || title
        usedFirstHeading = true
      } else {
        blocks.push(toTextBlock(headingType, headingMatch[2]))
      }

      index += 1
      continue
    }

    const imageMatch = trimmed.match(imagePattern)
    if (imageMatch) {
      flushParagraph()
      blocks.push({
        type: 'image_candidate',
        source: imageMatch[2],
        alt: imageMatch[1],
        fallbackText: trimmed,
      })
      index += 1
      continue
    }

    if (index + 1 < lines.length && isTableRow(line) && isTableSeparator(lines[index + 1])) {
      flushParagraph()
      const rows = [splitTableRow(line)]
      index += 2

      while (index < lines.length && lines[index].trim() && isTableRow(lines[index])) {
        rows.push(splitTableRow(lines[index]))
        index += 1
      }

      blocks.push({ id: createId('block'), type: 'table', rows })
      continue
    }

    const todoMatch = line.match(todoPattern)
    if (todoMatch) {
      flushParagraph()
      blocks.push(toTextBlock('todo', todoMatch[2], todoMatch[1].toLowerCase() === 'x'))
      index += 1
      continue
    }

    const bulletMatch = line.match(bulletPattern)
    if (bulletMatch) {
      flushParagraph()
      blocks.push({
        id: createId('block'),
        type: 'bulleted_list',
        items: [parseInlineText(bulletMatch[1]).text],
      })
      index += 1
      continue
    }

    const numberedMatch = line.match(numberedPattern)
    if (numberedMatch) {
      flushParagraph()
      blocks.push({
        id: createId('block'),
        type: 'numbered_list',
        items: [parseInlineText(numberedMatch[1]).text],
      })
      index += 1
      continue
    }

    paragraphLines.push(line)
    index += 1
  }

  flushParagraph()
  return { title, blocks }
}

export function parseMarkdownPage(fileName: string, contents: string): MarkdownPageImport {
  return parseMarkdownDocument(fileName, contents, true)
}

export function parseMarkdownBlocks(contents: string): BlockRecord[] {
  return parseMarkdownDocument('pasted.md', contents, false).blocks.map((block) => {
    if (block.type !== 'image_candidate') {
      return block
    }

    return {
      id: createId('block'),
      type: 'paragraph',
      text: block.fallbackText,
    }
  })
}
