import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { SyncedPickerItem } from '../../domain/syncedBlocks'
import type { SyncedBlockMode } from '../../domain/types'

interface SyncedBlockPickerDialogProps {
  open: boolean
  mode: SyncedBlockMode
  items: SyncedPickerItem[]
  onPick: (itemId: string) => void
  onClose: () => void
}

export function SyncedBlockPickerDialog({
  open,
  mode,
  items,
  onPick,
  onClose,
}: SyncedBlockPickerDialogProps) {
  const [query, setQuery] = useState('')
  const [activeIndex, setActiveIndex] = useState(-1)
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([])

  useEffect(() => {
    if (!open) {
      setQuery('')
      setActiveIndex(-1)
    }
  }, [open])

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

  const filteredItems = useMemo(() => {
    const keyword = query.trim().toLocaleLowerCase()

    if (!keyword) {
      return items
    }

    return items.filter((item) => item.searchText.toLocaleLowerCase().includes(keyword))
  }, [items, query])

  useEffect(() => {
    itemRefs.current = itemRefs.current.slice(0, filteredItems.length)

    if (filteredItems.length === 0) {
      setActiveIndex(-1)
      return
    }

    setActiveIndex((current) => {
      if (current < 0) {
        return -1
      }

      return Math.min(current, filteredItems.length - 1)
    })
  }, [filteredItems])

  useEffect(() => {
    if (activeIndex < 0) {
      return
    }

    const activeElement = itemRefs.current[activeIndex]
    if (typeof activeElement?.scrollIntoView === 'function') {
      activeElement.scrollIntoView({
        block: 'nearest',
      })
    }
  }, [activeIndex])

  if (!open) {
    return null
  }

  return createPortal(
    <div
      className="synced-picker-overlay"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose()
        }
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-label={mode === 'reference' ? '插入引用块' : '插入同步块'}
        className="synced-picker-dialog"
      >
        <div className="synced-picker-header">
          <div className="synced-picker-title">
            {mode === 'reference' ? '插入引用块' : '插入同步块'}
          </div>
          <button
            type="button"
            className="synced-picker-close"
            aria-label="关闭"
            onClick={onClose}
          >
            ×
          </button>
        </div>
        <input
          autoFocus
          className="synced-picker-input"
          placeholder="搜索已有内容"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value)
            setActiveIndex(-1)
          }}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              event.preventDefault()
              onClose()
              return
            }

            if (event.key === 'ArrowDown') {
              event.preventDefault()
              setActiveIndex((current) =>
                filteredItems.length === 0
                  ? -1
                  : current < 0
                    ? 0
                    : (current + 1) % filteredItems.length,
              )
              return
            }

            if (event.key === 'ArrowUp') {
              event.preventDefault()
              setActiveIndex((current) =>
                filteredItems.length === 0
                  ? -1
                  : current <= 0
                    ? filteredItems.length - 1
                    : current - 1,
              )
              return
            }

            if (event.key === 'Enter') {
              const activeItem =
                activeIndex >= 0 && activeIndex < filteredItems.length
                  ? filteredItems[activeIndex]
                  : null

              if (!activeItem) {
                return
              }

              event.preventDefault()
              onPick(activeItem.id)
            }
          }}
        />
        <div className="synced-picker-list">
          {filteredItems.length > 0 ? (
            filteredItems.map((item, index) => (
              <button
                key={item.id}
                type="button"
                ref={(element) => {
                  itemRefs.current[index] = element
                }}
                className={
                  index === activeIndex ? 'synced-picker-item synced-picker-item-active' : 'synced-picker-item'
                }
                onClick={() => onPick(item.id)}
              >
                <span className="synced-picker-item-title">{item.summary}</span>
                <span className="synced-picker-item-meta">{item.meta}</span>
              </button>
            ))
          ) : (
            <div className="synced-picker-empty">没有匹配的内容</div>
          )}
        </div>
      </section>
    </div>,
    document.body,
  )
}
