import type { KeyboardEvent as ReactKeyboardEvent } from 'react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { BoardRecord, PageRecord } from '../../domain/types'
import { searchBoards, searchPages, type SearchResult } from '../../domain/search'
import { uiCopy } from '../../ui/copy'

interface SearchDialogProps {
  open: boolean
  pages: PageRecord[]
  boards?: BoardRecord[]
  onClose: () => void
  onOpenPage: (pageId: string) => void
  onOpenBoard?: (pageId: string, boardId: string) => void
}

const OPEN_WHITEBOARD_LABEL = '\u6253\u5f00\u767d\u677f'

export function SearchDialog({
  open,
  pages,
  boards = [],
  onClose,
  onOpenPage,
  onOpenBoard,
}: SearchDialogProps) {
  const [query, setQuery] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const results = useMemo(
    () => [...searchPages(pages, query), ...searchBoards(pages, boards, query)],
    [boards, pages, query],
  )
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
                key={
                  result.kind === 'whiteboard'
                    ? `${result.pageId}-${result.boardId}`
                    : result.pageId
                }
                type="button"
                className={[
                  'search-result',
                  index === activeIndex ? 'search-result-active' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                aria-label={`${
                  result.kind === 'whiteboard'
                    ? OPEN_WHITEBOARD_LABEL
                    : uiCopy.search.openPage
                } ${result.title}`}
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
