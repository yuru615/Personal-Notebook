import { describe, expect, it } from 'vitest'
import type { PageRecord } from '../domain/types'
import {
  getRecycleBinRoots,
  purgeExpiredDeletedPageBranches,
  restorePageBranch,
  softDeletePageBranch,
} from './pageTree'

const deletedAt = '2026-07-16T00:00:00.000Z'

function createPages(): PageRecord[] {
  return [
    {
      id: 'parent',
      parentId: null,
      title: '父页面',
      icon: null,
      cover: null,
      blocks: [{ id: 'parent-paragraph', type: 'paragraph', text: '保留正文' }],
      createdAt: deletedAt,
      updatedAt: deletedAt,
    },
    {
      id: 'child',
      parentId: 'parent',
      title: '子页面',
      icon: null,
      cover: null,
      blocks: [{ id: 'child-paragraph', type: 'paragraph', text: '保留子页面正文' }],
      createdAt: deletedAt,
      updatedAt: deletedAt,
    },
    {
      id: 'other',
      parentId: null,
      title: '其他页面',
      icon: null,
      cover: null,
      blocks: [],
      createdAt: deletedAt,
      updatedAt: deletedAt,
    },
  ]
}

describe('page recycle bin helpers', () => {
  it('soft deletes a page branch while preserving its hierarchy and content', () => {
    const pages = softDeletePageBranch(createPages(), 'parent', deletedAt)

    expect(pages.find((page) => page.id === 'parent')).toMatchObject({
      deletedAt,
      deletedRootId: 'parent',
      parentId: null,
      blocks: [{ id: 'parent-paragraph', type: 'paragraph', text: '保留正文' }],
    })
    expect(pages.find((page) => page.id === 'child')).toMatchObject({
      deletedAt,
      deletedRootId: 'parent',
      parentId: 'parent',
      blocks: [{ id: 'child-paragraph', type: 'paragraph', text: '保留子页面正文' }],
    })
    expect(pages.find((page) => page.id === 'other')).not.toHaveProperty('deletedAt')
  })

  it('restores only the selected deleted branch', () => {
    const deletedPages = softDeletePageBranch(createPages(), 'parent', deletedAt)
    const pages = restorePageBranch(deletedPages, 'parent')

    expect(pages.find((page) => page.id === 'parent')).not.toHaveProperty('deletedAt')
    expect(pages.find((page) => page.id === 'child')).not.toHaveProperty('deletedRootId')
    expect(pages.find((page) => page.id === 'other')).not.toHaveProperty('deletedAt')
  })

  it('lists only the root item for each deleted page tree', () => {
    const pages = softDeletePageBranch(createPages(), 'parent', deletedAt)

    expect(getRecycleBinRoots(pages).map((page) => page.id)).toEqual(['parent'])
  })

  it('purges only page trees that have been in the recycle bin for at least 30 days', () => {
    const expiredAt = '2026-06-16T00:00:00.000Z'
    const pages = softDeletePageBranch(createPages(), 'parent', expiredAt)

    const result = purgeExpiredDeletedPageBranches(pages, new Date('2026-07-16T00:00:00.000Z'))

    expect(result.pages.map((page) => page.id)).toEqual(['other'])
    expect(result.deletedPageIds).toEqual(new Set(['parent', 'child']))
  })

  it('purges a deleted tree with an invalid deletion time instead of retaining it forever', () => {
    const pages = softDeletePageBranch(createPages(), 'parent', 'not-a-date')

    const result = purgeExpiredDeletedPageBranches(pages, new Date('2026-07-16T00:00:00.000Z'))

    expect(result.pages.map((page) => page.id)).toEqual(['other'])
    expect(result.deletedPageIds).toEqual(new Set(['parent', 'child']))
  })
})
