import type { PageId, PageRecord } from '../domain/types'

export interface VisiblePageItem {
  page: PageRecord
  depth: number
  hasChildren: boolean
}

export function deletePageBranch(pages: PageRecord[], targetId: PageId): PageRecord[] {
  const idsToRemove = new Set<PageId>([targetId])
  let changed = true

  while (changed) {
    changed = false

    for (const page of pages) {
      if (page.parentId && idsToRemove.has(page.parentId) && !idsToRemove.has(page.id)) {
        idsToRemove.add(page.id)
        changed = true
      }
    }
  }

  return pages.filter((page) => !idsToRemove.has(page.id))
}

export function buildVisiblePageItems(
  pages: PageRecord[],
  expandedIds: Record<string, boolean>,
): VisiblePageItem[] {
  const childrenByParent = new Map<PageId | null, PageRecord[]>()

  for (const page of pages) {
    const siblings = childrenByParent.get(page.parentId) ?? []
    siblings.push(page)
    childrenByParent.set(page.parentId, siblings)
  }

  const items: VisiblePageItem[] = []

  function visit(parentId: PageId | null, depth: number) {
    for (const page of childrenByParent.get(parentId) ?? []) {
      const children = childrenByParent.get(page.id) ?? []
      items.push({
        page,
        depth,
        hasChildren: children.length > 0,
      })

      if (children.length > 0 && (expandedIds[page.id] ?? true)) {
        visit(page.id, depth + 1)
      }
    }
  }

  visit(null, 0)
  return items
}
