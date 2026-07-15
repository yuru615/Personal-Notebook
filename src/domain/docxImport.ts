import JSZip from 'jszip'
import type { BlockRecord, ImageBlock } from './types'
import { createId } from '../utils/id'

const WORD_NAMESPACE = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'
const RELATIONSHIP_NAMESPACE = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'

export interface DocxImageAsset {
  blockId: string
  name: string
  mimeType: string
  bytes: Uint8Array
}

export interface DocxPageImport {
  title: string
  blocks: BlockRecord[]
  images: DocxImageAsset[]
}

function fileNameWithoutExtension(fileName: string) {
  const baseName = fileName.split(/[\\/]/).at(-1) ?? fileName
  return baseName.replace(/\.[^.]+$/, '') || baseName
}

function getAttribute(element: Element, namespace: string, name: string) {
  return (
    element.getAttributeNS(namespace, name) ??
    element.getAttribute(`w:${name}`) ??
    element.getAttribute(`r:${name}`) ??
    element.getAttribute(name)
  )
}

function getDescendants(element: Element | Document, localName: string) {
  return Array.from(element.getElementsByTagNameNS('*', localName))
}

function getFirstDescendant(element: Element | Document, localName: string) {
  return getDescendants(element, localName)[0] ?? null
}

function getDirectChildren(element: Element, localName: string) {
  return Array.from(element.children).filter((child) => child.localName === localName)
}

function parseXml(xml: string, errorMessage: string) {
  const document = new DOMParser().parseFromString(xml, 'application/xml')

  if (document.getElementsByTagName('parsererror').length > 0 || document.documentElement.localName === 'parsererror') {
    throw new Error(errorMessage)
  }

  return document
}

function readParagraphText(paragraph: Element) {
  let text = ''

  function readNode(node: Node) {
    if (!(node instanceof Element)) {
      return
    }

    if (node.namespaceURI === WORD_NAMESPACE && node.localName === 't') {
      text += node.textContent ?? ''
      return
    }

    if (node.namespaceURI === WORD_NAMESPACE && (node.localName === 'br' || node.localName === 'cr')) {
      text += '\n'
      return
    }

    if (node.namespaceURI === WORD_NAMESPACE && node.localName === 'tab') {
      text += '\t'
      return
    }

    Array.from(node.childNodes).forEach(readNode)
  }

  Array.from(paragraph.childNodes).forEach(readNode)
  return text.trim()
}

function getHeadingType(paragraph: Element) {
  const style = getFirstDescendant(paragraph, 'pStyle')
  const styleName = getAttribute(style ?? paragraph, WORD_NAMESPACE, 'val')?.replace(/\s+/g, '').toLowerCase() ?? ''
  const level = styleName.match(/(?:heading|标题)([1-3])/)?.[1]

  if (level === '1') return 'heading_1'
  if (level === '2') return 'heading_2'
  if (level === '3') return 'heading_3'
  return null
}

function getParagraphListKey(paragraph: Element) {
  const numId = getFirstDescendant(paragraph, 'numId')

  if (!numId) {
    return null
  }

  return {
    id: getAttribute(numId, WORD_NAMESPACE, 'val'),
    level: getAttribute(getFirstDescendant(paragraph, 'ilvl') ?? paragraph, WORD_NAMESPACE, 'val') ?? '0',
  }
}

function getImageRelationIds(paragraph: Element) {
  return getDescendants(paragraph, 'blip')
    .map((blip) => getAttribute(blip, RELATIONSHIP_NAMESPACE, 'embed'))
    .filter((relationId): relationId is string => Boolean(relationId))
}

function resolveDocxPath(target: string) {
  const parts = ['word']

  for (const part of target.replace(/\\/g, '/').split('/')) {
    if (!part || part === '.') {
      continue
    }

    if (part === '..') {
      if (parts.length > 1) {
        parts.pop()
      }
      continue
    }

    parts.push(part)
  }

  return parts.join('/')
}

function inferImageMimeType(name: string) {
  switch (name.split('.').pop()?.toLowerCase()) {
    case 'png':
      return 'image/png'
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg'
    case 'gif':
      return 'image/gif'
    case 'webp':
      return 'image/webp'
    case 'svg':
      return 'image/svg+xml'
    case 'bmp':
      return 'image/bmp'
    case 'tif':
    case 'tiff':
      return 'image/tiff'
    default:
      return 'application/octet-stream'
  }
}

async function readImageRelationships(zip: JSZip) {
  const file = zip.file('word/_rels/document.xml.rels')

  if (!file) {
    return new Map<string, string>()
  }

  const document = parseXml(await file.async('text'), '无法读取 Word 文档：图片关系格式错误')
  const relationships = new Map<string, string>()

  getDescendants(document, 'Relationship').forEach((relationship) => {
    const id = relationship.getAttribute('Id')
    const type = relationship.getAttribute('Type')
    const target = relationship.getAttribute('Target')

    if (id && target && type?.endsWith('/image')) {
      relationships.set(id, resolveDocxPath(target))
    }
  })

  return relationships
}

async function readListTypes(zip: JSZip) {
  const file = zip.file('word/numbering.xml')

  if (!file) {
    return new Map<string, 'bulleted_list' | 'numbered_list'>()
  }

  const document = parseXml(await file.async('text'), '无法读取 Word 文档：列表格式错误')
  const abstractTypes = new Map<string, Map<string, 'bulleted_list' | 'numbered_list'>>()

  getDescendants(document, 'abstractNum').forEach((abstractNumbering) => {
    const abstractId = getAttribute(abstractNumbering, WORD_NAMESPACE, 'abstractNumId')

    if (!abstractId) {
      return
    }

    const levels = new Map<string, 'bulleted_list' | 'numbered_list'>()
    getDirectChildren(abstractNumbering, 'lvl').forEach((level) => {
      const levelId = getAttribute(level, WORD_NAMESPACE, 'ilvl') ?? '0'
      const format = getAttribute(getFirstDescendant(level, 'numFmt') ?? level, WORD_NAMESPACE, 'val')
      levels.set(levelId, format === 'bullet' ? 'bulleted_list' : 'numbered_list')
    })
    abstractTypes.set(abstractId, levels)
  })

  const types = new Map<string, 'bulleted_list' | 'numbered_list'>()
  getDescendants(document, 'num').forEach((numbering) => {
    const id = getAttribute(numbering, WORD_NAMESPACE, 'numId')
    const abstractId = getAttribute(getFirstDescendant(numbering, 'abstractNumId') ?? numbering, WORD_NAMESPACE, 'val')

    if (!id || !abstractId) {
      return
    }

    for (const [level, type] of abstractTypes.get(abstractId) ?? []) {
      types.set(`${id}:${level}`, type)
    }
  })

  return types
}

function parseTable(table: Element): BlockRecord | null {
  const rows = getDirectChildren(table, 'tr')
    .map((row) =>
      getDirectChildren(row, 'tc').map((cell) =>
        getDirectChildren(cell, 'p')
          .map(readParagraphText)
          .filter(Boolean)
          .join('\n'),
      ),
    )
    .filter((row) => row.length > 0)

  return rows.length > 0 ? { id: createId('block'), type: 'table', rows } : null
}

export async function parseDocxPage(fileName: string, bytes: Uint8Array): Promise<DocxPageImport> {
  let zip: JSZip

  try {
    zip = await JSZip.loadAsync(bytes)
  } catch {
    throw new Error('无法读取 Word 文档')
  }

  const documentFile = zip.file('word/document.xml')

  if (!documentFile) {
    throw new Error('Word 文档缺少正文')
  }

  const document = parseXml(await documentFile.async('text'), '无法读取 Word 文档：正文格式错误')
  const body = getFirstDescendant(document, 'body')

  if (!body) {
    throw new Error('Word 文档缺少正文')
  }

  const [listTypes, imageRelationships] = await Promise.all([readListTypes(zip), readImageRelationships(zip)])
  const blocks: BlockRecord[] = []
  const images: DocxImageAsset[] = []

  for (const element of Array.from(body.children)) {
    if (element.localName === 'tbl') {
      const table = parseTable(element)
      if (table) {
        blocks.push(table)
      }
      continue
    }

    if (element.localName !== 'p') {
      continue
    }

    const text = readParagraphText(element)
    const headingType = getHeadingType(element)
    const listKey = getParagraphListKey(element)

    if (text) {
      if (headingType) {
        blocks.push({ id: createId('block'), type: headingType, text })
      } else if (listKey?.id) {
        blocks.push({
          id: createId('block'),
          type: listTypes.get(`${listKey.id}:${listKey.level}`) ?? 'bulleted_list',
          items: [text],
        })
      } else {
        blocks.push({ id: createId('block'), type: 'paragraph', text })
      }
    }

    for (const relationId of getImageRelationIds(element)) {
      const path = imageRelationships.get(relationId)
      const imageFile = path ? zip.file(path) : null

      if (!imageFile || !path) {
        continue
      }

      const name = path.split('/').at(-1) ?? 'image'
      const block: ImageBlock = {
        id: createId('block'),
        type: 'image',
        assetId: null,
        name,
        mimeType: inferImageMimeType(name),
        caption: '',
        alt: name,
      }
      blocks.push(block)
      images.push({
        blockId: block.id,
        name,
        mimeType: block.mimeType,
        bytes: await imageFile.async('uint8array'),
      })
    }
  }

  return {
    title: fileNameWithoutExtension(fileName),
    blocks,
    images,
  }
}
