import { extractMindmapTitle } from '../components/mindmap/mindmapModel'
import { normalizeWhiteboardSnapshot } from '../components/whiteboard/whiteboardModel'
import { normalizeRichText, richTextToPlainText } from './richText'
import type {
  BlockRecord,
  BoardRecord,
  DataTableRecord,
  MindmapRecord,
  PagePropertyDefinition,
  PageRecord,
  SyncedBlockGroupRecord,
} from './types'

export interface SearchResult {
  kind: 'page' | 'whiteboard' | 'mindmap' | 'data_table' | 'data_table_record'
  pageId: string
  blockId?: string
  boardId?: string
  mindmapId?: string
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
    | 'page_link'
    | 'page_mention'
    | 'synced_block'
    | 'reference_block'
    | 'whiteboard'
    | 'whiteboard_title'
    | 'whiteboard_content'
    | 'mindmap_title'
    | 'mindmap_node'
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
  blockId?: string
}

export function searchPages(
  pages: PageRecord[],
  definitions: PagePropertyDefinition[],
  syncedBlockGroups: SyncedBlockGroupRecord[],
  query: string,
): SearchResult[] {
  const normalizedQuery = normalizeSearchText(query)

  if (!normalizedQuery) {
    return []
  }

  const pageTitleById = new Map(pages.map((page) => [page.id, page.title]))
  const syncedGroupMap = new Map(syncedBlockGroups.map((group) => [group.id, group]))
  const results: SearchResult[] = []

  for (const page of pages) {
    const entries: SearchEntry[] = [
      createSearchEntry(page.title, 'title', '标题'),
      ...getPropertySearchEntries(page, definitions),
      ...page.blocks.flatMap((block) =>
        getBlockSearchEntries(block, pageTitleById, syncedGroupMap),
      ),
    ].flatMap((entry) => (entry ? [entry] : []))

    for (const entry of entries) {
      if (!normalizeSearchText(entry.searchText).includes(normalizedQuery)) {
        continue
      }

      results.push({
        kind: 'page',
        pageId: page.id,
        blockId: entry.blockId,
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

  const results: SearchResult[] = []

  for (const board of boards) {
    const pageId = pageIdByBoardId.get(board.id)

    if (!pageId) {
      continue
    }

    const pageTitle = pageTitleById.get(pageId)
    const titleExcerpt = pageTitle ? `白板 / ${pageTitle}` : '白板'
    const titleEntry = createSearchEntry(board.title, 'whiteboard_title', '白板标题')

    if (titleEntry && normalizeSearchText(titleEntry.searchText).includes(normalizedQuery)) {
      results.push({
        kind: 'whiteboard',
        pageId,
        boardId: board.id,
        title: board.title,
        icon: '◌',
        excerpt: titleExcerpt,
        matchSource: titleEntry.matchSource,
        sourceLabel: titleEntry.sourceLabel,
      })
    }

    for (const text of getWhiteboardSearchTexts(board.snapshot)) {
      const entry = createSearchEntry(text, 'whiteboard_content', '白板内容')

      if (!entry || !normalizeSearchText(entry.searchText).includes(normalizedQuery)) {
        continue
      }

      results.push({
        kind: 'whiteboard',
        pageId,
        boardId: board.id,
        title: board.title,
        icon: '◌',
        excerpt: entry.excerpt,
        matchSource: entry.matchSource,
        sourceLabel: entry.sourceLabel,
      })
    }
  }

  return results
}

export function searchMindmaps(
  pages: PageRecord[],
  mindmaps: MindmapRecord[],
  query: string,
): SearchResult[] {
  const normalizedQuery = normalizeSearchText(query)

  if (!normalizedQuery) {
    return []
  }

  const pageTitleById = new Map(pages.map((page) => [page.id, page.title]))
  const pageIdByMindmapId = new Map<string, string>()

  for (const page of pages) {
    for (const block of page.blocks) {
      if (block.type === 'mindmap' && !pageIdByMindmapId.has(block.mindmapId)) {
        pageIdByMindmapId.set(block.mindmapId, page.id)
      }
    }
  }

  const results: SearchResult[] = []

  for (const mindmap of mindmaps) {
    const pageId = pageIdByMindmapId.get(mindmap.id)

    if (!pageId) {
      continue
    }

    const pageTitle = pageTitleById.get(pageId)
    const titleExcerpt = pageTitle ? `导图 / ${pageTitle}` : '导图'
    const snapshotTitle = extractMindmapTitle(mindmap.snapshot as { title?: unknown })
    const displayTitle = mindmap.title.trim() || snapshotTitle
    const titleSearchText = buildSearchText([displayTitle, snapshotTitle])
    const titleTextSet = new Set(
      [displayTitle, snapshotTitle].map((text) => normalizeSearchText(text)).filter(Boolean),
    )

    if (normalizeSearchText(titleSearchText).includes(normalizedQuery)) {
      results.push({
        kind: 'mindmap',
        pageId,
        mindmapId: mindmap.id,
        title: displayTitle,
        icon: '🧠',
        excerpt: titleExcerpt,
        matchSource: 'mindmap_title',
        sourceLabel: '导图标题',
      })
    }

    for (const text of getMindmapNodeTexts(mindmap.snapshot)) {
      if (titleTextSet.has(normalizeSearchText(text))) {
        continue
      }

      const entry = createSearchEntry(text, 'mindmap_node', '导图节点')

      if (!entry || !normalizeSearchText(entry.searchText).includes(normalizedQuery)) {
        continue
      }

      results.push({
        kind: 'mindmap',
        pageId,
        mindmapId: mindmap.id,
        title: displayTitle,
        icon: '🧠',
        excerpt: entry.excerpt,
        matchSource: entry.matchSource,
        sourceLabel: entry.sourceLabel,
      })
    }
  }

  return results
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
    const excerpt = pageTitle ? `数据表格 / ${pageTitle}` : '数据表格'

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
        excerpt: `${dataTable.title} / 记录`,
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

function getBlockSearchEntries(
  block: BlockRecord,
  pageTitleById: Map<string, string>,
  syncedGroupMap: Map<string, SyncedBlockGroupRecord>,
): SearchEntry[] {
  if (block.type === 'synced_block') {
    const group = syncedGroupMap.get(block.groupId)

    if (!group) {
      return []
    }

    return group.blocks.flatMap((innerBlock) => {
      if (innerBlock.type === 'synced_block') {
        return []
      }

      return getBlockSearchEntries(innerBlock, pageTitleById, syncedGroupMap).map((entry) => ({
        ...entry,
        blockId: block.id,
        matchSource: block.mode === 'reference' ? 'reference_block' : 'synced_block',
        sourceLabel: block.mode === 'reference' ? '引用块内容' : '同步块内容',
      }))
    })
  }

  const relationEntries = getRichTextRelationEntries(block)
  const bodyEntry = getBlockSearchEntry(block, pageTitleById)

  return bodyEntry ? [...relationEntries, bodyEntry] : relationEntries
}

function getRichTextRelationEntries(block: BlockRecord): SearchEntry[] {
  if (
    block.type !== 'paragraph' &&
    block.type !== 'heading_1' &&
    block.type !== 'heading_2' &&
    block.type !== 'heading_3' &&
    block.type !== 'todo'
  ) {
    return []
  }

  const richText = normalizeRichText(block.richText ?? [{ text: block.text }])
  const excerpt = richTextToPlainText(richText)

  return richText.flatMap((segment) => {
    if (!segment.pageId || !segment.relationKind) {
      return []
    }

    return [
      {
        excerpt,
        searchText: segment.text,
        matchSource: segment.relationKind === 'mention' ? 'page_mention' : 'page_link',
        sourceLabel: segment.relationKind === 'mention' ? '页面提及' : '页面链接',
        blockId: block.id,
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
      return createSearchEntry(getVisibleTextBlockContent(block), 'body', '正文', block.id)
    case 'code':
      return createSearchEntry(block.text, 'body', '正文', block.id)
    case 'bulleted_list':
    case 'numbered_list':
      return createSearchEntry(block.items.join(' '), 'body', '正文', block.id)
    case 'table':
      return createSearchEntry(block.rows.flat().join(' '), 'body', '正文', block.id)
    case 'image':
      return createMediaSearchEntry([block.name, block.caption, block.alt], block.id)
    case 'video':
    case 'audio':
    case 'file':
      return createMediaSearchEntry([block.name, block.caption], block.id)
    case 'child_page':
      return createSearchEntry(pageTitleById.get(block.pageId) ?? '', 'body', '正文', block.id)
    case 'whiteboard':
      return createSearchEntry('白板', 'whiteboard', '白板', block.id)
    case 'data_table':
      return createSearchEntry('数据表格', 'data_table', '数据表格', block.id)
    case 'mindmap':
      return createSearchEntry('导图', 'body', '导图', block.id)
    case 'synced_block':
      return null
  }
}

function getVisibleTextBlockContent(
  block: Extract<BlockRecord, { type: 'paragraph' | 'heading_1' | 'heading_2' | 'heading_3' | 'todo' }>,
) {
  const richTextContent = richTextToPlainText(
    normalizeRichText(block.richText ?? [{ text: block.text }]),
  ).trim()

  return richTextContent || block.text
}

function createMediaSearchEntry(parts: string[], blockId?: string) {
  const trimmedParts = parts.map((part) => part.trim()).filter(Boolean)
  const fileName = trimmedParts[0] ?? ''
  const description = Array.from(new Set(trimmedParts.slice(1))).join(' / ')
  const excerpt = description ? `${fileName} / ${description}` : fileName

  if (!excerpt) {
    return null
  }

  return {
    excerpt,
    searchText: buildSearchText([
      ...trimmedParts,
      ...buildFileNameSearchAliases(fileName),
    ]),
    matchSource: 'media' as const,
    sourceLabel: '媒体',
    blockId,
  }
}

function createSearchEntry(
  text: string,
  matchSource: SearchResult['matchSource'],
  sourceLabel: string,
  blockId?: string,
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
    blockId,
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

function getWhiteboardSearchTexts(snapshot: unknown) {
  const normalized = normalizeWhiteboardSnapshot(snapshot)

  return [
    ...normalized.notes.map((note) => note.text),
    ...normalized.texts.map((text) => text.text),
    ...normalized.shapes.map((shape) => shape.text),
  ]
    .map((text) => text.trim())
    .filter(Boolean)
}

function getMindmapNodeTexts(snapshot: unknown) {
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) {
    return []
  }

  const nodes = (snapshot as { nodes?: unknown }).nodes

  if (!nodes || typeof nodes !== 'object' || Array.isArray(nodes)) {
    return []
  }

  return Object.values(nodes).flatMap((node) => {
    if (!node || typeof node !== 'object' || Array.isArray(node)) {
      return []
    }

    const text = (node as { text?: unknown }).text
    return typeof text === 'string' && text.trim() ? [text.trim()] : []
  })
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
