import type { BlockRecord, BoardRecord, PageRecord } from './types'

export interface SearchResult {
  kind: 'page' | 'whiteboard'
  pageId: string
  boardId?: string
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
  }
}
