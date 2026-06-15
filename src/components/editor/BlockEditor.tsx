import type { BlockRecord } from '../../domain/types'
import { uiCopy } from '../../ui/copy'

interface BlockEditorProps {
  blocks: BlockRecord[]
}

export function BlockEditor({ blocks }: BlockEditorProps) {
  return (
    <div className="block-editor">
      {blocks.map((block) => {
        switch (block.type) {
          case 'paragraph':
            return (
              <p key={block.id} className="block-paragraph">
                {block.text}
              </p>
            )
          case 'todo':
            return (
              <label key={block.id} className="block-todo">
                <input type="checkbox" checked={block.checked} readOnly />
                <span>{block.text}</span>
              </label>
            )
          case 'bulleted_list':
            return (
              <ul key={block.id} className="block-list">
                {block.items.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            )
          case 'numbered_list':
            return (
              <ol key={block.id} className="block-list">
                {block.items.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ol>
            )
          case 'code':
            return (
              <pre key={block.id} className="block-code">
                <code>{block.text}</code>
              </pre>
            )
          case 'table':
            return (
              <div key={block.id} className="block-table-wrapper">
                <table className="block-table">
                  <tbody>
                    {block.rows.map((row, rowIndex) => (
                      <tr key={`${block.id}-${rowIndex}`}>
                        {row.map((cell, cellIndex) => (
                          <td key={`${block.id}-${rowIndex}-${cellIndex}`}>{cell}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          case 'child_page':
            return (
              <div key={block.id} className="block-child-page">
                {uiCopy.editor.childPage}
              </div>
            )
          default:
            return null
        }
      })}
    </div>
  )
}
