import JSZip from 'jszip'
import type { BlockRecord, BoardRecord, PageId, PageRecord } from './types'
import { richTextToMarkdown } from './richText'
import { uiCopy } from '../ui/copy'
import { sanitizeFileNameSegment } from '../utils/fileName'
import { createId } from '../utils/id'

const WHITEBOARD_LABEL = '\u767d\u677f'
const WHITEBOARD_LINK_PREFIX = `${WHITEBOARD_LABEL}\uff1a`

interface BuildMarkdownZipOptions {
  rootPage: PageRecord
  allPages: PageRecord[]
  boards?: BoardRecord[]
  reversible: boolean
  readAsset?: (assetId: string) => Promise<Uint8Array>
}

interface ImportMarkdownZipOptions {
  writeAsset?: (input: { name: string; mimeType: string; bytes: Uint8Array }) => Promise<{
    id: string
    name: string
    mimeType: string
  }>
}

export interface ImportedMarkdownPackage {
  rootPageId: string | null
  pages: PageRecord[]
  boards: BoardRecord[]
}

interface ChildPageLink {
  folderName: string
  title: string
}

interface PageFrontmatter {
  pageId: string
  parentId: string | null
  title: string
  icon: string | null
  cover: string | null
  createdAt: string
  updatedAt: string
}

type ImportedBlockDraft =
  | { type: 'paragraph'; text: string }
  | { type: 'heading_1'; text: string }
  | { type: 'heading_2'; text: string }
  | { type: 'heading_3'; text: string }
  | { type: 'todo'; text: string; checked: boolean }
  | { type: 'bulleted_list'; text: string }
  | { type: 'numbered_list'; text: string }
  | { type: 'code'; language: string; text: string }
  | { type: 'table'; rows: string[][] }
  | { type: 'child_page'; targetPath: string }
  | { type: 'whiteboard'; assetPath: string }
  | {
      type: 'image' | 'video' | 'audio'
      assetPath: string
      name: string
      mimeType: string
      caption: string
      alt?: string
    }

interface ImportedPageDraft {
  filePath: string
  frontmatter: PageFrontmatter
  blocks: ImportedBlockDraft[]
}

function sanitizePathSegment(value: string): string {
  return sanitizeFileNameSegment(value, uiCopy.page.untitled)
}

function escapeYamlValue(value: string | null): string {
  if (value === null) {
    return 'null'
  }

  return JSON.stringify(value)
}

function escapeTableCell(value: string): string {
  return value.replace(/\|/g, '\\|')
}

function buildChildrenMap(pages: PageRecord[]) {
  const childrenByParentId = new Map<PageId | null, PageRecord[]>()

  for (const page of pages) {
    const siblings = childrenByParentId.get(page.parentId) ?? []
    siblings.push(page)
    childrenByParentId.set(page.parentId, siblings)
  }

  return childrenByParentId
}

function buildSiblingFolderNames(children: PageRecord[]): Map<PageId, string> {
  const names = new Map<PageId, string>()
  const counts = new Map<string, number>()

  for (const child of children) {
    const baseName = sanitizePathSegment(child.title)
    const nextCount = (counts.get(baseName) ?? 0) + 1
    counts.set(baseName, nextCount)
    names.set(child.id, nextCount === 1 ? baseName : `${baseName}-${nextCount}`)
  }

  return names
}

function blockToMarkdown(
  block: BlockRecord,
  childLinks: Map<PageId, ChildPageLink>,
  boardTitles: Map<string, string>,
  boardLinks: Map<string, string>,
  mediaLinks: Map<string, string>,
): string {
  switch (block.type) {
    case 'paragraph':
      return block.richText ? richTextToMarkdown(block.richText) : block.text
    case 'heading_1':
      return `# ${block.richText ? richTextToMarkdown(block.richText) : block.text}`
    case 'heading_2':
      return `## ${block.richText ? richTextToMarkdown(block.richText) : block.text}`
    case 'heading_3':
      return `### ${block.richText ? richTextToMarkdown(block.richText) : block.text}`
    case 'todo':
      return `- [${block.checked ? 'x' : ' '}] ${
        block.richText ? richTextToMarkdown(block.richText) : block.text
      }`
    case 'bulleted_list':
      return block.items.map((item) => `- ${item}`).join('\n')
    case 'numbered_list':
      return block.items.map((item, index) => `${index + 1}. ${item}`).join('\n')
    case 'code':
      return `\`\`\`${block.language}\n${block.text}\n\`\`\``
    case 'table': {
      const [headerRow, ...bodyRows] = block.rows
      const safeHeader = headerRow ?? ['', '']
      const separator = safeHeader.map(() => '---')

      return [safeHeader, separator, ...bodyRows]
        .map((row) => `| ${row.map(escapeTableCell).join(' | ')} |`)
        .join('\n')
    }
    case 'image':
      return block.assetId
        ? `![${block.alt || block.name}](${mediaLinks.get(block.id) ?? '#'})`
        : `![${block.alt || block.name || '\u56fe\u7247'}]()`
    case 'video':
      return block.assetId
        ? `[${block.caption || block.name || '\u89c6\u9891'}](${mediaLinks.get(block.id) ?? '#'})`
        : `[${block.caption || block.name || '\u89c6\u9891'}](#)`
    case 'audio':
      return block.assetId
        ? `[${block.caption || block.name || '\u97f3\u9891'}](${mediaLinks.get(block.id) ?? '#'})`
        : `[${block.caption || block.name || '\u97f3\u9891'}](#)`
    case 'child_page': {
      const childLink = childLinks.get(block.pageId)

      if (!childLink) {
        return uiCopy.editor.childPage
      }

      return `[${childLink.title}](./${childLink.folderName}/index.md)`
    }
    case 'whiteboard':
      return `[${WHITEBOARD_LINK_PREFIX}${boardTitles.get(block.boardId) ?? WHITEBOARD_LABEL}](${
        boardLinks.get(block.boardId) ?? '#'
      })`
    case 'data_table':
      return '[\u6570\u636e\u8868\u683c](#)'
    case 'mindmap':
      return '[\u5bfc\u56fe](#)'
  }
}

function pageToMarkdown(
  page: PageRecord,
  childLinks: Map<PageId, ChildPageLink>,
  boardTitles: Map<string, string>,
  boardLinks: Map<string, string>,
  mediaLinks: Map<string, string>,
  reversible: boolean,
): string {
  const blocks = page.blocks
    .map((block) =>
      blockToMarkdown(
        block,
        childLinks,
        boardTitles,
        boardLinks,
        mediaLinks,
      ),
    )
    .filter((block) => block.trim().length > 0)
  const body = blocks.join('\n\n')
  const title = `# ${page.title}`

  if (!reversible) {
    return [title, body].filter(Boolean).join('\n\n').trim()
  }

  const frontmatter = [
    '---',
    `pageId: ${escapeYamlValue(page.id)}`,
    `parentId: ${escapeYamlValue(page.parentId)}`,
    `title: ${escapeYamlValue(page.title)}`,
    `icon: ${escapeYamlValue(page.icon)}`,
    `cover: ${escapeYamlValue(page.cover)}`,
    `createdAt: ${escapeYamlValue(page.createdAt)}`,
    `updatedAt: ${escapeYamlValue(page.updatedAt)}`,
    '---',
  ].join('\n')

  return [frontmatter, title, body].filter(Boolean).join('\n\n').trim()
}

function buildWhiteboardAssets(
  page: PageRecord,
  currentFolder: JSZip,
  boardsById: Map<string, BoardRecord>,
  reversible: boolean,
) {
  const boardTitles = new Map<string, string>()
  const boardLinks = new Map<string, string>()

  for (const block of page.blocks) {
    if (block.type !== 'whiteboard') {
      continue
    }

    const board = boardsById.get(block.boardId)

    if (!board) {
      continue
    }

    boardTitles.set(board.id, board.title)
  }

  if (!reversible || boardTitles.size === 0) {
    return { boardTitles, boardLinks }
  }

  const whiteboardFolder = currentFolder.folder('_assets')?.folder('whiteboards')

  if (!whiteboardFolder) {
    return { boardTitles, boardLinks }
  }

  for (const [boardId, title] of boardTitles) {
    const board = boardsById.get(boardId)

    if (!board) {
      continue
    }

    const fileName = `${sanitizeFileNameSegment(title, WHITEBOARD_LABEL)}-${board.id}.whiteboard.json`

    whiteboardFolder.file(
      fileName,
      JSON.stringify(
        {
          boardId: board.id,
          title: board.title,
          snapshot: board.snapshot,
        },
        null,
        2,
      ),
    )
    boardLinks.set(board.id, `./_assets/whiteboards/${fileName}`)
  }

  return { boardTitles, boardLinks }
}

async function buildMediaAssets(
  page: PageRecord,
  currentFolder: JSZip,
  readAsset: BuildMarkdownZipOptions['readAsset'],
) {
  const mediaLinks = new Map<string, string>()

  if (!readAsset) {
    return mediaLinks
  }

  const mediaFolder = currentFolder.folder('_assets')?.folder('media')

  if (!mediaFolder) {
    return mediaLinks
  }

  for (const block of page.blocks) {
    if (block.type !== 'image' && block.type !== 'video' && block.type !== 'audio') {
      continue
    }

    if (!block.assetId) {
      continue
    }

    const fileName = `${block.assetId}-${sanitizeFileNameSegment(block.name || block.type, block.type)}`
    mediaFolder.file(fileName, await readAsset(block.assetId))
    mediaLinks.set(block.id, `./_assets/media/${fileName}`)
  }

  return mediaLinks
}

export async function buildMarkdownZip({
  rootPage,
  allPages,
  boards = [],
  reversible,
  readAsset,
}: BuildMarkdownZipOptions): Promise<Blob> {
  const zip = new JSZip()
  const childrenByParentId = buildChildrenMap(allPages)
  const boardsById = new Map(boards.map((board) => [board.id, board]))

  async function visit(page: PageRecord, parentFolder: JSZip, folderName: string) {
    const currentFolder = parentFolder.folder(folderName)

    if (!currentFolder) {
      return
    }

    const children = childrenByParentId.get(page.id) ?? []
    const folderNames = buildSiblingFolderNames(children)
    const childLinks = new Map<PageId, ChildPageLink>(
      children.map((child) => [
        child.id,
        {
          folderName: folderNames.get(child.id) ?? sanitizePathSegment(child.title),
          title: child.title,
        },
      ]),
    )
    const { boardTitles, boardLinks } = buildWhiteboardAssets(
      page,
      currentFolder,
      boardsById,
      reversible,
    )
    const mediaLinks = await buildMediaAssets(page, currentFolder, readAsset)

    currentFolder.file(
      'index.md',
      pageToMarkdown(
        page,
        childLinks,
        boardTitles,
        boardLinks,
        mediaLinks,
        reversible,
      ),
    )

    for (const child of children) {
      await visit(
        child,
        currentFolder,
        folderNames.get(child.id) ?? sanitizePathSegment(child.title),
      )
    }
  }

  await visit(rootPage, zip, sanitizePathSegment(rootPage.title))

  return zip.generateAsync({ type: 'blob' })
}

function normalizeZipPath(value: string): string {
  return value.replace(/\\/g, '/').replace(/^\.\/+/, '').replace(/\/+/g, '/')
}

function getZipDirname(path: string): string {
  const normalized = normalizeZipPath(path)
  const lastSlash = normalized.lastIndexOf('/')
  return lastSlash === -1 ? '' : normalized.slice(0, lastSlash)
}

function resolveZipPath(fromFilePath: string, relativePath: string): string {
  const baseParts = getZipDirname(fromFilePath)
    .split('/')
    .filter(Boolean)
  const relativeParts = normalizeZipPath(relativePath)
    .split('/')
    .filter(Boolean)

  for (const part of relativeParts) {
    if (part === '.') {
      continue
    }

    if (part === '..') {
      baseParts.pop()
      continue
    }

    baseParts.push(part)
  }

  return baseParts.join('/')
}

function parseFrontmatterValue(value: string): string | null {
  if (value === 'null') {
    return null
  }

  return JSON.parse(value) as string
}

function parseFrontmatter(source: string): { frontmatter: PageFrontmatter; body: string } {
  const match = source.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/)

  if (!match) {
    throw new Error('Unsupported markdown page package')
  }

  const values = new Map<string, string>()

  for (const line of match[1].split(/\r?\n/)) {
    const separatorIndex = line.indexOf(':')

    if (separatorIndex === -1) {
      continue
    }

    values.set(line.slice(0, separatorIndex).trim(), line.slice(separatorIndex + 1).trim())
  }

  const pageId = parseFrontmatterValue(values.get('pageId') ?? '')
  const title = parseFrontmatterValue(values.get('title') ?? '')
  const createdAt = parseFrontmatterValue(values.get('createdAt') ?? '')
  const updatedAt = parseFrontmatterValue(values.get('updatedAt') ?? '')

  if (!pageId || !title || !createdAt || !updatedAt) {
    throw new Error('Unsupported markdown page package')
  }

  return {
    frontmatter: {
      pageId,
      parentId: parseFrontmatterValue(values.get('parentId') ?? 'null'),
      title,
      icon: parseFrontmatterValue(values.get('icon') ?? 'null'),
      cover: parseFrontmatterValue(values.get('cover') ?? 'null'),
      createdAt,
      updatedAt,
    },
    body: match[2],
  }
}

function markdownToPlainText(value: string): string {
  return value
    .replace(/<span[^>]*>(.*?)<\/span>/g, '$1')
    .replace(/<u>(.*?)<\/u>/g, '$1')
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/\*(.*?)\*/g, '$1')
    .replace(/~~(.*?)~~/g, '$1')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1')
    .replace(/\\\|/g, '|')
}

function fileNameFromZipPath(path: string) {
  return normalizeZipPath(path).split('/').pop() || 'media'
}

function mimeTypeFromName(name: string) {
  const extension = name.split('.').pop()?.toLowerCase()

  switch (extension) {
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
    case 'mp4':
      return 'video/mp4'
    case 'webm':
      return 'video/webm'
    case 'mov':
      return 'video/quicktime'
    case 'mp3':
      return 'audio/mpeg'
    case 'wav':
      return 'audio/wav'
    case 'ogg':
      return 'audio/ogg'
    case 'm4a':
      return 'audio/mp4'
    default:
      return 'application/octet-stream'
  }
}

function mediaTypeFromName(name: string): 'image' | 'video' | 'audio' | null {
  const mimeType = mimeTypeFromName(name)

  if (mimeType.startsWith('image/')) {
    return 'image'
  }

  if (mimeType.startsWith('video/')) {
    return 'video'
  }

  if (mimeType.startsWith('audio/')) {
    return 'audio'
  }

  return null
}

function parseStandaloneLink(line: string, pageFilePath: string): ImportedBlockDraft | null {
  const match = line.trim().match(/^\[([^\]]+)\]\((.+)\)$/)

  if (!match) {
    return null
  }

  const [, , href] = match
  const assetPath = resolveZipPath(pageFilePath, href)
  const name = fileNameFromZipPath(assetPath)
  const mediaType = mediaTypeFromName(name)

  if (assetPath.includes('/_assets/media/') && mediaType && mediaType !== 'image') {
    return {
      type: mediaType,
      assetPath,
      name,
      mimeType: mimeTypeFromName(name),
      caption: markdownToPlainText(match[1]),
    }
  }

  if (href.endsWith('.whiteboard.json')) {
    return {
      type: 'whiteboard',
      assetPath: resolveZipPath(pageFilePath, href),
    }
  }

  if (href.endsWith('/index.md')) {
    return {
      type: 'child_page',
      targetPath: resolveZipPath(pageFilePath, href),
    }
  }

  return null
}

function parseImageLine(line: string, pageFilePath: string): ImportedBlockDraft | null {
  const match = line.trim().match(/^!\[([^\]]*)\]\((.+)\)$/)

  if (!match) {
    return null
  }

  const assetPath = resolveZipPath(pageFilePath, match[2])
  const name = fileNameFromZipPath(assetPath)

  return {
    type: 'image',
    assetPath,
    name,
    mimeType: mimeTypeFromName(name),
    caption: '',
    alt: markdownToPlainText(match[1]),
  }
}

function splitTableRow(line: string): string[] {
  const marker = '\u0000'
  const normalized = line.trim().replace(/^\|/, '').replace(/\|$/, '').replace(/\\\|/g, marker)

  return normalized.split('|').map((cell) => markdownToPlainText(cell.replaceAll(marker, '|').trim()))
}

function isTableSeparatorLine(line: string): boolean {
  return /^\|\s*:?-{3,}:?(?:\s*\|\s*:?-{3,}:?)*\s*\|$/.test(line.trim())
}

function trimPageTitle(body: string, title: string): string[] {
  const lines = body.split(/\r?\n/)
  let index = 0

  while (index < lines.length && lines[index].trim() === '') {
    index += 1
  }

  if (lines[index] === `# ${title}`) {
    index += 1
  }

  while (index < lines.length && lines[index].trim() === '') {
    index += 1
  }

  return lines.slice(index)
}

function isStructuredLine(lines: string[], index: number): boolean {
  const line = lines[index]?.trim() ?? ''
  const nextLine = lines[index + 1]?.trim() ?? ''

  return (
    line.startsWith('# ') ||
    line.startsWith('## ') ||
    line.startsWith('### ') ||
    line.startsWith('- [') ||
    line.startsWith('- ') ||
    /^\d+\.\s/.test(line) ||
    line.startsWith('```') ||
    (line.startsWith('|') && isTableSeparatorLine(nextLine)) ||
    /^!\[[^\]]*\]\((.+)\)$/.test(line) ||
    /^\[[^\]]+\]\((.+)\)$/.test(line)
  )
}

function parseMarkdownBlocks(body: string, frontmatter: PageFrontmatter, pageFilePath: string): ImportedBlockDraft[] {
  const lines = trimPageTitle(body, frontmatter.title)
  const blocks: ImportedBlockDraft[] = []

  for (let index = 0; index < lines.length; ) {
    const currentLine = lines[index]
    const trimmedLine = currentLine?.trim() ?? ''

    if (!trimmedLine) {
      index += 1
      continue
    }

    if (trimmedLine.startsWith('```')) {
      const language = trimmedLine.slice(3).trim() || 'text'
      const content: string[] = []
      index += 1

      while (index < lines.length && !lines[index].trim().startsWith('```')) {
        content.push(lines[index])
        index += 1
      }

      if (index < lines.length) {
        index += 1
      }

      blocks.push({
        type: 'code',
        language,
        text: content.join('\n'),
      })
      continue
    }

    if (trimmedLine.startsWith('|') && isTableSeparatorLine(lines[index + 1] ?? '')) {
      const tableLines = [lines[index], lines[index + 1]]
      index += 2

      while (index < lines.length && lines[index].trim().startsWith('|')) {
        tableLines.push(lines[index])
        index += 1
      }

      blocks.push({
        type: 'table',
        rows: [splitTableRow(tableLines[0]), ...tableLines.slice(2).map(splitTableRow)],
      })
      continue
    }

    if (trimmedLine.startsWith('### ')) {
      blocks.push({ type: 'heading_3', text: markdownToPlainText(trimmedLine.slice(4)) })
      index += 1
      continue
    }

    if (trimmedLine.startsWith('## ')) {
      blocks.push({ type: 'heading_2', text: markdownToPlainText(trimmedLine.slice(3)) })
      index += 1
      continue
    }

    if (trimmedLine.startsWith('# ')) {
      blocks.push({ type: 'heading_1', text: markdownToPlainText(trimmedLine.slice(2)) })
      index += 1
      continue
    }

    const todoMatch = trimmedLine.match(/^- \[([ xX])\] (.*)$/)

    if (todoMatch) {
      blocks.push({
        type: 'todo',
        checked: todoMatch[1].toLowerCase() === 'x',
        text: markdownToPlainText(todoMatch[2]),
      })
      index += 1
      continue
    }

    if (trimmedLine.startsWith('- ')) {
      blocks.push({
        type: 'bulleted_list',
        text: markdownToPlainText(trimmedLine.slice(2)),
      })
      index += 1
      continue
    }

    const numberedMatch = trimmedLine.match(/^\d+\.\s+(.*)$/)

    if (numberedMatch) {
      blocks.push({
        type: 'numbered_list',
        text: markdownToPlainText(numberedMatch[1]),
      })
      index += 1
      continue
    }

    const imageBlock = parseImageLine(trimmedLine, pageFilePath)

    if (imageBlock) {
      blocks.push(imageBlock)
      index += 1
      continue
    }

    const linkBlock = parseStandaloneLink(trimmedLine, pageFilePath)

    if (linkBlock) {
      blocks.push(linkBlock)
      index += 1
      continue
    }

    const paragraphLines = [currentLine]
    index += 1

    while (
      index < lines.length &&
      lines[index].trim() !== '' &&
      !isStructuredLine(lines, index)
    ) {
      paragraphLines.push(lines[index])
      index += 1
    }

    blocks.push({
      type: 'paragraph',
      text: markdownToPlainText(paragraphLines.join('\n').trim()),
    })
  }

  return blocks.filter((block) => {
    if ('text' in block) {
      return block.text.trim().length > 0
    }

    return true
  })
}

function createBlockFromDraft(
  draft: ImportedBlockDraft,
  pageIdByFilePath: Map<string, string>,
  boardIdByAssetPath: Map<string, string>,
  assetIdByAssetPath: Map<string, string>,
): BlockRecord | null {
  switch (draft.type) {
    case 'paragraph':
      return { id: createId('block'), type: 'paragraph', text: draft.text }
    case 'heading_1':
      return { id: createId('block'), type: 'heading_1', text: draft.text }
    case 'heading_2':
      return { id: createId('block'), type: 'heading_2', text: draft.text }
    case 'heading_3':
      return { id: createId('block'), type: 'heading_3', text: draft.text }
    case 'todo':
      return { id: createId('block'), type: 'todo', text: draft.text, checked: draft.checked }
    case 'bulleted_list':
      return { id: createId('block'), type: 'bulleted_list', items: [draft.text] }
    case 'numbered_list':
      return { id: createId('block'), type: 'numbered_list', items: [draft.text] }
    case 'code':
      return { id: createId('block'), type: 'code', language: draft.language, text: draft.text }
    case 'table':
      return { id: createId('block'), type: 'table', rows: draft.rows }
    case 'child_page': {
      const pageId = pageIdByFilePath.get(draft.targetPath)
      return pageId ? { id: createId('block'), type: 'child_page', pageId } : null
    }
    case 'whiteboard': {
      const boardId = boardIdByAssetPath.get(draft.assetPath)
      return boardId ? { id: createId('block'), type: 'whiteboard', boardId } : null
    }
    case 'image': {
      const assetId = assetIdByAssetPath.get(draft.assetPath) ?? null
      return {
        id: createId('block'),
        type: 'image',
        assetId,
        name: draft.name,
        mimeType: draft.mimeType,
        caption: draft.caption,
        alt: draft.alt ?? '',
      }
    }
    case 'video':
    case 'audio': {
      const assetId = assetIdByAssetPath.get(draft.assetPath) ?? null
      return {
        id: createId('block'),
        type: draft.type,
        assetId,
        name: draft.name,
        mimeType: draft.mimeType,
        caption: draft.caption,
      }
    }
  }
}

export async function importMarkdownZip(
  blob: Blob,
  options: ImportMarkdownZipOptions = {},
): Promise<ImportedMarkdownPackage> {
  const zip = await JSZip.loadAsync(await blob.arrayBuffer())
  const pageFiles = Object.values(zip.files)
    .filter((file) => !file.dir && file.name.endsWith('/index.md'))
    .sort((left, right) => left.name.localeCompare(right.name))

  if (pageFiles.length === 0) {
    throw new Error('Unsupported markdown page package')
  }

  const importedPageDrafts: ImportedPageDraft[] = []

  for (const file of pageFiles) {
    const markdown = await file.async('string')
    const { frontmatter, body } = parseFrontmatter(markdown)

    importedPageDrafts.push({
      filePath: normalizeZipPath(file.name),
      frontmatter,
      blocks: parseMarkdownBlocks(body, frontmatter, file.name),
    })
  }

  const pageIdByOriginalId = new Map<string, string>()
  const pageIdByFilePath = new Map<string, string>()

  for (const page of importedPageDrafts) {
    const nextId = createId('page')
    pageIdByOriginalId.set(page.frontmatter.pageId, nextId)
    pageIdByFilePath.set(page.filePath, nextId)
  }

  const assetPaths = Array.from(
    new Set(
      importedPageDrafts.flatMap((page) =>
        page.blocks
          .filter((block): block is Extract<ImportedBlockDraft, { type: 'whiteboard' }> => block.type === 'whiteboard')
          .map((block) => block.assetPath),
      ),
    ),
  )

  const boardIdByOriginalId = new Map<string, string>()
  const boardIdByAssetPath = new Map<string, string>()
  const assetIdByAssetPath = new Map<string, string>()
  const boards: BoardRecord[] = []
  const now = new Date().toISOString()

  for (const assetPath of assetPaths) {
    const assetFile = zip.file(assetPath)

    if (!assetFile) {
      continue
    }

    const payload = JSON.parse(await assetFile.async('string')) as {
      boardId?: unknown
      title?: unknown
      snapshot?: unknown
    }
    const originalBoardId =
      typeof payload.boardId === 'string' && payload.boardId ? payload.boardId : assetPath
    let nextBoardId = boardIdByOriginalId.get(originalBoardId)

    if (!nextBoardId) {
      nextBoardId = createId('board')
      boardIdByOriginalId.set(originalBoardId, nextBoardId)
      boards.push({
        id: nextBoardId,
        title:
          typeof payload.title === 'string' && payload.title.trim()
            ? payload.title
            : WHITEBOARD_LABEL,
        snapshot: payload.snapshot ?? null,
        createdAt: now,
        updatedAt: now,
      })
    }

    boardIdByAssetPath.set(assetPath, nextBoardId)
  }

  if (options.writeAsset) {
    const mediaAssetPaths = Array.from(
      new Set(
        importedPageDrafts.flatMap((page) =>
          page.blocks
            .filter(
              (
                block,
              ): block is Extract<ImportedBlockDraft, { type: 'image' | 'video' | 'audio' }> =>
                block.type === 'image' || block.type === 'video' || block.type === 'audio',
            )
            .map((block) => block.assetPath),
        ),
      ),
    )

    for (const assetPath of mediaAssetPaths) {
      const assetFile = zip.file(assetPath)

      if (!assetFile) {
        continue
      }

      const name = fileNameFromZipPath(assetPath)
      const asset = await options.writeAsset({
        name,
        mimeType: mimeTypeFromName(name),
        bytes: await assetFile.async('uint8array'),
      })
      assetIdByAssetPath.set(assetPath, asset.id)
    }
  }

  const pages: PageRecord[] = importedPageDrafts.map((draft) => ({
    id: pageIdByOriginalId.get(draft.frontmatter.pageId) ?? createId('page'),
    parentId: draft.frontmatter.parentId
      ? (pageIdByOriginalId.get(draft.frontmatter.parentId) ?? null)
      : null,
    title: draft.frontmatter.title,
    icon: draft.frontmatter.icon,
    cover: draft.frontmatter.cover,
    blocks: draft.blocks
      .map((block) =>
        createBlockFromDraft(block, pageIdByFilePath, boardIdByAssetPath, assetIdByAssetPath),
      )
      .filter((block): block is BlockRecord => block !== null),
    createdAt: draft.frontmatter.createdAt,
    updatedAt: draft.frontmatter.updatedAt,
  }))

  const rootDraft =
    importedPageDrafts.find((draft) => draft.frontmatter.parentId === null) ?? importedPageDrafts[0]

  return {
    rootPageId: pageIdByOriginalId.get(rootDraft.frontmatter.pageId) ?? null,
    pages,
    boards,
  }
}
