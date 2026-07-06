import type { Ref } from 'react'
import { uiCopy } from '../../ui/copy'

export interface PageRelationAutocompleteItem {
  id: string
  title: string
  icon: string | null
  parentId: string | null
  pathLabel?: string
}

interface PageRelationAutocompleteProps {
  kind: 'link' | 'mention'
  suggestions: PageRelationAutocompleteItem[]
  activeIndex: number
  top: number
  left: number
  panelRef?: Ref<HTMLDivElement>
  onSelect: (page: PageRelationAutocompleteItem) => void
  createTitle?: string
  createDisabled?: boolean
  onCreate?: () => void
}

export function PageRelationAutocomplete({
  kind,
  suggestions,
  activeIndex,
  top,
  left,
  panelRef,
  onSelect,
  createTitle,
  createDisabled = false,
  onCreate,
}: PageRelationAutocompleteProps) {
  const listboxLabel =
    kind === 'link'
      ? uiCopy.editor.pageRelation.linkSuggestions
      : uiCopy.editor.pageRelation.mentionSuggestions

  return (
    <div
      ref={panelRef}
      className="page-relation-autocomplete"
      style={{ top: `${top}px`, left: `${left}px` }}
      onMouseDown={(event) => {
        event.preventDefault()
      }}
    >
      <div role="listbox" aria-label={listboxLabel} className="page-relation-autocomplete-list">
        {suggestions.map((page, index) => (
          <button
            key={page.id}
            type="button"
            role="option"
            aria-selected={index === activeIndex}
            className={
              index === activeIndex
                ? 'page-relation-option page-relation-option-active'
                : 'page-relation-option'
            }
            onClick={() => onSelect(page)}
          >
            <span className="page-relation-option-icon" aria-hidden="true">
              {page.icon ?? '📄'}
            </span>
            <span className="page-relation-option-copy">
              <span className="page-relation-option-title">{page.title}</span>
              {page.pathLabel ? (
                <span className="page-relation-option-path">{page.pathLabel}</span>
              ) : null}
            </span>
          </button>
        ))}
      </div>
      {createTitle && onCreate ? (
        <button
          type="button"
          className="page-relation-create-option"
          disabled={createDisabled}
          onClick={onCreate}
        >
          {uiCopy.editor.pageRelation.createPage(createTitle)}
        </button>
      ) : null}
    </div>
  )
}
