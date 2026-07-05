import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { PagePropertiesPanel } from './PagePropertiesPanel'

describe('PagePropertiesPanel', () => {
  it('renders compact property rows', () => {
    render(
      <PagePropertiesPanel
        definitions={[
          {
            id: 'prop_tags',
            key: 'tags',
            name: '标签',
            type: 'multiSelect',
            config: {},
            createdAt: '',
            updatedAt: '',
          },
          {
            id: 'prop_status',
            key: 'status',
            name: '状态',
            type: 'select',
            config: {},
            createdAt: '',
            updatedAt: '',
          },
        ]}
        values={{
          prop_tags: ['产品'],
          prop_status: '进行中',
        }}
        onSetValue={vi.fn()}
        onAddDefaultProperty={vi.fn()}
      />,
    )

    expect(screen.getByText('标签')).toBeInTheDocument()
    expect(screen.getByText('状态')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '产品' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '进行中' })).toBeInTheDocument()
  })

  it('uses configured select options in the compact interaction and still exposes add property', async () => {
    const user = userEvent.setup()
    const onSetValue = vi.fn()
    const onAddDefaultProperty = vi.fn()

    render(
      <PagePropertiesPanel
        definitions={[
          {
            id: 'prop_tags',
            key: 'tags',
            name: '标签',
            type: 'multiSelect',
            config: {},
            createdAt: '',
            updatedAt: '',
          },
          {
            id: 'prop_status',
            key: 'status',
            name: '状态',
            type: 'select',
            config: {
              options: [
                { id: 'todo', label: '待办', color: 'gray' },
                { id: 'doing', label: '进行中', color: 'blue' },
              ],
            },
            createdAt: '',
            updatedAt: '',
          },
        ]}
        values={{
          prop_tags: ['产品'],
          prop_status: null,
        }}
        onSetValue={onSetValue}
        onAddDefaultProperty={onAddDefaultProperty}
      />,
    )

    await user.click(screen.getByRole('button', { name: '空' }))
    expect(onSetValue).toHaveBeenCalledWith('prop_status', '待办')

    await user.click(screen.getByRole('button', { name: '添加属性' }))
    expect(onAddDefaultProperty).toHaveBeenCalled()
  })

  it('hides the add button when all default properties already exist', () => {
    render(
      <PagePropertiesPanel
        definitions={[
          {
            id: 'prop_tags',
            key: 'tags',
            name: '标签',
            type: 'multiSelect',
            config: {},
            createdAt: '',
            updatedAt: '',
          },
          {
            id: 'prop_status',
            key: 'status',
            name: '状态',
            type: 'select',
            config: {},
            createdAt: '',
            updatedAt: '',
          },
          {
            id: 'prop_date',
            key: 'date',
            name: '日期',
            type: 'date',
            config: {},
            createdAt: '',
            updatedAt: '',
          },
          {
            id: 'prop_notes',
            key: 'notes',
            name: '备注',
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

    expect(screen.queryByRole('button', { name: '添加属性' })).not.toBeInTheDocument()
  })
})
