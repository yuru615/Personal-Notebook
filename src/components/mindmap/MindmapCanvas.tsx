import clsx from 'clsx'
import { useMemo, useState } from 'react'
import type { MindmapLayoutMode, MindmapRecord } from '../../domain/types'
import { AutoGrowTextarea } from '../editor/AutoGrowTextarea'
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
  const nodesById = useMemo(() => new Map(layout.nodes.map((node) => [node.id, node])), [layout.nodes])

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
      <div className="mindmap-canvas" onMouseDown={() => setSelectedNodeId(null)}>
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

            return (
              <path
                key={edge.id}
                d={buildMindmapEdgePath(from, to)}
                className={clsx(
                  'mindmap-edge',
                  selectedNodeId && (edge.from === selectedNodeId || edge.to === selectedNodeId)
                    ? 'mindmap-edge-active'
                    : undefined,
                )}
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
            const isSelected = selectedNodeId === node.id
            const hasChildren = Object.values(mindmap.nodes).some((item) => item.parentId === node.id)
            const isCollapsed = mindmap.nodes[node.id]?.collapsed === true

            return (
              <div
                key={node.id}
                className={clsx('mindmap-node', isRoot && 'mindmap-node-root', isSelected && 'mindmap-node-selected')}
                style={{ left: `${node.x}px`, top: `${node.y}px` }}
                onMouseDown={(event) => {
                  event.stopPropagation()
                  setSelectedNodeId(node.id)
                }}
              >
                <AutoGrowTextarea
                  minRows={1}
                  aria-label={`节点 ${node.id}`}
                  className="mindmap-node-input"
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
                    }
                  }}
                />
                {isSelected ? (
                  <div className="mindmap-node-toolbar" onMouseDown={(event) => event.stopPropagation()}>
                    <button
                      type="button"
                      className="mindmap-node-tool"
                      aria-label="新增子级"
                      title="新增子级"
                      onClick={() => onAddChildNode(node.id)}
                    >
                      <PlusIcon />
                    </button>
                    {!isRoot ? (
                      <button
                        type="button"
                        className="mindmap-node-tool"
                        aria-label="新增同级"
                        title="新增同级"
                        onClick={() => onAddSiblingNode(node.id)}
                      >
                        <SiblingPlusIcon />
                      </button>
                    ) : null}
                    {hasChildren ? (
                      <button
                        type="button"
                        className="mindmap-node-tool"
                        aria-label={isCollapsed ? '展开节点' : '折叠节点'}
                        title={isCollapsed ? '展开节点' : '折叠节点'}
                        onClick={() => onToggleNodeCollapsed(node.id)}
                      >
                        {isCollapsed ? <ExpandIcon /> : <CollapseIcon />}
                      </button>
                    ) : null}
                    {!isRoot ? (
                      <button
                        type="button"
                        className="mindmap-node-tool mindmap-node-tool-danger"
                        aria-label="删除节点"
                        title="删除节点"
                        onClick={() => onDeleteNode(node.id)}
                      >
                        <TrashIcon />
                      </button>
                    ) : null}
                  </div>
                ) : null}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function buildMindmapEdgePath(
  from: { x: number; y: number },
  to: { x: number; y: number },
) {
  const direction = to.x >= from.x ? 1 : -1
  const fromX = from.x + direction * 88
  const toX = to.x - direction * 88
  const curveOffset = Math.max(44, Math.min(96, Math.abs(to.x - from.x) * 0.35))
  const controlX1 = fromX + direction * curveOffset
  const controlX2 = toX - direction * curveOffset

  return `M ${fromX} ${from.y} C ${controlX1} ${from.y}, ${controlX2} ${to.y}, ${toX} ${to.y}`
}

function PlusIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true">
      <path d="M10 4.5v11M4.5 10h11" />
    </svg>
  )
}

function SiblingPlusIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true">
      <path d="M5 6.5h6M5 10h6M5 13.5h6M14 8v6M11 11h6" />
    </svg>
  )
}

function CollapseIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true">
      <path d="M5.5 8.5 10 13l4.5-4.5" />
    </svg>
  )
}

function ExpandIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true">
      <path d="M5.5 11.5 10 7l4.5 4.5" />
    </svg>
  )
}

function TrashIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true">
      <path d="M7.5 5.5h5M6.5 7.5v6m3-6v6m3-6v6M6 5.5l.5 9h7l.5-9M8 5.5l.5-1.5h3L12 5.5" />
    </svg>
  )
}
