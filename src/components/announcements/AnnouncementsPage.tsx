import { useCallback, useEffect, useMemo, useState, type MouseEvent } from 'react'
import { Bell, ChevronLeft, ChevronRight, RefreshCw, WifiOff } from 'lucide-react'
import { useOptionalAccount } from '../../app/accountContext'
import { sanitizeAnnouncementHtml } from '../../domain/announcementHtml'
import {
  createTauriAnnouncementClient,
  type AnnouncementClient,
  type AnnouncementDetail,
  type AnnouncementPage,
} from '../../lib/announcementClient'
import { normalizeAccountError } from '../../lib/accountClient'
import { openExternalLink } from '../../lib/externalLinks'

interface AnnouncementsPageProps {
  client?: AnnouncementClient
}

const dateFormatter = new Intl.DateTimeFormat('zh-CN', {
  year: 'numeric',
  month: 'long',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
})

function formatAnnouncementDate(value: string) {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '时间未知' : dateFormatter.format(date)
}

function isTerminalAccountError(code: string, status?: number) {
  return status === 401 || status === 403 || code === 'session_expired' || code === 'account_suspended'
}

export function AnnouncementsPage({ client: injectedClient }: AnnouncementsPageProps) {
  const client = useMemo(
    () => injectedClient ?? createTauriAnnouncementClient(),
    [injectedClient],
  )
  const account = useOptionalAccount()
  const [page, setPage] = useState(1)
  const [reloadVersion, setReloadVersion] = useState(0)
  const [detailReloadVersion, setDetailReloadVersion] = useState(0)
  const [result, setResult] = useState<AnnouncementPage | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [detail, setDetail] = useState<AnnouncementDetail | null>(null)
  const [listError, setListError] = useState('')
  const [detailError, setDetailError] = useState('')
  const [isListLoading, setIsListLoading] = useState(true)
  const [isDetailLoading, setIsDetailLoading] = useState(false)

  const handleRequestError = useCallback(
    (cause: unknown) => {
      const error = normalizeAccountError(cause)
      if (isTerminalAccountError(error.code, error.status)) {
        void account?.lock(error)
        return null
      }
      return error.message
    },
    [account],
  )

  useEffect(() => {
    let active = true
    setIsListLoading(true)
    setListError('')

    void client
      .list(page)
      .then((nextResult) => {
        if (!active) return
        setResult(nextResult)
        setSelectedId((current) => {
          if (current && nextResult.items.some((item) => item.id === current)) return current
          return nextResult.items[0]?.id ?? null
        })
        if (nextResult.items.length === 0) setDetail(null)
      })
      .catch((cause) => {
        if (!active) return
        const message = handleRequestError(cause)
        if (message) setListError(message)
      })
      .finally(() => {
        if (active) setIsListLoading(false)
      })

    return () => {
      active = false
    }
  }, [client, handleRequestError, page, reloadVersion])

  useEffect(() => {
    if (!selectedId) return
    let active = true
    setIsDetailLoading(true)
    setDetailError('')
    setDetail(null)

    void client
      .get(selectedId)
      .then((nextDetail) => {
        if (active) setDetail(nextDetail)
      })
      .catch((cause) => {
        if (!active) return
        const message = handleRequestError(cause)
        if (message) setDetailError(message)
      })
      .finally(() => {
        if (active) setIsDetailLoading(false)
      })

    return () => {
      active = false
    }
  }, [client, detailReloadVersion, handleRequestError, reloadVersion, selectedId])

  const pageCount = Math.max(1, Math.ceil((result?.total ?? 0) / (result?.pageSize ?? 20)))
  const safeContentHtml = useMemo(
    () => (detail ? sanitizeAnnouncementHtml(detail.contentHtml) : ''),
    [detail],
  )

  function handleContentClick(event: MouseEvent<HTMLElement>) {
    const target = event.target
    if (!(target instanceof Element)) return
    const anchor = target.closest('a')
    const href = anchor?.getAttribute('href')
    if (!href) return
    event.preventDefault()
    void openExternalLink(href)
  }

  return (
    <section className="announcements-page" aria-label="消息公告">
      <header className="announcements-header">
        <div>
          <div className="announcements-eyebrow">消息中心</div>
          <h1>公告</h1>
        </div>
        <div className="announcements-header-actions">
          {account?.session.connectivity === 'offline' ? (
            <span className="announcements-connectivity">
              <WifiOff size={14} aria-hidden="true" />
              当前离线
            </span>
          ) : null}
          <button
            type="button"
            className="announcements-icon-button"
            aria-label="刷新公告"
            data-tooltip="刷新公告"
            onClick={() => setReloadVersion((value) => value + 1)}
          >
            <RefreshCw size={17} aria-hidden="true" />
          </button>
        </div>
      </header>

      <div className="announcements-layout">
        <aside className="announcements-list-panel" aria-label="公告列表">
          {isListLoading && !result ? <AnnouncementsListSkeleton /> : null}
          {listError ? (
            <AnnouncementsState
              title={account?.session.connectivity === 'offline' ? '当前无法联网' : '公告加载失败'}
              description={listError}
              actionLabel="重新加载"
              onAction={() => setReloadVersion((value) => value + 1)}
            />
          ) : null}
          {!isListLoading && !listError && result?.items.length === 0 ? (
            <AnnouncementsState title="暂无公告" description="管理员发布公告后会显示在这里。" />
          ) : null}
          {!listError && result?.items.length ? (
            <div className="announcements-list">
              {result.items.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={
                    selectedId === item.id
                      ? 'announcement-list-item announcement-list-item-active'
                      : 'announcement-list-item'
                  }
                  aria-pressed={selectedId === item.id}
                  onClick={() => setSelectedId(item.id)}
                >
                  <span className="announcement-list-title">{item.title}</span>
                  <time dateTime={item.publishedAt}>{formatAnnouncementDate(item.publishedAt)}</time>
                </button>
              ))}
            </div>
          ) : null}
          {(result?.total ?? 0) > (result?.pageSize ?? 20) ? (
            <div className="announcements-pagination" aria-label="公告分页">
              <button
                type="button"
                aria-label="上一页"
                disabled={page <= 1 || isListLoading}
                onClick={() => setPage((value) => Math.max(1, value - 1))}
              >
                <ChevronLeft size={16} aria-hidden="true" />
              </button>
              <span>{page} / {pageCount}</span>
              <button
                type="button"
                aria-label="下一页"
                disabled={page >= pageCount || isListLoading}
                onClick={() => setPage((value) => Math.min(pageCount, value + 1))}
              >
                <ChevronRight size={16} aria-hidden="true" />
              </button>
            </div>
          ) : null}
        </aside>

        <div className="announcement-detail-panel">
          {isDetailLoading ? <div className="announcement-detail-loading">正在加载公告...</div> : null}
          {!isDetailLoading && detailError ? (
            <AnnouncementsState
              title="公告内容加载失败"
              description={detailError}
              actionLabel="重试"
              onAction={() => setDetailReloadVersion((value) => value + 1)}
            />
          ) : null}
          {!isDetailLoading && !detailError && detail ? (
            <article className="announcement-article">
              <div className="announcement-article-heading">
                <div className="announcement-article-icon" aria-hidden="true">
                  <Bell size={19} />
                </div>
                <div>
                  <h2>{detail.title}</h2>
                  <time dateTime={detail.publishedAt}>
                    发布于 {formatAnnouncementDate(detail.publishedAt)}
                  </time>
                </div>
              </div>
              <div
                className="announcement-content"
                onClick={handleContentClick}
                dangerouslySetInnerHTML={{ __html: safeContentHtml }}
              />
            </article>
          ) : null}
          {!isDetailLoading && !detailError && !detail && !isListLoading && !listError ? (
            <AnnouncementsState title="选择一条公告" description="公告内容会显示在这里。" />
          ) : null}
        </div>
      </div>
    </section>
  )
}

function AnnouncementsListSkeleton() {
  return (
    <div className="announcements-list announcements-list-loading" aria-label="正在加载公告">
      {Array.from({ length: 4 }, (_, index) => <div key={index} />)}
    </div>
  )
}

function AnnouncementsState({
  title,
  description,
  actionLabel,
  onAction,
}: {
  title: string
  description: string
  actionLabel?: string
  onAction?: () => void
}) {
  return (
    <div className="announcements-state">
      <strong>{title}</strong>
      <span>{description}</span>
      {actionLabel && onAction ? (
        <button type="button" onClick={onAction}>{actionLabel}</button>
      ) : null}
    </div>
  )
}
