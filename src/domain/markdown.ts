import JSZip from 'jszip'
import type { BlockRecord, PageId, PageRecord } from './types'
import { uiCopy } from '../ui/copy'

interface BuildMarkdownZipOptions {
  rootPage: PageRecord
  allPages: PageRecord[]
  reversible: boolean
}

interface ChildPageLink {
  folderName: string
  title: string
}

function sanitizePathSegment(value: string): string {
  const cleaned = value
    .trim()
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/\.+$/g, '')
    .trim()

  return cleaned || uiCopy.page.untitled
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

function blockToMarkdown(block: BlockRecord, childLinks: Map<PageId, ChildPageLink>): string {
  switch (block.type) {
    case 'paragraph':
      return block.text
    case 'todo':
      return `- [${block.checked ? 'x' : ' '}] ${block.text}`
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
    case 'child_page': {
      const childLink = childLinks.get(block.pageId)

      if (!childLink) {
        return childLinks.get(block.pageId)?.title ?? uiCopy.editor.childPage
      }

      return `[${childLink.title}](./${childLink.folderName}/index.md)`
    }
  }
}

function pageToMarkdown(
  page: PageRecord,
  childLinks: Map<PageId, ChildPageLink>,
  reversible: boolean,
): string {
  const blocks = page.blocks
    .map((block) => blockToMarkdown(block, childLinks))
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

export async function buildMarkdownZip({
  rootPage,
  allPages,
  reversible,
}: BuildMarkdownZipOptions): Promise<Blob> {
  const zip = new JSZip()
  const childrenByParentId = buildChildrenMap(allPages)

  function visit(page: PageRecord, parentFolder: JSZip, folderName: string) {
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

    currentFolder.file('index.md', pageToMarkdown(page, childLinks, reversible))

    for (const child of children) {
      visit(
        child,
        currentFolder,
        folderNames.get(child.id) ?? sanitizePathSegment(child.title),
      )
    }
  }

  visit(rootPage, zip, sanitizePathSegment(rootPage.title))

  return zip.generateAsync({ type: 'blob' })
}
