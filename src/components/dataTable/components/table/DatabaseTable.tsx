import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
} from "react";
import { ChevronDown, ChevronRight, Eye, GripVertical, Plus } from "lucide-react";
import { createPortal } from "react-dom";
import CellEditor from "./CellEditor";
import ColumnMenu from "./ColumnMenu";
import { RecordOpenLink } from "./RecordOpenControl";
import { evaluateFormulaValue } from "../../domain/query";
import type {
  AppState,
  DatabaseRecord,
  Property,
  PropertyType,
  SelectOption,
  SortRule,
} from "../../domain/types";
import type { TableGroupSection, TableHiddenGroup } from "./tableGrouping";
import type { TableWidthMode } from "./viewTypes";

const UNTITLED_RECORD = "未命名记录";
const SELECTION_COLUMN_WIDTH = 52;
const ADD_PROPERTY_COLUMN_WIDTH = 44;
const DEFAULT_COLUMN_WIDTH = 200;
const TITLE_COLUMN_WIDTH = 280;
const MIN_COLUMN_WIDTH = 120;
const COLUMN_MENU_WIDTH = 320;
const COLUMN_MENU_OFFSET = 6;
const VIEWPORT_MARGIN = 16;

const HEADER_ICONS: Record<PropertyType, string> = {
  title: "Aa",
  text: "Aa",
  number: "#",
  select: "S",
  multiSelect: "M",
  date: "D",
  checkbox: "[]",
  formula: "fx",
};

type DatabaseTableProps = {
  state: AppState;
  properties: Property[];
  records: DatabaseRecord[];
  hasAnyRecords?: boolean;
  tableWidthMode?: TableWidthMode;
  wrapCells?: boolean;
  freezeFirstColumn?: boolean;
  columnWidths?: Record<string, number>;
  draggingPropertyId?: string | null;
  canReorderRows?: boolean;
  draggingRecordId?: string | null;
  sortRule?: SortRule | null;
  activeColumnMenuPropertyId?: string | null;
  selectedRecordIds?: string[];
  groupedSections?: TableGroupSection[];
  hiddenGroups?: TableHiddenGroup[];
  loadMoreCount?: number;
  onCreateRecord?: () => void;
  onCreateRecordInGroup?: (group: TableGroupSection) => void;
  onAddProperty?: () => void;
  recordBasePath?: string;
  onOpenRecord?: (
    event: ReactMouseEvent<HTMLAnchorElement>,
    recordId: string,
  ) => void;
  onToggleRecordSelection?: (recordId: string) => void;
  onToggleAllVisibleRows?: () => void;
  onRestoreGroup?: (groupId: string) => void;
  onToggleGroupCollapse?: (groupId: string) => void;
  onToggleColumnMenu?: (propertyId: string) => void;
  onSortProperty?: (
    propertyId: string,
    direction: "asc" | "desc",
  ) => void;
  onClearPropertySort?: () => void;
  onHideProperty?: (propertyId: string) => void;
  onDeleteProperty?: (propertyId: string) => void;
  onRenameProperty?: (propertyId: string, name: string) => void;
  onUpdatePropertyType?: (propertyId: string, type: PropertyType) => void;
  onUpdatePropertyOptions?: (propertyId: string, options: SelectOption[]) => void;
  onCreateOption?: (property: Property, label: string) => void;
  onDeleteOption?: (property: Property, optionId: string) => void;
  onUpdateFormulaExpression?: (
    propertyId: string,
    formulaExpression: string,
  ) => void;
  onInsertProperty?: (propertyId: string, side: "left" | "right") => void;
  onColumnWidthChange?: (propertyId: string, width: number) => void;
  onResetColumnWidth?: (propertyId: string) => void;
  onDragPropertyStart?: (propertyId: string) => void;
  onDragPropertyEnd?: () => void;
  onReorderProperty?: (propertyId: string, targetPropertyId: string) => void;
  onDragRecordStart?: (recordId: string) => void;
  onDragRecordEnd?: () => void;
  onReorderRecord?: (recordId: string, targetRecordId: string) => void;
  onLoadMore?: () => void;
  onCellChange: (
    recordId: string,
    property: Property,
    value: string | boolean | string[],
  ) => void;
};

function getDefaultColumnWidth(property: Property) {
  return property.type === "title" ? TITLE_COLUMN_WIDTH : DEFAULT_COLUMN_WIDTH;
}

export default function DatabaseTable({
  state,
  properties,
  records,
  hasAnyRecords = false,
  tableWidthMode = "fitPage",
  wrapCells = false,
  freezeFirstColumn = false,
  columnWidths = {},
  draggingPropertyId = null,
  canReorderRows = false,
  draggingRecordId = null,
  sortRule = null,
  activeColumnMenuPropertyId = null,
  selectedRecordIds = [],
  groupedSections,
  hiddenGroups = [],
  loadMoreCount = 0,
  onCreateRecord,
  onCreateRecordInGroup,
  onAddProperty,
  recordBasePath = "",
  onOpenRecord,
  onToggleRecordSelection,
  onToggleAllVisibleRows,
  onRestoreGroup,
  onToggleGroupCollapse,
  onToggleColumnMenu,
  onSortProperty,
  onClearPropertySort,
  onHideProperty,
  onDeleteProperty,
  onRenameProperty,
  onUpdatePropertyType,
  onUpdatePropertyOptions,
  onCreateOption,
  onDeleteOption,
  onUpdateFormulaExpression,
  onInsertProperty,
  onColumnWidthChange,
  onResetColumnWidth,
  onDragPropertyStart,
  onDragPropertyEnd,
  onReorderProperty,
  onDragRecordStart,
  onDragRecordEnd,
  onReorderRecord,
  onLoadMore,
  onCellChange,
}: DatabaseTableProps) {
  const headerCheckboxRef = useRef<HTMLInputElement | null>(null);
  const headerRefs = useRef<Record<string, HTMLTableCellElement | null>>({});
  const columnMenuLayerRef = useRef<HTMLDivElement | null>(null);
  const resizeSessionRef = useRef<{
    propertyId: string;
    startX: number;
    startWidth: number;
  } | null>(null);
  const suppressColumnMenuClickRef = useRef(false);
  const suppressColumnMenuClickTimerRef = useRef<number | null>(null);
  const [columnMenuPosition, setColumnMenuPosition] = useState({
    top: 0,
    left: 0,
  });
  const hasVisibleRows = records.length > 0;
  const canLoadMore = loadMoreCount > 0 && Boolean(onLoadMore);
  const allVisibleSelected =
    records.length > 0 && records.every((record) => selectedRecordIds.includes(record.id));
  const hasSomeVisibleSelected =
    records.some((record) => selectedRecordIds.includes(record.id)) && !allVisibleSelected;
  const emptyCopy = hasAnyRecords
    ? "当前视图里没有符合条件的页面"
    : "从这里开始创建第一条记录";
  const hasAddPropertyColumn = Boolean(onAddProperty);
  const totalTableWidth = properties.reduce(
    (width, property) =>
      width + (columnWidths[property.id] ?? getDefaultColumnWidth(property)),
    SELECTION_COLUMN_WIDTH + (hasAddPropertyColumn ? ADD_PROPERTY_COLUMN_WIDTH : 0),
  );
  const resolvedTableWidth =
    tableWidthMode === "fitPage"
      ? `max(100%, ${totalTableWidth}px)`
      : `${totalTableWidth}px`;
  const totalColumnSpan = Math.max(
    properties.length + 1 + (hasAddPropertyColumn ? 1 : 0),
    1,
  );
  const activeMenuProperty = activeColumnMenuPropertyId
    ? properties.find((property) => property.id === activeColumnMenuPropertyId) ?? null
    : null;

  useEffect(() => {
    if (headerCheckboxRef.current) {
      headerCheckboxRef.current.indeterminate = hasSomeVisibleSelected;
    }
  }, [hasSomeVisibleSelected]);

  useEffect(() => {
    const handleResizeMove = (event: globalThis.MouseEvent) => {
      const session = resizeSessionRef.current;

      if (!session) {
        return;
      }

      const width = Math.max(
        MIN_COLUMN_WIDTH,
        session.startWidth + event.clientX - session.startX,
      );
      onColumnWidthChange?.(session.propertyId, width);
    };

    const handleResizeEnd = () => {
      if (!resizeSessionRef.current) {
        return;
      }

      resizeSessionRef.current = null;
      suppressColumnMenuClickRef.current = true;
      if (suppressColumnMenuClickTimerRef.current) {
        window.clearTimeout(suppressColumnMenuClickTimerRef.current);
      }
      suppressColumnMenuClickTimerRef.current = window.setTimeout(() => {
        suppressColumnMenuClickRef.current = false;
        suppressColumnMenuClickTimerRef.current = null;
      }, 0);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };

    window.addEventListener("mousemove", handleResizeMove);
    window.addEventListener("mouseup", handleResizeEnd);

    return () => {
      window.removeEventListener("mousemove", handleResizeMove);
      window.removeEventListener("mouseup", handleResizeEnd);
      if (suppressColumnMenuClickTimerRef.current) {
        window.clearTimeout(suppressColumnMenuClickTimerRef.current);
      }
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, [onColumnWidthChange]);

  const consumeSuppressedColumnMenuClick = () => {
    if (!suppressColumnMenuClickRef.current) {
      return false;
    }

    suppressColumnMenuClickRef.current = false;
    if (suppressColumnMenuClickTimerRef.current) {
      window.clearTimeout(suppressColumnMenuClickTimerRef.current);
      suppressColumnMenuClickTimerRef.current = null;
    }
    return true;
  };

  const setHeaderRef = useCallback(
    (propertyId: string, element: HTMLTableCellElement | null) => {
      if (element) {
        headerRefs.current[propertyId] = element;
        return;
      }

      delete headerRefs.current[propertyId];
    },
    [],
  );

  const updateColumnMenuPosition = useCallback(() => {
    if (!activeMenuProperty) {
      return;
    }

    const headerElement = headerRefs.current[activeMenuProperty.id];

    if (!headerElement) {
      return;
    }

    const headerRect = headerElement.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const menuWidth = Math.min(
      COLUMN_MENU_WIDTH,
      Math.max(viewportWidth - VIEWPORT_MARGIN * 2, 0),
    );
    const menuHeight = columnMenuLayerRef.current?.offsetHeight ?? 0;
    let left = headerRect.right - menuWidth;
    let top = headerRect.bottom + COLUMN_MENU_OFFSET;

    left = Math.max(
      VIEWPORT_MARGIN,
      Math.min(left, viewportWidth - VIEWPORT_MARGIN - menuWidth),
    );

    if (menuHeight > 0 && top + menuHeight > viewportHeight - VIEWPORT_MARGIN) {
      const flippedTop = headerRect.top - COLUMN_MENU_OFFSET - menuHeight;

      top =
        flippedTop >= VIEWPORT_MARGIN
          ? flippedTop
          : Math.max(VIEWPORT_MARGIN, viewportHeight - VIEWPORT_MARGIN - menuHeight);
    }

    setColumnMenuPosition((current) =>
      current.top === top && current.left === left ? current : { top, left },
    );
  }, [activeMenuProperty]);

  useLayoutEffect(() => {
    if (!activeMenuProperty) {
      return;
    }

    updateColumnMenuPosition();
  }, [activeMenuProperty, columnWidths, properties, updateColumnMenuPosition]);

  useEffect(() => {
    if (!activeMenuProperty) {
      return;
    }

    const syncColumnMenuPosition = () => {
      updateColumnMenuPosition();
    };

    window.addEventListener("resize", syncColumnMenuPosition);
    window.addEventListener("scroll", syncColumnMenuPosition, true);

    return () => {
      window.removeEventListener("resize", syncColumnMenuPosition);
      window.removeEventListener("scroll", syncColumnMenuPosition, true);
    };
  }, [activeMenuProperty, updateColumnMenuPosition]);

  const beginColumnResize = (
    event: ReactMouseEvent<HTMLButtonElement>,
    property: Property,
  ) => {
    event.preventDefault();
    event.stopPropagation();

    resizeSessionRef.current = {
      propertyId: property.id,
      startX: event.clientX,
      startWidth: columnWidths[property.id] ?? getDefaultColumnWidth(property),
    };
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  };

  const handleColumnHeaderClick = (
    event: ReactMouseEvent<HTMLTableCellElement>,
    propertyId: string,
  ) => {
    if (consumeSuppressedColumnMenuClick()) {
      return;
    }

    const target = event.target;

    if (
      !(target instanceof Element) ||
      target.closest(".database-column-menu") ||
      target.closest(".database-column-drag-handle") ||
      target.closest(".database-column-menu-trigger") ||
      target.closest(".database-column-resize-handle")
    ) {
      return;
    }

    onToggleColumnMenu?.(propertyId);
  };

  const renderRecordRow = (record: DatabaseRecord, keyPrefix = "row") => (
    <tr
      key={`${keyPrefix}-${record.id}`}
      className={
        [
          "database-row",
          selectedRecordIds.includes(record.id) ? "is-selected" : "",
          draggingRecordId === record.id ? "is-dragging" : "",
        ]
          .filter(Boolean)
          .join(" ")
      }
      onDragEnter={(event) => {
        if (!canReorderRows || draggingRecordId === record.id) {
          return;
        }

        event.preventDefault();
      }}
      onDragOver={(event) => {
        if (!canReorderRows || draggingRecordId === record.id) {
          return;
        }

        event.preventDefault();
      }}
      onDrop={(event) => {
        if (!canReorderRows || draggingRecordId === record.id) {
          return;
        }

        event.preventDefault();
        const recordId = event.dataTransfer.getData("text/plain") || draggingRecordId;

        if (recordId) {
          onReorderRecord?.(recordId, record.id);
        }
      }}
    >
      <td className="database-selection-cell">
        <div className="database-row-leading-actions">
          {canReorderRows ? (
            <button
              type="button"
              className="database-row-drag-handle"
              draggable
              aria-label={`拖动 ${record.title || UNTITLED_RECORD}`}
              onDragStart={(event) => {
                event.dataTransfer.setData("text/plain", record.id);
                event.dataTransfer.effectAllowed = "move";
                onDragRecordStart?.(record.id);
              }}
              onDragEnd={() => onDragRecordEnd?.()}
            >
              <GripVertical size={12} strokeWidth={2} aria-hidden="true" />
            </button>
          ) : null}
          <input
            type="checkbox"
            className="database-selection-checkbox"
            aria-label={`选择 ${record.title || UNTITLED_RECORD}`}
            checked={selectedRecordIds.includes(record.id)}
            onChange={() => onToggleRecordSelection?.(record.id)}
          />
        </div>
      </td>
      {properties.map((property) => (
        <td key={property.id}>
          {property.type === "title" ? (
            <div className="title-cell">
              <CellEditor
                property={property}
                record={record}
                onChange={(value) => onCellChange(record.id, property, value)}
                onCreateOption={(label) => onCreateOption?.(property, label)}
                onDeleteOption={(optionId) => onDeleteOption?.(property, optionId)}
              />
              <RecordOpenLink
                to={`${recordBasePath}/records/${record.id}`}
                className="record-open-link"
                ariaLabel={`打开 ${record.title || UNTITLED_RECORD}`}
                onClick={(event) => onOpenRecord?.(event, record.id)}
              />
            </div>
          ) : property.type === "formula" ? (
            <span>{evaluateFormulaValue(state, record.id, property)}</span>
          ) : (
            <CellEditor
              property={property}
              record={record}
              onChange={(value) => onCellChange(record.id, property, value)}
              onCreateOption={(label) => onCreateOption?.(property, label)}
              onDeleteOption={(optionId) => onDeleteOption?.(property, optionId)}
            />
          )}
        </td>
      ))}
      {hasAddPropertyColumn ? (
        <td className="database-add-property-cell" aria-hidden="true" />
      ) : null}
    </tr>
  );

  return (
    <div
      className={
        freezeFirstColumn
          ? "table-wrapper has-frozen-first-column"
          : "table-wrapper"
      }
    >
      <table
        className={wrapCells ? "database-table is-wrapped" : "database-table"}
        style={{ width: resolvedTableWidth }}
      >
        <colgroup>
          <col style={{ width: `${SELECTION_COLUMN_WIDTH}px` }} />
          {properties.map((property) => (
            <col
              key={property.id}
              data-property-id={property.id}
              style={{
                width: `${columnWidths[property.id] ?? getDefaultColumnWidth(property)}px`,
              }}
            />
          ))}
          {hasAddPropertyColumn ? (
            <col style={{ width: `${ADD_PROPERTY_COLUMN_WIDTH}px` }} />
          ) : null}
        </colgroup>
        <thead>
          <tr>
            <th scope="col" className="database-selection-header">
              <input
                ref={headerCheckboxRef}
                type="checkbox"
                className="database-selection-checkbox"
                aria-label="全选当前视图"
                checked={allVisibleSelected}
                onChange={() => onToggleAllVisibleRows?.()}
              />
            </th>
            {properties.map((property) => (
              <th
                key={property.id}
                ref={(element) => setHeaderRef(property.id, element)}
                scope="col"
                className={
                  [
                    "database-column-header",
                    property.type !== "title" ? "is-reorderable" : "",
                    draggingPropertyId === property.id ? "is-dragging" : "",
                  ]
                    .filter(Boolean)
                    .join(" ")
                }
                data-property-id={property.id}
                onDragEnter={(event) => {
                  if (!draggingPropertyId || draggingPropertyId === property.id) {
                    return;
                  }

                  event.preventDefault();
                }}
                onDragOver={(event) => {
                  if (!draggingPropertyId || draggingPropertyId === property.id) {
                    return;
                  }

                  event.preventDefault();
                }}
                onDrop={(event) => {
                  if (!draggingPropertyId || draggingPropertyId === property.id) {
                    return;
                  }

                  event.preventDefault();
                  const propertyId =
                    event.dataTransfer.getData("text/plain") || draggingPropertyId;

                  if (propertyId) {
                    onReorderProperty?.(propertyId, property.id);
                  }
                }}
                onClick={(event) => handleColumnHeaderClick(event, property.id)}
              >
                <div className="database-column-header-inner">
                  {property.type !== "title" ? (
                    <button
                      type="button"
                      className="database-column-drag-handle"
                      draggable
                      aria-label={`拖动列 ${property.name}`}
                      onDragStart={(event) => {
                        event.dataTransfer.setData("text/plain", property.id);
                        event.dataTransfer.effectAllowed = "move";
                        onDragPropertyStart?.(property.id);
                      }}
                      onDragEnd={() => onDragPropertyEnd?.()}
                    >
                      <GripVertical size={12} strokeWidth={2} aria-hidden="true" />
                    </button>
                  ) : null}
                  <span className="database-column-label">
                    <span className="database-column-icon" aria-hidden="true">
                      {HEADER_ICONS[property.type]}
                    </span>
                    {property.name}
                  </span>
                  <button
                    type="button"
                    className={
                      activeColumnMenuPropertyId === property.id
                        ? "database-column-menu-trigger is-active"
                        : "database-column-menu-trigger"
                    }
                    aria-label={`${property.name} 列菜单`}
                    aria-expanded={activeColumnMenuPropertyId === property.id}
                    onClick={(event) => {
                      if (consumeSuppressedColumnMenuClick()) {
                        event.stopPropagation();
                        return;
                      }

                      onToggleColumnMenu?.(property.id);
                    }}
                  >
                    <ChevronDown size={14} strokeWidth={2} aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    className="database-column-resize-handle"
                    aria-label={`${property.name} 调整列宽`}
                    onMouseDown={(event) => beginColumnResize(event, property)}
                    onDoubleClick={() => onResetColumnWidth?.(property.id)}
                  />
                </div>
              </th>
            ))}
            {hasAddPropertyColumn ? (
              <th scope="col" className="database-add-property-header">
                <button
                  type="button"
                  className="database-add-property-button"
                  aria-label="在表格末尾新增字段"
                  onClick={onAddProperty}
                >
                  <Plus size={14} strokeWidth={2} aria-hidden="true" />
                </button>
              </th>
            ) : null}
          </tr>
        </thead>
        <tbody>
          {groupedSections
            ? groupedSections.flatMap((group) => {
                const groupRows = [
                  <tr key={`${group.id}-header`} className="database-group-row">
                    <td colSpan={totalColumnSpan}>
                      <div className="database-group-header">
                        <div className="database-group-header-main">
                          <button
                            type="button"
                            className="database-group-header-toggle"
                            aria-label={`${
                              group.isCollapsed ? "展开" : "折叠"
                            }分组 ${group.label}`}
                            onClick={() => onToggleGroupCollapse?.(group.id)}
                          >
                            {group.isCollapsed ? (
                              <ChevronRight size={14} strokeWidth={2} aria-hidden="true" />
                            ) : (
                              <ChevronDown size={14} strokeWidth={2} aria-hidden="true" />
                            )}
                          </button>
                          {group.tone ? (
                            <span
                              className="database-group-header-dot"
                              style={{ backgroundColor: group.tone }}
                              aria-hidden="true"
                            />
                          ) : (
                            <span
                              className="database-group-header-dot is-neutral"
                              aria-hidden="true"
                            />
                          )}
                          <span className="database-group-header-title">{group.label}</span>
                          <span className="database-group-header-count">
                            {group.records.length}
                          </span>
                          {onCreateRecordInGroup ? (
                            <button
                              type="button"
                              className="database-group-header-action"
                              aria-label={`在分组 ${group.label} 中新建记录`}
                              onClick={() => onCreateRecordInGroup(group)}
                            >
                              <Plus size={14} strokeWidth={2} aria-hidden="true" />
                            </button>
                          ) : null}
                        </div>
                      </div>
                    </td>
                  </tr>,
                ];

                if (group.isCollapsed) {
                  return groupRows;
                }

                if (group.records.length === 0) {
                  groupRows.push(
                    <tr key={`${group.id}-empty`} className="database-group-empty-row">
                      <td colSpan={totalColumnSpan}>
                        <div className="database-group-empty-copy">暂无记录</div>
                      </td>
                    </tr>,
                  );
                } else {
                  groupRows.push(
                    ...group.records.map((record) =>
                      renderRecordRow(record, group.id),
                    ),
                  );
                }

                return groupRows;
              })
            : records.map((record) => renderRecordRow(record))}
          {onCreateRecord ? (
            <tr
              className={
                hasVisibleRows
                  ? "database-table-new-row"
                  : "database-table-new-row is-empty"
              }
            >
              <td colSpan={totalColumnSpan}>
                <div className="database-table-new-row-content">
                  <button
                    type="button"
                    className="database-new-row"
                    onClick={onCreateRecord}
                  >
                    <Plus size={14} strokeWidth={2} aria-hidden="true" />
                    新页面
                  </button>
                  {!hasVisibleRows ? (
                    <span className="database-table-empty-copy">{emptyCopy}</span>
                  ) : null}
                </div>
              </td>
            </tr>
          ) : null}
          {canLoadMore ? (
            <tr className="database-table-load-more-row">
              <td colSpan={totalColumnSpan}>
                <button
                  type="button"
                  className="database-load-more"
                  onClick={onLoadMore}
                >
                  加载更多 {loadMoreCount} 条数据
                </button>
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
      {hiddenGroups.length > 0 ? (
        <aside className="database-hidden-groups" aria-label="隐藏的分组">
          <header className="database-hidden-groups-header">
            <h3>隐藏的分组</h3>
          </header>
          <div className="database-hidden-groups-list">
            {hiddenGroups.map((group) => (
              <div key={group.id} className="database-hidden-groups-item">
                <div className="database-hidden-groups-copy">
                  <span className="database-hidden-groups-name">{group.label}</span>
                  <span className="database-hidden-groups-count">
                    {group.count} 条记录
                  </span>
                </div>
                <button
                  type="button"
                  className="database-hidden-groups-action"
                  aria-label={`显示分组 ${group.label}`}
                  onClick={() => onRestoreGroup?.(group.id)}
                >
                  <Eye size={14} strokeWidth={2} aria-hidden="true" />
                </button>
              </div>
            ))}
          </div>
        </aside>
      ) : null}
      {activeMenuProperty
        ? createPortal(
            <div
              ref={columnMenuLayerRef}
              className="database-column-menu-floating-layer"
              style={{
                top: `${columnMenuPosition.top}px`,
                left: `${columnMenuPosition.left}px`,
              }}
            >
              <ColumnMenu
                property={activeMenuProperty}
                currentSort={sortRule}
                onRename={(name) => onRenameProperty?.(activeMenuProperty.id, name)}
                onUpdateType={(type) =>
                  onUpdatePropertyType?.(activeMenuProperty.id, type)
                }
                onUpdateOptions={(options) =>
                  onUpdatePropertyOptions?.(activeMenuProperty.id, options)
                }
                onUpdateFormulaExpression={(formulaExpression) =>
                  onUpdateFormulaExpression?.(activeMenuProperty.id, formulaExpression)
                }
                onInsertProperty={(side) =>
                  onInsertProperty?.(activeMenuProperty.id, side)
                }
                onSort={(direction) =>
                  onSortProperty?.(activeMenuProperty.id, direction)
                }
                onClearSort={() => onClearPropertySort?.()}
                onHide={() => onHideProperty?.(activeMenuProperty.id)}
                onDelete={() => onDeleteProperty?.(activeMenuProperty.id)}
              />
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
