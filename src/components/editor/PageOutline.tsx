import { useEffect, useMemo, useState } from 'react'
import type { BlockRecord } from '../../domain/types'
import { getBlockAnchorId } from './blockAnchors'

interface PageOutlineProps {
  blocks: BlockRecord[]
}

interface OutlineItem {
  id: string
  level: 1 | 2 | 3
  title: string
}

const headingLevel = {
  heading_1: 1,
  heading_2: 2,
  heading_3: 3,
} as const

export function PageOutline({ blocks }: PageOutlineProps) {
  const items = useMemo(
    () =>
      blocks.flatMap((block): OutlineItem[] => {
        if (
          block.type !== 'heading_1' &&
          block.type !== 'heading_2' &&
          block.type !== 'heading_3'
        ) {
          return []
        }

        const title = block.text.trim()

        if (!title) {
          return []
        }

        return [
          {
            id: block.id,
            level: headingLevel[block.type],
            title,
          },
        ]
      }),
    [blocks],
  )
  const [activeId, setActiveId] = useState<string | null>(null)
  const currentActiveId =
    activeId && items.some((item) => item.id === activeId) ? activeId : (items[0]?.id ?? null)

  useEffect(() => {
    if (items.length === 0 || !('IntersectionObserver' in window)) {
      return
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0]
        const blockId = visible?.target.getAttribute('data-block-id')

        if (blockId) {
          setActiveId(blockId)
        }
      },
      {
        rootMargin: '-96px 0px -70% 0px',
        threshold: 0,
      },
    )

    items.forEach((item) => {
      const element = document.getElementById(getBlockAnchorId(item.id))

      if (element) {
        observer.observe(element)
      }
    })

    return () => {
      observer.disconnect()
    }
  }, [items])

  return (
    <aside className="page-outline" aria-label="当前页面目录">
      <div className="page-outline-title">目录</div>
      {items.length > 0 ? (
        <nav className="page-outline-list">
          {items.map((item) => (
            <button
              key={item.id}
              type="button"
              className={
                item.id === currentActiveId
                  ? `page-outline-item page-outline-item-level-${item.level} page-outline-item-active`
                  : `page-outline-item page-outline-item-level-${item.level}`
              }
              onClick={() => {
                document
                  .getElementById(getBlockAnchorId(item.id))
                  ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                setActiveId(item.id)
              }}
            >
              {item.title}
            </button>
          ))}
        </nav>
      ) : (
        <div className="page-outline-empty">暂无标题</div>
      )}
    </aside>
  )
}
