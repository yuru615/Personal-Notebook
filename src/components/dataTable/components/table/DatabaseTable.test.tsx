import { fireEvent, render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { createDefaultAppState } from '../../domain/factory'
import type { Property } from '../../domain/types'
import DatabaseTable from './DatabaseTable'

const timestamp = '2026-06-24T00:00:00.000Z'

const textProperty: Property = {
  id: 'property-text',
  key: 'text',
  name: '新属性',
  type: 'text',
  config: {},
  createdAt: timestamp,
  updatedAt: timestamp,
}

function renderDatabaseTable(onToggleColumnMenu = vi.fn()) {
  const state = createDefaultAppState()

  return {
    onToggleColumnMenu,
    ...render(
      <DatabaseTable
        state={state}
        properties={[textProperty]}
        records={[]}
        onToggleColumnMenu={onToggleColumnMenu}
        onColumnWidthChange={vi.fn()}
        onCellChange={vi.fn()}
      />,
    ),
  }
}

describe('DatabaseTable column resize interactions', () => {
  it('opens the column menu from the trigger during a normal click', () => {
    const { container, onToggleColumnMenu } = renderDatabaseTable()
    const trigger = container.querySelector(
      '.database-column-menu-trigger',
    ) as HTMLButtonElement

    fireEvent.click(trigger)

    expect(onToggleColumnMenu).toHaveBeenCalledWith(textProperty.id)
  })

  it('does not open the column menu from the release click after resizing', () => {
    const { container, onToggleColumnMenu } = renderDatabaseTable()
    const handle = container.querySelector(
      '.database-column-resize-handle',
    ) as HTMLButtonElement
    const trigger = container.querySelector(
      '.database-column-menu-trigger',
    ) as HTMLButtonElement

    fireEvent.mouseDown(handle, { clientX: 200 })
    fireEvent.mouseMove(window, { clientX: 240 })
    fireEvent.mouseUp(window)
    fireEvent.click(trigger)

    expect(onToggleColumnMenu).not.toHaveBeenCalled()
  })
})
