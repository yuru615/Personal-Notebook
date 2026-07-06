import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { uiCopy } from '../../ui/copy'
import { PagePropertiesPanel } from './PagePropertiesPanel'

beforeEach(() => {
  vi.restoreAllMocks()
  vi.spyOn(window, 'prompt').mockImplementation(() => null)
})

describe('PagePropertiesPanel', () => {
  it('renders compact property rows', () => {
    render(
      <PagePropertiesPanel
        definitions={[
          {
            id: 'prop_tags',
            key: 'tags',
            name: 'Tags',
            type: 'multiSelect',
            config: {},
            createdAt: '',
            updatedAt: '',
          },
          {
            id: 'prop_status',
            key: 'status',
            name: 'Status',
            type: 'select',
            config: {},
            createdAt: '',
            updatedAt: '',
          },
        ]}
        values={{
          prop_tags: ['Product'],
          prop_status: 'Doing',
        }}
        onSetValue={vi.fn()}
        onAddDefaultProperty={vi.fn()}
      />,
    )

    expect(screen.getByText('Tags')).toBeInTheDocument()
    expect(screen.getByText('Status')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Product' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Doing' })).toBeInTheDocument()
  })

  it('renders status and tags as colored chips inside the value trigger', () => {
    render(
      <PagePropertiesPanel
        definitions={[
          {
            id: 'prop_tags',
            key: 'tags',
            name: 'Tags',
            type: 'multiSelect',
            config: {
              options: [
                { id: 'alpha', label: 'Alpha', color: '#2563eb' },
                { id: 'beta', label: 'Beta', color: '#16a34a' },
              ],
            },
            createdAt: '',
            updatedAt: '',
          },
          {
            id: 'prop_status',
            key: 'status',
            name: 'Status',
            type: 'select',
            config: {
              options: [{ id: 'doing', label: 'Doing', color: '#f59e0b' }],
            },
            createdAt: '',
            updatedAt: '',
          },
        ]}
        values={{
          prop_tags: ['Alpha', 'Beta'],
          prop_status: 'Doing',
        }}
        onSetValue={vi.fn()}
        onAddDefaultProperty={vi.fn()}
      />,
    )

    const tagsButton = screen.getByRole('button', { name: 'Alpha / Beta' })
    const statusButton = screen.getByRole('button', { name: 'Doing' })
    const tagChips = tagsButton.querySelectorAll('.cell-option-chip')
    const statusChip = statusButton.querySelector('.cell-option-chip')

    expect(tagsButton.querySelector('.cell-option-chip-list')).toBeInTheDocument()
    expect(tagChips).toHaveLength(2)
    expect(Array.from(tagChips).map((chip) => chip.textContent)).toEqual(['Alpha', 'Beta'])
    expect(tagChips[0]?.getAttribute('style')).toContain('background-color')
    expect(statusChip).toBeInTheDocument()
    expect(statusChip?.textContent).toBe('Doing')
    expect(statusChip?.getAttribute('style')).toContain('background-color')
  })

  it('edits a text property inline and saves on Enter', async () => {
    const user = userEvent.setup()
    const onSetValue = vi.fn()

    render(
      <PagePropertiesPanel
        definitions={[
          {
            id: 'prop_notes',
            key: 'notes',
            name: 'Notes',
            type: 'text',
            config: {},
            createdAt: '',
            updatedAt: '',
          },
        ]}
        values={{
          prop_notes: 'Old note',
        }}
        onSetValue={onSetValue}
        onAddDefaultProperty={vi.fn()}
      />,
    )

    await user.click(screen.getByRole('button', { name: 'Old note' }))

    const input = screen.getByDisplayValue('Old note')
    await user.clear(input)
    await user.type(input, 'Fresh note{Enter}')

    expect(onSetValue).toHaveBeenCalledWith('prop_notes', 'Fresh note')
  })

  it('cancels inline text editing on Escape', async () => {
    const user = userEvent.setup()
    const onSetValue = vi.fn()

    render(
      <PagePropertiesPanel
        definitions={[
          {
            id: 'prop_notes',
            key: 'notes',
            name: 'Notes',
            type: 'text',
            config: {},
            createdAt: '',
            updatedAt: '',
          },
        ]}
        values={{
          prop_notes: 'Old note',
        }}
        onSetValue={onSetValue}
        onAddDefaultProperty={vi.fn()}
      />,
    )

    await user.click(screen.getByRole('button', { name: 'Old note' }))

    const input = screen.getByDisplayValue('Old note')
    await user.clear(input)
    await user.type(input, 'Discard me')
    await user.keyboard('{Escape}')

    expect(onSetValue).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Old note' })).toBeInTheDocument()
  })

  it('creates a multi-select option on Enter and appends it to the current value', async () => {
    const user = userEvent.setup()
    const onSetValue = vi.fn()
    const onSetOptions = vi.fn()

    render(
      <PagePropertiesPanel
        definitions={[
          {
            id: 'prop_tags',
            key: 'tags',
            name: 'Tags',
            type: 'multiSelect',
            config: {
              options: [{ id: 'alpha', label: 'Alpha', color: 'blue' }],
            },
            createdAt: '',
            updatedAt: '',
          },
        ]}
        values={{
          prop_tags: ['Alpha'],
        }}
        onSetValue={onSetValue}
        onSetOptions={onSetOptions}
        onAddDefaultProperty={vi.fn()}
      />,
    )

    await user.click(screen.getByRole('button', { name: 'Alpha' }))

    const input = screen.getByRole('textbox')
    await user.type(input, 'Beta{Enter}')

    expect(onSetOptions).toHaveBeenCalledWith('prop_tags', [
      { id: 'alpha', label: 'Alpha', color: 'blue' },
      expect.objectContaining({
        id: expect.stringMatching(/^page_property_option_/),
        label: 'Beta',
        color: '#475569',
      }),
    ])
    expect(onSetValue).toHaveBeenCalledWith('prop_tags', ['Alpha', 'Beta'])
    expect(screen.getByRole('textbox')).toBeInTheDocument()
  })

  it('keeps the date trigger visible while opening the shared calendar popover', async () => {
    const user = userEvent.setup()

    render(
      <PagePropertiesPanel
        definitions={[
          {
            id: 'prop_date',
            key: 'date',
            name: 'Date',
            type: 'date',
            config: {},
            createdAt: '',
            updatedAt: '',
          },
        ]}
        values={{
          prop_date: '2026-07-05',
        }}
        onSetValue={vi.fn()}
        onAddDefaultProperty={vi.fn()}
      />,
    )

    await user.click(screen.getByRole('button', { name: '2026-07-05' }))

    const row = screen.getByText('Date').closest('.page-property-row')
    expect(row).not.toBeNull()
    expect(within(row as HTMLElement).queryByRole('dialog', { name: 'Date 日期' })).toBeNull()
    expect(screen.getAllByRole('button', { name: '2026-07-05' })).toHaveLength(2)
    expect(screen.getByRole('dialog', { name: 'Date 日期' })).toBeInTheDocument()
  })

  it('edits a date property with the shared calendar picker', async () => {
    const user = userEvent.setup()
    const onSetValue = vi.fn()

    render(
      <PagePropertiesPanel
        definitions={[
          {
            id: 'prop_date',
            key: 'date',
            name: 'Date',
            type: 'date',
            config: {},
            createdAt: '',
            updatedAt: '',
          },
        ]}
        values={{
          prop_date: '2026-07-05',
        }}
        onSetValue={onSetValue}
        onAddDefaultProperty={vi.fn()}
      />,
    )

    await user.click(screen.getByRole('button', { name: '2026-07-05' }))

    expect(screen.getByRole('dialog', { name: 'Date 日期' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '2026-07-20' }))

    expect(onSetValue).toHaveBeenCalledWith('prop_date', '2026-07-20')
  })

  it('can clear a date property back to null from the shared calendar picker', async () => {
    const user = userEvent.setup()
    const onSetValue = vi.fn()

    render(
      <PagePropertiesPanel
        definitions={[
          {
            id: 'prop_date',
            key: 'date',
            name: 'Date',
            type: 'date',
            config: {},
            createdAt: '',
            updatedAt: '',
          },
        ]}
        values={{
          prop_date: '2026-07-05',
        }}
        onSetValue={onSetValue}
        onAddDefaultProperty={vi.fn()}
      />,
    )

    await user.click(screen.getByRole('button', { name: '2026-07-05' }))
    expect(screen.getByRole('dialog', { name: 'Date 日期' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: uiCopy.pageProperties.clearDate }))

    expect(onSetValue).toHaveBeenCalledWith('prop_date', null)
  })

  it('keeps the select trigger visible while opening the shared option popover', async () => {
    const user = userEvent.setup()

    render(
      <PagePropertiesPanel
        definitions={[
          {
            id: 'prop_status',
            key: 'status',
            name: 'Status',
            type: 'select',
            config: {
              options: [{ id: 'todo', label: 'Todo', color: 'gray' }],
            },
            createdAt: '',
            updatedAt: '',
          },
        ]}
        values={{
          prop_status: null,
        }}
        onSetValue={vi.fn()}
        onAddDefaultProperty={vi.fn()}
      />,
    )

    await user.click(screen.getByRole('button', { name: uiCopy.pageProperties.emptyValue }))

    const row = screen.getByText('Status').closest('.page-property-row')
    expect(row).not.toBeNull()
    expect(
      within(row as HTMLElement).getByRole('button', { name: uiCopy.pageProperties.emptyValue }),
    ).toBeInTheDocument()
    expect(screen.getByRole('dialog', { name: 'Status 选项' })).toBeInTheDocument()
  })

  it('creates a single-select option on Enter, selects it, and closes the picker', async () => {
    const user = userEvent.setup()
    const onSetValue = vi.fn()
    const onSetOptions = vi.fn()

    render(
      <PagePropertiesPanel
        definitions={[
          {
            id: 'prop_status',
            key: 'status',
            name: 'Status',
            type: 'select',
            config: {
              options: [{ id: 'todo', label: 'Todo', color: 'gray' }],
            },
            createdAt: '',
            updatedAt: '',
          },
        ]}
        values={{
          prop_status: null,
        }}
        onSetValue={onSetValue}
        onSetOptions={onSetOptions}
        onAddDefaultProperty={vi.fn()}
      />,
    )

    await user.click(screen.getByRole('button', { name: uiCopy.pageProperties.emptyValue }))

    const input = screen.getByRole('textbox')
    await user.type(input, 'Blocked{Enter}')

    expect(onSetOptions).toHaveBeenCalledWith('prop_status', [
      { id: 'todo', label: 'Todo', color: 'gray' },
      expect.objectContaining({
        id: expect.stringMatching(/^page_property_option_/),
        label: 'Blocked',
        color: '#475569',
      }),
    ])
    expect(onSetValue).toHaveBeenCalledWith('prop_status', 'Blocked')
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
  })

  it('deletes an existing option from the shared picker without writing a page value directly', async () => {
    const user = userEvent.setup()
    const onSetOptions = vi.fn()
    const onSetValue = vi.fn()

    render(
      <PagePropertiesPanel
        definitions={[
          {
            id: 'prop_status',
            key: 'status',
            name: 'Status',
            type: 'select',
            config: {
              options: [
                { id: 'todo', label: 'Todo', color: 'gray' },
                { id: 'doing', label: 'Doing', color: 'blue' },
              ],
            },
            createdAt: '',
            updatedAt: '',
          },
        ]}
        values={{
          prop_status: 'Doing',
        }}
        onSetValue={onSetValue}
        onSetOptions={onSetOptions}
        onAddDefaultProperty={vi.fn()}
      />,
    )

    await user.click(screen.getByRole('button', { name: 'Doing' }))
    await user.click(screen.getByRole('button', { name: '删除 Doing' }))

    expect(onSetOptions).toHaveBeenCalledWith('prop_status', [
      { id: 'todo', label: 'Todo', color: 'gray' },
    ])
    expect(onSetValue).not.toHaveBeenCalled()
  })

  it('does not write a created select value when onSetOptions is missing', async () => {
    const user = userEvent.setup()
    const onSetValue = vi.fn()

    render(
      <PagePropertiesPanel
        definitions={[
          {
            id: 'prop_status',
            key: 'status',
            name: 'Status',
            type: 'select',
            config: {
              options: [{ id: 'todo', label: 'Todo', color: 'gray' }],
            },
            createdAt: '',
            updatedAt: '',
          },
        ]}
        values={{
          prop_status: null,
        }}
        onSetValue={onSetValue}
        onAddDefaultProperty={vi.fn()}
      />,
    )

    await user.click(screen.getByRole('button', { name: uiCopy.pageProperties.emptyValue }))
    await user.type(screen.getByRole('textbox'), 'Blocked{Enter}')

    expect(onSetValue).not.toHaveBeenCalled()
    expect(screen.getByRole('textbox')).toBeInTheDocument()
  })

  it('selects an existing status through the shared picker', async () => {
    const user = userEvent.setup()
    const onSetValue = vi.fn()
    const onAddDefaultProperty = vi.fn()

    render(
      <PagePropertiesPanel
        definitions={[
          {
            id: 'prop_tags',
            key: 'tags',
            name: 'Tags',
            type: 'multiSelect',
            config: {},
            createdAt: '',
            updatedAt: '',
          },
          {
            id: 'prop_status',
            key: 'status',
            name: 'Status',
            type: 'select',
            config: {
              options: [
                { id: 'todo', label: 'Todo', color: 'gray' },
                { id: 'doing', label: 'Doing', color: 'blue' },
              ],
            },
            createdAt: '',
            updatedAt: '',
          },
        ]}
        values={{
          prop_tags: ['Product'],
          prop_status: null,
        }}
        onSetValue={onSetValue}
        onAddDefaultProperty={onAddDefaultProperty}
      />,
    )

    await user.click(screen.getByRole('button', { name: uiCopy.pageProperties.emptyValue }))
    await user.click(screen.getByRole('option', { name: 'Todo' }))

    expect(onSetValue).toHaveBeenCalledWith('prop_status', 'Todo')

    await user.click(screen.getByRole('button', { name: uiCopy.pageProperties.add }))
    expect(onAddDefaultProperty).toHaveBeenCalled()
  })

  it('hides the add button when all default properties already exist', () => {
    render(
      <PagePropertiesPanel
        definitions={[
          {
            id: 'prop_tags',
            key: 'tags',
            name: 'Tags',
            type: 'multiSelect',
            config: {},
            createdAt: '',
            updatedAt: '',
          },
          {
            id: 'prop_status',
            key: 'status',
            name: 'Status',
            type: 'select',
            config: {},
            createdAt: '',
            updatedAt: '',
          },
          {
            id: 'prop_date',
            key: 'date',
            name: 'Date',
            type: 'date',
            config: {},
            createdAt: '',
            updatedAt: '',
          },
          {
            id: 'prop_notes',
            key: 'notes',
            name: 'Notes',
            type: 'text',
            config: {},
            createdAt: '',
            updatedAt: '',
          },
        ]}
        values={{
          prop_tags: [],
          prop_status: null,
          prop_date: null,
          prop_notes: null,
        }}
        onSetValue={vi.fn()}
        onAddDefaultProperty={vi.fn()}
      />,
    )

    expect(screen.queryByRole('button', { name: uiCopy.pageProperties.add })).not.toBeInTheDocument()
  })
})
