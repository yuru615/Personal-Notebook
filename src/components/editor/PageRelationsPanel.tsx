import type { PageRelationMatch } from '../../domain/pageRelations'
import { uiCopy } from '../../ui/copy'

interface PageRelationsPanelProps {
  links: PageRelationMatch[]
  mentions: PageRelationMatch[]
  onOpenSource: (pageId: string, blockId?: string) => void
}

function getRelationPanelItems(items: PageRelationMatch[]) {
  const seen = new Set<string>()

  return items.filter((item) => {
    const key = `${item.sourcePageId}:${item.sourceBlockId}:${item.kind}`

    if (seen.has(key)) {
      return false
    }

    seen.add(key)
    return true
  })
}

function renderSection(
  title: string,
  items: PageRelationMatch[],
  onOpenSource: (pageId: string, blockId?: string) => void,
) {
  const panelItems = getRelationPanelItems(items)

  if (panelItems.length === 0) {
    return null
  }

  return (
    <section className="page-relations-section">
      <h2 className="page-relations-title">{title}</h2>
      <div className="page-relations-list">
        {panelItems.map((item) => (
          <button
            key={`${item.sourcePageId}:${item.sourceBlockId}:${item.kind}`}
            type="button"
            className="page-relations-item"
            onClick={() => onOpenSource(item.sourcePageId, item.sourceBlockId)}
          >
            {item.sourcePageIcon ? (
              <span className="page-relations-item-icon" aria-hidden="true">
                {item.sourcePageIcon}
              </span>
            ) : null}
            <span className="page-relations-item-body">
              <span className="page-relations-item-title">
                {item.sourcePageTitle || uiCopy.page.untitled}
              </span>
              <span className="page-relations-item-excerpt">{item.excerpt}</span>
            </span>
          </button>
        ))}
      </div>
    </section>
  )
}

export function PageRelationsPanel({ links, mentions, onOpenSource }: PageRelationsPanelProps) {
  if (links.length === 0 && mentions.length === 0) {
    return null
  }

  return (
    <section className="page-relations-panel" aria-label={uiCopy.pageRelations.title}>
      {renderSection(uiCopy.pageRelations.backlinks, links, onOpenSource)}
      {renderSection(uiCopy.pageRelations.mentions, mentions, onOpenSource)}
    </section>
  )
}
