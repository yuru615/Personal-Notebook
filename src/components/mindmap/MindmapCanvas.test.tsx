import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ComponentProps } from 'react'
import { describe, expect, it, vi } from 'vitest'
import type { MindmapRecord } from '../../domain/types'
import { MindmapCanvas } from './MindmapCanvas'
import { createEmptyMindmapRecord } from './mindmapModel'

function renderMindmapCanvas(
  mindmap: MindmapRecord,
  props: Partial<ComponentProps<typeof MindmapCanvas>> = {},
) {
  return render(
    <MindmapCanvas
      mindmap={mindmap}
      onRenameNode={() => undefined}
      onAddChildNode={() => undefined}
      onAddSiblingNode={() => undefined}
      onDeleteNode={() => undefined}
      onToggleNodeCollapsed={() => undefined}
      onChangeLayoutMode={() => undefined}
      {...props}
    />,
  )
}

describe('MindmapCanvas', () => {
  it('renders the root node input and node action buttons', () => {
    const mindmap = createEmptyMindmapRecord('2026-06-18T00:00:00.000Z')

    renderMindmapCanvas(mindmap)

    expect(screen.getByLabelText(`节点 ${mindmap.rootNodeId}`)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '子级' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '同级' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '左右导图' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '右侧导图' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '大纲导图' })).toBeInTheDocument()
  })

  it('forwards node actions', async () => {
    const user = userEvent.setup()
    const mindmap = createEmptyMindmapRecord('2026-06-18T00:00:00.000Z')
    const onAddChildNode = vi.fn()
    const onRenameNode = vi.fn()
    const onAddSiblingNode = vi.fn()

    renderMindmapCanvas(mindmap, {
      onRenameNode,
      onAddChildNode,
      onAddSiblingNode,
    })

    fireEvent.change(screen.getByLabelText(`节点 ${mindmap.rootNodeId}`), {
      target: { value: '新主题' },
    })
    await user.click(screen.getByRole('button', { name: '子级' }))
    await user.click(screen.getByRole('button', { name: '同级' }))

    expect(onRenameNode).toHaveBeenLastCalledWith(mindmap.rootNodeId, '新主题')
    expect(onAddChildNode).toHaveBeenCalledWith(mindmap.rootNodeId)
    expect(onAddSiblingNode).toHaveBeenCalledWith(mindmap.rootNodeId)
  })

  it('adds a sibling node from the focused node when pressing Enter', () => {
    const mindmap = createEmptyMindmapRecord('2026-06-18T00:00:00.000Z')
    const onAddChildNode = vi.fn()
    const onAddSiblingNode = vi.fn()

    renderMindmapCanvas(mindmap, {
      onAddChildNode,
      onAddSiblingNode,
    })

    fireEvent.keyDown(screen.getByRole('textbox'), {
      key: 'Enter',
    })

    expect(onAddSiblingNode).toHaveBeenCalledWith(mindmap.rootNodeId)
    expect(onAddChildNode).not.toHaveBeenCalled()
  })

  it('adds a child node from the focused node when pressing Tab', () => {
    const mindmap = createEmptyMindmapRecord('2026-06-18T00:00:00.000Z')
    const onAddChildNode = vi.fn()

    renderMindmapCanvas(mindmap, { onAddChildNode })

    fireEvent.keyDown(screen.getByRole('textbox'), {
      key: 'Tab',
    })

    expect(onAddChildNode).toHaveBeenCalledWith(mindmap.rootNodeId)
  })

  it('deletes a non-root focused node when pressing Delete', () => {
    const base = createEmptyMindmapRecord('2026-06-18T00:00:00.000Z')
    const childId = 'mindmap-node-child'
    const mindmap = {
      ...base,
      nodes: {
        ...base.nodes,
        [childId]: {
          id: childId,
          parentId: base.rootNodeId,
          text: '分支',
          order: 0,
        },
      },
    }
    const onDeleteNode = vi.fn()

    renderMindmapCanvas(mindmap, { onDeleteNode })

    fireEvent.keyDown(screen.getByLabelText(`节点 ${childId}`), {
      key: 'Delete',
    })

    expect(onDeleteNode).toHaveBeenCalledWith(childId)
  })

  it('does not delete the root node when pressing Delete', () => {
    const mindmap = createEmptyMindmapRecord('2026-06-18T00:00:00.000Z')
    const onDeleteNode = vi.fn()

    renderMindmapCanvas(mindmap, { onDeleteNode })

    fireEvent.keyDown(screen.getByRole('textbox'), {
      key: 'Delete',
    })

    expect(onDeleteNode).not.toHaveBeenCalled()
  })

  it('shows delete action for child nodes and forwards the delete callback', async () => {
    const user = userEvent.setup()
    const base = createEmptyMindmapRecord('2026-06-18T00:00:00.000Z')
    const childId = 'mindmap-node-child'
    const mindmap = {
      ...base,
      nodes: {
        ...base.nodes,
        [childId]: {
          id: childId,
          parentId: base.rootNodeId,
          text: '分支',
          order: 0,
        },
      },
    }
    const onDeleteNode = vi.fn()

    renderMindmapCanvas(mindmap, { onDeleteNode })

    const deleteButtons = screen.getAllByRole('button', { name: '删除' })
    expect(deleteButtons).toHaveLength(1)

    await user.click(deleteButtons[0])

    expect(onDeleteNode).toHaveBeenCalledWith(childId)
  })

  it('forwards outline layout mode changes', async () => {
    const user = userEvent.setup()
    const mindmap = createEmptyMindmapRecord('2026-06-18T00:00:00.000Z')
    const onChangeLayoutMode = vi.fn()

    renderMindmapCanvas(mindmap, { onChangeLayoutMode })

    await user.click(screen.getByRole('button', { name: '大纲导图' }))

    expect(onChangeLayoutMode).toHaveBeenCalledWith('outline')
  })

  it('shows collapse and expand actions for non-root nodes', async () => {
    const user = userEvent.setup()
    const base = createEmptyMindmapRecord('2026-06-18T00:00:00.000Z')
    const childId = 'mindmap-node-child'
    const onToggleNodeCollapsed = vi.fn()
    const expandedMindmap = {
      ...base,
      nodes: {
        ...base.nodes,
        [childId]: {
          id: childId,
          parentId: base.rootNodeId,
          text: '分支',
          order: 0,
        },
      },
    }
    const { rerender } = renderMindmapCanvas(expandedMindmap, { onToggleNodeCollapsed })

    await user.click(screen.getByRole('button', { name: '折叠' }))

    expect(onToggleNodeCollapsed).toHaveBeenCalledWith(childId)

    rerender(
      <MindmapCanvas
        mindmap={{
          ...expandedMindmap,
          nodes: {
            ...expandedMindmap.nodes,
            [childId]: {
              ...expandedMindmap.nodes[childId],
              collapsed: true,
            },
          },
        }}
        onRenameNode={() => undefined}
        onAddChildNode={() => undefined}
        onAddSiblingNode={() => undefined}
        onDeleteNode={() => undefined}
        onToggleNodeCollapsed={onToggleNodeCollapsed}
        onChangeLayoutMode={() => undefined}
      />,
    )

    await user.click(screen.getByRole('button', { name: '展开' }))

    expect(onToggleNodeCollapsed).toHaveBeenLastCalledWith(childId)
  })

  it('marks a focused node as selected', () => {
    const mindmap = createEmptyMindmapRecord('2026-06-18T00:00:00.000Z')

    const { container } = renderMindmapCanvas(mindmap)

    fireEvent.focus(screen.getByRole('textbox'))

    expect(container.querySelector('.mindmap-node-card-selected')).toBeInTheDocument()
  })

  it('uses layout dimensions for the canvas viewport and node layer', () => {
    const mindmap = createEmptyMindmapRecord('2026-06-18T00:00:00.000Z')
    const { container } = renderMindmapCanvas(mindmap)

    expect(screen.getByLabelText('思维导图画布')).toHaveAttribute('viewBox', '0 0 960 540')
    expect(container.querySelector('.mindmap-node-layer')).toHaveStyle({
      width: '960px',
      height: '540px',
    })
  })
})
