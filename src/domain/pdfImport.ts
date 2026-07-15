import type { BlockRecord } from './types'
import { createId } from '../utils/id'

export interface PdfPositionedText {
  text: string
  x: number
  y: number
  size: number
  width?: number
  hasEol?: boolean
}

export interface PdfPageImport {
  title: string
  blocks: BlockRecord[]
}

interface PdfTextLine {
  text: string
  y: number
  size: number
}

type PdfTextBlockType = 'paragraph' | 'heading_1' | 'heading_2' | 'heading_3'

function fileNameWithoutExtension(fileName: string) {
  const baseName = fileName.split(/[\\/]/).at(-1) ?? fileName
  return baseName.replace(/\.[^.]+$/, '') || baseName
}

export function resolvePdfTitle(fileName: string, metadataTitle: string | null | undefined) {
  return metadataTitle?.trim() || fileNameWithoutExtension(fileName)
}

function mostCommonSize(lines: PdfTextLine[]) {
  const counts = new Map<number, number>()

  lines.forEach((line) => {
    const size = Math.round(line.size * 2) / 2
    counts.set(size, (counts.get(size) ?? 0) + 1)
  })

  return [...counts.entries()].sort((left, right) => right[1] - left[1] || left[0] - right[0])[0]?.[0] ?? 12
}

function textLineType(size: number, bodySize: number): PdfTextBlockType {
  if (size >= bodySize * 1.65) return 'heading_1'
  if (size >= bodySize * 1.35) return 'heading_2'
  if (size >= bodySize * 1.15) return 'heading_3'
  return 'paragraph'
}

function createTextBlock(type: PdfTextBlockType, text: string) {
  return { id: createId('block'), type, text } as BlockRecord
}

function joinLineItems(items: PdfPositionedText[]) {
  return items.reduce((text, item, index) => {
    if (index === 0) {
      return item.text
    }

    const previous = items[index - 1]
    const previousWidth = previous.width ?? previous.text.length * previous.size * 0.5
    const gap = item.x - (previous.x + previousWidth)
    const needsSpace =
      !/\s$/.test(previous.text) &&
      !/^\s/.test(item.text) &&
      gap > Math.max(2, Math.max(previous.size, item.size) * 0.25)

    return `${text}${needsSpace ? ' ' : ''}${item.text}`
  }, '')
}

function toLines(items: PdfPositionedText[]) {
  const lines: Array<{ y: number; items: PdfPositionedText[] }> = []

  for (const item of [...items]
    .filter((candidate) => candidate.text.trim())
    .sort((left, right) => right.y - left.y || left.x - right.x)) {
    const line = lines.find((candidate) => Math.abs(candidate.y - item.y) <= Math.max(2, item.size * 0.25))

    if (line) {
      line.items.push(item)
    } else {
      lines.push({ y: item.y, items: [item] })
    }
  }

  return lines.map((line) => {
    const items = line.items.sort((left, right) => left.x - right.x)
    return {
      text: joinLineItems(items).trim(),
      y: line.y,
      size: Math.max(...items.map((item) => item.size)),
    }
  })
}

export function pdfTextToBlocks(items: PdfPositionedText[]): BlockRecord[] {
  const lines = toLines(items).filter((line) => line.text)

  if (lines.length === 0) {
    throw new Error('未检测到可编辑文本；当前版本仅支持文字型 PDF。')
  }

  const bodySize = mostCommonSize(lines)
  const blocks: BlockRecord[] = []
  let paragraphLines: PdfTextLine[] = []

  function flushParagraph() {
    if (paragraphLines.length === 0) {
      return
    }

    blocks.push(createTextBlock('paragraph', paragraphLines.map((line) => line.text).join('\n')))
    paragraphLines = []
  }

  for (const line of lines) {
    const type = textLineType(line.size, bodySize)
    const previousLine = paragraphLines.at(-1)
    const belongsToParagraph =
      type === 'paragraph' &&
      previousLine !== undefined &&
      previousLine.y - line.y <= Math.max(previousLine.size, line.size, bodySize) * 1.75

    if (type !== 'paragraph') {
      flushParagraph()
      blocks.push(createTextBlock(type, line.text))
    } else if (paragraphLines.length === 0 || belongsToParagraph) {
      paragraphLines.push(line)
    } else {
      flushParagraph()
      paragraphLines.push(line)
    }
  }

  flushParagraph()
  return blocks
}

function readMetadataTitle(info: object) {
  const title = (info as { Title?: unknown }).Title
  return typeof title === 'string' ? title : undefined
}

export async function parsePdfPage(fileName: string, bytes: Uint8Array): Promise<PdfPageImport> {
  const { getDocument, GlobalWorkerOptions } = await import('pdfjs-dist')
  GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString()

  const loadingTask = getDocument({ data: bytes })
  let document

  try {
    document = await loadingTask.promise
  } catch {
    throw new Error('无法读取 PDF 文件。')
  }

  try {
    const metadata = await document.getMetadata()
    const blocks: BlockRecord[] = []

    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      const page = await document.getPage(pageNumber)
      const content = await page.getTextContent()
      const items = content.items.flatMap((item) => {
        if (!('str' in item) || !item.str.trim()) {
          return []
        }

        const transform = item.transform
        return [{
          text: item.str,
          x: Number(transform[4]) || 0,
          y: Number(transform[5]) || 0,
          size: Number(item.height) || Math.abs(Number(transform[0])) || 12,
          width: Number(item.width) || undefined,
          hasEol: item.hasEOL,
        }]
      })

      if (items.length > 0) {
        blocks.push(...pdfTextToBlocks(items))
      }
    }

    if (blocks.length === 0) {
      throw new Error('未检测到可编辑文本；当前版本仅支持文字型 PDF。')
    }

    return {
      title: resolvePdfTitle(fileName, readMetadataTitle(metadata.info)),
      blocks,
    }
  } finally {
    await loadingTask.destroy()
  }
}
