import type { BlockRecord, BlockType, PageRecord } from '../../domain/types'
import { uiCopy } from '../../ui/copy'
import { EmptyBlockRow } from './EmptyBlockRow'
import { BlockFrame } from './BlockFrame'
import { ChildPageBlock } from './blocks/ChildPageBlock'
import { CodeBlock } from './blocks/CodeBlock'
import { ListBlock } from './blocks/ListBlock'
import { ParagraphBlock } from './blocks/ParagraphBlock'
import { TableBlock } from './blocks/TableBlock'
import { TodoBlock } from './blocks/TodoBlock'

interface BlockEditorProps {
  page: PageRecord
  allPages: PageRecord[]
  onUpdateBlock: (blockId: string, nextBlock: BlockRecord) => void
  onInsert?: (type: BlockType) => void
  onDeleteBlock?: (blockId: string) => void
  onDuplicateBlock?: (blockId: string) => void
  onTurnInto?: (blockId: string, type: BlockType) => void
  onReorderBlock?: (activeBlockId: string, overBlockId: string) => void
}

export function BlockEditor({
  page,
  allPages,
  onUpdateBlock,
  onInsert,
  onDeleteBlock,
  onDuplicateBlock,
  onTurnInto,
  onReorderBlock,
}: BlockEditorProps) {
  const childPageTitleMap = Object.fromEntries(allPages.map((item) => [item.id, item.title]))
  let draggingBlockId: string | null = null

  return (
    <section className="editor-surface">
      {page.blocks.map((block) => {
        switch (block.type) {
          case 'paragraph':
            return (
              <div
                key={block.id}
                className="editor-row"
                onDragOver={(event) => event.preventDefault()}
                onDrop={() => {
                  if (draggingBlockId && draggingBlockId !== block.id) {
                    onReorderBlock?.(draggingBlockId, block.id)
                  }
                  draggingBlockId = null
                }}
              >
                <BlockFrame
                  onDragStart={() => {
                    draggingBlockId = block.id
                  }}
                  onTurnInto={(type) => onTurnInto?.(block.id, type)}
                  onDuplicate={() => onDuplicateBlock?.(block.id)}
                  onDelete={() => onDeleteBlock?.(block.id)}
                >
                  <ParagraphBlock
                    value={block.text}
                    onChange={(text) => onUpdateBlock(block.id, { ...block, text })}
                  />
                </BlockFrame>
              </div>
            )
          case 'todo':
            return (
              <div
                key={block.id}
                className="editor-row"
                onDragOver={(event) => event.preventDefault()}
                onDrop={() => {
                  if (draggingBlockId && draggingBlockId !== block.id) {
                    onReorderBlock?.(draggingBlockId, block.id)
                  }
                  draggingBlockId = null
                }}
              >
                <BlockFrame
                  onDragStart={() => {
                    draggingBlockId = block.id
                  }}
                  onTurnInto={(type) => onTurnInto?.(block.id, type)}
                  onDuplicate={() => onDuplicateBlock?.(block.id)}
                  onDelete={() => onDeleteBlock?.(block.id)}
                >
                  <TodoBlock
                    text={block.text}
                    checked={block.checked}
                    onChange={({ text, checked }) => onUpdateBlock(block.id, { ...block, text, checked })}
                  />
                </BlockFrame>
              </div>
            )
          case 'bulleted_list':
          case 'numbered_list':
            return (
              <div
                key={block.id}
                className="editor-row"
                onDragOver={(event) => event.preventDefault()}
                onDrop={() => {
                  if (draggingBlockId && draggingBlockId !== block.id) {
                    onReorderBlock?.(draggingBlockId, block.id)
                  }
                  draggingBlockId = null
                }}
              >
                <BlockFrame
                  onDragStart={() => {
                    draggingBlockId = block.id
                  }}
                  onTurnInto={(type) => onTurnInto?.(block.id, type)}
                  onDuplicate={() => onDuplicateBlock?.(block.id)}
                  onDelete={() => onDeleteBlock?.(block.id)}
                >
                  <ListBlock
                    items={block.items}
                    onChange={(items) => onUpdateBlock(block.id, { ...block, items })}
                  />
                </BlockFrame>
              </div>
            )
          case 'code':
            return (
              <div
                key={block.id}
                className="editor-row"
                onDragOver={(event) => event.preventDefault()}
                onDrop={() => {
                  if (draggingBlockId && draggingBlockId !== block.id) {
                    onReorderBlock?.(draggingBlockId, block.id)
                  }
                  draggingBlockId = null
                }}
              >
                <BlockFrame
                  onDragStart={() => {
                    draggingBlockId = block.id
                  }}
                  onTurnInto={(type) => onTurnInto?.(block.id, type)}
                  onDuplicate={() => onDuplicateBlock?.(block.id)}
                  onDelete={() => onDeleteBlock?.(block.id)}
                >
                  <CodeBlock
                    language={block.language}
                    text={block.text}
                    onChange={({ language, text }) => onUpdateBlock(block.id, { ...block, language, text })}
                  />
                </BlockFrame>
              </div>
            )
          case 'table':
            return (
              <div
                key={block.id}
                className="editor-row"
                onDragOver={(event) => event.preventDefault()}
                onDrop={() => {
                  if (draggingBlockId && draggingBlockId !== block.id) {
                    onReorderBlock?.(draggingBlockId, block.id)
                  }
                  draggingBlockId = null
                }}
              >
                <BlockFrame
                  onDragStart={() => {
                    draggingBlockId = block.id
                  }}
                  onTurnInto={(type) => onTurnInto?.(block.id, type)}
                  onDuplicate={() => onDuplicateBlock?.(block.id)}
                  onDelete={() => onDeleteBlock?.(block.id)}
                >
                  <TableBlock
                    rows={block.rows}
                    onChange={(rows) => onUpdateBlock(block.id, { ...block, rows })}
                  />
                </BlockFrame>
              </div>
            )
          case 'child_page':
            return (
              <div
                key={block.id}
                className="editor-row"
                onDragOver={(event) => event.preventDefault()}
                onDrop={() => {
                  if (draggingBlockId && draggingBlockId !== block.id) {
                    onReorderBlock?.(draggingBlockId, block.id)
                  }
                  draggingBlockId = null
                }}
              >
                <BlockFrame
                  onDragStart={() => {
                    draggingBlockId = block.id
                  }}
                  onTurnInto={(type) => onTurnInto?.(block.id, type)}
                  onDuplicate={() => onDuplicateBlock?.(block.id)}
                  onDelete={() => onDeleteBlock?.(block.id)}
                >
                  <ChildPageBlock title={childPageTitleMap[block.pageId] ?? uiCopy.page.untitled} />
                </BlockFrame>
              </div>
            )
          default:
            return null
        }
      })}
      <EmptyBlockRow
        onInsert={(type) => {
          onInsert?.(type)
        }}
      />
    </section>
  )
}
