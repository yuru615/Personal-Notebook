import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createDefaultAppState } from '../../domain/factory'
import type { AppState, DatabaseRecord } from '../../domain/types'
import { AppStoreProvider } from '../../store/AppStore'
import TablePage from './TablePage'

function createTableState(recordCount: number, tablePageSize = 10): AppState {
  const state = createDefaultAppState()
  const activeViewId = state.database.activeViewId
  const timestamp = '2026-06-23T00:00:00.000Z'
  const records: Record<string, DatabaseRecord> = {}

  for (let index = 1; index <= recordCount; index += 1) {
    const id = `record-${index}`

    records[id] = {
      id,
      title: `记录 ${index}`,
      values: {},
      createdAt: `2026-06-23T00:${String(index).padStart(2, '0')}:00.000Z`,
      updatedAt: timestamp,
    }
    state.recordPages[id] = {
      recordId: id,
      blockIds: [],
      updatedAt: timestamp,
    }
  }

  state.records = records
  state.database.views[activeViewId] = {
    ...state.database.views[activeViewId],
    tablePageSize,
  }

  return state
}

function renderTablePage(state: AppState, isEmbedded = true) {
  return render(
    <MemoryRouter>
      <AppStoreProvider initialState={state} saveStatus="saved">
        <TablePage
          basePath="/pages/page-1/data-tables/database-1"
          showSidebar={false}
          isEmbedded={isEmbedded}
        />
      </AppStoreProvider>
    </MemoryRouter>,
  )
}

afterEach(() => {
  document.documentElement.style.overflow = ''
})

describe('TablePage embedded row loading', () => {
  it('shows only the first page of embedded rows and loads the next batch on demand', async () => {
    const user = userEvent.setup()
    renderTablePage(createTableState(12))

    expect(screen.getByText('记录 10')).toBeInTheDocument()
    expect(screen.queryByText('记录 11')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '加载更多 2 条数据' }))

    expect(await screen.findByText('记录 12')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /加载更多/ })).not.toBeInTheDocument()
  })

  it('changes the embedded row batch size from view settings', async () => {
    const user = userEvent.setup()
    const { container } = renderTablePage(createTableState(12))
    const viewSettingsButton = container.querySelectorAll(
      '.database-toolbar-actions .toolbar-button',
    )[2] as HTMLButtonElement

    await user.click(viewSettingsButton)
    await user.click(screen.getByLabelText('20'))

    expect(await screen.findByText('记录 12')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /加载更多/ })).not.toBeInTheDocument()
  })

  it('does not limit rows on the full data table page', () => {
    renderTablePage(createTableState(12), false)

    expect(screen.getByText('记录 12')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /加载更多/ })).not.toBeInTheDocument()
  })

  it('locks page scrolling while a toolbar popover is open', async () => {
    const user = userEvent.setup()
    const { container } = renderTablePage(createTableState(3))
    const viewSettingsButton = container.querySelectorAll(
      '.database-toolbar-actions .toolbar-button',
    )[2] as HTMLButtonElement

    document.documentElement.style.overflow = 'auto'

    await user.click(viewSettingsButton)

    expect(document.documentElement.style.overflow).toBe('hidden')

    await user.click(viewSettingsButton)

    expect(document.documentElement.style.overflow).toBe('auto')
  })

  it('sizes toolbar popovers to the visible viewport space below the toolbar', async () => {
    const user = userEvent.setup()
    const originalInnerHeight = window.innerHeight
    const rectSpy = vi
      .spyOn(HTMLElement.prototype, 'getBoundingClientRect')
      .mockImplementation(function getMockRect(this: HTMLElement) {
        if (this.classList.contains('database-toolbar-floating-layer')) {
          return {
            x: 0,
            y: 500,
            width: 760,
            height: 0,
            top: 500,
            right: 760,
            bottom: 500,
            left: 0,
            toJSON: () => ({}),
          } as DOMRect
        }

        return {
          x: 0,
          y: 0,
          width: 0,
          height: 0,
          top: 0,
          right: 0,
          bottom: 0,
          left: 0,
          toJSON: () => ({}),
        } as DOMRect
      })

    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 700 })

    try {
      const { container } = renderTablePage(createTableState(3))
      const viewSettingsButton = container.querySelectorAll(
        '.database-toolbar-actions .toolbar-button',
      )[2] as HTMLButtonElement

      await user.click(viewSettingsButton)

      const layer = container.querySelector('.database-toolbar-floating-layer') as HTMLElement

      await waitFor(() => {
        expect(layer.style.getPropertyValue('--database-toolbar-popover-max-height')).toBe(
          '184px',
        )
      })
    } finally {
      rectSpy.mockRestore()
      Object.defineProperty(window, 'innerHeight', {
        configurable: true,
        value: originalInnerHeight,
      })
    }
  })
})
