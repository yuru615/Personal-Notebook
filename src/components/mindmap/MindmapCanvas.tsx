import type { MindmapRecord } from '../../domain/types'
import { buildMindmapLayout } from './mindmapLayout'

interface MindmapCanvasProps {
  mindmap: MindmapRecord
  onRenameNode: (nodeId: string, text: string) => void
  onAddChildNode: (nodeId: string) => void
  onAddSiblingNode: (nodeId: string) => void
  onDeleteNode: (nodeId: string) => void
}

export function MindmapCanvas({
  mindmap,
  onRenameNode,
  onAddChildNode,
  onAddSiblingNode,
  onDeleteNode,
}: MindmapCanvasProps) {
  const layout = buildMindmapLayout(mindmap)

  return (
    <div className="mindmap-canvas">
      <svg className="mindmap-canvas-svg" viewBox="0 0 960 540" aria-label="思维导图画布">
        {layout.nodes
          .filter((node) => node.parentId)
          .map((node) => {
            const parent = layout.nodes.find((candidate) => candidate.id === node.parentId)
            if (!parent) {
              return null
            }

            return (
              <line
                key={`${parent.id}-${node.id}`}
                x1={parent.x + 80}
                y1={parent.y}
                x2={node.x - 80}
                y2={node.y}
                className="mindmap-edge"
              />
            )
          })}
      </svg>
      <div className="mindmap-node-layer">
        {layout.nodes.map((node) => (
          <div
            key={node.id}
            className="mindmap-node-card"
            style={{ left: `${node.x}px`, top: `${node.y}px` }}
          >
            <input
              aria-label={`节点 ${node.id}`}
              value={node.text}
              onChange={(event) => onRenameNode(node.id, event.target.value)}
            />
            <div className="mindmap-node-actions">
              <button type="button" onClick={() => onAddChildNode(node.id)}>
                子级
              </button>
              <button type="button" onClick={() => onAddSiblingNode(node.id)}>
                同级
              </button>
              {node.parentId ? (
                <button type="button" onClick={() => onDeleteNode(node.id)}>
                  删除
                </button>
              ) : null}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
