import { normalizeRichText } from './richText'
import type { RichTextSegment, TextColor } from './types'
import { textColorValues } from './colors'

function isTextColor(value: string | null): value is TextColor {
  return Boolean(value && value in textColorValues)
}

function parseCssColor(value: string) {
  const hex = value.trim().match(/^#([\da-f]{3}|[\da-f]{6})$/i)?.[1]
  if (hex) {
    const normalized = hex.length === 3 ? hex.split('').map((part) => `${part}${part}`).join('') : hex
    return {
      red: Number.parseInt(normalized.slice(0, 2), 16),
      green: Number.parseInt(normalized.slice(2, 4), 16),
      blue: Number.parseInt(normalized.slice(4, 6), 16),
    }
  }

  const rgb = value.match(/^rgba?\(\s*([\d.]+)[,\s]+\s*([\d.]+)[,\s]+\s*([\d.]+)/i)
  return rgb
    ? { red: Number(rgb[1]), green: Number(rgb[2]), blue: Number(rgb[3]) }
    : null
}

function textColorFromCss(value: string) {
  const source = parseCssColor(value)
  if (!source) {
    return undefined
  }

  const closest = Object.entries(textColorValues)
    .map(([color, hex]) => {
      const target = parseCssColor(hex)
      if (!target) {
        return null
      }

      return {
        color: color as TextColor,
        distance: Math.hypot(source.red - target.red, source.green - target.green, source.blue - target.blue),
      }
    })
    .filter((candidate): candidate is { color: TextColor; distance: number } => candidate !== null)
    .sort((left, right) => left.distance - right.distance)[0]

  return closest && closest.distance <= 180 ? closest.color : undefined
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

  if (element instanceof HTMLElement) {
    const fontWeight = element.style.fontWeight || element.style.getPropertyValue('mso-bidi-font-weight')
    if (fontWeight === 'bold' || Number.parseFloat(fontWeight) >= 600) {
      nextMarks.bold = true
    }

    const fontStyle = element.style.fontStyle || element.style.getPropertyValue('mso-bidi-font-style')
    if (fontStyle.toLowerCase().includes('italic')) {
      nextMarks.italic = true
    }

    const textDecoration = [
      element.style.textDecoration,
      element.style.textDecorationLine,
      element.style.getPropertyValue('mso-text-decoration'),
    ]
      .join(' ')
      .toLowerCase()
    if (textDecoration.includes('underline')) {
      nextMarks.underline = true
    }
    if (textDecoration.includes('line-through')) {
      nextMarks.strike = true
    }

    const cssColor = textColorFromCss(element.style.color)
    if (cssColor) {
      nextMarks.color = cssColor
    }
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
