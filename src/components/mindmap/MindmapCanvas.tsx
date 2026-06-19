import { useState } from 'react'
import type { MindmapLayoutMode, MindmapRecord } from '../../domain/types'
import { buildMindmapLayout } from './mindmapLayout'

interface MindmapCanvasProps {
  mindmap: MindmapRecord
  onRenameNode: (nodeId: string, text: string) => void
  onAddChildNode: (nodeId: string) => void
  onAddSiblingNode: (nodeId: string) => void
  onDeleteNode: (nodeId: string) => void
  onToggleNodeCollapsed: (nodeId: string) => void
  onChangeLayoutMode: (layoutMode: MindmapLayoutMode) => void
}

export function MindmapCanvas({
  mindmap,
  onRenameNode,
  onAddChildNode,
  onAddSiblingNode,
  onDeleteNode,
  onToggleNodeCollapsed,
  onChangeLayoutMode,
}: MindmapCanvasProps) {
  const layout = buildMindmapLayout(mindmap)
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const nodesById = new Map(layout.nodes.map((node) => [node.id, node]))

  return (
    <div className="mindmap-workspace">
      <div className="mindmap-layout-toolbar" aria-label="导图布局">
        <button
          type="button"
          className={mindmap.layoutMode === 'balanced' ? 'mindmap-layout-button-active' : undefined}
          onClick={() => onChangeLayoutMode('balanced')}
        >
          左右导图
        </button>
        <button
          type="button"
          className={mindmap.layoutMode === 'right' ? 'mindmap-layout-button-active' : undefined}
          onClick={() => onChangeLayoutMode('right')}
        >
          右侧导图
        </button>
        <button
          type="button"
          className={mindmap.layoutMode === 'outline' ? 'mindmap-layout-button-active' : undefined}
          onClick={() => onChangeLayoutMode('outline')}
        >
          大纲导图
        </button>
      </div>
      <div className="mindmap-canvas">
        <svg
          className="mindmap-canvas-svg"
          viewBox={`0 0 ${layout.width} ${layout.height}`}
          width={layout.width}
          height={layout.height}
          aria-label="思维导图画布"
        >
          {layout.edges.map((edge) => {
            const from = nodesById.get(edge.from)
            const to = nodesById.get(edge.to)
            if (!from || !to) {
              return null
            }
            const midX = from.x + (to.x - from.x) / 2

            return (
              <path
                key={edge.id}
                d={`M ${from.x} ${from.y} C ${midX} ${from.y}, ${midX} ${to.y}, ${to.x} ${to.y}`}
                className="mindmap-edge"
              />
            )
          })}
        </svg>
        <div
          className="mindmap-node-layer"
          style={{ width: `${layout.width}px`, height: `${layout.height}px` }}
        >
          {layout.nodes.map((node) => {
            const isRoot = node.id === mindmap.rootNodeId
            const isCollapsed = mindmap.nodes[node.id]?.collapsed === true

            return (
              <div
                key={node.id}
                className={[
                  'mindmap-node-card',
                  selectedNodeId === node.id ? 'mindmap-node-card-selected' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                style={{ left: `${node.x}px`, top: `${node.y}px` }}
                onMouseDown={() => setSelectedNodeId(node.id)}
              >
                <input
                  aria-label={`节点 ${node.id}`}
                  value={node.text}
                  onFocus={() => setSelectedNodeId(node.id)}
                  onChange={(event) => onRenameNode(node.id, event.target.value)}
                  onKeyDown={(event) => {
                    if (event.nativeEvent.isComposing) {
                      return
                    }

                    if (event.key === 'Enter') {
                      event.preventDefault()
                      if (isRoot) {
                        onAddChildNode(node.id)
                      } else {
                        onAddSiblingNode(node.id)
                      }
                      return
                    }

                    if (event.key === 'Tab') {
                      event.preventDefault()
                      onAddChildNode(node.id)
                      return
                    }

                  }}
                />
                <div className="mindmap-node-actions">
                  <button type="button" onClick={() => onAddChildNode(node.id)}>
                    子级
                  </button>
                  {!isRoot ? (
                    <>
                      <button type="button" onClick={() => onAddSiblingNode(node.id)}>
                        同级
                      </button>
                      <button type="button" onClick={() => onToggleNodeCollapsed(node.id)}>
                        {isCollapsed ? '展开' : '折叠'}
                      </button>
                      <button type="button" onClick={() => onDeleteNode(node.id)}>
                        删除
                      </button>
                    </>
                  ) : null}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
