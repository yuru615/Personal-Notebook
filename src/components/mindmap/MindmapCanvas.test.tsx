import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { MindmapCanvas } from './MindmapCanvas'
import { createEmptyMindmapRecord } from './mindmapModel'

describe('MindmapCanvas', () => {
  it('renders the root node input and node action buttons', () => {
    const mindmap = createEmptyMindmapRecord('2026-06-18T00:00:00.000Z')

    render(
      <MindmapCanvas
        mindmap={mindmap}
        onRenameNode={() => undefined}
        onAddChildNode={() => undefined}
        onAddSiblingNode={() => undefined}
        onDeleteNode={() => undefined}
      />,
    )

    expect(screen.getByLabelText(`节点 ${mindmap.rootNodeId}`)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '子级' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '同级' })).toBeInTheDocument()
  })

  it('forwards node actions', async () => {
    const user = userEvent.setup()
    const mindmap = createEmptyMindmapRecord('2026-06-18T00:00:00.000Z')
    const onAddChildNode = vi.fn()
    const onRenameNode = vi.fn()
    const onAddSiblingNode = vi.fn()

    render(
      <MindmapCanvas
        mindmap={mindmap}
        onRenameNode={onRenameNode}
        onAddChildNode={onAddChildNode}
        onAddSiblingNode={onAddSiblingNode}
        onDeleteNode={() => undefined}
      />,
    )

    fireEvent.change(screen.getByLabelText(`节点 ${mindmap.rootNodeId}`), {
      target: { value: '新主题' },
    })
    await user.click(screen.getByRole('button', { name: '子级' }))
    await user.click(screen.getByRole('button', { name: '同级' }))

    expect(onRenameNode).toHaveBeenLastCalledWith(mindmap.rootNodeId, '新主题')
    expect(onAddChildNode).toHaveBeenCalledWith(mindmap.rootNodeId)
    expect(onAddSiblingNode).toHaveBeenCalledWith(mindmap.rootNodeId)
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

    render(
      <MindmapCanvas
        mindmap={mindmap}
        onRenameNode={() => undefined}
        onAddChildNode={() => undefined}
        onAddSiblingNode={() => undefined}
        onDeleteNode={onDeleteNode}
      />,
    )

    const deleteButtons = screen.getAllByRole('button', { name: '删除' })
    expect(deleteButtons).toHaveLength(1)

    await user.click(deleteButtons[0])

    expect(onDeleteNode).toHaveBeenCalledWith(childId)
  })
})
