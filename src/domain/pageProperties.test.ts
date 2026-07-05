import { describe, expect, it } from 'vitest'
import {
  createDefaultPagePropertyDefinitions,
  normalizePagePropertyValue,
} from './pageProperties'

describe('pageProperties', () => {
  it('creates default definitions for tags, status, date, and notes', () => {
    const definitions = createDefaultPagePropertyDefinitions('2026-07-05T00:00:00.000Z')

    expect(definitions.map((definition) => [definition.key, definition.type])).toEqual([
      ['tags', 'multiSelect'],
      ['status', 'select'],
      ['date', 'date'],
      ['notes', 'text'],
    ])
  })

  it('normalizes multiSelect and select values by type', () => {
    expect(
      normalizePagePropertyValue(
        {
          id: 'prop_tags',
          key: 'tags',
          name: '标签',
          type: 'multiSelect',
          config: {},
          createdAt: '',
          updatedAt: '',
        },
        ['产品', '搜索', 1],
      ),
    ).toEqual(['产品', '搜索'])

    expect(
      normalizePagePropertyValue(
        {
          id: 'prop_status',
          key: 'status',
          name: '状态',
          type: 'select',
          config: {},
          createdAt: '',
          updatedAt: '',
        },
        ['进行中'],
      ),
    ).toBeNull()
  })
})
