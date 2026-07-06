import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'

interface DateCalendarPanelProps {
  value: string | null
  ariaLabel: string
  clearLabel: string
  todayLabel: string
  onSelect: (value: string) => void
  onClear: () => void
}

const weekdayLabels = ['一', '二', '三', '四', '五', '六', '日']

export function parseIsoDate(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)

  if (!match) {
    return null
  }

  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const parsedDate = new Date(year, month - 1, day)

  if (
    parsedDate.getFullYear() !== year ||
    parsedDate.getMonth() !== month - 1 ||
    parsedDate.getDate() !== day
  ) {
    return null
  }

  return parsedDate
}

export function formatDateDisplay(value: string) {
  const parsedDate = parseIsoDate(value)

  if (!parsedDate) {
    return value
  }

  return `${parsedDate.getFullYear()}年${parsedDate.getMonth() + 1}月${parsedDate.getDate()}日`
}

function formatMonthLabel(date: Date) {
  return `${date.getFullYear()}年${date.getMonth() + 1}月`
}

function toIsoDate(date: Date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')

  return `${year}-${month}-${day}`
}

function addMonths(date: Date, offset: number) {
  return new Date(date.getFullYear(), date.getMonth() + offset, 1)
}

function getMonthAnchor(value: string | null) {
  const parsedDate = value ? parseIsoDate(value) : null
  const basis = parsedDate ?? new Date()

  return new Date(basis.getFullYear(), basis.getMonth(), 1)
}

function getCalendarDays(month: Date) {
  const monthStart = new Date(month.getFullYear(), month.getMonth(), 1)
  const startOffset = (monthStart.getDay() + 6) % 7
  const gridStart = new Date(
    monthStart.getFullYear(),
    monthStart.getMonth(),
    monthStart.getDate() - startOffset,
  )

  return Array.from({ length: 42 }, (_, index) => {
    const current = new Date(gridStart)
    current.setDate(gridStart.getDate() + index)
    return current
  })
}

function isSameDay(left: Date, right: Date) {
  return (
    left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth() &&
    left.getDate() === right.getDate()
  )
}

function isSameMonth(left: Date, right: Date) {
  return left.getFullYear() === right.getFullYear() && left.getMonth() === right.getMonth()
}

export function DateCalendarPanel({
  value,
  ariaLabel,
  clearLabel,
  todayLabel,
  onSelect,
  onClear,
}: DateCalendarPanelProps) {
  const [calendarMonth, setCalendarMonth] = useState(() => getMonthAnchor(value))

  useEffect(() => {
    setCalendarMonth(getMonthAnchor(value))
  }, [value])

  const selectedDate = useMemo(() => (value ? parseIsoDate(value) : null), [value])
  const calendarDays = useMemo(() => getCalendarDays(calendarMonth), [calendarMonth])

  return (
    <section className="database-date-popover" role="dialog" aria-label={ariaLabel}>
      <div className="database-date-popover-header">
        <button
          type="button"
          className="database-date-nav"
          aria-label="上一个月"
          onClick={() => setCalendarMonth((current) => addMonths(current, -1))}
        >
          <ChevronLeft size={14} strokeWidth={2} aria-hidden="true" />
        </button>
        <strong>{formatMonthLabel(calendarMonth)}</strong>
        <button
          type="button"
          className="database-date-nav"
          aria-label="下一个月"
          onClick={() => setCalendarMonth((current) => addMonths(current, 1))}
        >
          <ChevronRight size={14} strokeWidth={2} aria-hidden="true" />
        </button>
      </div>

      <div className="database-date-weekdays" aria-hidden="true">
        {weekdayLabels.map((label) => (
          <span key={label}>{label}</span>
        ))}
      </div>

      <div className="database-date-grid">
        {calendarDays.map((day) => {
          const isoDate = toIsoDate(day)
          const isCurrentMonth = isSameMonth(day, calendarMonth)
          const isSelected = selectedDate ? isSameDay(day, selectedDate) : false
          const isToday = isSameDay(day, new Date())

          return (
            <button
              key={isoDate}
              type="button"
              aria-label={isoDate}
              className={[
                'database-date-day',
                !isCurrentMonth ? 'is-outside' : '',
                isSelected ? 'is-selected' : '',
                isToday ? 'is-today' : '',
              ]
                .filter(Boolean)
                .join(' ')}
              onClick={() => onSelect(isoDate)}
            >
              {day.getDate()}
            </button>
          )
        })}
      </div>

      <div className="database-date-footer">
        <button
          type="button"
          className="database-date-footer-button"
          onClick={() => onSelect(toIsoDate(new Date()))}
        >
          {todayLabel}
        </button>
        <button type="button" className="database-date-footer-button" onClick={onClear}>
          {clearLabel}
        </button>
      </div>
    </section>
  )
}
