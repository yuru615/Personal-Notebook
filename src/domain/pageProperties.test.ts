import { describe, expect, it } from 'vitest'
import {
  createDefaultPagePropertyDefinitions,
  normalizePagePropertyDefinitions,
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
  it('drops removed select values when explicit options are provided', () => {
    expect(
      normalizePagePropertyValue(
        {
          id: 'prop_status',
          key: 'status',
          name: 'Status',
          type: 'select',
          config: {
            options: [{ id: 'todo', label: 'Todo', color: '#64748b' }],
          },
          createdAt: '',
          updatedAt: '',
        },
        'Doing',
      ),
    ).toBeNull()
  })

  it('filters removed multi-select values when explicit options are provided', () => {
    expect(
      normalizePagePropertyValue(
        {
          id: 'prop_tags',
          key: 'tags',
          name: 'Tags',
          type: 'multiSelect',
          config: {
            options: [{ id: 'alpha', label: 'Alpha', color: '#2563eb' }],
          },
          createdAt: '',
          updatedAt: '',
        },
        ['Alpha', 'Ghost', 1],
      ),
    ).toEqual(['Alpha'])
  })

  it('reassigns placeholder gray page property option colors to the shared palette on load', () => {
    expect(
      normalizePagePropertyDefinitions([
        {
          id: 'prop_status',
          key: 'status',
          name: 'Status',
          type: 'select',
          config: {
            options: [
              { id: 'todo', label: 'Todo', color: '#475569' },
              { id: 'doing', label: 'Doing', color: '#475569' },
            ],
          },
          createdAt: '',
          updatedAt: '',
        },
      ]),
    ).toEqual([
      expect.objectContaining({
        config: {
          options: [
            { id: 'todo', label: 'Todo', color: '#7c3aed' },
            { id: 'doing', label: 'Doing', color: '#2563eb' },
          ],
        },
      }),
    ])
  })
})
