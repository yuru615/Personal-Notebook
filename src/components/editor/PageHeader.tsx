import { useEffect, useState } from 'react'
import type { PageRecord } from '../../domain/types'
import { uiCopy } from '../../ui/copy'

interface PageHeaderProps {
  page: PageRecord
  onRename: (title: string) => void
}

export function PageHeader({ page, onRename }: PageHeaderProps) {
  const [value, setValue] = useState(page.title)

  useEffect(() => {
    setValue(page.title)
  }, [page.id, page.title])

  function handleBlur() {
    const nextTitle = value.trim() || uiCopy.page.untitled
    setValue(nextTitle)

    if (nextTitle !== page.title) {
      onRename(nextTitle)
    }
  }

  return (
    <header className="page-header">
      <div className="page-header-icon" aria-hidden="true">
        {page.icon ?? '📄'}
      </div>
      <input
        className="page-title-input"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        onBlur={handleBlur}
      />
      <div className="page-header-actions">
        <button type="button" className="page-header-action">
          {uiCopy.page.addIcon}
        </button>
        <button type="button" className="page-header-action">
          {uiCopy.page.addComment}
        </button>
      </div>
    </header>
  )
}
