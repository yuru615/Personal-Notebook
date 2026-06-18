import { render, screen } from '@testing-library/react'
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

    render(
      <MindmapCanvas
        mindmap={mindmap}
        onRenameNode={() => undefined}
        onAddChildNode={onAddChildNode}
        onAddSiblingNode={() => undefined}
        onDeleteNode={() => undefined}
      />,
    )

    await user.click(screen.getByRole('button', { name: '子级' }))

    expect(onAddChildNode).toHaveBeenCalledWith(mindmap.rootNodeId)
  })
})
