import { Eye, EyeOff, MoreHorizontal } from "lucide-react";
import { useEffect, useId, useRef, useState, type CSSProperties } from "react";
import { makeId } from "../../domain/factory";
import type {
  BoardCardSortMode,
  DatabaseView,
  Property,
  PropertyType,
  SelectOption,
} from "../../domain/types";
import NotionSelect from "./NotionSelect";
import PropertyManager from "./PropertyManager";
import ViewTabMenu from "./ViewTabMenu";
import { VIEW_LAYOUT_OPTIONS, getViewLayoutOption } from "./viewLayoutOptions";
import type { TableLayout, TableOpenMode, TableWidthMode } from "./viewTypes";

type ViewOptionsMenuProps = {
  views: DatabaseView[];
  activeViewId: string;
  viewName: string;
  layout: TableLayout;
  tableGroupPropertyId: string | null;
  tableGroupOrder: string[];
  tableHiddenGroupIds: string[];
  tableHideEmptyGroups: boolean;
  boardGroupPropertyId: string | null;
  boardColumnOrder: string[];
  boardHiddenColumnIds: string[];
  boardCardSortMode: BoardCardSortMode;
  boardShowPropertyNames: boolean;
  ganttStartPropertyId: string | null;
  ganttEndPropertyId: string | null;
  calendarDatePropertyId: string | null;
  openMode: TableOpenMode;
  tableWidthMode: TableWidthMode;
  tablePageSize: number;
  showTablePageSize?: boolean;
  wrapCells: boolean;
  freezeFirstColumn: boolean;
  properties: Property[];
  hiddenPropertyIds: string[];
  onViewSelect: (viewId: string) => void;
  onReorderView: (viewId: string, targetViewId: string) => void;
  onRenameView: (viewId: string, name: string) => void;
  onLayoutChange: (layout: TableLayout) => void;
  onTableGroupPropertyChange: (propertyId: string | null) => void;
  onTableGroupOrderChange: (nextOrder: string[]) => void;
  onTableHiddenGroupIdsChange: (nextIds: string[]) => void;
  onTableHideEmptyGroupsChange: (nextValue: boolean) => void;
  onBoardGroupPropertyChange: (propertyId: string | null) => void;
  onBoardColumnOrderChange: (nextOrder: string[]) => void;
  onBoardHiddenColumnIdsChange: (nextIds: string[]) => void;
  onBoardCardSortModeChange: (nextMode: BoardCardSortMode) => void;
  onBoardShowPropertyNamesChange: (nextValue: boolean) => void;
  onGanttStartPropertyChange: (propertyId: string | null) => void;
  onGanttEndPropertyChange: (propertyId: string | null) => void;
  onCalendarDatePropertyChange: (propertyId: string | null) => void;
  onDuplicateView: (viewId: string) => void;
  onDeleteView: (viewId: string) => void;
  onOpenModeChange: (mode: TableOpenMode) => void;
  onTableWidthModeChange: (mode: TableWidthMode) => void;
  onTablePageSizeChange: (size: number) => void;
  onWrapCellsChange: (nextValue: boolean) => void;
  onFreezeFirstColumnChange: (nextValue: boolean) => void;
  onTogglePropertyVisibility: (propertyId: string) => void;
  onAddProperty: () => void;
  onRenameProperty: (propertyId: string, name: string) => void;
  onUpdatePropertyType: (propertyId: string, type: PropertyType) => void;
  onMoveProperty: (propertyId: string, direction: "left" | "right") => void;
  onDeleteProperty: (propertyId: string) => void;
  onUpdatePropertyOptions: (propertyId: string, options: SelectOption[]) => void;
  onUpdateFormulaExpression: (
    propertyId: string,
    formulaExpression: string,
  ) => void;
};

const OPEN_MODE_OPTIONS: Array<{ value: TableOpenMode; label: string }> = [
  { value: "sidePeek", label: "侧边预览" },
  { value: "centerPeek", label: "居中预览" },
  { value: "fullPage", label: "整页打开" },
];

const TABLE_WIDTH_OPTIONS: Array<{ value: TableWidthMode; label: string }> = [
  { value: "fitPage", label: "适应页面宽度" },
  { value: "content", label: "按内容宽度" },
];

const TABLE_PAGE_SIZE_OPTIONS = [10, 20, 30, 50];

const BOARD_CARD_SORT_OPTIONS: Array<{
  value: BoardCardSortMode;
  label: string;
}> = [
  { value: "manual", label: "手动" },
  { value: "titleAsc", label: "A-Z" },
  { value: "titleDesc", label: "Z-A" },
];

type ViewOptionsTab = "view" | "group" | "properties";

const VIEW_DRAG_MIME_TYPE = "application/x-database-view-id";
const BOARD_OPTION_DRAG_MIME_TYPE = "application/x-database-board-option-id";

function getOrderedSelectOptions(
  property: Property | undefined,
  optionOrder: string[],
) {
  if (
    !property ||
    (property.type !== "select" && property.type !== "multiSelect") ||
    !property.config.options?.length
  ) {
    return [];
  }

  const optionById = new Map(
    property.config.options.map((option) => [option.id, option] as const),
  );
  const seenIds = new Set<string>();
  const orderedOptions = optionOrder.flatMap((optionId) => {
    const option = optionById.get(optionId);

    if (!option || seenIds.has(optionId)) {
      return [];
    }

    seenIds.add(optionId);
    return [option];
  });

  for (const option of property.config.options) {
    if (!seenIds.has(option.id)) {
      orderedOptions.push(option);
    }
  }

  return orderedOptions;
}

function getGroupOrderPillStyle(option: SelectOption): CSSProperties {
  return {
    "--board-order-pill-color": option.color,
    "--board-order-pill-bg": `${option.color}18`,
  } as CSSProperties;
}

function getNextOptionLabel(options: SelectOption[]) {
  const labels = new Set(options.map((option) => option.label));
  let index = options.length + 1;
  let nextLabel = `选项 ${index}`;

  while (labels.has(nextLabel)) {
    index += 1;
    nextLabel = `选项 ${index}`;
  }

  return nextLabel;
}

export default function ViewOptionsMenu({
  views,
  activeViewId,
  viewName,
  layout,
  tableGroupPropertyId,
  tableGroupOrder,
  tableHiddenGroupIds,
  tableHideEmptyGroups,
  boardGroupPropertyId,
  boardColumnOrder,
  boardHiddenColumnIds,
  boardCardSortMode,
  boardShowPropertyNames,
  ganttStartPropertyId,
  ganttEndPropertyId,
  calendarDatePropertyId,
  openMode,
  tableWidthMode,
  tablePageSize,
  showTablePageSize = false,
  wrapCells,
  freezeFirstColumn,
  properties,
  hiddenPropertyIds,
  onViewSelect,
  onReorderView,
  onRenameView,
  onLayoutChange,
  onTableGroupPropertyChange,
  onTableGroupOrderChange,
  onTableHiddenGroupIdsChange,
  onTableHideEmptyGroupsChange,
  onBoardGroupPropertyChange,
  onBoardColumnOrderChange,
  onBoardHiddenColumnIdsChange,
  onBoardCardSortModeChange,
  onBoardShowPropertyNamesChange,
  onGanttStartPropertyChange,
  onGanttEndPropertyChange,
  onCalendarDatePropertyChange,
  onDuplicateView,
  onDeleteView,
  onOpenModeChange,
  onTableWidthModeChange,
  onTablePageSizeChange,
  onWrapCellsChange,
  onFreezeFirstColumnChange,
  onTogglePropertyVisibility,
  onAddProperty,
  onRenameProperty,
  onUpdatePropertyType,
  onMoveProperty,
  onDeleteProperty,
  onUpdatePropertyOptions,
  onUpdateFormulaExpression,
}: ViewOptionsMenuProps) {
  const [activeTab, setActiveTab] = useState<ViewOptionsTab>("view");
  const [draggingViewId, setDraggingViewId] = useState<string | null>(null);
  const [dropTargetViewId, setDropTargetViewId] = useState<string | null>(null);
  const [openViewMenuId, setOpenViewMenuId] = useState<string | null>(null);
  const [draggingTableGroupId, setDraggingTableGroupId] = useState<string | null>(
    null,
  );
  const [dropTargetTableGroupId, setDropTargetTableGroupId] = useState<string | null>(
    null,
  );
  const [draggingBoardOptionId, setDraggingBoardOptionId] = useState<string | null>(
    null,
  );
  const [dropTargetBoardOptionId, setDropTargetBoardOptionId] = useState<string | null>(
    null,
  );
  const tabBaseId = useId();
  const viewMenuShellRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const tableGroupOptions = [
    { value: "", label: "无" },
    ...properties
      .filter(
        (property) =>
          property.type === "text" ||
          property.type === "number" ||
          property.type === "select" ||
          property.type === "multiSelect" ||
          property.type === "date" ||
          property.type === "checkbox",
      )
      .map((property) => ({
        value: property.id,
        label: property.name,
      })),
  ];
  const boardGroupOptions = [
    { value: "", label: "无" },
    ...properties
      .filter(
        (property) =>
          property.type === "text" ||
          property.type === "select" ||
          property.type === "multiSelect",
      )
      .map((property) => ({
        value: property.id,
        label: property.name,
      })),
  ];
  const dateOptions = [
    { value: "", label: "自动识别" },
    ...properties
      .filter((property) => property.type === "date")
      .map((property) => ({
        value: property.id,
        label: property.name,
      })),
  ];
  const tableGroupProperty = tableGroupPropertyId
    ? properties.find((property) => property.id === tableGroupPropertyId)
    : undefined;
  const orderedTableGroupOptions = getOrderedSelectOptions(
    tableGroupProperty,
    tableGroupOrder,
  );
  const hiddenTableGroupIdSet = new Set(tableHiddenGroupIds);
  const boardGroupProperty = boardGroupPropertyId
    ? properties.find((property) => property.id === boardGroupPropertyId)
    : undefined;
  const orderedBoardOptions = getOrderedSelectOptions(
    boardGroupProperty,
    boardColumnOrder,
  );
  const hiddenBoardIdSet = new Set(boardHiddenColumnIds);
  const rootClassName =
    activeTab === "properties"
      ? "view-options-menu view-options-menu--properties"
      : "view-options-menu view-options-menu--view";

  useEffect(() => {
    if (!openViewMenuId) {
      return;
    }

    const handleDocumentMouseDown = (event: globalThis.MouseEvent) => {
      const target = event.target;
      const activeMenuShell = viewMenuShellRefs.current[openViewMenuId];

      if (
        activeMenuShell &&
        target instanceof Node &&
        activeMenuShell.contains(target)
      ) {
        return;
      }

      setOpenViewMenuId(null);
    };

    const handleDocumentKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpenViewMenuId(null);
      }
    };

    document.addEventListener("mousedown", handleDocumentMouseDown);
    document.addEventListener("keydown", handleDocumentKeyDown);

    return () => {
      document.removeEventListener("mousedown", handleDocumentMouseDown);
      document.removeEventListener("keydown", handleDocumentKeyDown);
    };
  }, [openViewMenuId]);

  useEffect(() => {
    if (!draggingTableGroupId) {
      return;
    }

    const resetPointerDrag = () => {
      setDraggingTableGroupId(null);
      setDropTargetTableGroupId(null);
    };

    window.addEventListener("pointerup", resetPointerDrag);
    window.addEventListener("pointercancel", resetPointerDrag);

    return () => {
      window.removeEventListener("pointerup", resetPointerDrag);
      window.removeEventListener("pointercancel", resetPointerDrag);
    };
  }, [draggingTableGroupId]);

  useEffect(() => {
    if (!draggingBoardOptionId) {
      return;
    }

    const resetPointerDrag = () => {
      setDraggingBoardOptionId(null);
      setDropTargetBoardOptionId(null);
    };

    window.addEventListener("pointerup", resetPointerDrag);
    window.addEventListener("pointercancel", resetPointerDrag);

    return () => {
      window.removeEventListener("pointerup", resetPointerDrag);
      window.removeEventListener("pointercancel", resetPointerDrag);
    };
  }, [draggingBoardOptionId]);

  const reorderBoardOptions = (optionId: string, targetOptionId: string) => {
    if (
      optionId === targetOptionId ||
      !orderedBoardOptions.some((option) => option.id === optionId) ||
      !orderedBoardOptions.some((option) => option.id === targetOptionId)
    ) {
      setDraggingBoardOptionId(null);
      setDropTargetBoardOptionId(null);
      return;
    }

    const nextOrder = orderedBoardOptions.map((option) => option.id);
    const sourceIndex = nextOrder.indexOf(optionId);
    const targetIndex = nextOrder.indexOf(targetOptionId);

    if (sourceIndex === -1 || targetIndex === -1) {
      setDraggingBoardOptionId(null);
      setDropTargetBoardOptionId(null);
      return;
    }

    nextOrder.splice(sourceIndex, 1);
    nextOrder.splice(targetIndex, 0, optionId);
    onBoardColumnOrderChange(nextOrder);
    setDraggingBoardOptionId(null);
    setDropTargetBoardOptionId(null);
  };

  const reorderTableGroups = (groupId: string, targetGroupId: string) => {
    if (
      groupId === targetGroupId ||
      !orderedTableGroupOptions.some((option) => option.id === groupId) ||
      !orderedTableGroupOptions.some((option) => option.id === targetGroupId)
    ) {
      setDraggingTableGroupId(null);
      setDropTargetTableGroupId(null);
      return;
    }

    const nextOrder = orderedTableGroupOptions.map((option) => option.id);
    const sourceIndex = nextOrder.indexOf(groupId);
    const targetIndex = nextOrder.indexOf(targetGroupId);

    if (sourceIndex === -1 || targetIndex === -1) {
      setDraggingTableGroupId(null);
      setDropTargetTableGroupId(null);
      return;
    }

    nextOrder.splice(sourceIndex, 1);
    nextOrder.splice(targetIndex, 0, groupId);
    onTableGroupOrderChange(nextOrder);
    setDraggingTableGroupId(null);
    setDropTargetTableGroupId(null);
  };

  const hideTableGroup = (groupId: string) => {
    if (hiddenTableGroupIdSet.has(groupId)) {
      return;
    }

    onTableHiddenGroupIdsChange([...tableHiddenGroupIds, groupId]);
  };

  const showTableGroup = (groupId: string) => {
    if (!hiddenTableGroupIdSet.has(groupId)) {
      return;
    }

    onTableHiddenGroupIdsChange(
      tableHiddenGroupIds.filter((currentGroupId) => currentGroupId !== groupId),
    );
  };

  const addTableGroup = () => {
    if (
      !tableGroupProperty ||
      (tableGroupProperty.type !== "select" &&
        tableGroupProperty.type !== "multiSelect")
    ) {
      return;
    }

    const options = tableGroupProperty.config.options ?? [];
    onUpdatePropertyOptions(tableGroupProperty.id, [
      ...options,
      {
        id: makeId("option"),
        label: getNextOptionLabel(options),
        color: "#475569",
      },
    ]);
  };

  const renderTableGroupOrderList = () => {
    if (orderedTableGroupOptions.length === 0) {
      return null;
    }

    return (
      <div className="view-options-board-order">
        <div className="view-options-board-order-header">
          <span className="view-options-board-order-label">显示的分组</span>
          {tableGroupProperty?.type === "select" ||
          tableGroupProperty?.type === "multiSelect" ? (
            <button
              type="button"
              className="database-column-menu-inline-button"
              onClick={addTableGroup}
            >
              新增分组
            </button>
          ) : null}
        </div>
        <div className="view-options-board-order-list">
          {orderedTableGroupOptions.map((option) => {
            const isDragging = draggingTableGroupId === option.id;
            const isDropTarget = dropTargetTableGroupId === option.id;
            const isHidden = hiddenTableGroupIdSet.has(option.id);

            return (
              <div
                key={option.id}
                draggable
                className={
                  isDropTarget
                    ? "view-options-board-order-row is-drop-target"
                    : isDragging
                      ? "view-options-board-order-row is-dragging"
                      : isHidden
                        ? "view-options-board-order-row is-hidden"
                        : "view-options-board-order-row"
                }
                onDragStart={(event) => {
                  event.dataTransfer.setData(
                    BOARD_OPTION_DRAG_MIME_TYPE,
                    option.id,
                  );
                  event.dataTransfer.effectAllowed = "move";
                  setDraggingTableGroupId(option.id);
                  setDropTargetTableGroupId(null);
                }}
                onDragEnd={() => {
                  setDraggingTableGroupId(null);
                  setDropTargetTableGroupId(null);
                }}
                onDragOver={(event) => {
                  if (!draggingTableGroupId || draggingTableGroupId === option.id) {
                    return;
                  }

                  event.preventDefault();
                  event.dataTransfer.dropEffect = "move";
                  setDropTargetTableGroupId(option.id);
                }}
                onDragLeave={(event) => {
                  if (
                    event.currentTarget.contains(
                      event.relatedTarget as Node | null,
                    )
                  ) {
                    return;
                  }

                  setDropTargetTableGroupId((current) =>
                    current === option.id ? null : current,
                  );
                }}
                onDrop={(event) => {
                  const sourceGroupId =
                    event.dataTransfer.getData(BOARD_OPTION_DRAG_MIME_TYPE) ||
                    draggingTableGroupId;

                  event.preventDefault();

                  if (!sourceGroupId) {
                    setDraggingTableGroupId(null);
                    setDropTargetTableGroupId(null);
                    return;
                  }

                  reorderTableGroups(sourceGroupId, option.id);
                }}
                onPointerEnter={(event) => {
                  if (
                    !draggingTableGroupId ||
                    event.buttons === 0 ||
                    draggingTableGroupId === option.id
                  ) {
                    return;
                  }

                  setDropTargetTableGroupId(option.id);
                }}
                onPointerMove={(event) => {
                  if (
                    !draggingTableGroupId ||
                    event.buttons === 0 ||
                    draggingTableGroupId === option.id
                  ) {
                    return;
                  }

                  if (dropTargetTableGroupId !== option.id) {
                    setDropTargetTableGroupId(option.id);
                  }
                }}
                onPointerUp={(event) => {
                  if (!draggingTableGroupId) {
                    return;
                  }

                  event.preventDefault();
                  reorderTableGroups(draggingTableGroupId, option.id);
                }}
              >
                <div className="view-options-board-order-item">
                  <button
                    type="button"
                    className="view-options-board-order-button"
                    aria-label={`拖动表格分组 ${option.label}`}
                    draggable
                    onDragStart={(event) => {
                      event.dataTransfer.setData(
                        BOARD_OPTION_DRAG_MIME_TYPE,
                        option.id,
                      );
                      event.dataTransfer.effectAllowed = "move";
                      setDraggingTableGroupId(option.id);
                      setDropTargetTableGroupId(null);
                    }}
                    onDragEnd={() => {
                      setDraggingTableGroupId(null);
                      setDropTargetTableGroupId(null);
                    }}
                    onPointerDown={(event) => {
                      if (event.button !== 0) {
                        return;
                      }

                      event.preventDefault();
                      setDraggingTableGroupId(option.id);
                      setDropTargetTableGroupId(option.id);
                    }}
                  >
                    <span
                      className="view-options-board-order-handle"
                      aria-hidden="true"
                    >
                      ⋮⋮
                    </span>
                    <span
                      className="view-options-board-order-pill"
                      style={getGroupOrderPillStyle(option)}
                    >
                      {option.label}
                    </span>
                  </button>

                  <button
                    type="button"
                    className="view-options-group-visibility-action"
                    aria-label={`${isHidden ? "显示" : "隐藏"}分组 ${option.label}`}
                    onClick={(event) => {
                      event.preventDefault();
                      event.stopPropagation();

                      if (isHidden) {
                        showTableGroup(option.id);
                        return;
                      }

                      hideTableGroup(option.id);
                    }}
                  >
                    {isHidden ? (
                      <Eye size={14} strokeWidth={2} aria-hidden="true" />
                    ) : (
                      <EyeOff size={14} strokeWidth={2} aria-hidden="true" />
                    )}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  const hideBoardGroup = (optionId: string) => {
    if (hiddenBoardIdSet.has(optionId)) {
      return;
    }

    onBoardHiddenColumnIdsChange([...boardHiddenColumnIds, optionId]);
  };

  const showBoardGroup = (optionId: string) => {
    if (!hiddenBoardIdSet.has(optionId)) {
      return;
    }

    onBoardHiddenColumnIdsChange(
      boardHiddenColumnIds.filter((columnId) => columnId !== optionId),
    );
  };

  const renderBoardOrderList = () => {
    if (orderedBoardOptions.length === 0) {
      return null;
    }

    return (
      <div className="view-options-board-order">
        <span className="view-options-board-order-label">分组顺序</span>
        <div className="view-options-board-order-list">
          {orderedBoardOptions.map((option) => {
            const isDragging = draggingBoardOptionId === option.id;
            const isDropTarget = dropTargetBoardOptionId === option.id;
            const isHidden = hiddenBoardIdSet.has(option.id);

            return (
              <div
                key={option.id}
                draggable
                className={
                  isDropTarget
                    ? "view-options-board-order-row is-drop-target"
                    : isDragging
                      ? "view-options-board-order-row is-dragging"
                      : isHidden
                        ? "view-options-board-order-row is-hidden"
                        : "view-options-board-order-row"
                }
                onDragStart={(event) => {
                  event.dataTransfer.setData(
                    BOARD_OPTION_DRAG_MIME_TYPE,
                    option.id,
                  );
                  event.dataTransfer.effectAllowed = "move";
                  setDraggingBoardOptionId(option.id);
                  setDropTargetBoardOptionId(null);
                }}
                onDragEnd={() => {
                  setDraggingBoardOptionId(null);
                  setDropTargetBoardOptionId(null);
                }}
                onDragOver={(event) => {
                  if (
                    !draggingBoardOptionId ||
                    draggingBoardOptionId === option.id
                  ) {
                    return;
                  }

                  event.preventDefault();
                  event.dataTransfer.dropEffect = "move";
                  setDropTargetBoardOptionId(option.id);
                }}
                onDragLeave={(event) => {
                  if (
                    event.currentTarget.contains(
                      event.relatedTarget as Node | null,
                    )
                  ) {
                    return;
                  }

                  setDropTargetBoardOptionId((current) =>
                    current === option.id ? null : current,
                  );
                }}
                onDrop={(event) => {
                  const sourceOptionId =
                    event.dataTransfer.getData(BOARD_OPTION_DRAG_MIME_TYPE) ||
                    draggingBoardOptionId;

                  event.preventDefault();

                  if (!sourceOptionId) {
                    setDraggingBoardOptionId(null);
                    setDropTargetBoardOptionId(null);
                    return;
                  }

                  reorderBoardOptions(sourceOptionId, option.id);
                }}
                onPointerEnter={(event) => {
                  if (
                    !draggingBoardOptionId ||
                    event.buttons === 0 ||
                    draggingBoardOptionId === option.id
                  ) {
                    return;
                  }

                  setDropTargetBoardOptionId(option.id);
                }}
                onPointerMove={(event) => {
                  if (
                    !draggingBoardOptionId ||
                    event.buttons === 0 ||
                    draggingBoardOptionId === option.id
                  ) {
                    return;
                  }

                  if (dropTargetBoardOptionId !== option.id) {
                    setDropTargetBoardOptionId(option.id);
                  }
                }}
                onPointerUp={(event) => {
                  if (!draggingBoardOptionId) {
                    return;
                  }

                  event.preventDefault();
                  reorderBoardOptions(draggingBoardOptionId, option.id);
                }}
              >
                <div className="view-options-board-order-item">
                  <button
                    type="button"
                    className="view-options-board-order-button"
                    aria-label={`拖动看板分组 ${option.label}`}
                    draggable
                    onDragStart={(event) => {
                      event.dataTransfer.setData(
                        BOARD_OPTION_DRAG_MIME_TYPE,
                        option.id,
                      );
                      event.dataTransfer.effectAllowed = "move";
                      setDraggingBoardOptionId(option.id);
                      setDropTargetBoardOptionId(null);
                    }}
                    onDragEnd={() => {
                      setDraggingBoardOptionId(null);
                      setDropTargetBoardOptionId(null);
                    }}
                    onPointerDown={(event) => {
                      if (event.button !== 0) {
                        return;
                      }

                      event.preventDefault();
                      setDraggingBoardOptionId(option.id);
                      setDropTargetBoardOptionId(option.id);
                    }}
                  >
                    <span
                      className="view-options-board-order-handle"
                      aria-hidden="true"
                    >
                      ⋮⋮
                    </span>
                    <span
                      className="view-options-board-order-pill"
                      style={getGroupOrderPillStyle(option)}
                    >
                      {option.label}
                    </span>
                  </button>

                  <button
                    type="button"
                    className="view-options-group-visibility-action"
                    aria-label={`${isHidden ? "显示" : "隐藏"}分组 ${option.label}`}
                    onClick={(event) => {
                      event.preventDefault();
                      event.stopPropagation();

                      if (isHidden) {
                        showBoardGroup(option.id);
                        return;
                      }

                      hideBoardGroup(option.id);
                    }}
                  >
                    {isHidden ? (
                      <Eye size={14} strokeWidth={2} aria-hidden="true" />
                    ) : (
                      <EyeOff size={14} strokeWidth={2} aria-hidden="true" />
                    )}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  const renderViewPanel = () => (
    <div
      id={`${tabBaseId}-view-panel`}
      role="tabpanel"
      aria-labelledby={`${tabBaseId}-view-tab`}
      className="view-options-panel view-options-panel--view"
    >
      <section className="view-options-section">
        <h3>所有视图</h3>
        <div className="view-options-view-list">
          {views.map((view) => {
            const layoutOption = getViewLayoutOption(view.layout);
            const Icon = layoutOption.Icon;
            const isActive = activeViewId === view.id;
            const isDragging = draggingViewId === view.id;
            const isDropTarget = dropTargetViewId === view.id;

            return (
              <div
                key={view.id}
                className={
                  isDropTarget
                    ? "view-options-view-row is-drop-target"
                    : isDragging
                      ? "view-options-view-row is-dragging"
                      : "view-options-view-row"
                }
                onDragOver={(event) => {
                  if (!draggingViewId || draggingViewId === view.id) {
                    return;
                  }

                  event.preventDefault();
                  event.dataTransfer.dropEffect = "move";
                  setDropTargetViewId(view.id);
                }}
                onDragLeave={(event) => {
                  if (
                    event.currentTarget.contains(event.relatedTarget as Node | null)
                  ) {
                    return;
                  }

                  setDropTargetViewId((current) =>
                    current === view.id ? null : current,
                  );
                }}
                onDrop={(event) => {
                  const sourceViewId =
                    event.dataTransfer.getData(VIEW_DRAG_MIME_TYPE) ||
                    draggingViewId;

                  if (!sourceViewId || sourceViewId === view.id) {
                    setDraggingViewId(null);
                    setDropTargetViewId(null);
                    return;
                  }

                  event.preventDefault();
                  onReorderView(sourceViewId, view.id);
                  setDraggingViewId(null);
                  setDropTargetViewId(null);
                }}
              >
                <button
                  type="button"
                  className={
                    isActive
                      ? "view-options-view-button is-active"
                      : "view-options-view-button"
                  }
                  aria-label={`切换到视图 ${view.name}`}
                  draggable
                  onClick={() => {
                    setOpenViewMenuId(null);
                    onViewSelect(view.id);
                  }}
                  onDragStart={(event) => {
                    event.dataTransfer.setData(VIEW_DRAG_MIME_TYPE, view.id);
                    event.dataTransfer.effectAllowed = "move";
                    setDraggingViewId(view.id);
                    setDropTargetViewId(null);
                    setOpenViewMenuId(null);
                  }}
                  onDragEnd={() => {
                    setDraggingViewId(null);
                    setDropTargetViewId(null);
                  }}
                >
                  <span className="view-options-view-main">
                    <span className="view-options-view-icon">
                      <Icon size={14} strokeWidth={2} aria-hidden="true" />
                    </span>
                    <span className="view-options-view-copy">
                      <span className="view-options-view-name">{view.name}</span>
                      <span className="view-options-view-layout">
                        {layoutOption.shortLabel}
                      </span>
                    </span>
                  </span>
                  {isActive ? (
                    <span className="view-options-view-badge">当前视图</span>
                  ) : null}
                </button>
                <div
                  ref={(node) => {
                    viewMenuShellRefs.current[view.id] = node;
                  }}
                  className="view-options-view-menu-shell"
                >
                  <button
                    type="button"
                    className={
                      openViewMenuId === view.id
                        ? "view-options-view-menu-trigger is-active"
                        : "view-options-view-menu-trigger"
                    }
                    aria-label={`视图列表菜单 ${view.name}`}
                    aria-expanded={openViewMenuId === view.id}
                    aria-haspopup="dialog"
                    onClick={() =>
                      setOpenViewMenuId((current) =>
                        current === view.id ? null : view.id,
                      )
                    }
                  >
                    <MoreHorizontal size={14} strokeWidth={2} aria-hidden="true" />
                  </button>

                  {openViewMenuId === view.id ? (
                    <ViewTabMenu
                      dialogLabel={`视图设置菜单 ${view.name}`}
                      nameLabel="视图名称"
                      viewName={view.name}
                      layout={view.layout}
                      canDelete={views.length > 1}
                      duplicateLabel="复制视图"
                      deleteLabel="删除视图"
                      showLayoutSection={false}
                      onViewNameChange={(name) => onRenameView(view.id, name)}
                      onDuplicateView={() => {
                        setOpenViewMenuId(null);
                        onDuplicateView(view.id);
                      }}
                      onDeleteView={() => {
                        setOpenViewMenuId(null);
                        onDeleteView(view.id);
                      }}
                    />
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section className="view-options-section">
        <h3>视图</h3>
        <label className="view-options-text-field">
          <span>视图名称</span>
          <input
            type="text"
            aria-label="视图名称"
            value={viewName}
            onChange={(event) =>
              onRenameView(activeViewId, event.currentTarget.value)
            }
          />
        </label>

        <div className="view-options-radio-group" role="radiogroup" aria-label="布局">
          {VIEW_LAYOUT_OPTIONS.map((option) => (
            <label
              key={option.value}
              className={
                layout === option.value
                  ? "view-options-radio is-active"
                  : "view-options-radio"
              }
            >
              <input
                type="radio"
                name="table-layout"
                checked={layout === option.value}
                onChange={() => onLayoutChange(option.value)}
              />
              <span className="view-options-radio-indicator" aria-hidden="true" />
              <span className="view-layout-option-label">
                <option.Icon size={14} strokeWidth={2} aria-hidden="true" />
                <span>{option.label}</span>
              </span>
            </label>
          ))}
        </div>

        <button
          type="button"
          className="view-options-secondary-button"
          onClick={() => onDuplicateView(activeViewId)}
        >
          复制视图
        </button>
      </section>

      {layout === "gantt" ? (
        <section className="view-options-section">
          <h3>甘特图设置</h3>
          <div className="view-options-text-field">
            <span>开始日期字段</span>
            <NotionSelect
              ariaLabel="甘特开始字段"
              listboxLabel="甘特开始字段选项"
              value={ganttStartPropertyId ?? ""}
              options={dateOptions}
              placeholder="自动识别"
              onChange={(propertyId) =>
                onGanttStartPropertyChange(propertyId || null)
              }
            />
          </div>
          <div className="view-options-text-field">
            <span>结束日期字段</span>
            <NotionSelect
              ariaLabel="甘特结束字段"
              listboxLabel="甘特结束字段选项"
              value={ganttEndPropertyId ?? ""}
              options={dateOptions}
              placeholder="自动识别"
              onChange={(propertyId) =>
                onGanttEndPropertyChange(propertyId || null)
              }
            />
          </div>
        </section>
      ) : null}

      {layout === "calendar" ? (
        <section className="view-options-section">
          <h3>日历设置</h3>
          <div className="view-options-text-field">
            <span>日历日期字段</span>
            <NotionSelect
              ariaLabel="日历日期字段"
              listboxLabel="日历日期字段选项"
              value={calendarDatePropertyId ?? ""}
              options={dateOptions}
              placeholder="自动识别"
              onChange={(propertyId) =>
                onCalendarDatePropertyChange(propertyId || null)
              }
            />
          </div>
        </section>
      ) : null}

      <section className="view-options-section">
        <h3>打开页面</h3>
        <div className="view-options-radio-group" role="radiogroup" aria-label="打开页面">
          {OPEN_MODE_OPTIONS.map((option) => (
            <label
              key={option.value}
              className={
                openMode === option.value
                  ? "view-options-radio is-active"
                  : "view-options-radio"
              }
            >
              <input
                type="radio"
                name="table-open-mode"
                checked={openMode === option.value}
                onChange={() => onOpenModeChange(option.value)}
              />
              <span className="view-options-radio-indicator" aria-hidden="true" />
              <span>{option.label}</span>
            </label>
          ))}
        </div>
      </section>

      <section className="view-options-section">
        <h3>表格设置</h3>
        <div className="view-options-radio-group" role="radiogroup" aria-label="表格宽度">
          {TABLE_WIDTH_OPTIONS.map((option) => (
            <label
              key={option.value}
              className={
                tableWidthMode === option.value
                  ? "view-options-radio is-active"
                  : "view-options-radio"
              }
            >
              <input
                type="radio"
                name="table-width-mode"
                checked={tableWidthMode === option.value}
                onChange={() => onTableWidthModeChange(option.value)}
              />
              <span className="view-options-radio-indicator" aria-hidden="true" />
              <span>{option.label}</span>
            </label>
          ))}
        </div>

        {showTablePageSize && layout === "table" ? (
          <div className="view-options-text-field">
            <span>每次加载条数</span>
            <div
              className="view-options-radio-group"
              role="radiogroup"
              aria-label="每次加载条数"
            >
              {TABLE_PAGE_SIZE_OPTIONS.map((size) => (
                <label
                  key={size}
                  className={
                    tablePageSize === size
                      ? "view-options-radio is-active"
                      : "view-options-radio"
                  }
                >
                  <input
                    type="radio"
                    name="table-page-size"
                    checked={tablePageSize === size}
                    onChange={() => onTablePageSizeChange(size)}
                  />
                  <span className="view-options-radio-indicator" aria-hidden="true" />
                  <span>{size}</span>
                </label>
              ))}
            </div>
          </div>
        ) : null}

        <label
          className={wrapCells ? "view-options-toggle is-active" : "view-options-toggle"}
        >
          <input
            type="checkbox"
            checked={wrapCells}
            onChange={(event) => onWrapCellsChange(event.currentTarget.checked)}
          />
          <span className="view-options-toggle-label">自动换行</span>
          <span className="view-options-toggle-switch" aria-hidden="true">
            <span className="view-options-toggle-knob" />
          </span>
        </label>

        <label
          className={
            freezeFirstColumn
              ? "view-options-toggle is-active"
              : "view-options-toggle"
          }
        >
          <input
            type="checkbox"
            checked={freezeFirstColumn}
            onChange={(event) =>
              onFreezeFirstColumnChange(event.currentTarget.checked)
            }
          />
          <span className="view-options-toggle-label">冻结首列</span>
          <span className="view-options-toggle-switch" aria-hidden="true">
            <span className="view-options-toggle-knob" />
          </span>
        </label>
      </section>
    </div>
  );

  const renderGroupPanel = () => (
    <div
      id={`${tabBaseId}-group-panel`}
      role="tabpanel"
      aria-labelledby={`${tabBaseId}-group-tab`}
      className="view-options-panel view-options-panel--view"
    >
      {layout === "table" ? (
        <>
          <section className="view-options-section">
            <h3>表格分组</h3>
            <NotionSelect
              ariaLabel="表格分组字段"
              listboxLabel="表格分组字段选项"
              value={tableGroupPropertyId ?? ""}
              options={tableGroupOptions}
              placeholder="无"
              onChange={(propertyId) =>
                onTableGroupPropertyChange(propertyId || null)
              }
            />

            <label
              className={
                tableHideEmptyGroups
                  ? "view-options-toggle is-active"
                  : "view-options-toggle"
              }
            >
              <input
                type="checkbox"
                aria-label="隐藏空分组"
                checked={tableHideEmptyGroups}
                onChange={(event) =>
                  onTableHideEmptyGroupsChange(event.currentTarget.checked)
                }
              />
              <span className="view-options-toggle-label">隐藏空分组</span>
              <span className="view-options-toggle-switch" aria-hidden="true">
                <span className="view-options-toggle-knob" />
              </span>
            </label>
          </section>

          {orderedTableGroupOptions.length > 0 ? (
            <section className="view-options-section">
              <h3>分组</h3>
              {renderTableGroupOrderList()}
            </section>
          ) : null}
        </>
      ) : layout === "board" ? (
        <>
          <section className="view-options-section">
            <h3>看板设置</h3>
            <NotionSelect
              ariaLabel="看板分组字段"
              listboxLabel="看板分组字段选项"
              value={boardGroupPropertyId ?? ""}
              options={boardGroupOptions}
              placeholder="无"
              onChange={(propertyId) =>
                onBoardGroupPropertyChange(propertyId || null)
              }
            />

            <label
              className={
                boardShowPropertyNames
                  ? "view-options-toggle is-active"
                  : "view-options-toggle"
              }
            >
              <input
                type="checkbox"
                checked={boardShowPropertyNames}
                onChange={(event) =>
                  onBoardShowPropertyNamesChange(event.currentTarget.checked)
                }
              />
              <span className="view-options-toggle-label">显示字段名称</span>
              <span className="view-options-toggle-switch" aria-hidden="true">
                <span className="view-options-toggle-knob" />
              </span>
            </label>

            <div className="view-options-text-field">
              <span>内容块排序</span>
              <div className="view-options-radio-group" role="radiogroup" aria-label="排序方式">
                {BOARD_CARD_SORT_OPTIONS.map((option) => (
                  <label
                    key={option.value}
                    className={
                      boardCardSortMode === option.value
                        ? "view-options-radio is-active"
                        : "view-options-radio"
                    }
                  >
                    <input
                      type="radio"
                      name="board-card-sort-mode"
                      checked={boardCardSortMode === option.value}
                      onChange={() => onBoardCardSortModeChange(option.value)}
                    />
                    <span className="view-options-radio-indicator" aria-hidden="true" />
                    <span>{option.label}</span>
                  </label>
                ))}
              </div>
            </div>
          </section>

          {orderedBoardOptions.length > 0 ? (
            <section className="view-options-section">
              <h3>分组</h3>
              {renderBoardOrderList()}
            </section>
          ) : null}
        </>
      ) : (
        <section className="view-options-section">
          <h3>分组</h3>
          <p className="view-options-empty-copy">当前布局没有可配置的分组设置。</p>
        </section>
      )}
    </div>
  );

  const renderPropertiesPanel = () => (
    <div
      id={`${tabBaseId}-properties-panel`}
      role="tabpanel"
      aria-labelledby={`${tabBaseId}-properties-tab`}
      className="view-options-panel view-options-panel--properties"
    >
      <PropertyManager
        properties={properties}
        hiddenPropertyIds={hiddenPropertyIds}
        onTogglePropertyVisibility={onTogglePropertyVisibility}
        onAddProperty={onAddProperty}
        onRenameProperty={onRenameProperty}
        onUpdatePropertyType={onUpdatePropertyType}
        onMoveProperty={onMoveProperty}
        onDeleteProperty={onDeleteProperty}
        onUpdatePropertyOptions={onUpdatePropertyOptions}
        onUpdateFormulaExpression={onUpdateFormulaExpression}
      />
    </div>
  );

  return (
    <div className={rootClassName}>
      <div className="view-options-tabs" role="tablist" aria-label="视图配置">
        <button
          id={`${tabBaseId}-view-tab`}
          type="button"
          role="tab"
          aria-selected={activeTab === "view"}
          aria-controls={`${tabBaseId}-view-panel`}
          tabIndex={activeTab === "view" ? 0 : -1}
          className={activeTab === "view" ? "view-options-tab is-active" : "view-options-tab"}
          onClick={() => {
            setActiveTab("view");
            setOpenViewMenuId(null);
          }}
        >
          视图
        </button>
        <button
          id={`${tabBaseId}-group-tab`}
          type="button"
          role="tab"
          aria-selected={activeTab === "group"}
          aria-controls={`${tabBaseId}-group-panel`}
          tabIndex={activeTab === "group" ? 0 : -1}
          className={
            activeTab === "group" ? "view-options-tab is-active" : "view-options-tab"
          }
          onClick={() => {
            setActiveTab("group");
            setOpenViewMenuId(null);
          }}
        >
          分组
        </button>
        <button
          id={`${tabBaseId}-properties-tab`}
          type="button"
          role="tab"
          aria-selected={activeTab === "properties"}
          aria-controls={`${tabBaseId}-properties-panel`}
          tabIndex={activeTab === "properties" ? 0 : -1}
          className={
            activeTab === "properties"
              ? "view-options-tab is-active"
              : "view-options-tab"
          }
          onClick={() => {
            setActiveTab("properties");
            setOpenViewMenuId(null);
          }}
        >
          字段
        </button>
      </div>

      {activeTab === "view"
        ? renderViewPanel()
        : activeTab === "group"
          ? renderGroupPanel()
          : renderPropertiesPanel()}
    </div>
  );
}
