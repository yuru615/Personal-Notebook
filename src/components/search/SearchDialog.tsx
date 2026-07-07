import type { KeyboardEvent as ReactKeyboardEvent } from 'react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type {
  BoardRecord,
  DataTableRecord,
  MindmapRecord,
  PagePropertyDefinition,
  PageRecord,
  SyncedBlockGroupRecord,
} from '../../domain/types'
import {
  searchBoards,
  searchDataTables,
  searchMindmaps,
  searchPages,
  type SearchResult,
} from '../../domain/search'
import { uiCopy } from '../../ui/copy'

interface SearchDialogProps {
  open: boolean
  pages: PageRecord[]
  pageProperties?: PagePropertyDefinition[]
  boards?: BoardRecord[]
  dataTables?: DataTableRecord[]
  mindmaps?: MindmapRecord[]
  syncedBlockGroups?: SyncedBlockGroupRecord[]
  onSearch?: (query: string) => Promise<AsyncSearchResult[]>
  onClose: () => void
  onOpenPage: (pageId: string, blockId?: string) => void
  onOpenBoard?: (pageId: string, boardId: string) => void
  onOpenMindmap?: (pageId: string, mindmapId: string) => void
  onOpenDataTable?: (pageId: string, databaseId: string, recordId?: string) => void
}

type SearchFilter =
  | 'all'
  | 'page'
  | 'media'
  | 'whiteboard'
  | 'mindmap'
  | 'data_table'
  | 'tags'
  | 'status'
type AsyncSearchResult = Omit<SearchResult, 'matchSource' | 'sourceLabel'> & {
  matchSource?: SearchResult['matchSource']
  matchKey?: string
  sourceLabel?: string
}

const OPEN_WHITEBOARD_LABEL = '打开白板'
const OPEN_MINDMAP_LABEL = '打开导图'
const OPEN_DATA_TABLE_LABEL = '打开数据表格'
const OPEN_DATA_TABLE_RECORD_LABEL = '打开记录'

export function SearchDialog({
  open,
  pages,
  pageProperties = [],
  boards = [],
  dataTables = [],
  mindmaps = [],
  syncedBlockGroups = [],
  onSearch,
  onClose,
  onOpenPage,
  onOpenBoard,
  onOpenMindmap,
  onOpenDataTable,
}: SearchDialogProps) {
  const [query, setQuery] = useState('')
  const [activeFilter, setActiveFilter] = useState<SearchFilter>('all')
  const [asyncResults, setAsyncResults] = useState<SearchResult[]>([])
  const [selectedIndex, setSelectedIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const localResults = useMemo(
    () => [
      ...searchPages(pages, pageProperties, syncedBlockGroups, query),
      ...searchBoards(pages, boards, query),
      ...searchMindmaps(pages, mindmaps, query),
      ...searchDataTables(pages, dataTables, query),
    ],
    [boards, dataTables, mindmaps, pageProperties, pages, query, syncedBlockGroups],
  )
  const results = onSearch ? asyncResults : localResults
  const filteredResults = useMemo(() => {
    if (activeFilter === 'all') {
      return results
    }

    if (activeFilter === 'tags' || activeFilter === 'status') {
      return results.filter((result) => result.matchKey === activeFilter)
    }

    if (activeFilter === 'data_table') {
      return results.filter(
        (result) => result.kind === 'data_table' || result.kind === 'data_table_record',
      )
    }

    if (activeFilter === 'media') {
      return results.filter((result) => result.matchSource === 'media')
    }

    return results.filter((result) => result.kind === activeFilter)
  }, [activeFilter, results])
  const groupedResults = useMemo(
    () =>
      [
        {
          key: 'media',
          label: '媒体',
          results: filteredResults.filter((result) => result.matchSource === 'media'),
        },
        {
          key: 'page',
          label: uiCopy.search.groups.page,
          results: filteredResults.filter(
            (result) => result.kind === 'page' && result.matchSource !== 'media',
          ),
        },
        {
          key: 'whiteboard',
          label: uiCopy.search.groups.whiteboard,
          results: filteredResults.filter((result) => result.kind === 'whiteboard'),
        },
        {
          key: 'data_table',
          label: uiCopy.search.groups.dataTable,
          results: filteredResults.filter(
            (result) => result.kind === 'data_table' || result.kind === 'data_table_record',
          ),
        },
        {
          key: 'mindmap',
          label: uiCopy.search.groups.mindmap,
          results: filteredResults.filter((result) => result.kind === 'mindmap'),
        },
      ].filter((group) => group.results.length > 0),
    [filteredResults],
  )
  const resultAriaLabels = useMemo(() => buildResultAriaLabels(filteredResults), [filteredResults])
  const activeIndex =
    filteredResults.length > 0 ? Math.min(selectedIndex, filteredResults.length - 1) : -1
  const closeDialog = useCallback(() => {
    setQuery('')
    setActiveFilter('all')
    setSelectedIndex(0)
    onClose()
  }, [onClose])

  function openResult(result: SearchResult) {
    if (result.kind === 'whiteboard' && result.boardId) {
      onOpenBoard?.(result.pageId, result.boardId)
      closeDialog()
      return
    }

    if (result.kind === 'mindmap' && result.mindmapId) {
      onOpenMindmap?.(result.pageId, result.mindmapId)
      closeDialog()
      return
    }

    if (
      (result.kind === 'data_table' || result.kind === 'data_table_record') &&
      result.databaseId
    ) {
      onOpenDataTable?.(result.pageId, result.databaseId, result.recordId)
      closeDialog()
      return
    }

    onOpenPage(result.pageId, result.blockId)
    closeDialog()
  }

  function handleInputKeyDown(event: ReactKeyboardEvent<HTMLInputElement>) {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setSelectedIndex((current) =>
        filteredResults.length > 0 ? (current + 1) % filteredResults.length : 0,
      )
      return
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault()
      setSelectedIndex((current) =>
        filteredResults.length > 0
          ? (current - 1 + filteredResults.length) % filteredResults.length
          : 0,
      )
      return
    }

    if (event.key === 'Enter') {
      const selectedResult = filteredResults[activeIndex]

      if (!selectedResult) {
        return
      }

      event.preventDefault()
      openResult(selectedResult)
    }
  }

  useEffect(() => {
    if (!open) {
      return
    }

    const root = document.documentElement
    const previousOverflow = root.style.overflow
    root.style.overflow = 'hidden'

    return () => {
      root.style.overflow = previousOverflow
    }
  }, [open])

  useEffect(() => {
    if (!open) {
      return
    }

    window.setTimeout(() => {
      inputRef.current?.focus()
    }, 0)
  }, [open])

  useEffect(() => {
    if (!open) {
      return
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== 'Escape') {
        return
      }

      event.preventDefault()
      closeDialog()
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [closeDialog, open])

  useEffect(() => {
    if (!open || !onSearch) {
      setAsyncResults([])
      return
    }

    const trimmedQuery = query.trim()

    if (!trimmedQuery) {
      setAsyncResults([])
      return
    }

    let isCurrent = true
    const timeoutId = window.setTimeout(() => {
      void onSearch(trimmedQuery)
        .then((nextResults) => {
          if (isCurrent) {
            setAsyncResults(nextResults.map(normalizeAsyncSearchResult))
          }
        })
        .catch(() => {
          if (isCurrent) {
            setAsyncResults([])
          }
        })
    }, 150)

    return () => {
      isCurrent = false
      window.clearTimeout(timeoutId)
    }
  }, [onSearch, open, query])

  useEffect(() => {
    if (activeIndex < 0) {
      return
    }

    document
      .querySelector<HTMLElement>(`.search-result[data-search-result-index="${activeIndex}"]`)
      ?.scrollIntoView?.({ block: 'nearest' })
  }, [activeIndex, filteredResults])

  if (!open) {
    return null
  }

  const dialog = (
    <div className="search-overlay" role="presentation" onMouseDown={closeDialog}>
      <section
        aria-label={uiCopy.search.title}
        aria-modal="true"
        className="search-dialog"
        role="dialog"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="search-input-row">
          <span className="search-input-icon" aria-hidden="true">
            ⌕
          </span>
          <input
            ref={inputRef}
            className="search-input"
            placeholder={uiCopy.search.placeholder}
            value={query}
            onChange={(event) => {
              setQuery(event.target.value)
              setSelectedIndex(0)
              if (!event.target.value.trim()) {
                setActiveFilter('all')
              }
            }}
            onKeyDown={handleInputKeyDown}
          />
          <button type="button" className="search-close" onClick={closeDialog}>
            {uiCopy.search.close}
          </button>
        </div>

        {query.trim() ? (
          <div className="search-filter-row">
            {getFilterOptions().map((filter) => (
              <button
                key={filter.key}
                type="button"
                className={[
                  'search-filter-chip',
                  activeFilter === filter.key ? 'search-filter-chip-active' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                aria-pressed={activeFilter === filter.key}
                onClick={() => {
                  setActiveFilter(filter.key)
                  setSelectedIndex(0)
                }}
              >
                {filter.label}
              </button>
            ))}
          </div>
        ) : null}

        <div className="search-results">
          {!query.trim() ? (
            <div className="search-empty">{uiCopy.search.emptyQuery}</div>
          ) : filteredResults.length > 0 ? (
            groupedResults.map((group) => (
              <section key={group.key} className="search-group" aria-label={group.label}>
                <h2 className="search-group-title">{group.label}</h2>
                <div className="search-group-results">
                  {group.results.map((result) => {
                    const index = filteredResults.indexOf(result)

                    return (
                      <button
                        key={`${getResultKey(result)}-${index}`}
                        type="button"
                        className={[
                          'search-result',
                          index === activeIndex ? 'search-result-active' : '',
                        ]
                          .filter(Boolean)
                          .join(' ')}
                        data-search-result-index={index}
                        aria-label={resultAriaLabels[index] ?? getResultActionLabel(result)}
                        aria-current={index === activeIndex ? 'true' : undefined}
                        onClick={() => openResult(result)}
                        onMouseEnter={() => setSelectedIndex(index)}
                      >
                        <span className="search-result-icon" aria-hidden="true">
                          {result.icon ?? '📄'}
                        </span>
                        <span className="search-result-body">
                          <span className="search-result-title-row">
                            <span className="search-result-title">{result.title}</span>
                            <span className="search-result-source">{result.sourceLabel}</span>
                          </span>
                          <span className="search-result-excerpt">{result.excerpt}</span>
                        </span>
                      </button>
                    )
                  })}
                </div>
              </section>
            ))
          ) : (
            <div className="search-empty">{uiCopy.search.noResults}</div>
          )}
        </div>
      </section>
    </div>
  )

  if (typeof document === 'undefined') {
    return dialog
  }

  return createPortal(dialog, document.body)
}

function normalizeAsyncSearchResult(result: AsyncSearchResult): SearchResult {
  const matchSource = result.matchSource ?? inferMatchSource(result.kind)

  return {
    ...result,
    matchSource,
    sourceLabel: result.sourceLabel ?? getSourceLabel(matchSource, result.kind),
  }
}

function inferMatchSource(kind: SearchResult['kind']): SearchResult['matchSource'] {
  if (kind === 'whiteboard') {
    return 'whiteboard'
  }

  if (kind === 'mindmap') {
    return 'mindmap_title'
  }

  if (kind === 'data_table') {
    return 'data_table'
  }

  if (kind === 'data_table_record') {
    return 'data_table_record'
  }

  return 'body'
}

function getSourceLabel(
  matchSource: SearchResult['matchSource'],
  kind: SearchResult['kind'],
): string {
  if (matchSource === 'title') {
    return '标题'
  }

  if (matchSource === 'property') {
    return '属性'
  }

  if (matchSource === 'media') {
    return '媒体'
  }

  if (matchSource === 'page_link') {
    return '页面链接'
  }

  if (matchSource === 'page_mention') {
    return '页面提及'
  }

  if (matchSource === 'whiteboard_title') {
    return '白板标题'
  }

  if (matchSource === 'whiteboard_content') {
    return '白板内容'
  }

  if (matchSource === 'whiteboard' || kind === 'whiteboard') {
    return '白板'
  }

  if (matchSource === 'mindmap_title') {
    return '导图标题'
  }

  if (matchSource === 'mindmap_node') {
    return '导图节点'
  }

  if (kind === 'mindmap') {
    return '导图'
  }

  if (matchSource === 'data_table' || kind === 'data_table') {
    return '数据表格'
  }

  if (matchSource === 'data_table_record' || kind === 'data_table_record') {
    return '记录'
  }

  return '正文'
}

function getFilterOptions(): Array<{ key: SearchFilter; label: string }> {
  return [
    { key: 'all', label: uiCopy.search.filters.all },
    { key: 'page', label: uiCopy.search.filters.page },
    { key: 'media', label: '媒体' },
    { key: 'whiteboard', label: uiCopy.search.filters.whiteboard },
    { key: 'mindmap', label: uiCopy.search.filters.mindmap },
    { key: 'data_table', label: uiCopy.search.filters.dataTable },
    { key: 'tags', label: uiCopy.search.filters.tags },
    { key: 'status', label: uiCopy.search.filters.status },
  ]
}

function getResultKey(result: SearchResult) {
  if (result.kind === 'whiteboard') {
    return `${result.pageId}-${result.boardId}`
  }

  if (result.kind === 'mindmap') {
    return `${result.pageId}-${result.mindmapId}`
  }

  if (result.kind === 'data_table' || result.kind === 'data_table_record') {
    return `${result.pageId}-${result.databaseId}-${result.recordId ?? 'table'}`
  }

  return result.pageId
}

function getResultActionLabel(result: SearchResult) {
  if (result.kind === 'whiteboard') {
    return OPEN_WHITEBOARD_LABEL
  }

  if (result.kind === 'mindmap') {
    return OPEN_MINDMAP_LABEL
  }

  if (result.kind === 'data_table_record') {
    return OPEN_DATA_TABLE_RECORD_LABEL
  }

  if (result.kind === 'data_table') {
    return OPEN_DATA_TABLE_LABEL
  }

  return uiCopy.search.openPage
}

function buildResultAriaLabels(results: SearchResult[]) {
  const pageResultCounts = results.reduce<Record<string, number>>((counts, result) => {
    if (result.kind === 'page') {
      counts[result.pageId] = (counts[result.pageId] ?? 0) + 1
    }

    return counts
  }, {})

  return results.map((result) => {
    const actionLabel = getResultActionLabel(result)
    const baseLabel = `${actionLabel} ${result.title}`
    const excerpt = result.excerpt.trim()

    if (result.kind !== 'page' || (pageResultCounts[result.pageId] ?? 0) < 2) {
      return baseLabel
    }

    if (!excerpt || excerpt === result.title) {
      return baseLabel
    }

    return `${baseLabel} ${excerpt}`
  })
}
