import type { BlockRecord, BoardRecord, DataTableRecord, PageRecord } from './types'

export interface SearchResult {
  kind: 'page' | 'whiteboard' | 'data_table' | 'data_table_record'
  pageId: string
  boardId?: string
  databaseId?: string
  recordId?: string
  title: string
  icon: string | null
  excerpt: string
}

export function searchPages(pages: PageRecord[], query: string): SearchResult[] {
  const normalizedQuery = normalizeSearchText(query)

  if (!normalizedQuery) {
    return []
  }

  const pageTitleById = new Map(pages.map((page) => [page.id, page.title]))
  const results: SearchResult[] = []

  for (const page of pages) {
    const matchedExcerpts = new Set<string>()
    const entries = [
      createSearchEntry(page.title),
      ...page.blocks.map((block) => getBlockSearchEntry(block, pageTitleById)),
    ]

    for (const entry of entries) {
      if (!entry) {
        continue
      }

      if (!normalizeSearchText(entry.searchText).includes(normalizedQuery)) {
        continue
      }

      if (matchedExcerpts.has(entry.excerpt)) {
        continue
      }

      matchedExcerpts.add(entry.excerpt)
      results.push({
        kind: 'page',
        pageId: page.id,
        title: page.title,
        icon: page.icon,
        excerpt: entry.excerpt,
      })
    }
  }

  return results
}

export function searchBoards(
  pages: PageRecord[],
  boards: BoardRecord[],
  query: string,
): SearchResult[] {
  const normalizedQuery = normalizeSearchText(query)

  if (!normalizedQuery) {
    return []
  }

  const pageTitleById = new Map(pages.map((page) => [page.id, page.title]))
  const pageIdByBoardId = new Map<string, string>()

  for (const page of pages) {
    for (const block of page.blocks) {
      if (block.type === 'whiteboard' && !pageIdByBoardId.has(block.boardId)) {
        pageIdByBoardId.set(block.boardId, page.id)
      }
    }
  }

  return boards
    .filter(
      (board) =>
        pageIdByBoardId.has(board.id) && normalizeSearchText(board.title).includes(normalizedQuery),
    )
    .map((board) => {
      const pageId = pageIdByBoardId.get(board.id) ?? ''
      const pageTitle = pageTitleById.get(pageId)

      return {
        kind: 'whiteboard' as const,
        pageId,
        boardId: board.id,
        title: board.title,
        icon: '\u25a1',
        excerpt: pageTitle ? `\u767d\u677f · ${pageTitle}` : '\u767d\u677f',
      }
    })
}

export function searchDataTables(
  pages: PageRecord[],
  dataTables: DataTableRecord[],
  query: string,
): SearchResult[] {
  const normalizedQuery = normalizeSearchText(query)

  if (!normalizedQuery) {
    return []
  }

  const pageTitleById = new Map(pages.map((page) => [page.id, page.title]))
  const pageIdByDatabaseId = new Map<string, string>()

  for (const page of pages) {
    for (const block of page.blocks) {
      if (block.type === 'data_table' && !pageIdByDatabaseId.has(block.databaseId)) {
        pageIdByDatabaseId.set(block.databaseId, page.id)
      }
    }
  }

  const results: SearchResult[] = []

  for (const dataTable of dataTables) {
    const pageId = pageIdByDatabaseId.get(dataTable.id)

    if (!pageId) {
      continue
    }

    const pageTitle = pageTitleById.get(pageId)
    const excerpt = pageTitle
      ? `\u6570\u636e\u8868\u683c \u8def ${pageTitle}`
      : '\u6570\u636e\u8868\u683c'

    if (normalizeSearchText(dataTable.title).includes(normalizedQuery)) {
      results.push({
        kind: 'data_table',
        pageId,
        databaseId: dataTable.id,
        title: dataTable.title,
        icon: '\u25a6',
        excerpt,
      })
    }

    for (const record of getDataTableRecords(dataTable.snapshot)) {
      if (!normalizeSearchText(record.title).includes(normalizedQuery)) {
        continue
      }

      results.push({
        kind: 'data_table_record',
        pageId,
        databaseId: dataTable.id,
        recordId: record.id,
        title: record.title,
        icon: '\u25a6',
        excerpt: `${dataTable.title} \u8def \u8bb0\u5f55`,
      })
    }
  }

  return results
}

function normalizeSearchText(value: string) {
  return value.trim().toLocaleLowerCase()
}

function getBlockSearchEntry(
  block: BlockRecord,
  pageTitleById: Map<string, string>,
): { excerpt: string; searchText: string } | null {
  switch (block.type) {
    case 'paragraph':
    case 'heading_1':
    case 'heading_2':
    case 'heading_3':
    case 'todo':
    case 'code':
      return createSearchEntry(block.text)
    case 'bulleted_list':
    case 'numbered_list':
      return createSearchEntry(block.items.join(' '))
    case 'table':
      return createSearchEntry(block.rows.flat().join(' '))
    case 'image':
      return createMediaSearchEntry([block.name, block.caption, block.alt])
    case 'video':
    case 'audio':
      return createMediaSearchEntry([block.name, block.caption])
    case 'child_page':
      return createSearchEntry(pageTitleById.get(block.pageId) ?? '')
    case 'whiteboard':
      return createSearchEntry('\u767d\u677f')
    case 'data_table':
      return createSearchEntry('\u6570\u636e\u8868\u683c')
    case 'mindmap':
      return createSearchEntry('\u5bfc\u56fe')
  }
}

function createMediaSearchEntry(parts: string[]) {
  const trimmedParts = parts.map((part) => part.trim()).filter(Boolean)
  const excerpt = trimmedParts[0] ?? ''

  if (!excerpt) {
    return null
  }

  return {
    excerpt,
    searchText: buildSearchText([
      ...trimmedParts,
      ...buildFileNameSearchAliases(trimmedParts[0] ?? ''),
    ]),
  }
}

function createSearchEntry(text: string) {
  const excerpt = text.trim()

  if (!excerpt) {
    return null
  }

  return {
    excerpt,
    searchText: excerpt,
  }
}

function buildSearchText(parts: string[]) {
  return Array.from(new Set(parts.map((part) => part.trim()).filter(Boolean))).join(' ')
}

function buildFileNameSearchAliases(value: string) {
  const normalizedValue = value.trim()

  if (!normalizedValue) {
    return []
  }

  const stem = normalizedValue.replace(/\.[^.]+$/u, '').trim()
  const punctuationNormalized = normalizedValue.replace(/[._-]+/gu, ' ').replace(/\s+/gu, ' ').trim()
  const stemNormalized = stem.replace(/[._-]+/gu, ' ').replace(/\s+/gu, ' ').trim()

  return Array.from(
    new Set(
      [punctuationNormalized, stem, stemNormalized].filter(
        (entry) => entry && entry !== normalizedValue,
      ),
    ),
  )
}

function getDataTableRecords(snapshot: unknown): Array<{ id: string; title: string }> {
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) {
    return []
  }

  const records = (snapshot as { records?: unknown }).records

  if (!records || typeof records !== 'object' || Array.isArray(records)) {
    return []
  }

  return Object.entries(records).flatMap(([recordId, value]) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return []
    }

    const record = value as { id?: unknown; title?: unknown }
    const title = typeof record.title === 'string' ? record.title.trim() : ''

    if (!title) {
      return []
    }

    return [
      {
        id: typeof record.id === 'string' ? record.id : recordId,
        title,
      },
    ]
  })
}
