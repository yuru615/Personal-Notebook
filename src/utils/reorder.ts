export function reorderItems<T extends { id: string }>(
  items: T[],
  activeId: string,
  overId: string,
): T[] {
  const oldIndex = items.findIndex((item) => item.id === activeId)
  const newIndex = items.findIndex((item) => item.id === overId)

  if (oldIndex < 0 || newIndex < 0) {
    return items
  }

  const next = [...items]
  const [moved] = next.splice(oldIndex, 1)
  next.splice(newIndex, 0, moved)
  return next
}
