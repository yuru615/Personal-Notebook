import type { KeyboardEvent } from 'react'
import type { PageRelationAutocompleteItem } from '../PageRelationAutocomplete'
import { ListBlock } from './ListBlock'
import { MediaBlock } from './MediaBlock'
import { ParagraphBlock } from './ParagraphBlock'
import { TodoBlock } from './TodoBlock'
import type {
  BlockRecord,
  ExternalLinkOpenMode,
  RichTextSegment,
  SyncedBlockGroupRecord,
  SyncedBlockInstanceBlock,
} from '../../../domain/types'

interface SyncedBlockContainerProps {
  containerBlock: SyncedBlockInstanceBlock
  group: SyncedBlockGroupRecord | null
  isPrimary: boolean
  canOpenPrimary?: boolean
  allPages: unknown[]
  onUpdateGroupBlock: (groupId: string, blockId: string, nextBlock: BlockRecord) => void
  onUnsync: () => void
  onOpenPrimary: () => void
  relationPages?: PageRelationAutocompleteItem[]
  onOpenPageRelation?: (pageId: string) => void
  onCreatePageRelation?: (title: string) => Promise<PageRelationAutocompleteItem>
  linkOpenMode?: ExternalLinkOpenMode
  onDeleteContainer?: () => void
}

export function SyncedBlockContainer({
  containerBlock,
  group,
  isPrimary,
  canOpenPrimary,
  allPages,
  onUpdateGroupBlock,
  onUnsync,
  onOpenPrimary,
  relationPages,
  onOpenPageRelation,
  onCreatePageRelation,
  linkOpenMode,
  onDeleteContainer,
}: SyncedBlockContainerProps) {
  void allPages
  const isReference = containerBlock.mode === 'reference'

  if (!group) {
    return (
      <div
        className="synced-block-container synced-block-container-missing"
        tabIndex={0}
        onClick={(event) => {
          event.currentTarget.focus()
        }}
        onKeyDown={(event) => {
          handleContainerDeleteKeyDown(event, onDeleteContainer)
        }}
      >
        <span className="synced-block-hidden-label">同步块</span>
        <div className="synced-block-body">
          <div className="synced-block-missing-copy">同步内容不可用</div>
          <div className="synced-block-actions">
            <button type="button" className="synced-block-action" onClick={onUnsync}>
              取消同步
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div
      className={
        isReference
          ? 'synced-block-container synced-block-container-reference'
          : 'synced-block-container synced-block-container-sync'
      }
      tabIndex={isReference ? 0 : undefined}
      onClick={
        isReference
          ? (event) => {
              event.currentTarget.focus()
            }
          : undefined
      }
      onKeyDown={
        isReference
          ? (event) => {
              handleContainerDeleteKeyDown(event, onDeleteContainer)
            }
          : undefined
      }
    >
      {isReference ? null : <span className="synced-block-hidden-label">同步块</span>}
      <div className="synced-block-body">
        {group.blocks.map((block, index) => (
          <div key={block.id} className="synced-block-body-item">
            {renderSyncedInnerBlock({
              block,
              index,
              mode: containerBlock.mode,
              canOpenPrimary: canOpenPrimary ?? !isPrimary,
              groupId: group.id,
              onUpdateGroupBlock,
              onOpenPrimary,
              relationPages,
              onOpenPageRelation,
              onCreatePageRelation,
              linkOpenMode,
            })}
          </div>
        ))}
      </div>
    </div>
  )
}

function renderSyncedInnerBlock({
  block,
  index,
  mode,
  canOpenPrimary,
  groupId,
  onUpdateGroupBlock,
  onOpenPrimary,
  relationPages,
  onOpenPageRelation,
  onCreatePageRelation,
  linkOpenMode,
}: {
  block: BlockRecord
  index: number
  mode: SyncedBlockInstanceBlock['mode']
  canOpenPrimary: boolean
  groupId: string
  onUpdateGroupBlock: (groupId: string, blockId: string, nextBlock: BlockRecord) => void
  onOpenPrimary: () => void
  relationPages?: PageRelationAutocompleteItem[]
  onOpenPageRelation?: (pageId: string) => void
  onCreatePageRelation?: (title: string) => Promise<PageRelationAutocompleteItem>
  linkOpenMode?: ExternalLinkOpenMode
}) {
  const isReference = mode === 'reference'

  switch (block.type) {
    case 'paragraph':
    case 'heading_1':
    case 'heading_2':
    case 'heading_3':
      if (isReference) {
        return (
          <div className={`synced-block-readonly synced-block-readonly-${block.type}`}>
            {getRichTextPlainText(block.richText ?? [{ text: block.text }]) || block.text}
          </div>
        )
      }

      return (
        <ParagraphBlock
          variant={block.type}
          value={block.text}
          richText={block.richText}
          relationPages={relationPages}
          onOpenPageRelation={onOpenPageRelation}
          onCreatePageRelation={onCreatePageRelation}
          linkOpenMode={linkOpenMode}
          onChange={({ text, richText }) =>
            onUpdateGroupBlock(groupId, block.id, { ...block, text, richText })
          }
        />
      )

    case 'todo':
      if (isReference) {
        return (
          <div className="synced-block-readonly synced-block-readonly-todo">
            <span className="synced-block-readonly-marker" aria-hidden="true">
              {block.checked ? '☑' : '☐'}
            </span>
            <span>{getRichTextPlainText(block.richText ?? [{ text: block.text }]) || block.text}</span>
          </div>
        )
      }

      return (
        <TodoBlock
          text={block.text}
          richText={block.richText}
          checked={block.checked}
          relationPages={relationPages}
          onOpenPageRelation={onOpenPageRelation}
          onCreatePageRelation={onCreatePageRelation}
          linkOpenMode={linkOpenMode}
          onChange={({ text, richText, checked }) =>
            onUpdateGroupBlock(groupId, block.id, { ...block, text, richText, checked })
          }
        />
      )

    case 'bulleted_list':
    case 'numbered_list':
      if (isReference) {
        return (
          <div className="synced-block-readonly synced-block-readonly-list">
            <span className="synced-block-readonly-marker" aria-hidden="true">
              {block.type === 'bulleted_list' ? '•' : `${index + 1}.`}
            </span>
            <span>{block.items[0] ?? ''}</span>
          </div>
        )
      }

      return (
        <ListBlock
          type={block.type}
          value={block.items[0] ?? ''}
          richText={block.richText}
          index={index}
          relationPages={relationPages}
          onOpenPageRelation={onOpenPageRelation}
          onCreatePageRelation={onCreatePageRelation}
          linkOpenMode={linkOpenMode}
          onChange={({ text, richText }) =>
            onUpdateGroupBlock(groupId, block.id, {
              ...block,
              items: [text],
              richText,
            })
          }
        />
      )

    case 'image':
    case 'video':
    case 'audio':
      return (
        <MediaBlock
          block={block}
          readOnly={isReference}
          onChange={(nextBlock) => onUpdateGroupBlock(groupId, block.id, nextBlock)}
        />
      )

    default:
      return (
        <div className="synced-block-complex-shell">
          <div className="synced-block-complex-label">{getComplexBlockLabel(block.type)}</div>
          {canOpenPrimary ? (
            <button type="button" className="synced-block-action" onClick={onOpenPrimary}>
              前往原位置
            </button>
          ) : null}
        </div>
      )
  }
}

function handleContainerDeleteKeyDown(
  event: KeyboardEvent<HTMLDivElement>,
  onDeleteContainer?: () => void,
) {
  if (
    event.nativeEvent.isComposing ||
    (event.key !== 'Backspace' && event.key !== 'Delete') ||
    event.target !== event.currentTarget
  ) {
    return
  }

  event.preventDefault()
  onDeleteContainer?.()
}

function getRichTextPlainText(richText: RichTextSegment[]) {
  return richText.map((segment) => segment.text).join('')
}

function getComplexBlockLabel(type: BlockRecord['type']) {
  switch (type) {
    case 'code':
      return '代码块'
    case 'table':
      return '表格'
    case 'image':
      return '图片'
    case 'video':
      return '视频'
    case 'audio':
      return '音频'
    case 'child_page':
      return '子页面'
    case 'whiteboard':
      return '白板'
    case 'data_table':
      return '数据表格'
    case 'mindmap':
      return '导图'
    default:
      return '块内容'
  }
}
