import { describe, expect, it } from 'vitest'
import {
  collectPageRelationMatches,
  getPageRelationDisplayText,
  stripDeletedPageRelations,
  syncPageRelationTitles,
} from './pageRelations'
import type { PageRecord } from './types'

const now = '2026-07-06T00:00:00.000Z'

function createPage(id: string, title: string, blocks: PageRecord['blocks']): PageRecord {
  return {
    id,
    parentId: null,
    title,
    icon: null,
    cover: null,
    properties: {},
    blocks,
    createdAt: now,
    updatedAt: now,
  }
}

describe('pageRelations', () => {
  it('collects link and mention matches with source block context', () => {
    const pages = [
      createPage('page_target', 'Product Plan', []),
      createPage('page_source', 'Meeting Notes', [
        {
          id: 'block_relation',
          type: 'paragraph',
          text: 'See Product Plan and @Product Plan',
          richText: [
            { text: 'See ' },
            { text: 'Product Plan', pageId: 'page_target', relationKind: 'link' },
            { text: ' and ' },
            { text: '@Product Plan', pageId: 'page_target', relationKind: 'mention' },
          ],
        },
      ]),
    ]

    expect(collectPageRelationMatches(pages)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          targetPageId: 'page_target',
          sourcePageId: 'page_source',
          sourceBlockId: 'block_relation',
          kind: 'link',
        }),
        expect.objectContaining({
          targetPageId: 'page_target',
          sourcePageId: 'page_source',
          sourceBlockId: 'block_relation',
          kind: 'mention',
        }),
      ]),
    )
  })

  it('keeps visible text while stripping metadata for deleted targets', () => {
    const pages = stripDeletedPageRelations(
      [
        createPage('page_source', 'Source', [
          {
            id: 'block_relation',
            type: 'paragraph',
            text: 'Product Plan',
            richText: [{ text: 'Product Plan', pageId: 'page_target', relationKind: 'link' }],
          },
        ]),
      ],
      new Set(['page_target']),
    )

    expect(pages[0].blocks[0]).toMatchObject({
      richText: [{ text: 'Product Plan' }],
      text: 'Product Plan',
    })
  })

  it('recomputes canonical display text from the current target title', () => {
    const pages = syncPageRelationTitles([
      createPage('page_target', 'Renamed Plan', []),
      createPage('page_source', 'Source', [
        {
          id: 'block_relation',
          type: 'paragraph',
          text: 'Old Plan @Old Plan',
          richText: [
            { text: 'Old Plan', pageId: 'page_target', relationKind: 'link' },
            { text: ' ' },
            { text: '@Old Plan', pageId: 'page_target', relationKind: 'mention' },
          ],
        },
      ]),
    ])

    expect(getPageRelationDisplayText('Renamed Plan', 'link')).toBe('Renamed Plan')
    expect(getPageRelationDisplayText('Renamed Plan', 'mention')).toBe('@Renamed Plan')
    expect(pages[1].blocks[0]).toMatchObject({
      text: 'Renamed Plan @Renamed Plan',
    })
  })
})
