import { describe, expect, it } from 'vitest'
import * as reorder from './reorder'

const items = [
  { id: 'a' },
  { id: 'b' },
  { id: 'c' },
  { id: 'd' },
  { id: 'e' },
]

describe('reorderItems', () => {
  it('moves an item before the target when dragging downward', () => {
    const reordered = reorder.reorderItems(items, 'a', 'c', 'before')

    expect(reordered.map((item) => item.id)).toEqual(['b', 'a', 'c', 'd', 'e'])
  })

  it('moves an item after the target when dragging downward', () => {
    const reordered = reorder.reorderItems(items, 'a', 'c', 'after')

    expect(reordered.map((item) => item.id)).toEqual(['b', 'c', 'a', 'd', 'e'])
  })
})

describe('reorderItemGroup', () => {
  it('moves the selected group before the target and keeps group order', () => {
    const reordered = reorder.reorderItemGroup(items, ['b', 'c'], 'e', 'before')

    expect(reordered.map((item) => item.id)).toEqual(['a', 'd', 'b', 'c', 'e'])
  })

  it('moves the selected group after the target and keeps group order', () => {
    const reordered = reorder.reorderItemGroup(items, ['b', 'c'], 'a', 'after')

    expect(reordered.map((item) => item.id)).toEqual(['a', 'b', 'c', 'd', 'e'])
  })

  it('does not move when the target is inside the selected group', () => {
    const reordered = reorder.reorderItemGroup(items, ['b', 'c'], 'b', 'before')

    expect(reordered).toBe(items)
  })
})
