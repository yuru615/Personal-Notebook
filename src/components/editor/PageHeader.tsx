import type { FocusEvent, ReactNode } from 'react'
import { useEffect, useRef, useState } from 'react'
import type { PageRecord } from '../../domain/types'
import { uiCopy } from '../../ui/copy'

interface PageHeaderProps {
  page: PageRecord
  bodyClassName?: string
  onRename: (title: string) => void
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
]

const defaultPageIcon = '\u{1F4C4}'

const pageCoverOptions = [
  { id: 'ocean', label: '\u6d77\u84dd' },
  { id: 'sunset', label: '\u65e5\u843d' },
  { id: 'forest', label: '\u68ee\u6797' },
  { id: 'sand', label: '\u6696\u6c99' },
  { id: 'berry', label: '\u8393\u679c' },
  { id: 'slate', label: '\u77f3\u58a8' },
] as const

export function PageHeader({
  page,
  bodyClassName,
  onRename,
  onChangeIcon,
  onChangeCover,
  actions,
}: PageHeaderProps) {
  const [iconMenuOpen, setIconMenuOpen] = useState(false)
  const [coverMenuOpen, setCoverMenuOpen] = useState(false)
  const headerMenusRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      if (!headerMenusRef.current?.contains(event.target as Node)) {
        setIconMenuOpen(false)
        setCoverMenuOpen(false)
      }
    }

    window.addEventListener('mousedown', handlePointerDown)
    return () => {
      window.removeEventListener('mousedown', handlePointerDown)
    }
  }, [])

  function handleBlur(event: FocusEvent<HTMLInputElement>) {
    const nextTitle = event.currentTarget.value.trim() || uiCopy.page.untitled
    event.currentTarget.value = nextTitle

    if (nextTitle !== page.title) {
      onRename(nextTitle)
    }
  }

  function handleIconChange(icon: string | null) {
    onChangeIcon(icon)
    setIconMenuOpen(false)
  }

  function handleCoverChange(cover: string | null) {
    onChangeCover(cover)
    setCoverMenuOpen(false)
  }

  return (
    <header className="page-header">
      {page.cover ? <div className={`page-cover page-cover-${page.cover}`} aria-hidden="true" /> : null}
      <div className="page-header-top">
        <div className="page-header-top-spacer" />
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
          {actions}
        </div>
      </div>
      <div
        className={['page-header-body', bodyClassName].filter(Boolean).join(' ')}
        data-testid="page-header-body"
      >
        <div
          className={page.cover ? 'page-header-icon page-header-icon-with-cover' : 'page-header-icon'}
          aria-hidden="true"
        >
          {page.icon ?? defaultPageIcon}
        </div>
        <input
          key={`${page.id}:${page.title}`}
          className="page-title-input"
          defaultValue={page.title}
          onBlur={handleBlur}
        />
      </div>
    </header>
  )
}
