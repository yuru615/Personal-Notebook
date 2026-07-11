export type ReorderPosition = 'before' | 'after'

export function reorderItemGroup<T extends { id: string }>(
  items: T[],
  activeIds: string[],
  overId: string,
  position: ReorderPosition = 'before',
): T[] {
  const activeIdSet = new Set(activeIds)

  if (activeIdSet.size === 0 || activeIdSet.has(overId)) {
    return items
  }

  const movedItems = items.filter((item) => activeIdSet.has(item.id))

  if (movedItems.length === 0) {
    return items
  }

  const withoutMoved = items.filter((item) => !activeIdSet.has(item.id))
  const targetIndex = withoutMoved.findIndex((item) => item.id === overId)

  if (targetIndex < 0) {
    return items
  }

  const next = [...withoutMoved]
  next.splice(position === 'after' ? targetIndex + 1 : targetIndex, 0, ...movedItems)
  return next
}

export function reorderItems<T extends { id: string }>(
  items: T[],
  activeId: string,
  overId: string,
  position: ReorderPosition = 'before',
): T[] {
  const oldIndex = items.findIndex((item) => item.id === activeId)

  if (oldIndex < 0 || activeId === overId) {
    return items
  }

  const moved = items[oldIndex]
  const withoutMoved = items.filter((item) => item.id !== activeId)
  const targetIndex = withoutMoved.findIndex((item) => item.id === overId)

  if (targetIndex < 0) {
    return items
  }

  const next = [...withoutMoved]
  next.splice(position === 'after' ? targetIndex + 1 : targetIndex, 0, moved)
  return next
}
