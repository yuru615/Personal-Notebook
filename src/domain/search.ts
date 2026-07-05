import type {
  BlockRecord,
  BoardRecord,
  DataTableRecord,
  PagePropertyDefinition,
  PageRecord,
} from './types'

export interface SearchResult {
  kind: 'page' | 'whiteboard' | 'data_table' | 'data_table_record'
  pageId: string
  boardId?: string
  databaseId?: string
  recordId?: string
  title: string
  icon: string | null
  excerpt: string
  matchSource:
    | 'title'
    | 'body'
    | 'property'
    | 'media'
    | 'whiteboard'
    | 'data_table'
    | 'data_table_record'
  matchKey?: string
  sourceLabel: string
}

interface SearchEntry {
  excerpt: string
  searchText: string
  matchSource: SearchResult['matchSource']
  matchKey?: string
  sourceLabel: string
}

export function searchPages(
  pages: PageRecord[],
  definitions: PagePropertyDefinition[],
  query: string,
): SearchResult[] {
  const normalizedQuery = normalizeSearchText(query)

  if (!normalizedQuery) {
    return []
  }

  const pageTitleById = new Map(pages.map((page) => [page.id, page.title]))
  const results: SearchResult[] = []

  for (const page of pages) {
    const entries: SearchEntry[] = [
      createSearchEntry(page.title, 'title', '标题'),
      ...getPropertySearchEntries(page, definitions),
      ...page.blocks.flatMap((block) => {
        const entry = getBlockSearchEntry(block, pageTitleById)
        return entry ? [entry] : []
      }),
    ].flatMap((entry) => (entry ? [entry] : []))

    for (const entry of entries) {
      if (!normalizeSearchText(entry.searchText).includes(normalizedQuery)) {
        continue
      }

      results.push({
        kind: 'page',
        pageId: page.id,
        title: page.title,
        icon: page.icon,
        excerpt: entry.excerpt,
        matchSource: entry.matchSource,
        matchKey: entry.matchKey,
        sourceLabel: entry.sourceLabel,
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
        icon: '□',
        excerpt: pageTitle ? `白板 · ${pageTitle}` : '白板',
        matchSource: 'whiteboard' as const,
        sourceLabel: '白板',
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
    const excerpt = pageTitle ? `数据表格 · ${pageTitle}` : '数据表格'

    if (normalizeSearchText(dataTable.title).includes(normalizedQuery)) {
      results.push({
        kind: 'data_table',
        pageId,
        databaseId: dataTable.id,
        title: dataTable.title,
        icon: '▦',
        excerpt,
        matchSource: 'data_table',
        sourceLabel: '数据表格',
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
        icon: '▦',
        excerpt: `${dataTable.title} · 记录`,
        matchSource: 'data_table_record',
        sourceLabel: '记录',
      })
    }
  }

  return results
}

function normalizeSearchText(value: string) {
  return value.trim().toLocaleLowerCase()
}

function getPropertySearchEntries(
  page: PageRecord,
  definitions: PagePropertyDefinition[],
): SearchEntry[] {
  return definitions.flatMap((definition) => {
    const rawValue = page.properties?.[definition.id]
    const excerpt = Array.isArray(rawValue)
      ? rawValue.map((item) => item.trim()).filter(Boolean).join(' / ')
      : typeof rawValue === 'string'
        ? rawValue.trim()
        : ''

    if (!excerpt) {
      return []
    }

    return [
      {
        excerpt,
        searchText: excerpt,
        matchSource: 'property' as const,
        matchKey: definition.key,
        sourceLabel: definition.name,
      },
    ]
  })
}

function getBlockSearchEntry(
  block: BlockRecord,
  pageTitleById: Map<string, string>,
): SearchEntry | null {
  switch (block.type) {
    case 'paragraph':
    case 'heading_1':
    case 'heading_2':
    case 'heading_3':
    case 'todo':
    case 'code':
      return createSearchEntry(block.text, 'body', '正文')
    case 'bulleted_list':
    case 'numbered_list':
      return createSearchEntry(block.items.join(' '), 'body', '正文')
    case 'table':
      return createSearchEntry(block.rows.flat().join(' '), 'body', '正文')
    case 'image':
      return createMediaSearchEntry([block.name, block.caption, block.alt])
    case 'video':
    case 'audio':
      return createMediaSearchEntry([block.name, block.caption])
    case 'child_page':
      return createSearchEntry(pageTitleById.get(block.pageId) ?? '', 'body', '正文')
    case 'whiteboard':
      return createSearchEntry('白板', 'whiteboard', '白板')
    case 'data_table':
      return createSearchEntry('数据表格', 'data_table', '数据表格')
    case 'mindmap':
      return createSearchEntry('导图', 'body', '导图')
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
    matchSource: 'media' as const,
    sourceLabel: '媒体',
  }
}

function createSearchEntry(
  text: string,
  matchSource: SearchResult['matchSource'],
  sourceLabel: string,
): SearchEntry | null {
  const excerpt = text.trim()

  if (!excerpt) {
    return null
  }

  return {
    excerpt,
    searchText: excerpt,
    matchSource,
    sourceLabel,
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
