import { describe, expect, it } from 'vitest'
import { reorderItems } from './reorder'

const items = [
  { id: 'a' },
  { id: 'b' },
  { id: 'c' },
  { id: 'd' },
]

describe('reorderItems', () => {
  it('moves an item before the target when dragging downward', () => {
    const reordered = reorderItems(items, 'a', 'c', 'before')

    expect(reordered.map((item) => item.id)).toEqual(['b', 'a', 'c', 'd'])
  })

  it('moves an item after the target when dragging downward', () => {
    const reordered = reorderItems(items, 'a', 'c', 'after')

    expect(reordered.map((item) => item.id)).toEqual(['b', 'c', 'a', 'd'])
  })
})
