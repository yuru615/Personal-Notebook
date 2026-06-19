import { createEvent, fireEvent, render, screen } from '@testing-library/react'
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

function createMindmapWithChild(collapsed = false): MindmapRecord {
  const base = createEmptyMindmapRecord('2026-06-18T00:00:00.000Z')
  const childId = 'mindmap-node-child'

  return {
    ...base,
    nodes: {
      ...base.nodes,
      [childId]: {
        id: childId,
        parentId: base.rootNodeId,
        text: '分支',
        order: 0,
        collapsed,
      },
    },
  }
}

function fireComposingKeyDown(element: HTMLElement, key: string) {
  const event = createEvent.keyDown(element, { key })
  Object.defineProperty(event, 'isComposing', { value: true })
  fireEvent(element, event)
}

describe('MindmapCanvas', () => {
  it('renders the root node input and node action buttons', () => {
    const mindmap = createEmptyMindmapRecord('2026-06-18T00:00:00.000Z')

    renderMindmapCanvas(mindmap)

    expect(screen.getByLabelText(`节点 ${mindmap.rootNodeId}`)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '子级' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '同级' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '左右导图' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '右侧导图' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '大纲导图' })).toBeInTheDocument()
  })

  it('keeps the layout toolbar outside the positioned canvas surface', () => {
    const mindmap = createEmptyMindmapRecord('2026-06-18T00:00:00.000Z')
    const { container } = renderMindmapCanvas(mindmap)
    const workspace = container.querySelector('.mindmap-workspace')
    const canvas = container.querySelector('.mindmap-canvas')
    const toolbar = container.querySelector('.mindmap-layout-toolbar')
    const nodeLayer = container.querySelector('.mindmap-node-layer')

    expect(workspace).toContainElement(toolbar)
    expect(workspace).toContainElement(canvas)
    expect(canvas).toContainElement(nodeLayer)
    expect(canvas).not.toContainElement(toolbar)
    expect(toolbar?.parentElement).toBe(workspace)
    expect(nodeLayer?.parentElement).toBe(canvas)
  })

  it('forwards node actions', async () => {
    const user = userEvent.setup()
    const mindmap = createMindmapWithChild()
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
    await user.click(screen.getAllByRole('button', { name: '子级' })[0])
    await user.click(screen.getByRole('button', { name: '同级' }))

    expect(onRenameNode).toHaveBeenLastCalledWith(mindmap.rootNodeId, '新主题')
    expect(onAddChildNode).toHaveBeenCalledWith(mindmap.rootNodeId)
    expect(onAddSiblingNode).toHaveBeenCalledWith('mindmap-node-child')
  })

  it('adds a child node from the root node when pressing Enter', () => {
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

    expect(onAddChildNode).toHaveBeenCalledWith(mindmap.rootNodeId)
    expect(onAddSiblingNode).not.toHaveBeenCalled()
  })

  it('adds a sibling node from a non-root focused node when pressing Enter', () => {
    const mindmap = createMindmapWithChild()
    const onAddChildNode = vi.fn()
    const onAddSiblingNode = vi.fn()

    renderMindmapCanvas(mindmap, {
      onAddChildNode,
      onAddSiblingNode,
    })

    fireEvent.keyDown(screen.getByLabelText('节点 mindmap-node-child'), {
      key: 'Enter',
    })

    expect(onAddSiblingNode).toHaveBeenCalledWith('mindmap-node-child')
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

  it('does not delete a non-root focused node when pressing Delete inside the input', () => {
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

    expect(onDeleteNode).not.toHaveBeenCalled()
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

  it('forwards all layout toolbar mode changes', async () => {
    const user = userEvent.setup()
    const mindmap = createEmptyMindmapRecord('2026-06-18T00:00:00.000Z')
    const onChangeLayoutMode = vi.fn()

    renderMindmapCanvas(mindmap, { onChangeLayoutMode })

    await user.click(screen.getByRole('button', { name: '左右导图' }))
    await user.click(screen.getByRole('button', { name: '右侧导图' }))
    await user.click(screen.getByRole('button', { name: '大纲导图' }))

    expect(onChangeLayoutMode).toHaveBeenNthCalledWith(1, 'balanced')
    expect(onChangeLayoutMode).toHaveBeenNthCalledWith(2, 'right')
    expect(onChangeLayoutMode).toHaveBeenNthCalledWith(3, 'outline')
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

  it('marks a node as selected on mouse down', () => {
    const mindmap = createMindmapWithChild()
    const { container } = renderMindmapCanvas(mindmap)
    const childInput = screen.getByLabelText('节点 mindmap-node-child')
    const childCard = childInput.closest('.mindmap-node-card')

    if (!childCard) {
      throw new Error('Expected child node card')
    }

    fireEvent.mouseDown(childCard)

    expect(childCard).toHaveClass('mindmap-node-card-selected')
    expect(container.querySelectorAll('.mindmap-node-card-selected')).toHaveLength(1)
  })

  it('uses layout dimensions for the canvas viewport and node layer', () => {
    const mindmap = createEmptyMindmapRecord('2026-06-18T00:00:00.000Z')
    const { container } = renderMindmapCanvas(mindmap)
    const viewBox = screen.getByLabelText('思维导图画布').getAttribute('viewBox')
    const [, , width, height] = viewBox?.split(' ').map(Number) ?? []

    expect(width).toBeGreaterThan(0)
    expect(height).toBeGreaterThan(0)
    expect(container.querySelector('.mindmap-node-layer')).toHaveStyle({
      width: `${width}px`,
      height: `${height}px`,
    })
  })

  it('uses expanded layout dimensions when nodes exceed the default canvas bounds', () => {
    const base = createEmptyMindmapRecord('2026-06-18T00:00:00.000Z')
    const nodes = { ...base.nodes }
    let parentId = base.rootNodeId

    Array.from({ length: 6 }).forEach((_, index) => {
      const nodeId = `mindmap-node-deep-${index}`
      nodes[nodeId] = {
        id: nodeId,
        parentId,
        text: `深层 ${index}`,
        order: 0,
      }
      parentId = nodeId
    })

    const mindmap = {
      ...base,
      layoutMode: 'right' as const,
      nodes,
    }
    const { container } = renderMindmapCanvas(mindmap)
    const viewBox = screen.getByLabelText('思维导图画布').getAttribute('viewBox')
    const [, , width, height] = viewBox?.split(' ').map(Number) ?? []

    expect(width).toBeGreaterThan(960)
    expect(height).toBeGreaterThan(540)
    expect(container.querySelector('.mindmap-node-layer')).toHaveStyle({
      width: `${width}px`,
      height: `${height}px`,
    })
  })

  it('renders parent child edges as curved svg paths', () => {
    const mindmap = createMindmapWithChild()
    const { container } = renderMindmapCanvas(mindmap)
    const edge = container.querySelector('path.mindmap-edge')

    expect(edge).toBeInTheDocument()
    expect(edge).toHaveAttribute('d', expect.stringContaining(' C '))
  })

  it('suppresses Enter Tab and Delete shortcuts during composition', () => {
    const mindmap = createMindmapWithChild()
    const onAddChildNode = vi.fn()
    const onAddSiblingNode = vi.fn()
    const onDeleteNode = vi.fn()

    renderMindmapCanvas(mindmap, {
      onAddChildNode,
      onAddSiblingNode,
      onDeleteNode,
    })

    const childInput = screen.getByLabelText('节点 mindmap-node-child')

    fireComposingKeyDown(childInput, 'Enter')
    fireComposingKeyDown(childInput, 'Tab')
    fireComposingKeyDown(childInput, 'Delete')

    expect(onAddSiblingNode).not.toHaveBeenCalled()
    expect(onAddChildNode).not.toHaveBeenCalled()
    expect(onDeleteNode).not.toHaveBeenCalled()
  })
})
