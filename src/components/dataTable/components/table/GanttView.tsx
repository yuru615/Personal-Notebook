import { useEffect, useRef, useState, type CSSProperties } from "react";
import { RecordOpenButton } from "./RecordOpenControl";
import type {
  DatabaseRecord,
  GanttTimelineScale,
  Property,
  RecordValue,
} from "../../domain/types";

type GanttViewProps = {
  properties: Property[];
  records: DatabaseRecord[];
  startPropertyId: string | null;
  endPropertyId: string | null;
  timelineScale?: GanttTimelineScale;
  hiddenPropertyIds?: string[];
  onTimelineScaleChange?: (scale: GanttTimelineScale) => void;
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

type GanttPropertyItem = {
  key: string;
  label: string;
  tone?: string;
};

type TimelineSegment = {
  start: Date;
  end: Date;
  label: string;
  secondaryLabel?: string;
};

const GANTT_TIMELINE_SCALE_OPTIONS: Array<{
  value: GanttTimelineScale;
  label: string;
}> = [
  { value: "day", label: "日" },
  { value: "week", label: "周" },
  { value: "month", label: "月" },
];

const GANTT_SUMMARY_WIDTH = 220;
const GANTT_COLUMN_GAP = 14;

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

function normalizeValueList(value: RecordValue) {
  if (Array.isArray(value)) {
    return value.map((item) => item.trim()).filter(Boolean);
  }

  const normalized = normalizeValue(value).trim();
  return normalized ? [normalized] : [];
}

function resolveOptionColor(color: string, alpha = "1f") {
  if (color.startsWith("#") && color.length === 7) {
    return `${color}${alpha}`;
  }

  return color;
}

function getGanttChipStyle(tone?: string): CSSProperties | undefined {
  if (!tone) {
    return undefined;
  }

  return {
    "--gantt-chip-color": tone,
    "--gantt-chip-bg": resolveOptionColor(tone, "18"),
  } as CSSProperties;
}

function getGanttPropertyItems(
  properties: Property[],
  record: DatabaseRecord,
  hiddenPropertyIds: string[],
): GanttPropertyItem[] {
  const items: GanttPropertyItem[] = [];

  for (const property of properties) {
    if (property.type === "title" || hiddenPropertyIds.includes(property.id)) {
      continue;
    }

    const values = normalizeValueList(record.values[property.id]);

    if (property.type === "checkbox") {
      if (record.values[property.id] === true) {
        items.push({ key: property.id, label: "已勾选" });
      }
      continue;
    }

    for (const value of values) {
      const tone =
        property.type === "select" || property.type === "multiSelect"
          ? property.config.options?.find((option) => option.label === value)?.color
          : undefined;
      items.push({ key: `${property.id}-${value}`, label: value, tone });
    }
  }

  return items;
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

function getWeekStart(date: Date) {
  const day = date.getUTCDay();
  return addDays(date, day === 0 ? -6 : 1 - day);
}

function getMonthStart(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

function addMonths(date: Date, months: number) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, 1));
}

function getIsoWeekNumber(date: Date) {
  const weekday = date.getUTCDay() || 7;
  const thursday = addDays(date, 4 - weekday);
  const yearStart = new Date(Date.UTC(thursday.getUTCFullYear(), 0, 1));
  return Math.ceil((diffDays(yearStart, thursday) + 1) / 7);
}

function buildTimelineSegments(
  start: Date,
  end: Date,
  scale: GanttTimelineScale,
): TimelineSegment[] {
  if (scale === "day") {
    const dates = buildTimelineDates(addDays(start, -1), addDays(end, 1));

    return dates.map((date, index) => {
      const previousDate = dates[index - 1];
      const isMonthStart =
        !previousDate || previousDate.getUTCMonth() !== date.getUTCMonth();

      return {
        start: date,
        end: date,
        label: formatHeaderDate(date),
        secondaryLabel: isMonthStart ? formatMonthLabel(date) : undefined,
      };
    });
  }

  if (scale === "week") {
    const segments: TimelineSegment[] = [];
    const lastWeekStart = addDays(getWeekStart(end), 7);

    for (
      let current = addDays(getWeekStart(start), -7);
      current <= lastWeekStart;
      current = addDays(current, 7)
    ) {
      segments.push({
        start: current,
        end: addDays(current, 6),
        label: formatHeaderDate(current),
        secondaryLabel: `第${getIsoWeekNumber(current)}周`,
      });
    }

    return segments;
  }

  const segments: TimelineSegment[] = [];
  const lastMonthStart = addMonths(getMonthStart(end), 1);
  let previousYear: number | null = null;

  for (
    let current = addMonths(getMonthStart(start), -1);
    current <= lastMonthStart;
    current = addMonths(current, 1)
  ) {
    const year = current.getUTCFullYear();
    segments.push({
      start: current,
      end: addDays(addMonths(current, 1), -1),
      label: formatMonthLabel(current),
      secondaryLabel: previousYear !== year ? `${year}年` : undefined,
    });
    previousYear = year;
  }

  return segments;
}

function getTimelinePosition(segments: TimelineSegment[], date: Date) {
  for (let index = 0; index < segments.length; index += 1) {
    const segment = segments[index];
    const segmentEndExclusive = addDays(segment.end, 1);

    if (date >= segment.start && date < segmentEndExclusive) {
      const segmentLength = diffDays(segment.start, segmentEndExclusive);
      return index + diffDays(segment.start, date) / segmentLength;
    }
  }

  return date < segments[0]?.start ? 0 : segments.length;
}

function getTimelineColumnWidth(scale: GanttTimelineScale) {
  if (scale === "week") {
    return 112;
  }

  if (scale === "month") {
    return 128;
  }

  return 72;
}

function extendTimelineSegments(
  segments: TimelineSegment[],
  targetCount: number,
  scale: GanttTimelineScale,
) {
  const extended = [...segments];

  while (extended.length > 0 && extended.length < targetCount) {
    const previous = extended[extended.length - 1];
    const start =
      scale === "month"
        ? addMonths(previous.start, 1)
        : addDays(previous.start, scale === "week" ? 7 : 1);

    if (scale === "month") {
      extended.push({
        start,
        end: addDays(addMonths(start, 1), -1),
        label: formatMonthLabel(start),
        secondaryLabel:
          previous.start.getUTCFullYear() !== start.getUTCFullYear()
            ? `${start.getUTCFullYear()}年`
            : undefined,
      });
      continue;
    }

    if (scale === "week") {
      extended.push({
        start,
        end: addDays(start, 6),
        label: formatHeaderDate(start),
        secondaryLabel: `第${getIsoWeekNumber(start)}周`,
      });
      continue;
    }

    extended.push({
      start,
      end: start,
      label: formatHeaderDate(start),
      secondaryLabel:
        previous.start.getUTCMonth() !== start.getUTCMonth()
          ? formatMonthLabel(start)
          : undefined,
    });
  }

  return extended;
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
  timelineScale = "day",
  hiddenPropertyIds = [],
  onTimelineScaleChange,
  onOpenRecord,
}: GanttViewProps) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [visibleTrackWidth, setVisibleTrackWidth] = useState(0);

  useEffect(() => {
    const scroller = scrollerRef.current;

    if (!scroller) {
      return;
    }

    const updateVisibleTrackWidth = () => {
      setVisibleTrackWidth(
        Math.max(0, scroller.clientWidth - GANTT_SUMMARY_WIDTH - GANTT_COLUMN_GAP),
      );
    };

    updateVisibleTrackWidth();
    window.addEventListener("resize", updateVisibleTrackWidth);

    if (typeof ResizeObserver === "undefined") {
      return () => window.removeEventListener("resize", updateVisibleTrackWidth);
    }

    const observer = new ResizeObserver(updateVisibleTrackWidth);
    observer.observe(scroller);

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", updateVisibleTrackWidth);
    };
  }, [records.length]);

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
  const timelineStartDate = firstTimelineDate;
  const timelineEndDate = lastTimelineDate;
  const baseTimelineSegments =
    timelineStartDate && timelineEndDate
      ? buildTimelineSegments(timelineStartDate, timelineEndDate, timelineScale)
      : [];
  const timelineColumnWidth = getTimelineColumnWidth(timelineScale);
  const timelineSegments = extendTimelineSegments(
    baseTimelineSegments,
    Math.ceil(visibleTrackWidth / timelineColumnWidth),
    timelineScale,
  );
  const hasTimelineDates = timelineSegments.length > 0;
  const timelineGridSegments = hasTimelineDates ? timelineSegments : [null];
  const columnCount = Math.max(timelineSegments.length, 1);
  const timelineStyle = {
    "--gantt-column-count": String(columnCount),
    "--gantt-track-width": `${Math.max(
      columnCount * timelineColumnWidth,
      360,
    )}px`,
  } as CSSProperties;

  return (
    <section className="database-alt-view gantt-view" aria-label="甘特图视图">
      <header className="database-alt-view-header">
        <div>
          <h2>甘特图视图</h2>
          <p>{getTimelineDescription(startProperty, endProperty)}</p>
        </div>
        <div className="gantt-view-actions">
          <div className="gantt-time-scale-switch" role="group" aria-label="时间轴粒度">
            {GANTT_TIMELINE_SCALE_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                className={
                  option.value === timelineScale
                    ? "gantt-time-scale-button is-active"
                    : "gantt-time-scale-button"
                }
                aria-pressed={option.value === timelineScale}
                onClick={() => onTimelineScaleChange?.(option.value)}
              >
                {option.label}
              </button>
            ))}
          </div>
          <span className="database-alt-view-meta">{records.length} 条记录</span>
        </div>
      </header>

      {records.length === 0 ? (
        <div className="gantt-empty">暂无记录</div>
      ) : (
        <div ref={scrollerRef} className="gantt-scroller">
          <div className="gantt-timeline-shell" style={timelineStyle}>
            <div className="gantt-timeline-header-row">
              <div className="gantt-timeline-spacer" aria-hidden="true" />
              <div className="gantt-timeline-header" aria-hidden="true">
                {hasTimelineDates ? (
                  timelineSegments.map((segment) => {
                    return (
                      <span key={segment.start.toISOString()} className="gantt-timeline-day">
                        <strong>{segment.label}</strong>
                        {segment.secondaryLabel ? <em>{segment.secondaryLabel}</em> : null}
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
                const propertyItems = getGanttPropertyItems(
                  properties,
                  entry.record,
                  hiddenPropertyIds,
                );
                const barStartPosition = entry.rangeStart
                  ? getTimelinePosition(timelineSegments, entry.rangeStart.date)
                  : 0;
                const barEndPosition = entry.rangeEnd
                  ? getTimelinePosition(timelineSegments, addDays(entry.rangeEnd.date, 1))
                  : barStartPosition + 1;
                const barOffset = barStartPosition;
                const barSpan =
                  barEndPosition > barStartPosition
                    ? barEndPosition - barStartPosition
                    : 1 / columnCount;
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
                    </div>

                    <div className="gantt-row-track">
                      <div className="gantt-row-grid" aria-hidden="true">
                        {timelineGridSegments.map((segment, index) => (
                          <span
                            key={
                              segment
                                ? `${entry.record.id}-${segment.start.toISOString()}`
                                : `${entry.record.id}-empty-${index}`
                            }
                            className="gantt-row-grid-cell"
                          />
                        ))}
                      </div>

                      {entry.rangeStart && entry.rangeEnd && hasTimelineDates ? (
                        <div
                          className="gantt-row-bar"
                          data-start-date={entry.rangeStart.value}
                          data-end-date={entry.rangeEnd.value}
                          style={barStyle}
                        >
                          <span className="gantt-row-bar-title">
                            {entry.record.title || "未命名记录"}
                          </span>
                          {propertyItems.map((item) => (
                            <span
                              key={item.key}
                              className={item.tone ? "gantt-row-bar-chip" : "gantt-row-bar-property"}
                              style={getGanttChipStyle(item.tone)}
                            >
                              {item.label}
                            </span>
                          ))}
                        </div>
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
