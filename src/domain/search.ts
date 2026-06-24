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
    const entries = [
      page.title,
      ...page.blocks.map((block) => getBlockSearchText(block, pageTitleById)),
    ].filter(Boolean)

    const matchedEntry = entries.find((entry) =>
      normalizeSearchText(entry).includes(normalizedQuery),
    )

    if (!matchedEntry) {
      continue
    }

    results.push({
      kind: 'page',
      pageId: page.id,
      title: page.title,
      icon: page.icon,
      excerpt: matchedEntry,
    })
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

function getBlockSearchText(block: BlockRecord, pageTitleById: Map<string, string>): string {
  switch (block.type) {
    case 'paragraph':
    case 'heading_1':
    case 'heading_2':
    case 'heading_3':
    case 'todo':
    case 'code':
      return block.text.trim()
    case 'bulleted_list':
    case 'numbered_list':
      return block.items.join(' ').trim()
    case 'table':
      return block.rows.flat().join(' ').trim()
    case 'child_page':
      return pageTitleById.get(block.pageId)?.trim() ?? ''
    case 'whiteboard':
      return '\u767d\u677f'
    case 'data_table':
      return '\u6570\u636e\u8868\u683c'
    case 'mindmap':
      return '\u5bfc\u56fe'
  }
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
