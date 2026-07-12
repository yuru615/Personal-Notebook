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

export type ClipboardStructuredPasteItem =
  | { kind: 'block'; block: BlockRecord }
  | { kind: 'image'; source: string; alt: string }

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
    (segment) =>
      segment.bold || segment.italic || segment.underline || segment.strike || segment.link || segment.color,
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
      ...(segment.color ? { color: segment.color } : {}),
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
    (element) =>
      ['table', 'img', 'video', 'audio', 'iframe', 'object', 'embed', 'svg', 'canvas'].includes(
        element.tagName.toLowerCase(),
      ),
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

function getWordClassStyles(root: HTMLElement) {
  const classStyles = new Map<string, string>()

  root.querySelectorAll('style').forEach((style) => {
    for (const rule of style.textContent?.matchAll(/([^{}]+)\{([^{}]*)\}/g) ?? []) {
      const declarations = rule[2]
      for (const className of rule[1].matchAll(/\.([\w-]+)/g)) {
        const name = className[1]
        classStyles.set(name, `${classStyles.get(name) ?? ''} ${declarations}`)
      }
    }
  })

  return classStyles
}

function getWordHeadingLevel(element: HTMLElement, classStyles: Map<string, string>) {
  const classDeclarations = Array.from(element.classList)
    .map((className) => classStyles.get(className) ?? '')
    .join(' ')
  const styleName = `${element.className} ${element.getAttribute('style') ?? ''} ${classDeclarations}`
  const outlineLevel = styleName.match(/mso-outline-level\s*:\s*['"]?([1-9])/i)?.[1]
  const ariaLevel =
    element.getAttribute('role') === 'heading' ? element.getAttribute('aria-level') : null
  const headingLevel = styleName.match(/(?:mso)?heading[\s_-]*([1-9])|标题\s*([1-9])/i)
  const isWordTitle = /(?:mso)?title\b|标题样式/i.test(styleName)
  const level = Number(outlineLevel ?? ariaLevel ?? headingLevel?.[1] ?? headingLevel?.[2] ?? (isWordTitle ? 1 : 0))

  return level >= 1 && level <= 9 ? Math.min(level, 3) : null
}

function hasWordHeading(root: HTMLElement, classStyles: Map<string, string>) {
  return Array.from(root.querySelectorAll<HTMLElement>('p, div')).some(
    (element) => getWordHeadingLevel(element, classStyles) !== null,
  )
}

function getImagePasteItems(element: HTMLElement): ClipboardStructuredPasteItem[] {
  const images = element.matches('img')
    ? [element as HTMLImageElement]
    : Array.from(element.querySelectorAll<HTMLImageElement>('img'))

  return images
    .map((image) => ({
      kind: 'image' as const,
      source: image.getAttribute('src')?.trim() ?? '',
      alt: image.getAttribute('alt')?.trim() || image.getAttribute('title')?.trim() || '',
    }))
    .filter((item) => item.source.length > 0)
}

export function clipboardHtmlToStructuredPasteItems(html: string): ClipboardStructuredPasteItem[] | null {
  const container = document.createElement('div')
  container.innerHTML = html
  const classStyles = getWordClassStyles(container)

  if (
    !container.querySelector('h1, h2, h3, h4, h5, h6, ul, ol, pre, table, img') &&
    !hasWordHeading(container, classStyles)
  ) {
    return null
  }

  const items: ClipboardStructuredPasteItem[] = []
  const appendBlock = (block: BlockRecord | null) => {
    if (block) {
      items.push({ kind: 'block', block })
    }
  }
  const appendElement = (element: HTMLElement): void => {
    const tag = element.tagName.toLowerCase()

    if (tag === 'style' || tag === 'meta' || tag === 'link') {
      return
    }

    if (tag === 'img') {
      items.push(...getImagePasteItems(element))
      return
    }

    if (/^h[1-6]$/.test(tag)) {
      appendBlock(
        toStructuredTextBlock(
          `heading_${Math.min(Number(tag[1]), 3)}` as 'heading_1' | 'heading_2' | 'heading_3',
          element,
        ),
      )
      return
    }

    const wordHeadingLevel = getWordHeadingLevel(element, classStyles)
    if (wordHeadingLevel) {
      appendBlock(
        toStructuredTextBlock(
          `heading_${wordHeadingLevel}` as 'heading_1' | 'heading_2' | 'heading_3',
          element,
        ),
      )
      return
    }

    if (tag === 'ul' || tag === 'ol') {
      const type = tag === 'ul' ? 'bulleted_list' : 'numbered_list'
      Array.from(element.children)
        .filter((child): child is HTMLElement => child instanceof HTMLElement && child.tagName.toLowerCase() === 'li')
        .forEach((item) => {
          appendBlock(getStructuredListItem(item, type))
          Array.from(item.children)
            .filter((child): child is HTMLElement => child instanceof HTMLElement && ['ul', 'ol'].includes(child.tagName.toLowerCase()))
            .forEach(appendElement)
        })
      return
    }

    if (tag === 'pre') {
      appendBlock(getStructuredCodeBlock(element))
      return
    }

    if (tag === 'table') {
      appendBlock(getStructuredTableBlock(element))
      return
    }

    if (tag === 'div') {
      const structuredChildren = Array.from(element.children).filter(
        (child): child is HTMLElement =>
          child instanceof HTMLElement && ['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'div', 'ul', 'ol', 'pre', 'table', 'img'].includes(child.tagName.toLowerCase()),
      )
      if (structuredChildren.length > 0) {
        structuredChildren.forEach(appendElement)
        return
      }
    }

    const block = toStructuredTextBlock('paragraph', element)
    if (block) {
      appendBlock(block)
      return
    }

    items.push(...getImagePasteItems(element))
  }

  Array.from(container.childNodes).forEach((child) => {
    if (child instanceof HTMLElement) {
      appendElement(child)
    }
  })

  return items.length > 0 ? items : null
}

export function clipboardHtmlToStructuredBlocks(html: string): BlockRecord[] | null {
  const blocks = clipboardHtmlToStructuredPasteItems(html)
    ?.filter((item): item is Extract<ClipboardStructuredPasteItem, { kind: 'block' }> => item.kind === 'block')
    .map((item) => item.block)

  return blocks && blocks.length > 0 ? blocks : null
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
