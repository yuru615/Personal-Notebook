import { normalizeRichText, richTextToPlainText } from './richText'
import type { BlockRecord, PageRecord, SyncedBlockGroupRecord, SyncedBlockMode } from './types'

export const INLINE_EDITABLE_SYNC_BLOCK_TYPES = new Set<BlockRecord['type']>([
  'paragraph',
  'heading_1',
  'heading_2',
  'heading_3',
  'todo',
  'bulleted_list',
  'numbered_list',
])

export interface SyncedPickerItem {
  id: string
  summary: string
  meta: string
  blockCount: number
  searchText: string
  source:
    | { kind: 'group'; groupId: string }
    | { kind: 'block'; pageId: string; blockId: string }
}

export function validateSyncedGroupBlocks(
  blocks: BlockRecord[],
):
  | { ok: true }
  | { ok: false; reason: 'empty_selection' | 'nested_synced_block'; blockId?: string } {
  if (blocks.length === 0) {
    return { ok: false, reason: 'empty_selection' }
  }

  const nestedBlock = blocks.find((block) => block.type === 'synced_block')
  if (nestedBlock) {
    return {
      ok: false,
      reason: 'nested_synced_block',
      blockId: nestedBlock.id,
    }
  }

  return { ok: true }
}

export function buildSyncedBlockSummary(group: SyncedBlockGroupRecord) {
  for (const block of group.blocks) {
    const summary = getStandaloneBlockSummary(block, new Map())
    if (summary) {
      return summary
    }
  }

  return '同步块'
}

export function buildSyncedPickerItems(
  pages: PageRecord[],
  groups: SyncedBlockGroupRecord[],
): SyncedPickerItem[] {
  const pageTitleById = new Map(
    pages.map((page) => [page.id, page.title.trim() || '未命名'] as const),
  )

  const groupItems = groups.map((group) => {
    const summary = buildSyncedBlockSummary(group)
    return {
      id: `group:${group.id}`,
      summary,
      meta: `${group.blocks.length} 个块`,
      blockCount: group.blocks.length,
      searchText: summary,
      source: { kind: 'group' as const, groupId: group.id },
    }
  })

  const blockItems = pages.flatMap((page) =>
    page.blocks.flatMap((block) => {
      if (block.type === 'synced_block') {
        return []
      }

      const summary = getStandaloneBlockSummary(block, pageTitleById)
      if (!summary) {
        return []
      }

      const pageTitle = page.title.trim() || '未命名'
      return [
        {
          id: `block:${page.id}:${block.id}`,
          summary,
          meta: pageTitle,
          blockCount: 1,
          searchText: `${summary} ${pageTitle}`,
          source: { kind: 'block' as const, pageId: page.id, blockId: block.id },
        },
      ]
    }),
  )

  return [...groupItems, ...blockItems]
}

export function cloneBlocksForUnsync(
  blocks: BlockRecord[],
  createBlockId: () => string,
): BlockRecord[] {
  return structuredClone(blocks).map((block) => ({
    ...block,
    id: createBlockId(),
  }))
}

export function collectSyncedGroupInstances(pages: PageRecord[], groupId: string) {
  return pages.flatMap((page) =>
    page.blocks.flatMap((block) =>
      block.type === 'synced_block' && block.groupId === groupId
        ? [
            {
              pageId: page.id,
              containerBlockId: block.id,
              instanceId: block.instanceId,
              mode: block.mode,
            },
          ]
        : [],
    ),
  )
}

export function findPrimaryInstanceLocation(pages: PageRecord[], group: SyncedBlockGroupRecord) {
  return (
    collectSyncedGroupInstances(pages, group.id).find(
      (instance) => instance.instanceId === group.primaryInstanceId,
    ) ?? null
  )
}

export function getNextPrimaryInstanceId(
  deletedPrimaryInstanceId: string,
  remainingInstanceIds: string[],
) {
  if (remainingInstanceIds.length === 0) {
    return null
  }

  return (
    remainingInstanceIds.find((instanceId) => instanceId !== deletedPrimaryInstanceId) ??
    remainingInstanceIds[0]
  )
}

export function reconcileSyncedBlockGroups(
  pages: PageRecord[],
  syncedBlockGroups: SyncedBlockGroupRecord[],
  affectedGroupIds?: ReadonlySet<string>,
  updatedAt = new Date().toISOString(),
) {
  return syncedBlockGroups
    .map((group) => {
      if (affectedGroupIds && !affectedGroupIds.has(group.id)) {
        return group
      }

      const remainingInstances = collectSyncedGroupInstances(pages, group.id)

      if (remainingInstances.length === 0) {
        return null
      }

      if (remainingInstances.some((instance) => instance.instanceId === group.primaryInstanceId)) {
        return group
      }

      return {
        ...group,
        primaryInstanceId:
          getNextPrimaryInstanceId(
            group.primaryInstanceId,
            remainingInstances.map((item) => item.instanceId),
          ) ?? group.primaryInstanceId,
        updatedAt,
      }
    })
    .filter(Boolean) as SyncedBlockGroupRecord[]
}

export function isInlineEditableSyncedBlock(
  block: BlockRecord,
  mode: SyncedBlockMode,
  isPrimary: boolean,
) {
  if (mode !== 'sync') {
    return false
  }

  if (INLINE_EDITABLE_SYNC_BLOCK_TYPES.has(block.type)) {
    return true
  }

  return isPrimary
}

function getStandaloneBlockSummary(
  block: BlockRecord,
  pageTitleById: Map<string, string>,
) {
  switch (block.type) {
    case 'paragraph':
    case 'heading_1':
    case 'heading_2':
    case 'heading_3':
    case 'todo':
    case 'code':
      return summarizeText(getTextLikeBlockContent(block))
    case 'bulleted_list':
    case 'numbered_list':
      return summarizeFirstNonEmpty(block.items)
    case 'table':
      return summarizeText(block.rows.flat().join(' '))
    case 'image':
      return summarizeText([block.name, block.caption, block.alt].filter(Boolean).join(' '))
    case 'video':
    case 'audio':
      return summarizeText([block.name, block.caption].filter(Boolean).join(' '))
    case 'child_page':
      return summarizeText(pageTitleById.get(block.pageId) ?? '')
    case 'whiteboard':
    case 'data_table':
    case 'mindmap':
    case 'synced_block':
      return null
  }
}

function getTextLikeBlockContent(
  block: Extract<
    BlockRecord,
    { type: 'paragraph' | 'heading_1' | 'heading_2' | 'heading_3' | 'todo' | 'code' }
  >,
) {
  if (block.type === 'code') {
    return block.text
  }

  return richTextToPlainText(normalizeRichText(block.richText ?? [{ text: block.text }])).trim()
}

function summarizeText(value: string) {
  const summary = value.trim()
  return summary ? summary.slice(0, 48) : null
}

function summarizeFirstNonEmpty(values: string[]) {
  for (const value of values) {
    const summary = summarizeText(value)
    if (summary) {
      return summary
    }
  }

  return null
}
