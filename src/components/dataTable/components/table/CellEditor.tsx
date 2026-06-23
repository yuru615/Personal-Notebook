import {
  CalendarDays,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type KeyboardEvent,
} from "react";
import { createPortal } from "react-dom";
import type { DatabaseRecord, Property, RecordValue } from "../../domain/types";

type CellEditorProps = {
  property: Property;
  record: DatabaseRecord;
  onChange: (value: string | boolean | string[]) => void;
};

type FloatingPosition = {
  top: number;
  left: number;
  width: number;
};

const EMPTY_CELL_COPY = "\u7a7a";
const EMPTY_SELECT_COPY = "\u672a\u9009\u62e9";
const EMPTY_DATE_COPY = "\u65e5\u671f";
const UNTITLED_RECORD = "\u672a\u547d\u540d\u8bb0\u5f55";
const TODAY_COPY = "\u4eca\u5929";
const CLEAR_COPY = "\u6e05\u7a7a";
const VIEWPORT_MARGIN = 16;
const FLOATING_OFFSET = 8;
const OPTION_POPOVER_MIN_WIDTH = 240;
const DATE_POPOVER_MIN_WIDTH = 312;
const WEEKDAY_LABELS = [
  "\u4e00",
  "\u4e8c",
  "\u4e09",
  "\u56db",
  "\u4e94",
  "\u516d",
  "\u65e5",
];

function resolveOptionColor(color: string, alpha = "1f") {
  if (color.startsWith("#")) {
    if (color.length === 7) {
      return `${color}${alpha}`;
    }

    if (color.length === 4) {
      const expanded = `#${color[1]}${color[1]}${color[2]}${color[2]}${color[3]}${color[3]}`;
      return `${expanded}${alpha}`;
    }
  }

  return undefined;
}

function parseIsoDate(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);

  if (!match) {
    return null;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const parsedDate = new Date(year, month - 1, day);

  if (
    parsedDate.getFullYear() !== year ||
    parsedDate.getMonth() !== month - 1 ||
    parsedDate.getDate() !== day
  ) {
    return null;
  }

  return parsedDate;
}

function formatMonthLabel(date: Date) {
  return `${date.getFullYear()}\u5e74${date.getMonth() + 1}\u6708`;
}

function formatDateDisplay(value: string) {
  const parsedDate = parseIsoDate(value);

  if (!parsedDate) {
    return value;
  }

  return `${parsedDate.getFullYear()}\u5e74${parsedDate.getMonth() + 1}\u6708${parsedDate.getDate()}\u65e5`;
}

function toIsoDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function addMonths(date: Date, offset: number) {
  return new Date(date.getFullYear(), date.getMonth() + offset, 1);
}

function getMonthAnchor(value: RecordValue | undefined) {
  const parsedDate =
    typeof value === "string" && value.trim() ? parseIsoDate(value) : null;
  const basis = parsedDate ?? new Date();

  return new Date(basis.getFullYear(), basis.getMonth(), 1);
}

function getCalendarDays(month: Date) {
  const monthStart = new Date(month.getFullYear(), month.getMonth(), 1);
  const startOffset = (monthStart.getDay() + 6) % 7;
  const gridStart = new Date(
    monthStart.getFullYear(),
    monthStart.getMonth(),
    monthStart.getDate() - startOffset,
  );

  return Array.from({ length: 42 }, (_, index) => {
    const current = new Date(gridStart);
    current.setDate(gridStart.getDate() + index);
    return current;
  });
}

function isSameDay(left: Date, right: Date) {
  return (
    left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth() &&
    left.getDate() === right.getDate()
  );
}

function isSameMonth(left: Date, right: Date) {
  return (
    left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth()
  );
}

function getDisplayCopy(property: Property, rawValue: RecordValue | undefined) {
  if (property.type === "title") {
    return typeof rawValue === "string" && rawValue.trim()
      ? rawValue
      : UNTITLED_RECORD;
  }

  if (property.type === "select") {
    return typeof rawValue === "string" && rawValue.trim()
      ? rawValue
      : EMPTY_SELECT_COPY;
  }

  if (property.type === "multiSelect") {
    return Array.isArray(rawValue) && rawValue.length > 0
      ? rawValue.join(", ")
      : EMPTY_SELECT_COPY;
  }

  if (property.type === "date") {
    return typeof rawValue === "string" && rawValue.trim()
      ? formatDateDisplay(rawValue)
      : EMPTY_DATE_COPY;
  }

  if (property.type === "checkbox") {
    return Boolean(rawValue);
  }

  return rawValue == null || String(rawValue).trim() === ""
    ? EMPTY_CELL_COPY
    : String(rawValue);
}

function getSelectedOptionLabels(
  property: Property,
  rawValue: RecordValue | undefined,
) {
  if (property.type === "select") {
    return typeof rawValue === "string" && rawValue.trim() ? [rawValue] : [];
  }

  if (property.type === "multiSelect") {
    return Array.isArray(rawValue) ? rawValue : [];
  }

  return [];
}

export default function CellEditor({
  property,
  record,
  onChange,
}: CellEditorProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [floatingPosition, setFloatingPosition] = useState<FloatingPosition>({
    top: 0,
    left: 0,
    width: OPTION_POPOVER_MIN_WIDTH,
  });
  const [calendarMonth, setCalendarMonth] = useState(() => getMonthAnchor(undefined));
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const floatingLayerRef = useRef<HTMLDivElement | null>(null);
  const rawValue =
    property.type === "title" ? record.title : record.values[property.id];
  const inputValue =
    property.type === "title" && rawValue === UNTITLED_RECORD
      ? ""
      : rawValue == null
        ? ""
        : String(rawValue);
  const displayCopy = getDisplayCopy(property, rawValue);
  const selectedOptionLabels = getSelectedOptionLabels(property, rawValue);
  const selectedDate = useMemo(
    () =>
      property.type === "date" && typeof rawValue === "string"
        ? parseIsoDate(rawValue)
        : null,
    [property.type, rawValue],
  );
  const calendarDays = useMemo(() => getCalendarDays(calendarMonth), [calendarMonth]);
  const isOptionProperty =
    property.type === "select" || property.type === "multiSelect";
  const isFloatingProperty = isOptionProperty || property.type === "date";
  const optionCount = property.config.options?.length ?? 0;

  useEffect(() => {
    setIsEditing(false);
  }, [property.id, record.id]);

  useEffect(() => {
    if (property.type === "date") {
      setCalendarMonth(getMonthAnchor(rawValue));
    }
  }, [property.type, rawValue]);

  const updateFloatingPosition = useCallback(() => {
    const triggerElement = triggerRef.current;

    if (!isEditing || !isFloatingProperty || !triggerElement) {
      return;
    }

    const triggerRect = triggerElement.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const desiredWidth =
      property.type === "date"
        ? Math.max(DATE_POPOVER_MIN_WIDTH, triggerRect.width)
        : Math.max(OPTION_POPOVER_MIN_WIDTH, triggerRect.width);
    const renderedWidth = floatingLayerRef.current?.offsetWidth ?? desiredWidth;
    const width = Math.max(desiredWidth, renderedWidth);
    const floatingHeight = floatingLayerRef.current?.offsetHeight ?? 0;
    let left = triggerRect.left;
    let top = triggerRect.bottom + FLOATING_OFFSET;

    left = Math.max(
      VIEWPORT_MARGIN,
      Math.min(left, viewportWidth - VIEWPORT_MARGIN - width),
    );

    if (floatingHeight > 0 && top + floatingHeight > viewportHeight - VIEWPORT_MARGIN) {
      const flippedTop = triggerRect.top - FLOATING_OFFSET - floatingHeight;

      top =
        flippedTop >= VIEWPORT_MARGIN
          ? flippedTop
          : Math.max(
              VIEWPORT_MARGIN,
              viewportHeight - VIEWPORT_MARGIN - floatingHeight,
            );
    }

    setFloatingPosition((current) =>
      current.top === top && current.left === left && current.width === width
        ? current
        : { top, left, width },
    );
  }, [isEditing, isFloatingProperty, property.type]);

  useLayoutEffect(() => {
    if (!isEditing || !isFloatingProperty) {
      return;
    }

    updateFloatingPosition();
    const frameId = window.requestAnimationFrame(updateFloatingPosition);

    return () => {
      window.cancelAnimationFrame(frameId);
    };
  }, [
    calendarMonth,
    isEditing,
    isFloatingProperty,
    optionCount,
    selectedOptionLabels.length,
    updateFloatingPosition,
  ]);

  useEffect(() => {
    if (!isEditing || !isFloatingProperty) {
      return;
    }

    const handleDocumentMouseDown = (event: globalThis.MouseEvent) => {
      const target = event.target;

      if (!(target instanceof Node)) {
        return;
      }

      if (
        triggerRef.current?.contains(target) ||
        floatingLayerRef.current?.contains(target)
      ) {
        return;
      }

      setIsEditing(false);
    };

    const handleDocumentKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsEditing(false);
      }
    };

    const syncFloatingPosition = () => {
      updateFloatingPosition();
    };

    document.addEventListener("mousedown", handleDocumentMouseDown);
    document.addEventListener("keydown", handleDocumentKeyDown);
    window.addEventListener("resize", syncFloatingPosition);
    window.addEventListener("scroll", syncFloatingPosition, true);

    return () => {
      document.removeEventListener("mousedown", handleDocumentMouseDown);
      document.removeEventListener("keydown", handleDocumentKeyDown);
      window.removeEventListener("resize", syncFloatingPosition);
      window.removeEventListener("scroll", syncFloatingPosition, true);
    };
  }, [isEditing, isFloatingProperty, updateFloatingPosition]);

  const exitEditing = () => {
    setIsEditing(false);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter" || event.key === "Escape") {
      event.currentTarget.blur();
    }
  };

  const renderOptionChip = (label: string, className = "cell-option-chip") => {
    const option = (property.config.options ?? []).find((item) => item.label === label);
    const tone = option?.color ?? "#475569";

    return (
      <span
        key={label}
        className={className}
        style={{
          color: tone,
          backgroundColor: resolveOptionColor(tone, "2e"),
          borderColor: "transparent",
        }}
      >
        {label}
      </span>
    );
  };

  const renderFloatingLayer = (children: ReactNode, className: string) => {
    if (!isEditing || !isFloatingProperty || typeof document === "undefined") {
      return null;
    }

    return createPortal(
      <div
        ref={floatingLayerRef}
        className="database-cell-floating-layer"
        style={{
          top: `${floatingPosition.top}px`,
          left: `${floatingPosition.left}px`,
          width: `${floatingPosition.width}px`,
        }}
      >
        <div className={`database-cell-popover ${className}`}>{children}</div>
      </div>,
      document.body,
    );
  };

  if (property.type === "checkbox") {
    return (
      <input
        aria-label={`${property.name}-${record.id}`}
        className="cell-editor-checkbox"
        type="checkbox"
        checked={Boolean(rawValue)}
        onChange={(event) => onChange(event.currentTarget.checked)}
      />
    );
  }

  if (isOptionProperty) {
    const optionValues = property.config.options ?? [];

    return (
      <div className="cell-option-editor">
        <button
          ref={triggerRef}
          type="button"
          aria-label={`${property.name}-${record.id}`}
          className={
            selectedOptionLabels.length === 0
              ? "cell-option-trigger is-placeholder"
              : "cell-option-trigger"
          }
          aria-expanded={isEditing}
          onClick={() => setIsEditing((current) => !current)}
        >
          <span className="cell-option-trigger-content">
            {selectedOptionLabels.length === 0 ? (
              <span>{EMPTY_SELECT_COPY}</span>
            ) : property.type === "select" ? (
              renderOptionChip(selectedOptionLabels[0])
            ) : (
              <span className="cell-option-chip-list">
                {selectedOptionLabels.map((label) => renderOptionChip(label))}
              </span>
            )}
          </span>
          <ChevronDown size={14} strokeWidth={2} aria-hidden="true" />
        </button>

        {renderFloatingLayer(
          <div
            className="cell-option-list"
            role="listbox"
            aria-label={`${property.name} \u9009\u9879`}
            aria-multiselectable={property.type === "multiSelect" ? "true" : undefined}
          >
            {property.type === "select" ? (
              <button
                type="button"
                role="option"
                aria-selected={selectedOptionLabels.length === 0}
                className={
                  selectedOptionLabels.length === 0
                    ? "cell-option-item is-selected is-clear"
                    : "cell-option-item is-clear"
                }
                onClick={() => {
                  onChange("");
                  setIsEditing(false);
                }}
              >
                <span className="cell-option-item-copy">{EMPTY_SELECT_COPY}</span>
                {selectedOptionLabels.length === 0 ? (
                  <Check size={14} strokeWidth={2} aria-hidden="true" />
                ) : null}
              </button>
            ) : null}

            {optionValues.map((option) => {
              const isSelected = selectedOptionLabels.includes(option.label);

              return (
                <button
                  key={option.id}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  className={isSelected ? "cell-option-item is-selected" : "cell-option-item"}
                  onClick={() => {
                    if (property.type === "select") {
                      onChange(option.label);
                      setIsEditing(false);
                      return;
                    }

                    const currentValues = Array.isArray(rawValue) ? rawValue : [];
                    const nextValues = isSelected
                      ? currentValues.filter((value) => value !== option.label)
                      : [...currentValues, option.label];

                    onChange(nextValues);
                  }}
                >
                  <span className="cell-option-item-copy">
                    {renderOptionChip(option.label, "cell-option-item-pill")}
                  </span>
                  {isSelected ? (
                    <Check size={14} strokeWidth={2} aria-hidden="true" />
                  ) : null}
                </button>
              );
            })}
          </div>,
          "database-cell-popover--options",
        )}
      </div>
    );
  }

  if (property.type === "date") {
    return (
      <div className="cell-date-editor">
        <button
          ref={triggerRef}
          type="button"
          aria-label={`${property.name}-${record.id}`}
          className={
            selectedDate ? "cell-date-trigger" : "cell-date-trigger is-placeholder"
          }
          aria-expanded={isEditing}
          onClick={() => {
            if (!isEditing) {
              setCalendarMonth(getMonthAnchor(rawValue));
            }

            setIsEditing((current) => !current);
          }}
        >
          <span className="cell-date-trigger-copy">
            <CalendarDays size={14} strokeWidth={2} aria-hidden="true" />
            <span>{displayCopy}</span>
          </span>
        </button>

        {renderFloatingLayer(
          <section
            className="database-date-popover"
            role="dialog"
            aria-label={`${property.name} \u65e5\u671f`}
          >
            <div className="database-date-popover-header">
              <button
                type="button"
                className="database-date-nav"
                aria-label="\u4e0a\u4e00\u4e2a\u6708"
                onClick={() => setCalendarMonth((current) => addMonths(current, -1))}
              >
                <ChevronLeft size={14} strokeWidth={2} aria-hidden="true" />
              </button>
              <strong>{formatMonthLabel(calendarMonth)}</strong>
              <button
                type="button"
                className="database-date-nav"
                aria-label="\u4e0b\u4e00\u4e2a\u6708"
                onClick={() => setCalendarMonth((current) => addMonths(current, 1))}
              >
                <ChevronRight size={14} strokeWidth={2} aria-hidden="true" />
              </button>
            </div>

            <div className="database-date-weekdays" aria-hidden="true">
              {WEEKDAY_LABELS.map((label) => (
                <span key={label}>{label}</span>
              ))}
            </div>

            <div className="database-date-grid">
              {calendarDays.map((day) => {
                const isoDate = toIsoDate(day);
                const isCurrentMonth = isSameMonth(day, calendarMonth);
                const isSelected = selectedDate ? isSameDay(day, selectedDate) : false;
                const isToday = isSameDay(day, new Date());

                return (
                  <button
                    key={isoDate}
                    type="button"
                    aria-label={isoDate}
                    className={[
                      "database-date-day",
                      !isCurrentMonth ? "is-outside" : "",
                      isSelected ? "is-selected" : "",
                      isToday ? "is-today" : "",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                    onClick={() => {
                      onChange(isoDate);
                      setIsEditing(false);
                    }}
                  >
                    {day.getDate()}
                  </button>
                );
              })}
            </div>

            <div className="database-date-footer">
              <button
                type="button"
                className="database-date-footer-button"
                onClick={() => {
                  onChange(toIsoDate(new Date()));
                  setIsEditing(false);
                }}
              >
                {TODAY_COPY}
              </button>
              <button
                type="button"
                className="database-date-footer-button"
                onClick={() => {
                  onChange("");
                  setIsEditing(false);
                }}
              >
                {CLEAR_COPY}
              </button>
            </div>
          </section>,
          "database-cell-popover--date",
        )}
      </div>
    );
  }

  if (!isEditing) {
    return (
      <button
        type="button"
        aria-label={`${property.name}-${record.id}`}
        className={
          property.type === "title"
            ? displayCopy === UNTITLED_RECORD
              ? "table-title-display is-placeholder"
              : "table-title-display"
            : displayCopy === EMPTY_CELL_COPY || displayCopy === EMPTY_SELECT_COPY
              ? "cell-display-button is-placeholder"
              : "cell-display-button"
        }
        onClick={() => setIsEditing(true)}
      >
        {displayCopy}
      </button>
    );
  }

  return (
    <input
      aria-label={`${property.name}-${record.id}`}
      className={property.type === "title" ? "table-title-input" : "cell-editor-input"}
      autoFocus
      type={property.type === "number" ? "number" : "text"}
      value={inputValue}
      onChange={(event) => onChange(event.currentTarget.value)}
      onBlur={exitEditing}
      onKeyDown={handleKeyDown}
    />
  );
}
