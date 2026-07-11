import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { DatabaseRecord, Property } from '../../domain/types'
import GanttView from './GanttView'

const createdAt = '2026-07-11T00:00:00.000Z'

const properties: Property[] = [
  { id: 'title', key: 'title', name: '名称', type: 'title', config: {}, createdAt, updatedAt: createdAt },
  {
    id: 'status',
    key: 'status',
    name: '状态',
    type: 'select',
    config: { options: [{ id: 'doing', label: '进行中', color: '#2383e2' }] },
    createdAt,
    updatedAt: createdAt,
  },
  { id: 'start', key: 'start', name: '开始', type: 'date', config: {}, createdAt, updatedAt: createdAt },
  { id: 'end', key: 'end', name: '结束', type: 'date', config: {}, createdAt, updatedAt: createdAt },
]

const records: DatabaseRecord[] = [
  {
    id: 'record_1',
    title: '优化甘特图',
    values: { status: '进行中', start: '2026-07-10', end: '2026-07-12' },
    createdAt,
    updatedAt: createdAt,
  },
]

describe('GanttView', () => {
  it('keeps only the record title in the left list and shows filled properties on the bar', () => {
    const { container } = render(
      <GanttView
        properties={properties}
        records={records}
        startPropertyId="start"
        endPropertyId="end"
      />,
    )

    const summary = container.querySelector('.gantt-row-summary')
    const bar = container.querySelector('.gantt-row-bar')

    expect(summary).toHaveTextContent('优化甘特图')
    expect(summary?.querySelector('p')).toBeNull()
    expect(bar).toHaveTextContent('优化甘特图')
    expect(bar).toHaveTextContent('进行中')
    expect(screen.getByText('2026-07-10')).toBeInTheDocument()
  })

  it('does not show properties hidden in the current view on the bar', () => {
    const { container } = render(
      <GanttView
        properties={properties}
        records={records}
        startPropertyId="start"
        endPropertyId="end"
        hiddenPropertyIds={['status']}
      />,
    )

    const bar = container.querySelector('.gantt-row-bar')

    expect(bar).not.toHaveTextContent('进行中')
    expect(bar).toHaveTextContent('2026-07-10')
  })

  it('adds one day of timeline space before and after the scheduled range', () => {
    const { container } = render(
      <GanttView
        properties={properties}
        records={records}
        startPropertyId="start"
        endPropertyId="end"
      />,
    )

    const bar = container.querySelector('.gantt-row-bar')

    expect(screen.getByText('07/09')).toBeInTheDocument()
    expect(screen.getByText('07/13')).toBeInTheDocument()
    expect(bar).toHaveStyle({ left: '20%', width: '60%' })
  })

  it('switches the gantt timeline between day, week, and month scales', async () => {
    const user = userEvent.setup()
    const onTimelineScaleChange = vi.fn()
    const { container } = render(
      <GanttView
        properties={properties}
        records={records}
        startPropertyId="start"
        endPropertyId="end"
        timelineScale="week"
        onTimelineScaleChange={onTimelineScaleChange}
      />,
    )

    expect(screen.getByRole('button', { name: '周' })).toHaveAttribute('aria-pressed', 'true')
    expect(container.querySelector('.gantt-timeline-shell')).toHaveStyle({
      '--gantt-column-count': '3',
    })

    await user.click(screen.getByRole('button', { name: '月' }))

    expect(onTimelineScaleChange).toHaveBeenCalledWith('month')
  })

  it('positions bars at the actual date within week and month cells', () => {
    const { container, rerender } = render(
      <GanttView
        properties={properties}
        records={records}
        startPropertyId="start"
        endPropertyId="end"
        timelineScale="week"
      />,
    )

    const weekBar = container.querySelector('.gantt-row-bar') as HTMLElement

    expect(Number.parseFloat(weekBar.style.left)).toBeCloseTo(52.38, 2)
    expect(Number.parseFloat(weekBar.style.width)).toBeCloseTo(14.29, 2)

    rerender(
      <GanttView
        properties={properties}
        records={records}
        startPropertyId="start"
        endPropertyId="end"
        timelineScale="month"
      />,
    )

    const monthBar = container.querySelector('.gantt-row-bar') as HTMLElement

    expect(Number.parseFloat(monthBar.style.left)).toBeCloseTo(43.01, 2)
    expect(Number.parseFloat(monthBar.style.width)).toBeCloseTo(3.23, 2)
  })

  it('extends week and month timelines to fill the visible timeline width', async () => {
    const originalClientWidth = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientWidth')
    Object.defineProperty(HTMLElement.prototype, 'clientWidth', {
      configurable: true,
      get() {
        return this.classList.contains('gantt-scroller') ? 1400 : 0
      },
    })

    try {
      const { container, rerender } = render(
        <GanttView
          properties={properties}
          records={records}
          startPropertyId="start"
          endPropertyId="end"
          timelineScale="week"
        />,
      )

      await waitFor(() => {
        expect(container.querySelector('.gantt-timeline-shell')).toHaveStyle({
          '--gantt-column-count': '11',
        })
      })

      rerender(
        <GanttView
          properties={properties}
          records={records}
          startPropertyId="start"
          endPropertyId="end"
          timelineScale="month"
        />,
      )

      await waitFor(() => {
        expect(container.querySelector('.gantt-timeline-shell')).toHaveStyle({
          '--gantt-column-count': '10',
        })
      })
    } finally {
      if (originalClientWidth) {
        Object.defineProperty(HTMLElement.prototype, 'clientWidth', originalClientWidth)
      } else {
        Reflect.deleteProperty(HTMLElement.prototype, 'clientWidth')
      }
    }
  })
})
