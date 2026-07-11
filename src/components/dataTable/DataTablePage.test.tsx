import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { DataTableRecord, PageRecord } from '../../domain/types'
import { createDefaultAppState, createProperty } from './domain/factory'
import { DataTablePage } from './DataTablePage'

const page: PageRecord = {
  id: 'page-1',
  parentId: null,
  title: '测试页面',
  icon: null,
  cover: null,
  blocks: [],
  createdAt: '2026-06-22T00:00:00.000Z',
  updatedAt: '2026-06-22T00:00:00.000Z',
}

const dataTable: DataTableRecord = {
  id: 'database-1',
  icon: null,
  cover: null,
  title: '项目数据库',
  snapshot: createDefaultAppState(),
  createdAt: '2026-06-22T00:00:00.000Z',
  updatedAt: '2026-06-22T00:00:00.000Z',
}

describe('DataTablePage', () => {
  let scrollTo: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined)
  })

  afterEach(() => {
    scrollTo.mockRestore()
  })

  it('scrolls to the top when opening the full data table page', async () => {
    render(
      <MemoryRouter>
        <DataTablePage
          page={page}
          dataTable={dataTable}
          saveStatus="saved"
          route="table"
          basePath="/pages/page-1/data-tables/database-1"
          onChange={vi.fn()}
          onRename={vi.fn()}
          onChangeIcon={vi.fn()}
          onChangeCover={vi.fn()}
        />
      </MemoryRouter>,
    )

    await waitFor(() => {
      expect(scrollTo).toHaveBeenCalledWith({ top: 0, left: 0 })
    })
  })

  it('uses the knowledge-base page shell without the copied workspace sidebar', () => {
    const { container } = render(
      <MemoryRouter>
        <DataTablePage
          page={page}
          dataTable={dataTable}
          saveStatus="saved"
          route="table"
          basePath="/pages/page-1/data-tables/database-1"
          onChange={vi.fn()}
          onRename={vi.fn()}
          onChangeIcon={vi.fn()}
          onChangeCover={vi.fn()}
        />
      </MemoryRouter>,
    )

    expect(screen.queryByRole('button', { name: '返回页面' })).not.toBeInTheDocument()
    expect(screen.queryByText('工作区 / 数据库')).not.toBeInTheDocument()
    expect(container.querySelector('.data-table-route-breadcrumbs')).toBeNull()
    expect(container.querySelector('.workspace-sidebar')).toBeNull()
  })

  it('uses the parent page adaptive width setting for the table route', () => {
    const { container } = render(
      <MemoryRouter>
        <DataTablePage
          page={page}
          dataTable={dataTable}
          saveStatus="saved"
          route="table"
          basePath="/pages/page-1/data-tables/database-1"
          adaptiveWidth
          onChange={vi.fn()}
          onRename={vi.fn()}
          onChangeIcon={vi.fn()}
          onChangeCover={vi.fn()}
        />
      </MemoryRouter>,
    )

    expect(container.querySelector('.data-table-route-page')).toHaveClass(
      'data-table-route-page-adaptive',
    )
  })

  it('uses the knowledge-base shell for record pages without copied record navigation', () => {
    const snapshot = createDefaultAppState()
    const recordId = 'record-1'
    snapshot.records[recordId] = {
      id: recordId,
      title: '客户访谈',
      values: {},
      createdAt: '2026-06-22T00:00:00.000Z',
      updatedAt: '2026-06-22T00:00:00.000Z',
    }
    snapshot.recordPages[recordId] = {
      recordId,
      blockIds: [],
      updatedAt: '2026-06-22T00:00:00.000Z',
    }

    const { container } = render(
      <MemoryRouter initialEntries={[`/pages/page-1/data-tables/database-1/records/${recordId}`]}>
        <Routes>
          <Route
            path="/pages/:pageId/data-tables/:databaseId/records/:recordId"
            element={
              <DataTablePage
                page={page}
                dataTable={{ ...dataTable, snapshot }}
                saveStatus="saved"
                route="record"
                basePath="/pages/page-1/data-tables/database-1"
                breadcrumbs={[
                  { label: 'Source', to: '/pages/page-1' },
                  { label: 'Database', to: '/pages/page-1/data-tables/database-1' },
                  { label: 'Record' },
                ]}
                onChange={vi.fn()}
                onRename={vi.fn()}
                onChangeIcon={vi.fn()}
                onChangeCover={vi.fn()}
              />
            }
          />
        </Routes>
      </MemoryRouter>,
    )

    expect(screen.queryByRole('button', { name: '返回页面' })).not.toBeInTheDocument()
    expect(screen.getByRole('navigation', { name: '页面层级' })).toHaveTextContent('Source')
    expect(screen.getByRole('link', { name: 'Source' })).toHaveAttribute('href', '/pages/page-1')
    expect(screen.getByRole('link', { name: 'Database' })).toHaveAttribute(
      'href',
      '/pages/page-1/data-tables/database-1',
    )
    expect(screen.getByDisplayValue('客户访谈')).toBeInTheDocument()
    expect(screen.queryByText('返回表格')).not.toBeInTheDocument()
    expect(screen.queryByText('记录页')).not.toBeInTheDocument()
    expect(container.querySelector('.record-page-icon')).toBeNull()
    expect(container.querySelector('.workspace-sidebar')).toBeNull()
  })

  it('does not render copied record icons in table title cells', () => {
    const snapshot = createDefaultAppState()
    const recordId = 'record-1'

    snapshot.records = {
      [recordId]: {
        id: recordId,
        title: '客户访谈',
        values: {},
        createdAt: '2026-06-22T00:00:00.000Z',
        updatedAt: '2026-06-22T00:00:00.000Z',
      },
    }

    const { container } = render(
      <MemoryRouter>
        <DataTablePage
          page={page}
          dataTable={{ ...dataTable, snapshot }}
          saveStatus="saved"
          route="table"
          basePath="/pages/page-1/data-tables/database-1"
          onChange={vi.fn()}
          onRename={vi.fn()}
          onChangeIcon={vi.fn()}
          onChangeCover={vi.fn()}
        />
      </MemoryRouter>,
    )

    expect(screen.getByText('客户访谈')).toBeInTheDocument()
    expect(container.querySelector('.title-cell-marker')).toBeNull()
  })

  it('opens placeholder record titles as an empty editable value', async () => {
    const user = userEvent.setup()
    const snapshot = createDefaultAppState()
    const recordId = 'record-1'

    snapshot.records = {
      [recordId]: {
        id: recordId,
        title: '未命名记录',
        values: {},
        createdAt: '2026-06-22T00:00:00.000Z',
        updatedAt: '2026-06-22T00:00:00.000Z',
      },
    }

    render(
      <MemoryRouter>
        <DataTablePage
          page={page}
          dataTable={{ ...dataTable, snapshot }}
          saveStatus="saved"
          route="table"
          basePath="/pages/page-1/data-tables/database-1"
          onChange={vi.fn()}
          onRename={vi.fn()}
          onChangeIcon={vi.fn()}
          onChangeCover={vi.fn()}
        />
      </MemoryRouter>,
    )

    await user.click(screen.getByRole('button', { name: `名称-${recordId}` }))

    expect(screen.getByRole('textbox', { name: `名称-${recordId}` })).toHaveValue('')
  })

  it('uses the knowledge-base block editor for record body text blocks', () => {
    const snapshot = createDefaultAppState()
    const recordId = 'record-1'
    const blockId = 'block-1'
    snapshot.records[recordId] = {
      id: recordId,
      title: '客户访谈',
      values: {},
      createdAt: '2026-06-22T00:00:00.000Z',
      updatedAt: '2026-06-22T00:00:00.000Z',
    }
    snapshot.recordPages[recordId] = {
      recordId,
      blockIds: [blockId],
      updatedAt: '2026-06-22T00:00:00.000Z',
    }
    snapshot.blocks[blockId] = {
      id: blockId,
      recordId,
      type: 'text',
      content: '访谈摘要',
      order: 0,
      createdAt: '2026-06-22T00:00:00.000Z',
      updatedAt: '2026-06-22T00:00:00.000Z',
    }

    render(
      <MemoryRouter initialEntries={[`/pages/page-1/data-tables/database-1/records/${recordId}`]}>
        <Routes>
          <Route
            path="/pages/:pageId/data-tables/:databaseId/records/:recordId"
            element={
              <DataTablePage
                page={page}
                dataTable={{ ...dataTable, snapshot }}
                saveStatus="saved"
                route="record"
                basePath="/pages/page-1/data-tables/database-1"
                onChange={vi.fn()}
                onRename={vi.fn()}
                onChangeIcon={vi.fn()}
                onChangeCover={vi.fn()}
              />
            }
          />
        </Routes>
      </MemoryRouter>,
    )

    expect(screen.getByRole('textbox', { name: '输入正文' })).toHaveTextContent('访谈摘要')
    expect(screen.queryByRole('textbox', { name: '块内容' })).not.toBeInTheDocument()
  })
  it('creates and selects a new record-page metadata option on Enter', async () => {
    const user = userEvent.setup()
    const snapshot = createDefaultAppState()
    const recordId = 'record-1'
    const statusProperty = {
      ...createProperty({
        key: 'status',
        name: 'Status',
        type: 'select',
      }),
      config: {
        options: [{ id: 'status-open', label: 'Open', color: '#2563eb' }],
      },
    }

    snapshot.properties[statusProperty.id] = statusProperty
    snapshot.database.propertyOrder.push(statusProperty.id)
    snapshot.records[recordId] = {
      id: recordId,
      title: '瀹㈡埛璁胯皥',
      values: {},
      createdAt: '2026-06-22T00:00:00.000Z',
      updatedAt: '2026-06-22T00:00:00.000Z',
    }
    snapshot.recordPages[recordId] = {
      recordId,
      blockIds: [],
      updatedAt: '2026-06-22T00:00:00.000Z',
    }

    render(
      <MemoryRouter initialEntries={[`/pages/page-1/data-tables/database-1/records/${recordId}`]}>
        <Routes>
          <Route
            path="/pages/:pageId/data-tables/:databaseId/records/:recordId"
            element={
              <DataTablePage
                page={page}
                dataTable={{ ...dataTable, snapshot }}
                saveStatus="saved"
                route="record"
                basePath="/pages/page-1/data-tables/database-1"
                onChange={vi.fn()}
                onRename={vi.fn()}
                onChangeIcon={vi.fn()}
                onChangeCover={vi.fn()}
              />
            }
          />
        </Routes>
      </MemoryRouter>,
    )

    await user.click(screen.getByRole('button', { name: 'Status-record-1' }))
    await user.type(
      screen.getByRole('textbox', { name: 'Status 选项输入' }),
      'Blocked{Enter}',
    )

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Status-record-1' })).toHaveTextContent(
        'Blocked',
      )
    })

    await user.click(screen.getByRole('button', { name: 'Status-record-1' }))

    const blockedOption = await screen.findByRole('option', { name: 'Blocked' })
    expect(blockedOption).toHaveAttribute('aria-selected', 'true')
  })

  it('uses the page header controls on the full data table page', async () => {
    const user = userEvent.setup()
    const onRename = vi.fn()
    const onChangeIcon = vi.fn()
    const onChangeCover = vi.fn()
    const snapshot = createDefaultAppState()
    snapshot.database.name = 'Project Database'

    const { container } = render(
      <MemoryRouter>
        <DataTablePage
          page={page}
          dataTable={{
            ...dataTable,
            title: 'Project Database',
            icon: null,
            cover: null,
            snapshot,
          }}
          saveStatus="saved"
          route="table"
          basePath="/pages/page-1/data-tables/database-1"
          onChange={vi.fn()}
          onRename={onRename}
          onChangeIcon={onChangeIcon}
          onChangeCover={onChangeCover}
        />
      </MemoryRouter>,
    )

    expect(container.querySelector('.page-header')).toBeInTheDocument()
    expect(container.querySelector('.database-page-title-row')).toBeNull()

    const titleInput = screen.getByDisplayValue('Project Database')
    await user.clear(titleInput)
    await user.type(titleInput, 'Client Database')
    await user.tab()

    expect(onRename).toHaveBeenCalledWith('Client Database')

    const headerActions = container.querySelectorAll<HTMLButtonElement>(
      '.page-header-actions .page-header-action',
    )
    await user.click(headerActions[0])
    await user.click(container.querySelector<HTMLButtonElement>('.page-cover-option')!)
    expect(onChangeCover).toHaveBeenCalledWith(expect.any(String))

    await user.click(headerActions[1])
    await user.click(container.querySelector<HTMLButtonElement>('.page-icon-option')!)
    expect(onChangeIcon).toHaveBeenCalledWith(expect.any(String))
  })
})
