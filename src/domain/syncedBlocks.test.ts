import { describe, expect, it } from 'vitest'
import {
  buildSyncedBlockSummary,
  cloneBlocksForUnsync,
  collectSyncedGroupInstances,
  findPrimaryInstanceLocation,
  getNextPrimaryInstanceId,
  isInlineEditableSyncedBlock,
  reconcileSyncedBlockGroups,
  validateSyncedGroupBlocks,
} from './syncedBlocks'
import type { PageRecord, SyncedBlockGroupRecord } from './types'

const now = '2026-07-06T00:00:00.000Z'

function createPage(id: string, blocks: PageRecord['blocks']): PageRecord {
  return {
    id,
    parentId: null,
    title: id,
    icon: null,
    cover: null,
    properties: {},
    blocks,
    createdAt: now,
    updatedAt: now,
  }
}

describe('syncedBlocks', () => {
  it('accepts normal blocks and rejects nested synced containers', () => {
    expect(
      validateSyncedGroupBlocks([
        { id: 'block_1', type: 'paragraph', text: 'Alpha' },
        { id: 'block_2', type: 'todo', text: 'Beta', checked: false },
      ]),
    ).toEqual({ ok: true })

    expect(
      validateSyncedGroupBlocks([
        { id: 'block_1', type: 'paragraph', text: 'Alpha' },
        {
          id: 'block_nested',
          type: 'synced_block',
          groupId: 'group_nested',
          instanceId: 'instance_nested',
          mode: 'sync',
        },
      ]),
    ).toEqual({
      ok: false,
      reason: 'nested_synced_block',
      blockId: 'block_nested',
    })
  })

  it('clones unsynced blocks with fresh ids', () => {
    const blocks = cloneBlocksForUnsync(
      [
        { id: 'block_1', type: 'paragraph', text: 'Alpha' },
        { id: 'block_2', type: 'todo', text: 'Beta', checked: true },
      ],
      (() => {
        let index = 0
        return () => `block_new_${++index}`
      })(),
    )

    expect(blocks).toEqual([
      { id: 'block_new_1', type: 'paragraph', text: 'Alpha' },
      { id: 'block_new_2', type: 'todo', text: 'Beta', checked: true },
    ])
  })

  it('derives summaries and primary replacement from existing instances', () => {
    const group: SyncedBlockGroupRecord = {
      id: 'group_1',
      blocks: [
        { id: 'block_1', type: 'heading_2', text: 'Weekly review' },
        { id: 'block_2', type: 'paragraph', text: 'Summary paragraph' },
      ],
      primaryInstanceId: 'instance_1',
      createdAt: now,
      updatedAt: now,
    }

    const pages = [
      createPage('page_1', [
        {
          id: 'container_1',
          type: 'synced_block',
          groupId: 'group_1',
          instanceId: 'instance_1',
          mode: 'sync',
        },
      ]),
      createPage('page_2', [
        {
          id: 'container_2',
          type: 'synced_block',
          groupId: 'group_1',
          instanceId: 'instance_2',
          mode: 'reference',
        },
      ]),
    ]

    expect(buildSyncedBlockSummary(group)).toBe('Weekly review')
    expect(collectSyncedGroupInstances(pages, 'group_1')).toEqual([
      {
        pageId: 'page_1',
        containerBlockId: 'container_1',
        instanceId: 'instance_1',
        mode: 'sync',
      },
      {
        pageId: 'page_2',
        containerBlockId: 'container_2',
        instanceId: 'instance_2',
        mode: 'reference',
      },
    ])
    expect(findPrimaryInstanceLocation(pages, group)).toEqual({
      pageId: 'page_1',
      containerBlockId: 'container_1',
      instanceId: 'instance_1',
      mode: 'sync',
    })
    expect(getNextPrimaryInstanceId(group.primaryInstanceId, ['instance_2'])).toBe('instance_2')
  })

  it('returns null when no replacement primary instance exists', () => {
    expect(getNextPrimaryInstanceId('instance_1', [])).toBeNull()
  })

  it('repairs malformed synced groups against the current page instances', () => {
    const groups: SyncedBlockGroupRecord[] = [
      {
        id: 'group_keep',
        blocks: [{ id: 'block_1', type: 'paragraph', text: 'Shared keep' }],
        primaryInstanceId: 'instance_missing',
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'group_drop',
        blocks: [{ id: 'block_2', type: 'paragraph', text: 'Shared drop' }],
        primaryInstanceId: 'instance_drop',
        createdAt: now,
        updatedAt: now,
      },
    ]
    const pages = [
      createPage('page_1', [
        {
          id: 'container_1',
          type: 'synced_block',
          groupId: 'group_keep',
          instanceId: 'instance_2',
          mode: 'sync',
        },
      ]),
    ]

    expect(reconcileSyncedBlockGroups(pages, groups, undefined, '2026-07-07T00:00:00.000Z')).toEqual([
      {
        ...groups[0],
        primaryInstanceId: 'instance_2',
        updatedAt: '2026-07-07T00:00:00.000Z',
      },
    ])
  })

  it('builds list summaries from the first non-empty item', () => {
    const group: SyncedBlockGroupRecord = {
      id: 'group_list',
      blocks: [
        { id: 'block_1', type: 'bulleted_list', items: ['', '  ', 'First readable item', 'Tail'] },
      ],
      primaryInstanceId: 'instance_1',
      createdAt: now,
      updatedAt: now,
    }

    expect(buildSyncedBlockSummary(group)).toBe('First readable item')
  })

  it('builds summaries from visible rich text when legacy text is empty', () => {
    const group: SyncedBlockGroupRecord = {
      id: 'group_rich_text',
      blocks: [
        {
          id: 'block_1',
          type: 'paragraph',
          text: '',
          richText: [{ text: 'Visible shared note' }],
        },
      ],
      primaryInstanceId: 'instance_1',
      createdAt: now,
      updatedAt: now,
    }

    expect(buildSyncedBlockSummary(group)).toBe('Visible shared note')
  })

  it('returns false when the container mode is not sync', () => {
    expect(
      isInlineEditableSyncedBlock(
        { id: 'block_1', type: 'paragraph', text: 'Alpha' },
        'reference',
        true,
      ),
    ).toBe(false)
  })

  it('returns true for inline text blocks in sync mode', () => {
    expect(
      isInlineEditableSyncedBlock(
        { id: 'block_1', type: 'paragraph', text: 'Alpha' },
        'sync',
        false,
      ),
    ).toBe(true)
  })

  it('only allows complex sync blocks when editing the primary instance', () => {
    const block = { id: 'block_1', type: 'data_table', databaseId: 'table_1' } as const

    expect(isInlineEditableSyncedBlock(block, 'sync', false)).toBe(false)
    expect(isInlineEditableSyncedBlock(block, 'sync', true)).toBe(true)
  })
})
