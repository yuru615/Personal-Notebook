import type { RichTextSegment } from './types'
import { textColorValues } from './colors'

export type RichTextMarkPatch = Partial<Omit<RichTextSegment, 'text'>>

function sameMarks(a: RichTextSegment, b: RichTextSegment) {
  return (
    Boolean(a.bold) === Boolean(b.bold) &&
    Boolean(a.italic) === Boolean(b.italic) &&
    Boolean(a.underline) === Boolean(b.underline) &&
    Boolean(a.strike) === Boolean(b.strike) &&
    (a.link ?? '') === (b.link ?? '') &&
    (a.color ?? '') === (b.color ?? '')
  )
}

function normalizeSegment(segment: RichTextSegment): RichTextSegment {
  return {
    text: segment.text,
    ...(segment.bold ? { bold: true } : {}),
    ...(segment.italic ? { italic: true } : {}),
    ...(segment.underline ? { underline: true } : {}),
    ...(segment.strike ? { strike: true } : {}),
    ...(segment.link ? { link: segment.link } : {}),
    ...(segment.color ? { color: segment.color } : {}),
  }
}

export function normalizeRichText(segments: RichTextSegment[]): RichTextSegment[] {
  const next: RichTextSegment[] = []

  for (const segment of segments.map(normalizeSegment)) {
    if (!segment.text) {
      continue
    }

    const previous = next.at(-1)
    if (previous && sameMarks(previous, segment)) {
      previous.text += segment.text
      continue
    }

    next.push(segment)
  }

  return next
}

export function richTextFromPlainText(text: string): RichTextSegment[] {
  return text ? [{ text }] : []
}

export function richTextToPlainText(segments: RichTextSegment[] | undefined): string {
  return normalizeRichText(segments ?? []).map((segment) => segment.text).join('')
}

function applyMarkPatch(segment: RichTextSegment, mark: RichTextMarkPatch): RichTextSegment {
  const next: RichTextSegment = { ...segment }

  for (const [key, value] of Object.entries(mark) as Array<
    [keyof RichTextMarkPatch, RichTextMarkPatch[keyof RichTextMarkPatch]]
  >) {
    if (value === undefined || value === false || value === '') {
      delete next[key]
      continue
    }

    next[key] = value as never
  }

  return normalizeSegment(next)
}

export function applyRichTextMark(
  segments: RichTextSegment[],
  selectionStart: number,
  selectionEnd: number,
  mark: RichTextMarkPatch,
): RichTextSegment[] {
  const plainText = richTextToPlainText(segments)
  const start = Math.max(0, Math.min(selectionStart, selectionEnd, plainText.length))
  const end = Math.max(0, Math.min(Math.max(selectionStart, selectionEnd), plainText.length))

  if (start === end) {
    return normalizeRichText(segments)
  }

  const next: RichTextSegment[] = []
  let offset = 0

  for (const segment of normalizeRichText(segments)) {
    const segmentStart = offset
    const segmentEnd = offset + segment.text.length
    offset = segmentEnd

    if (segmentEnd <= start || segmentStart >= end) {
      next.push(segment)
      continue
    }

    const beforeLength = Math.max(0, start - segmentStart)
    const selectedStart = beforeLength
    const selectedEnd = Math.min(segment.text.length, end - segmentStart)

    if (beforeLength > 0) {
      next.push({ ...segment, text: segment.text.slice(0, beforeLength) })
    }

    next.push(
      applyMarkPatch(
        {
          ...segment,
          text: segment.text.slice(selectedStart, selectedEnd),
        },
        mark,
      ),
    )

    if (selectedEnd < segment.text.length) {
      next.push({ ...segment, text: segment.text.slice(selectedEnd) })
    }
  }

  return normalizeRichText(next)
}

function escapeMarkdownText(value: string): string {
  return value.replace(/\\/g, '\\\\')
}

function escapeLinkUrl(value: string): string {
  return value.replace(/\)/g, '%29')
}

export function richTextToMarkdown(segments: RichTextSegment[] | undefined): string {
  return normalizeRichText(segments ?? [])
    .map((segment) => {
      let text = escapeMarkdownText(segment.text)

      if (segment.bold) {
        text = `**${text}**`
      }

      if (segment.italic) {
        text = `*${text}*`
      }

      if (segment.underline) {
        text = `<u>${text}</u>`
      }

      if (segment.strike) {
        text = `~~${text}~~`
      }

      if (segment.link) {
        text = `[${text}](${escapeLinkUrl(segment.link)})`
      }

      if (segment.color) {
        text = `<span style="color: ${textColorValues[segment.color]}">${text}</span>`
      }

      return text
    })
    .join('')
}
