import { normalizeRichText } from './richText'
import type { RichTextSegment, TextColor } from './types'
import { textColorValues } from './colors'

function isTextColor(value: string | null): value is TextColor {
  return Boolean(value && value in textColorValues)
}

function marksFromElement(element: Element, marks: Omit<RichTextSegment, 'text'>) {
  const tagName = element.tagName.toLowerCase()
  const nextMarks = { ...marks }

  if (tagName === 'strong' || tagName === 'b') {
    nextMarks.bold = true
  }

  if (tagName === 'em' || tagName === 'i') {
    nextMarks.italic = true
  }

  if (tagName === 'u') {
    nextMarks.underline = true
  }

  if (tagName === 's' || tagName === 'strike' || tagName === 'del') {
    nextMarks.strike = true
  }

  if (tagName === 'a') {
    const pageId = element.getAttribute('data-page-id')
    const relationKind = element.getAttribute('data-page-relation-kind')

    if (pageId && (relationKind === 'link' || relationKind === 'mention')) {
      nextMarks.pageId = pageId
      nextMarks.relationKind = relationKind
      delete nextMarks.link
    } else {
      const href = element.getAttribute('href')
      if (href) {
        nextMarks.link = href
      }
    }
  }

  const color = element.getAttribute('data-rich-text-color')
  if (isTextColor(color)) {
    nextMarks.color = color
  }

  return nextMarks
}

function readSegmentsFromNode(
  node: Node,
  marks: Omit<RichTextSegment, 'text'>,
): RichTextSegment[] {
  if (node.nodeType === Node.TEXT_NODE) {
    const text = node.textContent ?? ''
    return text ? [{ text, ...marks }] : []
  }

  if (!(node instanceof Element)) {
    return []
  }

  if (node.tagName.toLowerCase() === 'br') {
    return [{ text: '\n', ...marks }]
  }

  const nextMarks = marksFromElement(node, marks)
  return Array.from(node.childNodes).flatMap((child) => readSegmentsFromNode(child, nextMarks))
}

export function readRichTextSegmentsFromElement(element: HTMLElement): RichTextSegment[] {
  return normalizeRichText(
    Array.from(element.childNodes).flatMap((child) => readSegmentsFromNode(child, {})),
  )
}

export function readRichTextSegmentsFromHtml(html: string): RichTextSegment[] {
  const container = document.createElement('div')
  container.innerHTML = html
  return readRichTextSegmentsFromElement(container)
}
