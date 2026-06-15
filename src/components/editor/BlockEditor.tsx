import type { BlockRecord, PageRecord } from '../../domain/types'
import { uiCopy } from '../../ui/copy'
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
}

export function BlockEditor({ page, allPages, onUpdateBlock }: BlockEditorProps) {
  const childPageTitleMap = Object.fromEntries(allPages.map((item) => [item.id, item.title]))

  return (
    <section className="editor-surface">
      {page.blocks.map((block) => {
        switch (block.type) {
          case 'paragraph':
            return (
              <div key={block.id} className="editor-row">
                <ParagraphBlock
                  value={block.text}
                  onChange={(text) => onUpdateBlock(block.id, { ...block, text })}
                />
              </div>
            )
          case 'todo':
            return (
              <div key={block.id} className="editor-row">
                <TodoBlock
                  text={block.text}
                  checked={block.checked}
                  onChange={({ text, checked }) => onUpdateBlock(block.id, { ...block, text, checked })}
                />
              </div>
            )
          case 'bulleted_list':
          case 'numbered_list':
            return (
              <div key={block.id} className="editor-row">
                <ListBlock
                  items={block.items}
                  onChange={(items) => onUpdateBlock(block.id, { ...block, items })}
                />
              </div>
            )
          case 'code':
            return (
              <div key={block.id} className="editor-row">
                <CodeBlock
                  language={block.language}
                  text={block.text}
                  onChange={({ language, text }) => onUpdateBlock(block.id, { ...block, language, text })}
                />
              </div>
            )
          case 'table':
            return (
              <div key={block.id} className="editor-row">
                <TableBlock
                  rows={block.rows}
                  onChange={(rows) => onUpdateBlock(block.id, { ...block, rows })}
                />
              </div>
            )
          case 'child_page':
            return (
              <div key={block.id} className="editor-row">
                <ChildPageBlock title={childPageTitleMap[block.pageId] ?? uiCopy.page.untitled} />
              </div>
            )
          default:
            return null
        }
      })}
      <div className="empty-block-row">{uiCopy.page.typeSlash}</div>
    </section>
  )
}
