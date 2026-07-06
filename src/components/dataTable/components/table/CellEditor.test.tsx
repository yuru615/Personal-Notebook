import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { createProperty } from '../../domain/factory'
import type { DatabaseRecord } from '../../domain/types'
import CellEditor from './CellEditor'

const timestamp = '2026-07-05T00:00:00.000Z'

function createRecord(values: DatabaseRecord['values'] = {}): DatabaseRecord {
  return {
    id: 'record-1',
    title: 'Record 1',
    values,
    createdAt: timestamp,
    updatedAt: timestamp,
  }
}

describe('CellEditor creatable option interactions', () => {
  it('creates and selects a new single-select option on Enter', async () => {
    const user = userEvent.setup()
    const property = {
      ...createProperty({
        key: 'status',
        name: 'Status',
        type: 'select',
      }),
      config: {
        options: [{ id: 'status-open', label: 'Open', color: '#2563eb' }],
      },
    }
    const onChange = vi.fn()
    const onCreateOption = vi.fn()

    render(
      <CellEditor
        property={property}
        record={createRecord()}
        onChange={onChange}
        onCreateOption={onCreateOption}
      />,
    )

    await user.click(screen.getByRole('button', { name: 'Status-record-1' }))
    await user.type(
      screen.getByRole('textbox', { name: 'Status 选项输入' }),
      'Blocked{Enter}',
    )

    expect(onCreateOption).toHaveBeenCalledWith('Blocked')
    expect(onChange).toHaveBeenCalledWith('Blocked')
  })

  it('creates and appends a new multi-select option on Enter', async () => {
    const user = userEvent.setup()
    const property = {
      ...createProperty({
        key: 'tags',
        name: 'Tags',
        type: 'multiSelect',
      }),
      config: {
        options: [{ id: 'tag-alpha', label: 'Alpha', color: '#16a34a' }],
      },
    }
    const onChange = vi.fn()
    const onCreateOption = vi.fn()

    render(
      <CellEditor
        property={property}
        record={createRecord({ [property.id]: ['Alpha'] })}
        onChange={onChange}
        onCreateOption={onCreateOption}
      />,
    )

    await user.click(screen.getByRole('button', { name: 'Tags-record-1' }))
    await user.type(
      screen.getByRole('textbox', { name: 'Tags 选项输入' }),
      'Beta{Enter}',
    )

    expect(onCreateOption).toHaveBeenCalledWith('Beta')
    expect(onChange).toHaveBeenCalledWith(['Alpha', 'Beta'])
  })

  it('deletes an option without changing the cell value', async () => {
    const user = userEvent.setup()
    const property = {
      ...createProperty({
        key: 'status',
        name: 'Status',
        type: 'select',
      }),
      config: {
        options: [{ id: 'status-open', label: 'Open', color: '#2563eb' }],
      },
    }
    const onChange = vi.fn()
    const onCreateOption = vi.fn()
    const onDeleteOption = vi.fn()

    render(
      <CellEditor
        property={property}
        record={createRecord({ [property.id]: 'Open' })}
        onChange={onChange}
        onCreateOption={onCreateOption}
        onDeleteOption={onDeleteOption}
      />,
    )

    await user.click(screen.getByRole('button', { name: 'Status-record-1' }))
    await user.click(screen.getByRole('button', { name: '删除 Open' }))

    expect(onDeleteOption).toHaveBeenCalledWith('status-open')
    expect(onDeleteOption).toHaveBeenCalledTimes(1)
    expect(onChange).not.toHaveBeenCalled()
    expect(onCreateOption).not.toHaveBeenCalled()
  })
})
