import type { PageId, PageRecord } from '../domain/types'

export const PAGE_RECYCLE_RETENTION_MS = 30 * 24 * 60 * 60 * 1000

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

function collectPageBranchIds(pages: PageRecord[], targetId: PageId): Set<PageId> {
  const ids = new Set<PageId>([targetId])
  let changed = true

  while (changed) {
    changed = false

    for (const page of pages) {
      if (page.parentId && ids.has(page.parentId) && !ids.has(page.id)) {
        ids.add(page.id)
        changed = true
      }
    }
  }

  return ids
}

export function softDeletePageBranch(
  pages: PageRecord[],
  targetId: PageId,
  deletedAt: string,
): PageRecord[] {
  const ids = collectPageBranchIds(pages, targetId)

  return pages.map((page) =>
    ids.has(page.id) ? { ...page, deletedAt, deletedRootId: targetId } : page,
  )
}

export function restorePageBranch(pages: PageRecord[], rootId: PageId): PageRecord[] {
  return pages.map((page) => {
    if (page.deletedRootId !== rootId) {
      return page
    }

    const restoredPage = { ...page }
    delete restoredPage.deletedAt
    delete restoredPage.deletedRootId
    return restoredPage
  })
}

export function getRecycleBinRoots(pages: PageRecord[]): PageRecord[] {
  return pages.filter((page) => page.deletedAt && page.deletedRootId === page.id)
}

export function purgeExpiredDeletedPageBranches(pages: PageRecord[], now: Date) {
  const cutoffTime = now.getTime() - PAGE_RECYCLE_RETENTION_MS
  const expiredRootIds = new Set(
    getRecycleBinRoots(pages)
      .filter((page) => {
        const deletedAt = Date.parse(page.deletedAt as string)
        return !Number.isFinite(deletedAt) || deletedAt <= cutoffTime
      })
      .map((page) => page.id),
  )
  const deletedPageIds = new Set(
    pages
      .filter((page) => page.deletedRootId && expiredRootIds.has(page.deletedRootId))
      .map((page) => page.id),
  )

  return {
    pages: pages.filter((page) => !deletedPageIds.has(page.id)),
    deletedPageIds,
  }
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
