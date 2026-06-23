import { Calendar } from "lucide-react";
import type { CSSProperties } from "react";
import { RecordOpenButton } from "./RecordOpenControl";
import type { DatabaseRecord, Property, RecordValue } from "../../domain/types";

type GanttViewProps = {
  properties: Property[];
  records: DatabaseRecord[];
  startPropertyId: string | null;
  endPropertyId: string | null;
  onOpenRecord?: (recordId: string) => void;
};

type ParsedDate = {
  value: string;
  date: Date;
};

type TimelineEntry = {
  record: DatabaseRecord;
  dateLabel: string;
  rangeStart: ParsedDate | null;
  rangeEnd: ParsedDate | null;
};

const DAY_MS = 24 * 60 * 60 * 1000;
const START_DATE_PROPERTY_PATTERN = /start|begin|from|launch|kickoff|开始|起始|启动/i;
const END_DATE_PROPERTY_PATTERN =
  /end|due|deadline|review|finish|close|until|to|结束|截止|到期|审核/i;

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

function diffDays(start: Date, end: Date) {
  return Math.round((end.getTime() - start.getTime()) / DAY_MS);
}

function formatHeaderDate(date: Date) {
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${month}/${day}`;
}

function formatMonthLabel(date: Date) {
  return `${date.getUTCMonth() + 1}月`;
}

function buildTimelineDates(start: Date, end: Date) {
  const length = diffDays(start, end) + 1;
  return Array.from({ length }, (_, index) => addDays(start, index));
}

function getDatePropertyById(
  properties: Property[],
  propertyId: string | null,
) {
  if (!propertyId) {
    return null;
  }

  const property = properties.find((entry) => entry.id === propertyId);
  return property?.type === "date" ? property : null;
}

function getAutoDateProperty(
  properties: Property[],
  pattern: RegExp,
  excludePropertyId: string | null,
) {
  const dateProperties = properties.filter((property) => property.type === "date");

  return (
    dateProperties.find(
      (property) =>
        property.id !== excludePropertyId &&
        pattern.test(`${property.key} ${property.name}`),
    ) ??
    dateProperties.find((property) => property.id !== excludePropertyId) ??
    null
  );
}

function resolveDateProperties(
  properties: Property[],
  startPropertyId: string | null,
  endPropertyId: string | null,
) {
  const configuredStartProperty = getDatePropertyById(properties, startPropertyId);
  const configuredEndProperty = getDatePropertyById(properties, endPropertyId);

  if (!configuredStartProperty && !configuredEndProperty) {
    const autoStartProperty =
      getAutoDateProperty(properties, START_DATE_PROPERTY_PATTERN, null) ??
      properties.find((property) => property.type === "date") ??
      null;
    const autoEndProperty =
      getAutoDateProperty(
        properties,
        END_DATE_PROPERTY_PATTERN,
        autoStartProperty?.id ?? null,
      ) ?? null;

    return {
      startProperty: autoStartProperty,
      endProperty: autoEndProperty,
    };
  }

  return {
    startProperty:
      configuredStartProperty ??
      getAutoDateProperty(properties, START_DATE_PROPERTY_PATTERN, configuredEndProperty?.id ?? null),
    endProperty:
      configuredEndProperty ??
      getAutoDateProperty(properties, END_DATE_PROPERTY_PATTERN, configuredStartProperty?.id ?? null),
  };
}

function resolveEntryRange(
  startDate: ParsedDate | null,
  endDate: ParsedDate | null,
) {
  const anchor = startDate ?? endDate;
  const finish = endDate ?? startDate;

  if (!anchor || !finish) {
    return {
      rangeStart: null,
      rangeEnd: null,
    };
  }

  if (anchor.date.getTime() <= finish.date.getTime()) {
    return {
      rangeStart: anchor,
      rangeEnd: finish,
    };
  }

  return {
    rangeStart: finish,
    rangeEnd: anchor,
  };
}

function formatRangeLabel(
  rangeStart: ParsedDate | null,
  rangeEnd: ParsedDate | null,
) {
  if (!rangeStart || !rangeEnd) {
    return "未设置日期";
  }

  if (rangeStart.value === rangeEnd.value) {
    return rangeStart.value;
  }

  return `${rangeStart.value} - ${rangeEnd.value}`;
}

function getTimelineDescription(
  startProperty: Property | null,
  endProperty: Property | null,
) {
  if (startProperty && endProperty && startProperty.id !== endProperty.id) {
    return `基于 ${startProperty.name} - ${endProperty.name} 生成时间轴`;
  }

  if (startProperty) {
    return `基于 ${startProperty.name} 生成时间轴`;
  }

  if (endProperty) {
    return `基于 ${endProperty.name} 生成时间轴`;
  }

  return "当前未找到日期字段，先展示时间轴骨架";
}

export default function GanttView({
  properties,
  records,
  startPropertyId,
  endPropertyId,
  onOpenRecord,
}: GanttViewProps) {
  const { startProperty, endProperty } = resolveDateProperties(
    properties,
    startPropertyId,
    endPropertyId,
  );
  const timelineEntries: TimelineEntry[] = records.map((record) => {
    const rawStartValue = startProperty
      ? normalizeValue(record.values[startProperty.id]).trim()
      : "";
    const rawEndValue = endProperty
      ? normalizeValue(record.values[endProperty.id]).trim()
      : "";
    const parsedStartDate = parseDateValue(rawStartValue);
    const parsedEndDate = parseDateValue(rawEndValue);
    const { rangeStart, rangeEnd } = resolveEntryRange(parsedStartDate, parsedEndDate);

    return {
      record,
      dateLabel: formatRangeLabel(rangeStart, rangeEnd),
      rangeStart,
      rangeEnd,
    };
  });
  const rangedEntries = timelineEntries.filter(
    (
      entry,
    ): entry is TimelineEntry & {
      rangeStart: ParsedDate;
      rangeEnd: ParsedDate;
    } => entry.rangeStart !== null && entry.rangeEnd !== null,
  );
  const firstTimelineDate =
    rangedEntries.length > 0
      ? rangedEntries.reduce(
          (current, entry) =>
            entry.rangeStart.date.getTime() < current.getTime()
              ? entry.rangeStart.date
              : current,
          rangedEntries[0].rangeStart.date,
        )
      : null;
  const lastTimelineDate =
    rangedEntries.length > 0
      ? rangedEntries.reduce(
          (current, entry) =>
            entry.rangeEnd.date.getTime() > current.getTime()
              ? entry.rangeEnd.date
              : current,
          rangedEntries[0].rangeEnd.date,
        )
      : null;
  const timelineDates =
    firstTimelineDate && lastTimelineDate
      ? buildTimelineDates(firstTimelineDate, lastTimelineDate)
      : [];
  const hasTimelineDates = timelineDates.length > 0;
  const timelineGridDates = hasTimelineDates ? timelineDates : [null];
  const columnCount = Math.max(timelineDates.length, 1);
  const timelineStyle = {
    "--gantt-column-count": String(columnCount),
    "--gantt-track-width": `${Math.max(columnCount * 72, 360)}px`,
  } as CSSProperties;

  return (
    <section className="database-alt-view gantt-view" aria-label="甘特图视图">
      <header className="database-alt-view-header">
        <div>
          <h2>甘特图视图</h2>
          <p>{getTimelineDescription(startProperty, endProperty)}</p>
        </div>
        <span className="database-alt-view-meta">{records.length} 条记录</span>
      </header>

      {records.length === 0 ? (
        <div className="gantt-empty">暂无记录</div>
      ) : (
        <div className="gantt-scroller">
          <div className="gantt-timeline-shell" style={timelineStyle}>
            <div className="gantt-timeline-header-row">
              <div className="gantt-timeline-spacer" aria-hidden="true" />
              <div className="gantt-timeline-header" aria-hidden="true">
                {hasTimelineDates ? (
                  timelineDates.map((date, index) => {
                    const previousDate = timelineDates[index - 1];
                    const isMonthStart =
                      !previousDate ||
                      previousDate.getUTCMonth() !== date.getUTCMonth();

                    return (
                      <span key={date.toISOString()} className="gantt-timeline-day">
                        <strong>{formatHeaderDate(date)}</strong>
                        {isMonthStart ? <em>{formatMonthLabel(date)}</em> : null}
                      </span>
                    );
                  })
                ) : (
                  <span className="gantt-timeline-day gantt-timeline-day--empty">
                    <strong>未设置日期</strong>
                    <em>添加日期字段后显示时间轴</em>
                  </span>
                )}
              </div>
            </div>

            <div className="gantt-rows">
              {timelineEntries.map((entry) => {
                const barOffset =
                  entry.rangeStart && firstTimelineDate
                    ? diffDays(firstTimelineDate, entry.rangeStart.date)
                    : 0;
                const barSpan =
                  entry.rangeStart && entry.rangeEnd
                    ? diffDays(entry.rangeStart.date, entry.rangeEnd.date) + 1
                    : 1;
                const barStyle =
                  entry.rangeStart && entry.rangeEnd && hasTimelineDates
                    ? {
                        left: `${(barOffset / columnCount) * 100}%`,
                        width: `${(barSpan / columnCount) * 100}%`,
                      }
                    : undefined;

                return (
                  <article
                    key={entry.record.id}
                    className={
                      entry.rangeStart && entry.rangeEnd
                        ? "gantt-row"
                        : "gantt-row is-undated"
                    }
                  >
                    <div className="gantt-row-summary">
                      <div className="gantt-row-summary-header">
                        <h3>{entry.record.title || "未命名记录"}</h3>
                        <RecordOpenButton
                          className="record-open-button gantt-row-summary-button"
                          ariaLabel={`打开 ${entry.record.title || "未命名记录"}`}
                          onClick={() => onOpenRecord?.(entry.record.id)}
                        />
                      </div>
                      <p>
                        <Calendar size={12} strokeWidth={2} aria-hidden="true" />
                        <span>{entry.dateLabel}</span>
                      </p>
                    </div>

                    <div className="gantt-row-track">
                      <div className="gantt-row-grid" aria-hidden="true">
                        {timelineGridDates.map((date, index) => (
                          <span
                            key={
                              date
                                ? `${entry.record.id}-${date.toISOString()}`
                                : `${entry.record.id}-empty-${index}`
                            }
                            className="gantt-row-grid-cell"
                          />
                        ))}
                      </div>

                      {entry.rangeStart && entry.rangeEnd && hasTimelineDates ? (
                        <span
                          className="gantt-row-bar"
                          data-start-date={entry.rangeStart.value}
                          data-end-date={entry.rangeEnd.value}
                          style={barStyle}
                        />
                      ) : (
                        <span className="gantt-row-empty-label">未设置日期</span>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
