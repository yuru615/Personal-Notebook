import { RotateCcw, Trash2 } from 'lucide-react'
import type { PageRecord } from '../../domain/types'
import { getRecycleBinRoots } from '../../utils/pageTree'

interface RecycleBinPageProps {
  pages: PageRecord[]
  onRestorePage: (pageId: string) => void
}

function formatDeletedAt(value: string | undefined) {
  if (!value) {
    return '删除时间未知'
  }

  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '删除时间未知' : `删除于 ${date.toLocaleDateString('zh-CN')}`
}

export function RecycleBinPage({ pages, onRestorePage }: RecycleBinPageProps) {
  const roots = getRecycleBinRoots(pages)

  return (
    <main className="recycle-bin-page">
      <header className="recycle-bin-header">
        <div>
          <h1>回收站</h1>
          <p>已删除的页面会保留 30 天，恢复后会还原子页面和关联资源。</p>
        </div>
      </header>
      {roots.length === 0 ? (
        <div className="recycle-bin-empty">
          <Trash2 size={20} strokeWidth={1.7} />
          <p>回收站为空</p>
        </div>
      ) : (
        <div className="recycle-bin-list">
          {roots.map((page) => {
            const childCount = pages.filter((item) => item.deletedRootId === page.id && item.id !== page.id).length

            return (
              <section className="recycle-bin-item" key={page.id}>
                <div className="recycle-bin-item-icon" aria-hidden="true">
                  {page.icon ?? '📄'}
                </div>
                <div className="recycle-bin-item-copy">
                  <strong>{page.title || '未命名'}</strong>
                  <span>{formatDeletedAt(page.deletedAt)}</span>
                  {childCount > 0 ? <span>包含 {childCount} 个子页面</span> : null}
                </div>
                <button type="button" className="recycle-bin-restore" onClick={() => onRestorePage(page.id)}>
                  <RotateCcw size={15} strokeWidth={1.9} />
                  恢复
                </button>
              </section>
            )
          })}
        </div>
      )}
    </main>
  )
}
