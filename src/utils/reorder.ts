export type ReorderPosition = 'before' | 'after'

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
