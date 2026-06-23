import {
  AlignLeft,
  Calendar,
  Check,
  Circle,
  Eye,
  Hash,
  ListFilter,
  Loader2,
} from "lucide-react";
import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type DragEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { createPortal } from "react-dom";
import type {
  DatabaseRecord,
  Property,
  RecordValue,
} from "../../domain/types";
import { RecordOpenButton } from "./RecordOpenControl";

type BoardViewProps = {
  properties: Property[];
  records: DatabaseRecord[];
  groupPropertyId: string | null;
  groupOptionOrder?: string[];
  hiddenColumnIds?: string[];
  showPropertyNames?: boolean;
  onRestoreHiddenColumn?: (columnId: string) => void;
  onOpenRecord?: (recordId: string) => void;
  onUpdateRecordValue?: (
    recordId: string,
    property: Property,
    value: string | string[],
  ) => void;
  onBoardRecordOrderChange?: (nextOrder: string[]) => void;
};

type BoardColumnId = "todo" | "doing" | "done";

type BoardColumnDefinition = {
  id: string;
  className: string;
  label: string;
  tone?: string;
  icon?: typeof Circle;
  kind: "status" | "option" | "ungrouped";
};

type BoardCardFieldValue = {
  key: string;
  label: string;
  tone?: string;
};

type BoardCardField =
  | {
      kind: "date";
      key: string;
      name: string;
      label: string;
      propertyType: "date";
    }
  | {
      kind: "chips";
      key: string;
      name: string;
      propertyType: "select" | "multiSelect";
      values: BoardCardFieldValue[];
    }
  | {
      kind: "text";
      key: string;
      name: string;
      label: string;
      propertyType: "text" | "number" | "checkbox" | "formula";
    };

type BoardDragPreviewPosition = {
  x: number;
  y: number;
};

type BoardDragState = {
  mode: "native" | "pointer";
  recordId: string;
  sourceColumnId: string;
  sourceColumnLabel: string;
  sourceColumnKind: BoardColumnDefinition["kind"];
  previewPosition: BoardDragPreviewPosition;
  previewOffsetX: number;
  previewOffsetY: number;
  previewWidth: number;
};

const BOARD_COLUMNS: Array<{
  id: BoardColumnId;
  label: string;
  icon: typeof Circle;
}> = [
  { id: "todo", label: "待开始", icon: Circle },
  { id: "doing", label: "进行中", icon: Loader2 },
  { id: "done", label: "已完成", icon: Check },
];

const DEFAULT_STATUS_LABELS: Record<BoardColumnId, string> = {
  todo: "待开始",
  doing: "进行中",
  done: "已完成",
};

const STATUS_PROPERTY_PATTERN =
  /status|stage|state|progress|workflow|状态|进度|流程/i;
const TODO_PATTERN = /todo|backlog|planned|待开始|未开始|计划/i;
const DOING_PATTERN = /doing|progress|active|进行中|处理中|开发中|执行中/i;
const DONE_PATTERN = /done|complete|completed|finished|已完成|完成|关闭/i;
const STATUS_MATCH_PATTERN =
  /todo|backlog|planned|doing|progress|active|done|complete|completed|finished|待开始|未开始|计划|进行中|处理中|执行中|已完成|完成|关闭/i;

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

  return color;
}

function sanitizeToken(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function normalizeValue(value: RecordValue) {
  if (Array.isArray(value)) {
    return value.join(" ");
  }

  return value == null ? "" : String(value);
}

function normalizeValueList(value: RecordValue) {
  if (Array.isArray(value)) {
    return value.map((item) => item.trim()).filter(Boolean);
  }

  if (value == null) {
    return [];
  }

  const normalized = String(value).trim();
  return normalized ? [normalized] : [];
}

function isSupportedStatusProperty(property: Property) {
  return (
    property.type === "text" ||
    property.type === "select" ||
    property.type === "multiSelect"
  );
}

function countStatusMatches(property: Property, records: DatabaseRecord[]) {
  let matchCount = 0;

  for (const record of records) {
    const labels = normalizeValueList(record.values[property.id]);

    if (labels.some((label) => STATUS_MATCH_PATTERN.test(label))) {
      matchCount += 1;
    }
  }

  return matchCount;
}

function getStatusProperty(
  properties: Property[],
  groupPropertyId: string | null,
  records: DatabaseRecord[],
) {
  if (groupPropertyId) {
    const configuredProperty = properties.find(
      (property) => property.id === groupPropertyId,
    );

    if (configuredProperty && isSupportedStatusProperty(configuredProperty)) {
      return configuredProperty;
    }
  }

  const namedMatch = properties.find(
    (property) =>
      isSupportedStatusProperty(property) &&
      STATUS_PROPERTY_PATTERN.test(`${property.key} ${property.name}`),
  );

  if (namedMatch) {
    return namedMatch;
  }

  const scoredMatch = properties
    .filter(isSupportedStatusProperty)
    .map((property) => ({
      property,
      score: countStatusMatches(property, records),
    }))
    .sort((left, right) => right.score - left.score)[0];

  if (scoredMatch && scoredMatch.score > 0) {
    return scoredMatch.property;
  }

  return null;
}

function resolveColumnId(value: string): BoardColumnId {
  if (DONE_PATTERN.test(value)) {
    return "done";
  }

  if (DOING_PATTERN.test(value)) {
    return "doing";
  }

  return "todo";
}

function getColumnClassName(label: string, fallbackId: string) {
  if (DONE_PATTERN.test(label)) {
    return "done";
  }

  if (DOING_PATTERN.test(label)) {
    return "doing";
  }

  if (TODO_PATTERN.test(label)) {
    return "todo";
  }

  return sanitizeToken(label) || fallbackId;
}

function getConfiguredBoardColumns(property: Property | null) {
  if (
    !property ||
    (property.type !== "select" && property.type !== "multiSelect") ||
    !property.config.options?.length
  ) {
    return null;
  }

  return property.config.options.map((option, index) => ({
    id: option.id,
    className: getColumnClassName(option.label, `option-${index + 1}`),
    label: option.label,
    tone: option.color,
    kind: "option" as const,
  }));
}

function orderConfiguredColumns(
  columns: ReturnType<typeof getConfiguredBoardColumns>,
  groupOptionOrder: string[] | undefined,
) {
  if (!columns?.length || !groupOptionOrder?.length) {
    return columns;
  }

  const columnById = new Map(columns.map((column) => [column.id, column] as const));
  const seenIds = new Set<string>();
  const orderedColumns = groupOptionOrder.flatMap((columnId) => {
    const column = columnById.get(columnId);

    if (!column || seenIds.has(columnId)) {
      return [];
    }

    seenIds.add(columnId);
    return [column];
  });

  for (const column of columns) {
    if (!seenIds.has(column.id)) {
      orderedColumns.push(column);
    }
  }

  return orderedColumns;
}

function getOptionTone(property: Property, label: string) {
  const options = property.config.options ?? [];
  return options.find((option) => option.label === label)?.color;
}

function getBoardColumnStyle(tone?: string): CSSProperties | undefined {
  if (!tone) {
    return undefined;
  }

  return {
    "--board-column-accent": tone,
    "--board-column-bg": resolveOptionColor(tone, "10"),
    "--board-column-border": resolveOptionColor(tone, "26"),
  } as CSSProperties;
}

function getBoardChipStyle(tone?: string): CSSProperties | undefined {
  if (!tone) {
    return undefined;
  }

  return {
    "--board-chip-color": tone,
    "--board-chip-bg": resolveOptionColor(tone, "18"),
    "--board-chip-border": resolveOptionColor(tone, "2a"),
  } as CSSProperties;
}

function getBoardDragFollowerTransform(
  position: BoardDragPreviewPosition,
  dragState: BoardDragState,
) {
  return `translate3d(${position.x - dragState.previewOffsetX}px, ${
    position.y - dragState.previewOffsetY
  }px, 0)`;
}

function getBoardDragFollowerStyle(
  position: BoardDragPreviewPosition,
  dragState: BoardDragState,
): CSSProperties {
  return {
    transform: getBoardDragFollowerTransform(position, dragState),
    width: dragState.previewWidth > 0 ? `${dragState.previewWidth}px` : undefined,
  };
}

function getBoardFieldIcon(propertyType: BoardCardField["propertyType"]) {
  switch (propertyType) {
    case "date":
      return Calendar;
    case "multiSelect":
      return ListFilter;
    case "select":
      return Circle;
    case "number":
      return Hash;
    case "checkbox":
      return Check;
    case "formula":
      return Hash;
    case "text":
    default:
      return AlignLeft;
  }
}

function createBoardCardDragImage(cardElement: HTMLElement) {
  const preview = cardElement.cloneNode(true) as HTMLElement;
  const { width } = cardElement.getBoundingClientRect();

  preview.classList.add("board-card-drag-image");
  preview.style.width = width > 0 ? `${width}px` : "";
  preview.style.position = "fixed";
  preview.style.top = "0";
  preview.style.left = "0";
  preview.style.margin = "0";
  preview.style.pointerEvents = "none";
  preview.style.transform = "translate3d(-9999px, -9999px, 0)";
  preview.style.zIndex = "9999";

  document.body.appendChild(preview);

  return preview;
}

function getBoardDragPreviewMetrics(
  cardElement: HTMLElement,
  clientX?: number,
  clientY?: number,
) {
  const rect = cardElement.getBoundingClientRect();
  const fallbackOffsetX = rect.width > 0 ? Math.min(28, rect.width / 2) : 28;
  const fallbackOffsetY = rect.height > 0 ? Math.min(18, rect.height / 2) : 18;
  const hasClientPoint =
    typeof clientX === "number" &&
    typeof clientY === "number" &&
    (clientX !== 0 || clientY !== 0);

  if (!hasClientPoint) {
    return {
      previewOffsetX: fallbackOffsetX,
      previewOffsetY: fallbackOffsetY,
      previewWidth: rect.width,
    };
  }

  return {
    previewOffsetX: Math.min(Math.max(clientX - rect.left, 0), rect.width || clientX),
    previewOffsetY: Math.min(Math.max(clientY - rect.top, 0), rect.height || clientY),
    previewWidth: rect.width,
  };
}

function getBoardCardFields(
  properties: Property[],
  groupProperty: Property | null,
  record: DatabaseRecord,
) {
  const fields: BoardCardField[] = [];

  for (const property of properties) {
    if (property.type === "title" || property.id === groupProperty?.id) {
      continue;
    }

    const value = record.values[property.id];

    if (property.type === "date") {
      const label = normalizeValue(value).trim();

      if (label) {
        fields.push({
          kind: "date",
          key: `${property.id}-date`,
          name: property.name,
          label,
          propertyType: "date",
        });
      }

      continue;
    }

    if (property.type === "select") {
      const label = normalizeValue(value).trim();

      if (label) {
        fields.push({
          kind: "chips",
          key: `${property.id}-select`,
          name: property.name,
          propertyType: "select",
          values: [
            {
              key: `${property.id}-${label}`,
              label,
              tone: getOptionTone(property, label),
            },
          ],
        });
      }

      continue;
    }

    if (property.type === "multiSelect") {
      const labels = normalizeValueList(value);

      if (labels.length > 0) {
        fields.push({
          kind: "chips",
          key: `${property.id}-multi-select`,
          name: property.name,
          propertyType: "multiSelect",
          values: labels.map((label) => ({
            key: `${property.id}-${label}`,
            label,
            tone: getOptionTone(property, label),
          })),
        });
      }

      continue;
    }

    if (property.type === "checkbox") {
      if (value === true) {
        fields.push({
          kind: "text",
          key: `${property.id}-checked`,
          name: property.name,
          label: "已勾选",
          propertyType: "checkbox",
        });
      }

      continue;
    }

    if (
      property.type === "text" ||
      property.type === "number" ||
      property.type === "formula"
    ) {
      const label = normalizeValue(value).trim();

      if (label) {
        fields.push({
          kind: "text",
          key: `${property.id}-value`,
          name: property.name,
          label,
          propertyType: property.type,
        });
      }
    }
  }

  return fields;
}

function renderBoardCardFields(
  fields: BoardCardField[],
  showPropertyNames: boolean,
) {
  if (fields.length === 0) {
    return null;
  }

  return (
    <div className="board-card-properties">
      {fields.map((field) => (
        <div
          key={field.key}
          className="board-card-property"
          data-property-type={field.propertyType}
        >
          {showPropertyNames ? (
            <span className="board-card-property-name">
              {(() => {
                const FieldIcon = getBoardFieldIcon(field.propertyType);
                return <FieldIcon size={12} strokeWidth={2} aria-hidden="true" />;
              })()}
              <span>{field.name}</span>
            </span>
          ) : null}

          {field.kind === "date" ? (
            <div className="board-card-property-value">
              <span>{field.label}</span>
            </div>
          ) : field.kind === "chips" ? (
            <div className="board-card-property-value board-card-property-value--chips">
              {field.values.map((value) => (
                <span
                  key={value.key}
                  className="board-card-chip"
                  style={getBoardChipStyle(value.tone)}
                >
                  {value.label}
                </span>
              ))}
            </div>
          ) : (
            <div className="board-card-property-value">
              <span>{field.label}</span>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function findMatchingStatusLabel(
  property: Property,
  targetColumnId: BoardColumnId,
  records: DatabaseRecord[],
) {
  if (property.type === "select" || property.type === "multiSelect") {
    const matchedOption = (property.config.options ?? []).find(
      (option) => resolveColumnId(option.label) === targetColumnId,
    );

    if (matchedOption) {
      return matchedOption.label;
    }
  }

  for (const record of records) {
    for (const label of normalizeValueList(record.values[property.id])) {
      if (resolveColumnId(label) === targetColumnId) {
        return label;
      }
    }
  }

  return DEFAULT_STATUS_LABELS[targetColumnId];
}

function resolveNextBoardValue(
  property: Property,
  currentValue: RecordValue,
  targetColumn: BoardColumnDefinition,
  sourceColumnId: string,
  sourceColumnLabel: string,
  sourceColumnKind: BoardColumnDefinition["kind"],
  records: DatabaseRecord[],
) {
  if (targetColumn.kind === "ungrouped") {
    return property.type === "multiSelect" ? [] : "";
  }

  const targetLabel =
    targetColumn.kind === "option"
      ? targetColumn.label
      : findMatchingStatusLabel(property, targetColumn.id as BoardColumnId, records);

  if (property.type === "multiSelect") {
    const currentLabels = normalizeValueList(currentValue);
    const nextLabels = currentLabels.filter((label) => {
      if (sourceColumnId === "ungrouped") {
        return true;
      }

      if (sourceColumnKind === "option") {
        return label !== sourceColumnLabel;
      }

      return resolveColumnId(label) !== sourceColumnId;
    });

    if (!nextLabels.includes(targetLabel)) {
      nextLabels.push(targetLabel);
    }

    return nextLabels;
  }

  return targetLabel;
}

export default function BoardView({
  properties,
  records,
  groupPropertyId,
  groupOptionOrder,
  hiddenColumnIds = [],
  showPropertyNames = true,
  onRestoreHiddenColumn,
  onOpenRecord,
  onUpdateRecordValue,
  onBoardRecordOrderChange,
}: BoardViewProps) {
  const [dragState, setDragState] = useState<BoardDragState | null>(null);
  const [dropColumnId, setDropColumnId] = useState<string | null>(null);
  const dragImageRef = useRef<HTMLElement | null>(null);
  const dragFollowerRef = useRef<HTMLElement | null>(null);
  const dragPreviewFrameRef = useRef<number | null>(null);
  const latestDragPreviewPositionRef = useRef<BoardDragPreviewPosition | null>(
    null,
  );
  const statusProperty = getStatusProperty(properties, groupPropertyId, records);
  const canDragRecords = Boolean(statusProperty && onUpdateRecordValue);
  const configuredColumns = orderConfiguredColumns(
    getConfiguredBoardColumns(statusProperty),
    groupOptionOrder,
  );
  const columnDefinitions: BoardColumnDefinition[] =
    configuredColumns ??
    BOARD_COLUMNS.map(({ id, label, icon }) => ({
      id,
      className: id,
      label,
      icon,
      kind: "status" as const,
    }));

  const groupedRecords = new Map<string, DatabaseRecord[]>(
    columnDefinitions.map((column) => [column.id, []]),
  );
  const ungroupedRecords: DatabaseRecord[] = [];

  records.forEach((record) => {
    if (configuredColumns && statusProperty) {
      const matchedColumns = columnDefinitions.filter((column) =>
        normalizeValueList(record.values[statusProperty.id]).includes(column.label),
      );

      if (matchedColumns.length === 0) {
        ungroupedRecords.push(record);
        return;
      }

      matchedColumns.forEach((column) => {
        groupedRecords.get(column.id)?.push(record);
      });

      return;
    }

    const rawStatus = statusProperty
      ? normalizeValue(record.values[statusProperty.id]).trim()
      : "";
    groupedRecords.get(resolveColumnId(rawStatus))?.push(record);
  });

  const renderedColumns =
    configuredColumns && ungroupedRecords.length > 0
      ? [
          ...columnDefinitions,
          {
            id: "ungrouped",
            className: "ungrouped",
            label: "未分组",
            kind: "ungrouped" as const,
          },
        ]
      : columnDefinitions;

  if (configuredColumns && ungroupedRecords.length > 0) {
    groupedRecords.set("ungrouped", ungroupedRecords);
  }

  const hiddenColumnIdSet = new Set(hiddenColumnIds);
  const visibleColumns = renderedColumns.filter(
    (column) => !hiddenColumnIdSet.has(column.id),
  );
  const hiddenColumns = renderedColumns.filter((column) =>
    hiddenColumnIdSet.has(column.id),
  );

  const draggedRecord = dragState
    ? records.find((record) => record.id === dragState.recordId) ?? null
    : null;
  const draggedRecordTitle = draggedRecord?.title || "未命名记录";
  const draggedRecordFields = draggedRecord
    ? getBoardCardFields(properties, statusProperty, draggedRecord)
    : [];

  const clearDragState = () => {
    if (dragPreviewFrameRef.current !== null) {
      window.cancelAnimationFrame(dragPreviewFrameRef.current);
      dragPreviewFrameRef.current = null;
    }

    dragImageRef.current?.remove();
    dragImageRef.current = null;
    latestDragPreviewPositionRef.current = null;
    setDragState(null);
    setDropColumnId(null);
  };

  const updateDragFollowerPosition = (
    position: BoardDragPreviewPosition,
    currentDragState: BoardDragState,
  ) => {
    if (!dragFollowerRef.current) {
      return;
    }

    dragFollowerRef.current.style.transform = getBoardDragFollowerTransform(
      position,
      currentDragState,
    );
  };

  useEffect(() => {
    if (!dragState) {
      return;
    }

    const resetPointerDrag = () => {
      clearDragState();
    };

    const handlePointerMove = (event: PointerEvent) => {
      if (dragState.mode !== "pointer" || event.buttons === 0) {
        return;
      }

      latestDragPreviewPositionRef.current = {
        x: event.clientX,
        y: event.clientY,
      };

      updateDragFollowerPosition(latestDragPreviewPositionRef.current, dragState);

      if (dragPreviewFrameRef.current !== null) {
        return;
      }

      dragPreviewFrameRef.current = window.requestAnimationFrame(() => {
        dragPreviewFrameRef.current = null;

        if (!dragFollowerRef.current || !latestDragPreviewPositionRef.current) {
          return;
        }

        updateDragFollowerPosition(
          latestDragPreviewPositionRef.current,
          dragState,
        );
      });
    };

    if (dragState.mode === "pointer") {
      window.addEventListener("pointermove", handlePointerMove);
    }
    window.addEventListener("pointerup", resetPointerDrag);
    window.addEventListener("pointercancel", resetPointerDrag);

    return () => {
      if (dragPreviewFrameRef.current !== null) {
        window.cancelAnimationFrame(dragPreviewFrameRef.current);
        dragPreviewFrameRef.current = null;
      }
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", resetPointerDrag);
      window.removeEventListener("pointercancel", resetPointerDrag);
    };
  }, [dragState]);

  useEffect(
    () => () => {
      if (dragPreviewFrameRef.current !== null) {
        window.cancelAnimationFrame(dragPreviewFrameRef.current);
        dragPreviewFrameRef.current = null;
      }
      dragImageRef.current?.remove();
      dragImageRef.current = null;
    },
    [],
  );

  const handleCardDragStart = (
    event: DragEvent<HTMLElement>,
    recordId: string,
    sourceColumn: BoardColumnDefinition,
  ) => {
    if (!statusProperty || !onUpdateRecordValue) {
      return;
    }

    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", recordId);
    const previewMetrics = getBoardDragPreviewMetrics(
      event.currentTarget,
      event.clientX,
      event.clientY,
    );
    dragImageRef.current?.remove();
    const dragImage = createBoardCardDragImage(event.currentTarget);
    dragImageRef.current = dragImage;
    event.dataTransfer.setDragImage(
      dragImage,
      previewMetrics.previewOffsetX,
      previewMetrics.previewOffsetY,
    );
    latestDragPreviewPositionRef.current = null;
    setDragState({
      mode: "native",
      recordId,
      sourceColumnId: sourceColumn.id,
      sourceColumnLabel: sourceColumn.label,
      sourceColumnKind: sourceColumn.kind,
      previewPosition: {
        x: event.clientX,
        y: event.clientY,
      },
      previewOffsetX: previewMetrics.previewOffsetX,
      previewOffsetY: previewMetrics.previewOffsetY,
      previewWidth: previewMetrics.previewWidth,
    });
  };

  const handleCardPointerDown = (
    event: ReactPointerEvent<HTMLElement>,
    recordId: string,
    sourceColumn: BoardColumnDefinition,
  ) => {
    if (!canDragRecords || event.button !== 0) {
      return;
    }

    if (
      event.target instanceof Element &&
      event.target.closest("button, a, input, textarea, select, [role='button']")
    ) {
      return;
    }

    event.preventDefault();
    const previewMetrics = getBoardDragPreviewMetrics(
      event.currentTarget,
      event.clientX,
      event.clientY,
    );
    const previewPosition = {
      x: event.clientX,
      y: event.clientY,
    };
    latestDragPreviewPositionRef.current = previewPosition;
    setDragState({
      mode: "pointer",
      recordId,
      sourceColumnId: sourceColumn.id,
      sourceColumnLabel: sourceColumn.label,
      sourceColumnKind: sourceColumn.kind,
      previewPosition,
      previewOffsetX: previewMetrics.previewOffsetX,
      previewOffsetY: previewMetrics.previewOffsetY,
      previewWidth: previewMetrics.previewWidth,
    });
    setDropColumnId(sourceColumn.id);
  };

  const handleCardDragEnd = () => {
    clearDragState();
  };

  const handleColumnDrop = (column: BoardColumnDefinition) => {
    if (!statusProperty || !onUpdateRecordValue || !dragState) {
      clearDragState();
      return;
    }

    if (dragState.sourceColumnId === column.id) {
      clearDragState();
      return;
    }

    const record = records.find((item) => item.id === dragState.recordId);

    if (!record) {
      clearDragState();
      return;
    }

    const nextValue = resolveNextBoardValue(
      statusProperty,
      record.values[statusProperty.id],
      column,
      dragState.sourceColumnId,
      dragState.sourceColumnLabel,
      dragState.sourceColumnKind,
      records,
    );

    onUpdateRecordValue(record.id, statusProperty, nextValue);

    if (onBoardRecordOrderChange) {
      const nextOrder = records.map((item) => item.id);
      const sourceIndex = nextOrder.indexOf(record.id);

      if (sourceIndex !== -1) {
        nextOrder.splice(sourceIndex, 1);
      }

      const targetColumnRecordIds = (groupedRecords.get(column.id) ?? []).map(
        (item) => item.id,
      );

      if (targetColumnRecordIds.length === 0) {
        nextOrder.push(record.id);
      } else {
        const lastTargetRecordId =
          targetColumnRecordIds[targetColumnRecordIds.length - 1];
        const targetIndex = nextOrder.indexOf(lastTargetRecordId);

        if (targetIndex === -1) {
          nextOrder.push(record.id);
        } else {
          nextOrder.splice(targetIndex + 1, 0, record.id);
        }
      }

      onBoardRecordOrderChange(nextOrder);
    }

    clearDragState();
  };

  return (
    <section className="database-alt-view board-view" aria-label="看板视图">
      <header className="database-alt-view-header">
        <div>
          <h2>看板视图</h2>
          <p>
            {statusProperty
              ? `按 ${statusProperty.name} 分组`
              : "当前按默认状态分组"}
          </p>
        </div>
        <span className="database-alt-view-meta">{records.length} 条记录</span>
      </header>

      <div className="board-view-content">
        <div className="board-view-grid">
          {visibleColumns.map((column) => {
            const columnRecords = groupedRecords.get(column.id) ?? [];
            const columnStyle =
              column.kind === "option" ? getBoardColumnStyle(column.tone) : undefined;
            const ColumnIcon = column.icon;
            const isDropTarget =
              dropColumnId === column.id && dragState?.sourceColumnId !== column.id;

            return (
              <section
                key={column.id}
                className={`board-column board-column--${column.className}${
                  isDropTarget ? " is-drop-target" : ""
                }`}
                data-column-id={column.id}
                data-column-kind={column.kind}
                style={columnStyle}
                onDragEnter={(event) => {
                  if (!dragState) {
                    return;
                  }

                  event.preventDefault();
                  setDropColumnId(column.id);
                }}
                onDragOver={(event) => {
                  if (!dragState) {
                    return;
                  }

                  event.preventDefault();
                  event.dataTransfer.dropEffect = "move";

                  if (dropColumnId !== column.id) {
                    setDropColumnId(column.id);
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

                  setDropColumnId((current) => (current === column.id ? null : current));
                }}
                onDrop={(event) => {
                  event.preventDefault();
                  handleColumnDrop(column);
                }}
                onPointerEnter={(event) => {
                  if (!dragState || event.buttons === 0) {
                    return;
                  }

                  setDropColumnId(column.id);
                }}
                onPointerMove={(event) => {
                  if (!dragState || event.buttons === 0) {
                    return;
                  }

                  if (dropColumnId !== column.id) {
                    setDropColumnId(column.id);
                  }
                }}
                onPointerUp={(event) => {
                  if (!dragState) {
                    return;
                  }

                  event.preventDefault();
                  handleColumnDrop(column);
                }}
              >
                <header className="board-column-header">
                  <div className="board-column-title">
                    {ColumnIcon ? (
                      <ColumnIcon size={14} strokeWidth={2} aria-hidden="true" />
                    ) : (
                      <span className="board-column-dot" aria-hidden="true" />
                    )}
                    <span>{column.label}</span>
                  </div>
                  <span className="board-column-count">{columnRecords.length}</span>
                </header>

                <div className="board-column-body">
                  {columnRecords.length > 0 ? (
                    columnRecords.map((record) => {
                      const fields = getBoardCardFields(
                        properties,
                        statusProperty,
                        record,
                      );
                      const recordTitle = record.title || "未命名记录";

                      return (
                        <article
                          key={record.id}
                          className={`board-card${
                            dragState?.recordId === record.id ? " is-dragging" : ""
                          }`}
                          draggable={canDragRecords}
                          onPointerDown={(event) =>
                            handleCardPointerDown(event, record.id, column)
                          }
                          onDragStart={(event) =>
                            handleCardDragStart(event, record.id, column)
                          }
                          onDragEnd={handleCardDragEnd}
                        >
                          <div className="board-card-header">
                            <h3>{recordTitle}</h3>
                            <RecordOpenButton
                              className="record-open-button board-card-open-button"
                              ariaLabel={`打开 ${recordTitle}`}
                              onClick={() => onOpenRecord?.(record.id)}
                            />
                          </div>

                          {renderBoardCardFields(fields, showPropertyNames)}
                        </article>
                      );
                    })
                  ) : (
                    <div className="board-column-empty">暂无记录</div>
                  )}
                </div>
              </section>
            );
          })}
        </div>

        {hiddenColumns.length > 0 ? (
          <aside className="board-hidden-groups" aria-label="隐藏的组">
            <header className="board-hidden-groups-header">
              <h3>隐藏的组</h3>
            </header>
            <div className="board-hidden-groups-list">
              {hiddenColumns.map((column) => {
                const columnRecords = groupedRecords.get(column.id) ?? [];

                return (
                  <div
                    key={column.id}
                    className="board-hidden-groups-item"
                    style={
                      column.kind === "option"
                        ? getBoardColumnStyle(column.tone)
                        : undefined
                    }
                  >
                    <div className="board-hidden-groups-copy">
                      <span className="board-hidden-groups-name">{column.label}</span>
                      <span className="board-hidden-groups-count">
                        {columnRecords.length} 条记录
                      </span>
                    </div>
                    <button
                      type="button"
                      className="board-hidden-groups-action"
                      aria-label={`显示分组 ${column.label}`}
                      onClick={() => onRestoreHiddenColumn?.(column.id)}
                    >
                      <Eye size={14} strokeWidth={2} aria-hidden="true" />
                    </button>
                  </div>
                );
              })}
            </div>
          </aside>
        ) : null}
      </div>

      {dragState?.mode === "pointer" && draggedRecord
        ? createPortal(
            <article
              className="board-card board-card-drag-follower"
              aria-hidden="true"
              ref={dragFollowerRef}
              style={getBoardDragFollowerStyle(
                dragState.previewPosition,
                dragState,
              )}
            >
              <div className="board-card-header">
                <h3>{draggedRecordTitle}</h3>
              </div>

              {renderBoardCardFields(draggedRecordFields, showPropertyNames)}
            </article>,
            document.body,
          )
        : null}
    </section>
  );
}
