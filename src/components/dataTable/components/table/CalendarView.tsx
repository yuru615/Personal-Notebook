import { Calendar, ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useState, type DragEvent } from "react";
import type { DatabaseRecord, Property, RecordValue } from "../../domain/types";

type CalendarViewProps = {
  properties: Property[];
  records: DatabaseRecord[];
  datePropertyId: string | null;
  onOpenRecord?: (recordId: string) => void;
  onUpdateRecordValue?: (recordId: string, property: Property, value: string) => void;
};

type ParsedDate = {
  value: string;
  date: Date;
};

type CalendarEntry = {
  record: DatabaseRecord;
  parsedDate: ParsedDate;
};

const DAY_MS = 24 * 60 * 60 * 1000;
const AUTO_DATE_PROPERTY_PATTERN =
  /start|begin|launch|kickoff|publish|schedule|date|开始|起始|发布日期|日期/i;
const WEEKDAY_LABELS = ["日", "一", "二", "三", "四", "五", "六"];

function normalizeValue(value: RecordValue) {
  if (Array.isArray(value)) {
    return value[0] ?? "";
  }

  return value == null ? "" : String(value);
}

function parseDateValue(value: string): ParsedDate | null {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);

  if (!match) {
    return null;
  }

  const [, yearText, monthText, dayText] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const date = new Date(Date.UTC(year, month - 1, day));

  if (
    Number.isNaN(date.getTime()) ||
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }

  return {
    value,
    date,
  };
}

function addDays(date: Date, days: number) {
  return new Date(date.getTime() + days * DAY_MS);
}

function shiftMonth(date: Date, offset: number) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + offset, 1));
}

function formatMonthLabel(date: Date) {
  return `${date.getUTCFullYear()} 年 ${date.getUTCMonth() + 1} 月`;
}

function formatDateKey(date: Date) {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getMonthStart(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

function getMonthEnd(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0));
}

function getDatePropertyById(properties: Property[], propertyId: string | null) {
  if (!propertyId) {
    return null;
  }

  const property = properties.find((entry) => entry.id === propertyId);
  return property?.type === "date" ? property : null;
}

function getAutoDateProperty(properties: Property[]) {
  const dateProperties = properties.filter((property) => property.type === "date");

  return (
    dateProperties.find((property) =>
      AUTO_DATE_PROPERTY_PATTERN.test(`${property.key} ${property.name}`),
    ) ??
    dateProperties[0] ??
    null
  );
}

function getReferenceMonth(entries: CalendarEntry[]) {
  if (entries.length > 0) {
    return getMonthStart(entries[0].parsedDate.date);
  }

  return getMonthStart(new Date());
}

function buildCalendarGrid(monthDate: Date) {
  const monthStart = getMonthStart(monthDate);
  const monthEnd = getMonthEnd(monthDate);
  const gridStart = addDays(monthStart, -monthStart.getUTCDay());
  const gridEnd = addDays(monthEnd, 6 - monthEnd.getUTCDay());
  const days: Date[] = [];

  for (
    let current = gridStart;
    current.getTime() <= gridEnd.getTime();
    current = addDays(current, 1)
  ) {
    days.push(current);
  }

  return {
    monthStart,
    days,
  };
}

export default function CalendarView({
  properties,
  records,
  datePropertyId,
  onOpenRecord,
  onUpdateRecordValue,
}: CalendarViewProps) {
  const [draggingRecordId, setDraggingRecordId] = useState<string | null>(null);
  const [dropDateKey, setDropDateKey] = useState<string | null>(null);
  const dateProperty =
    getDatePropertyById(properties, datePropertyId) ?? getAutoDateProperty(properties);
  const datedEntries = records
    .map((record) => {
      const rawValue = dateProperty
        ? normalizeValue(record.values[dateProperty.id]).trim()
        : "";
      const parsedDate = parseDateValue(rawValue);

      if (!parsedDate) {
        return null;
      }

      return {
        record,
        parsedDate,
      } satisfies CalendarEntry;
    })
    .filter((entry): entry is CalendarEntry => entry !== null)
    .sort((left, right) => left.parsedDate.value.localeCompare(right.parsedDate.value));
  const referenceMonth = getReferenceMonth(datedEntries);
  const referenceMonthTime = referenceMonth.getTime();
  const [visibleMonthStart, setVisibleMonthStart] = useState(referenceMonth);

  useEffect(() => {
    setVisibleMonthStart(new Date(referenceMonthTime));
  }, [dateProperty?.id, referenceMonthTime]);

  const { monthStart, days } = buildCalendarGrid(visibleMonthStart);
  const visibleEntries = datedEntries.filter(
    (entry) =>
      entry.parsedDate.date.getUTCFullYear() === monthStart.getUTCFullYear() &&
      entry.parsedDate.date.getUTCMonth() === monthStart.getUTCMonth(),
  );
  const entryMap = new Map<string, CalendarEntry[]>();

  for (const entry of visibleEntries) {
    const items = entryMap.get(entry.parsedDate.value);

    if (items) {
      items.push(entry);
    } else {
      entryMap.set(entry.parsedDate.value, [entry]);
    }
  }

  const canDragRecords = Boolean(dateProperty && onUpdateRecordValue);

  const resetDragState = () => {
    setDraggingRecordId(null);
    setDropDateKey(null);
  };

  const handleRecordDragStart = (
    event: DragEvent<HTMLButtonElement>,
    recordId: string,
  ) => {
    if (!canDragRecords) {
      return;
    }

    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", recordId);
    setDraggingRecordId(recordId);
  };

  const handleDateDrop = (dateKey: string) => {
    if (!dateProperty || !onUpdateRecordValue || !draggingRecordId) {
      resetDragState();
      return;
    }

    const record = records.find((entry) => entry.id === draggingRecordId);

    if (!record) {
      resetDragState();
      return;
    }

    const currentValue = normalizeValue(record.values[dateProperty.id]).trim();

    if (currentValue === dateKey) {
      resetDragState();
      return;
    }

    onUpdateRecordValue(record.id, dateProperty, dateKey);
    resetDragState();
  };

  return (
    <section className="database-alt-view calendar-view" aria-label="日历视图">
      <header className="database-alt-view-header">
        <div>
          <h2>日历视图</h2>
          <p>
            {dateProperty
              ? `基于 ${dateProperty.name} 显示当月记录`
              : "当前未找到日期字段，先显示当月日历骨架"}
          </p>
        </div>

        <div className="calendar-view-toolbar">
          <div className="calendar-view-navigation">
            <button
              type="button"
              className="calendar-view-nav-button"
              aria-label="上个月"
              onClick={() => setVisibleMonthStart((current) => shiftMonth(current, -1))}
            >
              <ChevronLeft size={14} strokeWidth={2} aria-hidden="true" />
            </button>
            <strong className="calendar-view-month-label">
              {formatMonthLabel(monthStart)}
            </strong>
            <button
              type="button"
              className="calendar-view-nav-button"
              aria-label="下个月"
              onClick={() => setVisibleMonthStart((current) => shiftMonth(current, 1))}
            >
              <ChevronRight size={14} strokeWidth={2} aria-hidden="true" />
            </button>
          </div>

          <div className="calendar-view-meta">
            <button
              type="button"
              className="calendar-view-today-button"
              aria-label="回到今天"
              onClick={() => setVisibleMonthStart(getMonthStart(new Date()))}
            >
              今天
            </button>
            <span className="database-alt-view-meta">{visibleEntries.length} 条记录</span>
          </div>
        </div>
      </header>

      <section className="calendar-grid-shell" aria-label="月历">
        <div className="calendar-weekdays" aria-hidden="true">
          {WEEKDAY_LABELS.map((label) => (
            <span key={label} className="calendar-weekday">
              {label}
            </span>
          ))}
        </div>

        <div className="calendar-grid">
          {days.map((day) => {
            const dateKey = formatDateKey(day);
            const items = entryMap.get(dateKey) ?? [];
            const isCurrentMonth = day.getUTCMonth() === monthStart.getUTCMonth();

            return (
              <section
                key={dateKey}
                className={`calendar-day-cell${
                  isCurrentMonth ? "" : " is-outside-month"
                }${dropDateKey === dateKey ? " is-drop-target" : ""}`}
                data-calendar-date={dateKey}
                onDragEnter={(event) => {
                  if (!draggingRecordId) {
                    return;
                  }

                  event.preventDefault();
                  setDropDateKey(dateKey);
                }}
                onDragOver={(event) => {
                  if (!draggingRecordId) {
                    return;
                  }

                  event.preventDefault();
                  event.dataTransfer.dropEffect = "move";

                  if (dropDateKey !== dateKey) {
                    setDropDateKey(dateKey);
                  }
                }}
                onDragLeave={(event) => {
                  const nextTarget = event.relatedTarget;

                  if (
                    nextTarget instanceof Node &&
                    event.currentTarget.contains(nextTarget)
                  ) {
                    return;
                  }

                  setDropDateKey((current) => (current === dateKey ? null : current));
                }}
                onDrop={(event) => {
                  event.preventDefault();
                  handleDateDrop(dateKey);
                }}
              >
                <header className="calendar-day-header">
                  <span className="calendar-day-number">{day.getUTCDate()}</span>
                </header>

                <div className="calendar-day-records">
                  {items.map(({ record, parsedDate }) => {
                    const recordTitle = record.title || "未命名记录";

                    return (
                      <button
                        key={record.id}
                        type="button"
                        className={`calendar-record-pill${
                          draggingRecordId === record.id ? " is-dragging" : ""
                        }`}
                        draggable={canDragRecords}
                        aria-label={`打开 ${recordTitle}`}
                        onDragStart={(event) => handleRecordDragStart(event, record.id)}
                        onDragEnd={resetDragState}
                        onClick={() => onOpenRecord?.(record.id)}
                      >
                        <Calendar size={12} strokeWidth={2} aria-hidden="true" />
                        <span>{recordTitle}</span>
                        <em>{parsedDate.value}</em>
                      </button>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>
      </section>
    </section>
  );
}
