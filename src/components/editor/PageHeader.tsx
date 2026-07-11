import type { FocusEvent, ReactNode } from 'react'
import { useEffect, useRef, useState } from 'react'
import { DEFAULT_PAGE_ICON } from '../../domain/pageIcons'
import type { PageRecord } from '../../domain/types'
import { uiCopy } from '../../ui/copy'

interface PageHeaderProps {
  page: PageRecord
  bodyClassName?: string
  meta?: ReactNode
  onRename: (title: string) => void
  onChangeIcon: (icon: string | null) => void
  onChangeCover: (cover: string | null) => void
  actions?: ReactNode
  showTopRow?: boolean
  showCover?: boolean
}

interface PageHeaderToolbarProps {
  page: PageRecord
  onChangeIcon: (icon: string | null) => void
  onChangeCover: (cover: string | null) => void
  actions?: ReactNode
}

const pageIconOptions = [
  '\u{1F4C4}',
  '\u{1F4D8}',
  '\u{1F4DD}',
  '\u{1F4A1}',
  '\u2705',
  '\u{1F4CC}',
  '\u{1F4CE}',
  '\u{1F5C2}',
  '\u2B50',
  '\u{1F3AF}',
  '\u{1F4DA}',
  '\u{1F516}',
  '\u{1F9E0}',
  '\u{1F4CA}',
  '\u{1F4C8}',
  '\u{1F9ED}',
  '\u{1F9EA}',
  '\u{1F50D}',
  '\u{1F9E9}',
  '\u{1F680}',
  '\u{1F5D3}\uFE0F',
  '\u{1F9F0}',
  '\u{1F3F7}\uFE0F',
  '\u{1F4AC}',
  '\u{1F331}',
  '\u{1F525}',
  '\u2699\uFE0F',
  '\u{1F9FE}',
  '\u{1F5C3}\uFE0F',
  '\u{1F3C6}',
]

const pageCoverOptions = [
  { id: 'ocean', label: '\u6d77\u84dd' },
  { id: 'sunset', label: '\u65e5\u843d' },
  { id: 'forest', label: '\u68ee\u6797' },
  { id: 'sand', label: '\u6696\u6c99' },
  { id: 'berry', label: '\u8393\u679c' },
  { id: 'slate', label: '\u77f3\u58a8' },
  { id: 'aurora', label: '\u6781\u5149' },
  { id: 'mint', label: '\u8584\u8377' },
  { id: 'lavender', label: '\u96fe\u7d2b' },
  { id: 'sky', label: '\u6674\u7a7a' },
  { id: 'coral', label: '\u73ca\u745a' },
  { id: 'amber', label: '\u7425\u73c0' },
  { id: 'night', label: '\u591c\u822a' },
  { id: 'paper', label: '\u7eb8\u7eb9' },
] as const

export function PageHeaderToolbar({
  page,
  onChangeIcon,
  onChangeCover,
  actions,
}: PageHeaderToolbarProps) {
  const [iconMenuOpen, setIconMenuOpen] = useState(false)
  const [coverMenuOpen, setCoverMenuOpen] = useState(false)
  const headerMenusRef = useRef<HTMLDivElement | null>(null)

  function closeInlineMenus() {
    setIconMenuOpen(false)
    setCoverMenuOpen(false)
  }

  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      if (!headerMenusRef.current?.contains(event.target as Node)) {
        closeInlineMenus()
      }
    }

    window.addEventListener('mousedown', handlePointerDown)
    return () => {
      window.removeEventListener('mousedown', handlePointerDown)
    }
  }, [])

  function handleIconChange(icon: string | null) {
    onChangeIcon(icon)
    setIconMenuOpen(false)
  }

  function handleCoverChange(cover: string | null) {
    onChangeCover(cover)
    setCoverMenuOpen(false)
  }

  return (
    <div className="page-header-actions" ref={headerMenusRef}>
      <div className="page-cover-menu">
        <button
          type="button"
          className="page-header-action"
          aria-expanded={coverMenuOpen}
          aria-haspopup="dialog"
          onClick={() => {
            setCoverMenuOpen((value) => !value)
            setIconMenuOpen(false)
          }}
        >
          {page.cover ? uiCopy.page.changeCover : uiCopy.page.addCover}
        </button>
        {coverMenuOpen ? (
          <div className="page-cover-popover" role="dialog" aria-label={uiCopy.page.addCover}>
            <button
              type="button"
              className="page-cover-remove"
              onClick={() => handleCoverChange(null)}
            >
              {uiCopy.page.removeCover}
            </button>
            <div className="page-cover-grid">
              {pageCoverOptions.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  className={
                    option.id === page.cover
                      ? 'page-cover-option page-cover-option-active'
                      : 'page-cover-option'
                  }
                  aria-pressed={option.id === page.cover}
                  onClick={() => handleCoverChange(option.id)}
                >
                  <span
                    className={`page-cover-swatch page-cover-swatch-${option.id}`}
                    aria-hidden="true"
                  />
                  <span>{option.label}</span>
                </button>
              ))}
            </div>
          </div>
        ) : null}
      </div>
      <div className="page-icon-menu">
        <button
          type="button"
          className="page-header-action"
          aria-expanded={iconMenuOpen}
          aria-haspopup="dialog"
          onClick={() => {
            setIconMenuOpen((value) => !value)
            setCoverMenuOpen(false)
          }}
        >
          {uiCopy.page.addIcon}
        </button>
        {iconMenuOpen ? (
          <div className="page-icon-popover" role="dialog" aria-label={uiCopy.page.addIcon}>
            <button
              type="button"
              className="page-icon-remove"
              onClick={() => handleIconChange(null)}
            >
              {uiCopy.page.removeIcon}
            </button>
            <div className="page-icon-grid">
              {pageIconOptions.map((icon) => (
                <button
                  key={icon}
                  type="button"
                  className={
                    icon === page.icon ? 'page-icon-option page-icon-option-active' : 'page-icon-option'
                  }
                  aria-pressed={icon === page.icon}
                  onClick={() => handleIconChange(icon)}
                >
                  {icon}
                </button>
              ))}
            </div>
          </div>
        ) : null}
      </div>
      {actions ? (
        <div className="page-header-external-actions" onMouseDownCapture={closeInlineMenus}>
          {actions}
        </div>
      ) : null}
    </div>
  )
}

export function PageHeader({
  page,
  bodyClassName,
  meta,
  onRename,
  onChangeIcon,
  onChangeCover,
  actions,
  showTopRow = true,
  showCover = true,
}: PageHeaderProps) {
  const hasVisibleCover = showCover && Boolean(page.cover)
  const headerClassName = [
    'page-header',
    showTopRow ? null : 'page-header-external-toolbar',
    !showTopRow && page.cover ? 'page-header-external-cover' : null,
    !showTopRow && !page.cover ? 'page-header-no-external-cover' : null,
  ]
    .filter(Boolean)
    .join(' ')

  function handleBlur(event: FocusEvent<HTMLInputElement>) {
    const nextTitle = event.currentTarget.value.trim() || uiCopy.page.untitled
    event.currentTarget.value = nextTitle

    if (nextTitle !== page.title) {
      onRename(nextTitle)
    }
  }

  return (
    <header className={headerClassName}>
      {hasVisibleCover ? (
        <div className={`page-cover page-cover-${page.cover}`} aria-hidden="true" />
      ) : null}
      {showTopRow ? (
        <div className="page-header-top">
          <div className="page-header-top-spacer" />
          <PageHeaderToolbar
            page={page}
            onChangeIcon={onChangeIcon}
            onChangeCover={onChangeCover}
            actions={actions}
          />
        </div>
      ) : null}
      <div
        className={['page-header-body', bodyClassName].filter(Boolean).join(' ')}
        data-testid="page-header-body"
      >
        <div
          className={hasVisibleCover ? 'page-header-icon page-header-icon-with-cover' : 'page-header-icon'}
          aria-hidden="true"
        >
          {page.iconHidden ? '' : page.icon ?? DEFAULT_PAGE_ICON}
        </div>
        <input
          key={`${page.id}:${page.title}`}
          className="page-title-input"
          defaultValue={page.title}
          onBlur={handleBlur}
        />
        {meta ? <div className="page-header-meta">{meta}</div> : null}
      </div>
    </header>
  )
}
