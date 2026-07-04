import type { KeyboardEvent as ReactKeyboardEvent } from 'react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { BoardRecord, DataTableRecord, PageRecord } from '../../domain/types'
import {
  searchBoards,
  searchDataTables,
  searchPages,
  type SearchResult,
} from '../../domain/search'
import { uiCopy } from '../../ui/copy'

interface SearchDialogProps {
  open: boolean
  pages: PageRecord[]
  boards?: BoardRecord[]
  dataTables?: DataTableRecord[]
  onSearch?: (query: string) => Promise<SearchResult[]>
  onClose: () => void
  onOpenPage: (pageId: string) => void
  onOpenBoard?: (pageId: string, boardId: string) => void
  onOpenDataTable?: (pageId: string, databaseId: string, recordId?: string) => void
}

const OPEN_WHITEBOARD_LABEL = '\u6253\u5f00\u767d\u677f'
const OPEN_DATA_TABLE_LABEL = '\u6253\u5f00\u6570\u636e\u8868\u683c'
const OPEN_DATA_TABLE_RECORD_LABEL = '\u6253\u5f00\u8bb0\u5f55'

export function SearchDialog({
  open,
  pages,
  boards = [],
  dataTables = [],
  onSearch,
  onClose,
  onOpenPage,
  onOpenBoard,
  onOpenDataTable,
}: SearchDialogProps) {
  const [query, setQuery] = useState('')
  const [asyncResults, setAsyncResults] = useState<SearchResult[]>([])
  const [selectedIndex, setSelectedIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const localResults = useMemo(
    () => [
      ...searchPages(pages, query),
      ...searchBoards(pages, boards, query),
      ...searchDataTables(pages, dataTables, query),
    ],
    [boards, dataTables, pages, query],
  )
  const results = onSearch ? asyncResults : localResults
  const resultAriaLabels = useMemo(() => buildResultAriaLabels(results), [results])
  const activeIndex = results.length > 0 ? Math.min(selectedIndex, results.length - 1) : -1
  const closeDialog = useCallback(() => {
    setQuery('')
    setSelectedIndex(0)
    onClose()
  }, [onClose])

  function openResult(result: SearchResult) {
    if (result.kind === 'whiteboard' && result.boardId) {
      onOpenBoard?.(result.pageId, result.boardId)
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

    onOpenPage(result.pageId)
    closeDialog()
  }

  function handleInputKeyDown(event: ReactKeyboardEvent<HTMLInputElement>) {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setSelectedIndex((current) => (results.length > 0 ? (current + 1) % results.length : 0))
      return
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault()
      setSelectedIndex((current) =>
        results.length > 0 ? (current - 1 + results.length) % results.length : 0,
      )
      return
    }

    if (event.key === 'Enter') {
      const selectedResult = results[activeIndex]

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
            setAsyncResults(nextResults)
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

  if (!open) {
    return null
  }

  return (
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
            }}
            onKeyDown={handleInputKeyDown}
          />
          <button type="button" className="search-close" onClick={closeDialog}>
            {uiCopy.search.close}
          </button>
        </div>

        <div className="search-results">
          {!query.trim() ? (
            <div className="search-empty">{uiCopy.search.emptyQuery}</div>
          ) : results.length > 0 ? (
            results.map((result, index) => (
              <button
                key={`${getResultKey(result)}-${index}`}
                type="button"
                className={[
                  'search-result',
                  index === activeIndex ? 'search-result-active' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                aria-label={resultAriaLabels[index] ?? getResultActionLabel(result)}
                aria-current={index === activeIndex ? 'true' : undefined}
                onClick={() => openResult(result)}
                onMouseEnter={() => setSelectedIndex(index)}
              >
                <span className="search-result-icon" aria-hidden="true">
                  {result.icon ?? '📄'}
                </span>
                <span className="search-result-body">
                  <span className="search-result-title">{result.title}</span>
                  <span className="search-result-excerpt">{result.excerpt}</span>
                </span>
              </button>
            ))
          ) : (
            <div className="search-empty">{uiCopy.search.noResults}</div>
          )}
        </div>
      </section>
    </div>
  )
}

function getResultKey(result: SearchResult) {
  if (result.kind === 'whiteboard') {
    return `${result.pageId}-${result.boardId}`
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
