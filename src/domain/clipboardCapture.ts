import { normalizeRichText, richTextToPlainText } from './richText'
import { readRichTextSegmentsFromElement } from './richTextHtml'
import type { BlockRecord, RichTextSegment } from './types'
import { createId } from '../utils/id'

const BLOCK_TAGS = new Set([
  'p',
  'div',
  'li',
  'blockquote',
  'pre',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'ul',
  'ol',
])

const ALLOWED_TAGS = new Set([
  ...BLOCK_TAGS,
  'strong',
  'b',
  'em',
  'i',
  'u',
  'a',
  'br',
  'span',
  's',
  'strike',
  'del',
])

function toParagraphBlock(text: string, richText?: RichTextSegment[]): BlockRecord {
  const normalizedRichText = normalizeRichText(richText ?? [])

  return {
    id: createId('block'),
    type: 'paragraph',
    text,
    ...(hasApprovedMarks(normalizedRichText) ? { richText: normalizedRichText } : {}),
  }
}

function hasApprovedMarks(segments: RichTextSegment[]) {
  return segments.some(
    (segment) => segment.bold || segment.italic || segment.underline || segment.strike || segment.link,
  )
}

function keepApprovedMarks(segments: RichTextSegment[]) {
  return normalizeRichText(
    segments.map((segment) => ({
      text: segment.text,
      ...(segment.bold ? { bold: true } : {}),
      ...(segment.italic ? { italic: true } : {}),
      ...(segment.underline ? { underline: true } : {}),
      ...(segment.strike ? { strike: true } : {}),
      ...(segment.link ? { link: segment.link } : {}),
    })),
  )
}

function normalizePlainText(value: string) {
  return value.replace(/\r\n?/g, '\n')
}

function splitPlainTextParagraphs(value: string) {
  return normalizePlainText(value)
    .split(/\n[ \t]*\n+/)
    .map((paragraph) => paragraph.replace(/^\n+|\n+$/g, ''))
    .filter((paragraph) => paragraph.trim().length > 0)
}

function htmlToPlainText(html: string) {
  const container = document.createElement('div')
  container.innerHTML = html
  return container.textContent ?? ''
}

function hasUnsupportedHtml(root: HTMLElement) {
  return Array.from(root.querySelectorAll('*')).some(
    (element) => !ALLOWED_TAGS.has(element.tagName.toLowerCase()),
  )
}

function readParagraphSegments(element: HTMLElement) {
  return keepApprovedMarks(readRichTextSegmentsFromElement(element))
}

function toStructuredTextBlock(
  type: 'paragraph' | 'heading_1' | 'heading_2' | 'heading_3',
  element: HTMLElement,
): BlockRecord | null {
  const richText = readParagraphSegments(element)
  const text = richTextToPlainText(richText).trim()

  if (!text) {
    return null
  }

  return {
    id: createId('block'),
    type,
    text,
    ...(hasApprovedMarks(richText) ? { richText } : {}),
  }
}

function getStructuredListItem(item: HTMLElement, type: 'bulleted_list' | 'numbered_list'): BlockRecord | null {
  const content = item.cloneNode(true) as HTMLElement
  const nestedLists = content.querySelectorAll('ul, ol')
  nestedLists.forEach((list) => list.remove())
  const checkbox = content.querySelector<HTMLInputElement>('input[type="checkbox"]')
  const checked = checkbox?.checked ?? false
  checkbox?.remove()
  const richText = readParagraphSegments(content)
  const text = richTextToPlainText(richText).trim()

  if (!text) {
    return null
  }

  if (checkbox) {
    return {
      id: createId('block'),
      type: 'todo',
      text,
      checked,
      ...(hasApprovedMarks(richText) ? { richText } : {}),
    }
  }

  return {
    id: createId('block'),
    type,
    items: [text],
    ...(hasApprovedMarks(richText) ? { richText } : {}),
  }
}

function getStructuredCodeBlock(element: HTMLElement): BlockRecord | null {
  const code = element.querySelector('code')
  const text = (code?.textContent ?? element.textContent ?? '').replace(/\r\n?/g, '\n').replace(/^\n+|\n+$/g, '')

  if (!text) {
    return null
  }

  const language =
    code?.className.match(/(?:^|\s)language-([^\s]+)/)?.[1] ||
    code?.getAttribute('data-language') ||
    'text'

  return { id: createId('block'), type: 'code', language, text }
}

function getStructuredTableBlock(element: HTMLElement): BlockRecord | null {
  const rows = Array.from(element.querySelectorAll('tr'))
    .map((row) =>
      Array.from(row.querySelectorAll('th, td')).map((cell) => (cell.textContent ?? '').trim()),
    )
    .filter((row) => row.length > 0)

  return rows.length > 0 ? { id: createId('block'), type: 'table', rows } : null
}

export function clipboardHtmlToStructuredBlocks(html: string): BlockRecord[] | null {
  const container = document.createElement('div')
  container.innerHTML = html

  if (!container.querySelector('h1, h2, h3, ul, ol, pre, table')) {
    return null
  }

  const blocks: BlockRecord[] = []
  const appendElement = (element: HTMLElement): void => {
    const tag = element.tagName.toLowerCase()

    if (tag === 'h1' || tag === 'h2' || tag === 'h3') {
      const block = toStructuredTextBlock(`heading_${tag[1]}` as 'heading_1' | 'heading_2' | 'heading_3', element)
      if (block) {
        blocks.push(block)
      }
      return
    }

    if (tag === 'ul' || tag === 'ol') {
      const type = tag === 'ul' ? 'bulleted_list' : 'numbered_list'
      Array.from(element.children)
        .filter((child): child is HTMLElement => child instanceof HTMLElement && child.tagName.toLowerCase() === 'li')
        .forEach((item) => {
          const block = getStructuredListItem(item, type)
          if (block) {
            blocks.push(block)
          }
          Array.from(item.children)
            .filter((child): child is HTMLElement => child instanceof HTMLElement && ['ul', 'ol'].includes(child.tagName.toLowerCase()))
            .forEach(appendElement)
        })
      return
    }

    if (tag === 'pre') {
      const block = getStructuredCodeBlock(element)
      if (block) {
        blocks.push(block)
      }
      return
    }

    if (tag === 'table') {
      const block = getStructuredTableBlock(element)
      if (block) {
        blocks.push(block)
      }
      return
    }

    if (tag === 'div') {
      const structuredChildren = Array.from(element.children).filter(
        (child): child is HTMLElement =>
          child instanceof HTMLElement && ['h1', 'h2', 'h3', 'p', 'div', 'ul', 'ol', 'pre', 'table'].includes(child.tagName.toLowerCase()),
      )
      if (structuredChildren.length > 0) {
        structuredChildren.forEach(appendElement)
        return
      }
    }

    const block = toStructuredTextBlock('paragraph', element)
    if (block) {
      blocks.push(block)
    }
  }

  Array.from(container.childNodes).forEach((child) => {
    if (child instanceof HTMLElement) {
      appendElement(child)
    }
  })

  return blocks.length > 0 ? blocks : null
}

function sliceRichTextSegments(segments: RichTextSegment[], start: number, end: number) {
  if (end <= start) {
    return []
  }

  const next: RichTextSegment[] = []
  let offset = 0

  for (const segment of normalizeRichText(segments)) {
    const segmentStart = offset
    const segmentEnd = offset + segment.text.length
    offset = segmentEnd

    if (segmentEnd <= start || segmentStart >= end) {
      continue
    }

    const sliceStart = Math.max(0, start - segmentStart)
    const sliceEnd = Math.min(segment.text.length, end - segmentStart)
    const text = segment.text.slice(sliceStart, sliceEnd)

    if (!text) {
      continue
    }

    next.push({
      ...segment,
      text,
    })
  }

  return normalizeRichText(next)
}

function findParagraphBoundary(text: string, start: number) {
  for (let index = start; index < text.length; index += 1) {
    if (text[index] !== '\n') {
      continue
    }

    let cursor = index + 1
    while (cursor < text.length && (text[cursor] === ' ' || text[cursor] === '\t')) {
      cursor += 1
    }

    if (text[cursor] !== '\n') {
      continue
    }

    cursor += 1
    while (
      cursor < text.length &&
      (text[cursor] === '\n' || text[cursor] === ' ' || text[cursor] === '\t')
    ) {
      cursor += 1
    }

    return {
      start: index,
      end: cursor,
    }
  }

  return null
}

function paragraphBlocksFromSegments(segments: RichTextSegment[]) {
  const normalizedSegments = normalizeRichText(segments)
  const text = richTextToPlainText(normalizedSegments)

  if (!text.trim()) {
    return []
  }

  const blocks: BlockRecord[] = []
  let paragraphStart = 0

  while (paragraphStart < text.length) {
    const boundary = findParagraphBoundary(text, paragraphStart)
    const paragraphEnd = boundary?.start ?? text.length
    const paragraphSegments = sliceRichTextSegments(normalizedSegments, paragraphStart, paragraphEnd)
    const paragraphText = richTextToPlainText(paragraphSegments)

    if (paragraphText.trim()) {
      blocks.push(toParagraphBlock(paragraphText, paragraphSegments))
    }

    if (!boundary) {
      break
    }

    paragraphStart = boundary.end
  }

  return blocks
}

export function clipboardPlainTextToParagraphBlocks(text: string): BlockRecord[] {
  return splitPlainTextParagraphs(text).map((paragraph) => toParagraphBlock(paragraph))
}

export function clipboardHtmlToParagraphBlocks(html: string): BlockRecord[] | null {
  const container = document.createElement('div')
  container.innerHTML = html

  if (hasUnsupportedHtml(container)) {
    return null
  }

  const blocks: BlockRecord[] = []
  const inlineWrapper = document.createElement('div')

  const flushInlineWrapper = () => {
    const segments = readParagraphSegments(inlineWrapper)
    inlineWrapper.replaceChildren()
    blocks.push(...paragraphBlocksFromSegments(segments))
  }

  for (const child of Array.from(container.childNodes)) {
    if (child instanceof HTMLElement && BLOCK_TAGS.has(child.tagName.toLowerCase())) {
      flushInlineWrapper()

      if (child.tagName.toLowerCase() === 'ul' || child.tagName.toLowerCase() === 'ol') {
        for (const item of Array.from(child.children)) {
          if (!(item instanceof HTMLElement)) {
            continue
          }

          const segments = readParagraphSegments(item)
          blocks.push(...paragraphBlocksFromSegments(segments))
        }

        continue
      }

      const segments = readParagraphSegments(child)
      blocks.push(...paragraphBlocksFromSegments(segments))
      continue
    }

    inlineWrapper.appendChild(child.cloneNode(true))
  }

  flushInlineWrapper()

  return blocks.length > 0 ? blocks : null
}

export function buildClipboardTextBlocks({
  html,
  text,
}: {
  html?: string | null
  text?: string | null
}): BlockRecord[] {
  const htmlBlocks = html ? clipboardHtmlToParagraphBlocks(html) : null
  if (htmlBlocks && htmlBlocks.length > 0) {
    return htmlBlocks
  }

  return clipboardPlainTextToParagraphBlocks(text ?? (html ? htmlToPlainText(html) : ''))
}

export function isDuplicateClipboardSignature(
  previous: string | null | undefined,
  next: string | null | undefined,
) {
  const left = previous?.trim() ?? ''
  const right = next?.trim() ?? ''

  return left.length > 0 && left === right
}
