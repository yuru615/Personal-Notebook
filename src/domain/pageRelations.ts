import { normalizeRichText, richTextToPlainText } from './richText'
import type {
  BlockRecord,
  PageRecord,
  PageRelationKind,
  RichTextSegment,
} from './types'

export interface PageRelationMatch {
  targetPageId: string
  sourcePageId: string
  sourcePageTitle: string
  sourcePageIcon: string | null
  sourceBlockId: string
  excerpt: string
  kind: PageRelationKind
}

type SupportedRelationBlock = Extract<
  BlockRecord,
  { type: 'paragraph' | 'heading_1' | 'heading_2' | 'heading_3' | 'todo' }
>

type RelationSegment = RichTextSegment & {
  pageId: string
  relationKind: PageRelationKind
}

export function getPageRelationDisplayText(title: string, kind: PageRelationKind) {
  return kind === 'mention' ? `@${title}` : title
}

function isSupportedRelationBlock(block: BlockRecord): block is SupportedRelationBlock {
  return (
    block.type === 'paragraph' ||
    block.type === 'heading_1' ||
    block.type === 'heading_2' ||
    block.type === 'heading_3' ||
    block.type === 'todo'
  )
}

function getBlockSegments(block: SupportedRelationBlock): RichTextSegment[] {
  return normalizeRichText(block.richText ?? [{ text: block.text }])
}

function isRelationSegment(segment: RichTextSegment): segment is RelationSegment {
  return typeof segment.pageId === 'string' && segment.pageId.length > 0 && !!segment.relationKind
}

export function collectPageRelationMatches(pages: PageRecord[]): PageRelationMatch[] {
  return pages.flatMap((page) =>
    page.blocks.flatMap((block) => {
      if (!isSupportedRelationBlock(block)) {
        return []
      }

      const segments = getBlockSegments(block)
      const excerpt = richTextToPlainText(segments)

      return segments.filter(isRelationSegment).map((segment) => ({
        targetPageId: segment.pageId,
        sourcePageId: page.id,
        sourcePageTitle: page.title,
        sourcePageIcon: page.icon,
        sourceBlockId: block.id,
        excerpt,
        kind: segment.relationKind,
      }))
    }),
  )
}

export function syncPageRelationTitles(pages: PageRecord[]): PageRecord[] {
  const pageTitleById = new Map(pages.map((page) => [page.id, page.title]))

  return pages.map((page) => ({
    ...page,
    blocks: page.blocks.map((block) => {
      if (!isSupportedRelationBlock(block)) {
        return block
      }

      let changed = false
      const nextRichText = normalizeRichText(
        getBlockSegments(block).map((segment) => {
          if (!isRelationSegment(segment)) {
            return segment
          }

          const nextTitle = pageTitleById.get(segment.pageId)
          if (!nextTitle) {
            return segment
          }

          const nextText = getPageRelationDisplayText(nextTitle, segment.relationKind)
          if (nextText === segment.text) {
            return segment
          }

          changed = true
          return {
            ...segment,
            text: nextText,
          }
        }),
      )

      if (!changed) {
        return block
      }

      return {
        ...block,
        text: richTextToPlainText(nextRichText),
        richText: nextRichText,
      }
    }),
  }))
}

export function stripDeletedPageRelations(
  pages: PageRecord[],
  deletedPageIds: Set<string>,
): PageRecord[] {
  return pages.map((page) => ({
    ...page,
    blocks: page.blocks.map((block) => {
      if (!isSupportedRelationBlock(block)) {
        return block
      }

      let changed = false
      const nextRichText = normalizeRichText(
        getBlockSegments(block).map((segment) => {
          if (!isRelationSegment(segment) || !deletedPageIds.has(segment.pageId)) {
            return segment
          }

          changed = true
          return { text: segment.text }
        }),
      )

      if (!changed) {
        return block
      }

      return {
        ...block,
        text: richTextToPlainText(nextRichText),
        richText: nextRichText,
      }
    }),
  }))
}
