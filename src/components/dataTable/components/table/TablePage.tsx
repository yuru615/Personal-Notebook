import { Search } from "lucide-react";
import { useEffect, useMemo, useState, type MouseEvent } from "react";
import { useNavigate } from "react-router-dom";
import { applyFilters, applySort, evaluateFormulaValue } from "../../domain/query";
import type { AppState, DatabaseRecord, Property, RecordValue } from "../../domain/types";
import { useAppStore } from "../../store/AppStore";
import WorkspaceShell from "../layout/WorkspaceShell";
import BoardView from "./BoardView";
import CalendarView from "./CalendarView";
import ConfirmDialog from "./ConfirmDialog";
import DatabaseTable from "./DatabaseTable";
import FilterBar from "./FilterBar";
import GanttView from "./GanttView";
import RecordPeekPanel from "./RecordPeekPanel";
import SaveStatusBadge from "./SaveStatusBadge";
import SelectionActionBar from "./SelectionActionBar";
import SortBar from "./SortBar";
import ToolbarPopover from "./ToolbarPopover";
import TableToolbar from "./TableToolbar";
import {
  buildTableGroupingResult,
  TABLE_UNGROUPED_ID,
  type TableGroupSection,
  type TableGroupingResult,
} from "./tableGrouping";
import ViewOptionsMenu from "./ViewOptionsMenu";
import type { TableLayout, TablePanel } from "./viewTypes";

const BOARD_TITLE_COLLATOR = new Intl.Collator("zh-CN", {
  numeric: true,
  sensitivity: "base",
});

function normalizeSearchValue(value: RecordValue) {
  if (Array.isArray(value)) {
    return value.join(" ");
  }

  if (typeof value === "boolean") {
    return value ? "true 是 已完成" : "false 否 未完成";
  }

  return value == null ? "" : String(value);
}

function matchesSearchQuery(
  state: AppState,
  record: DatabaseRecord,
  properties: Property[],
  normalizedQuery: string,
) {
  const chunks = properties.map((property) => {
    if (property.type === "title") {
      return record.title;
    }

    if (property.type === "formula") {
      return evaluateFormulaValue(state, record.id, property);
    }

    return normalizeSearchValue(record.values[property.id]);
  });

  return chunks.join(" ").toLowerCase().includes(normalizedQuery);
}

function getInitialValueForTableGroup(
  property: Property | null,
  group: TableGroupSection,
): RecordValue | undefined {
  if (!property || group.id === TABLE_UNGROUPED_ID) {
    return undefined;
  }

  return group.seedValue;
}

interface TablePageProps {
  basePath: string;
  showSidebar?: boolean;
}

export default function TablePage({ basePath, showSidebar = true }: TablePageProps) {
  const navigate = useNavigate();
  const { state, loaded, saveStatus, replaceState, actions } = useAppStore();
  const [activePanel, setActivePanel] = useState<TablePanel | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [draggingPropertyId, setDraggingPropertyId] = useState<string | null>(null);
  const [recordOrder, setRecordOrder] = useState<string[]>([]);
  const [draggingRecordId, setDraggingRecordId] = useState<string | null>(null);
  const [peekRecordId, setPeekRecordId] = useState<string | null>(null);
  const [selectedRecordIds, setSelectedRecordIds] = useState<string[]>([]);
  const [pendingDeleteViewId, setPendingDeleteViewId] = useState<string | null>(null);
  const [pendingDeleteRecordIds, setPendingDeleteRecordIds] = useState<string[]>([]);
  const [pendingDeletePropertyId, setPendingDeletePropertyId] = useState<string | null>(null);
  const [activeColumnMenuPropertyId, setActiveColumnMenuPropertyId] = useState<
    string | null
  >(null);
  const orderedViews = state.database.viewOrder
    .map((id) => state.database.views[id])
    .filter(Boolean);
  const fallbackView = orderedViews[0];

  if (!fallbackView) {
    throw new Error("Database requires at least one view.");
  }

  const activeView =
    orderedViews.find((view) => view.id === state.database.activeViewId) ?? fallbackView;
  const {
    id: activeViewId,
    name: activeViewName,
    layout,
    sort,
    filters,
    tableGroupPropertyId,
    tableGroupOrder = [],
    tableHiddenGroupIds = [],
    tableCollapsedGroupIds = [],
    tableHideEmptyGroups = false,
    boardGroupPropertyId,
    boardColumnOrder,
    boardHiddenColumnIds = [],
    boardRecordOrder = [],
    boardCardSortMode = "manual",
    boardShowPropertyNames = true,
    ganttStartPropertyId,
    ganttEndPropertyId,
    calendarDatePropertyId,
    openMode,
    tableWidthMode,
    wrapCells,
    freezeFirstColumn,
    hiddenPropertyIds,
    columnWidths,
  } = activeView;
  const hasAnyRecords = Object.keys(state.records).length > 0;
  const orderedProperties = state.database.propertyOrder
    .map((id) => state.properties[id])
    .filter(Boolean);
  const titleProperty = orderedProperties.find((property) => property.type === "title");
  const metadataProperties = orderedProperties.filter(
    (property) => property.type !== "title",
  );
  const visibleProperties = orderedProperties.filter(
    (property) =>
      property.type === "title" || !hiddenPropertyIds.includes(property.id),
  );
  const pendingDeleteProperty = pendingDeletePropertyId
    ? state.properties[pendingDeletePropertyId] ?? null
    : null;
  const pendingDeleteView = pendingDeleteViewId
    ? state.database.views[pendingDeleteViewId] ?? null
    : null;
  const pendingDeleteRecords = pendingDeleteRecordIds
    .map((recordId) => state.records[recordId])
    .filter(Boolean);
  const tableGroupProperty = tableGroupPropertyId
    ? orderedProperties.find((property) => property.id === tableGroupPropertyId) ?? null
    : null;
  const filteredRecords = useMemo(() => {
    const recordsAfterFilters = applyFilters(state, filters);
    const normalizedQuery = searchQuery.trim().toLowerCase();

    if (!normalizedQuery) {
      return recordsAfterFilters;
    }

    return recordsAfterFilters.filter((record) =>
      matchesSearchQuery(state, record, orderedProperties, normalizedQuery),
    );
  }, [filters, orderedProperties, searchQuery, state]);
  const orderedRecords = useMemo(() => {
    const sortedRecords = applySort(
      {
        ...state,
        records: Object.fromEntries(
          filteredRecords.map((record) => [record.id, record]),
        ),
      },
      sort,
    ).sort((left, right) =>
      sort ? 0 : left.createdAt.localeCompare(right.createdAt),
    );

    if (sort) {
      return sortedRecords;
    }

    const rank = new Map(recordOrder.map((id, index) => [id, index]));

    return [...sortedRecords].sort(
      (left, right) =>
        (rank.get(left.id) ?? Number.MAX_SAFE_INTEGER) -
        (rank.get(right.id) ?? Number.MAX_SAFE_INTEGER),
    );
  }, [filteredRecords, recordOrder, sort, state]);
  const boardOrderedRecords = useMemo(() => {
    if (sort) {
      return orderedRecords;
    }

    if (boardCardSortMode === "titleAsc" || boardCardSortMode === "titleDesc") {
      const direction = boardCardSortMode === "titleAsc" ? 1 : -1;

      return [...orderedRecords].sort((left, right) => {
        const byTitle = BOARD_TITLE_COLLATOR.compare(left.title, right.title);

        if (byTitle !== 0) {
          return byTitle * direction;
        }

        return left.createdAt.localeCompare(right.createdAt);
      });
    }

    if (boardRecordOrder.length === 0) {
      return orderedRecords;
    }

    const rank = new Map(boardRecordOrder.map((id, index) => [id, index] as const));

    return [...orderedRecords].sort((left, right) => {
      const leftRank = rank.get(left.id);
      const rightRank = rank.get(right.id);

      if (leftRank == null && rightRank == null) {
        return 0;
      }

      if (leftRank == null) {
        return 1;
      }

      if (rightRank == null) {
        return -1;
      }

      return leftRank - rightRank;
    });
  }, [boardCardSortMode, boardRecordOrder, orderedRecords, sort]);
  const tableGrouping = useMemo<TableGroupingResult | null>(
    () =>
      buildTableGroupingResult(
        tableGroupProperty,
        orderedRecords,
        tableGroupOrder,
        tableHiddenGroupIds,
        tableCollapsedGroupIds,
        tableHideEmptyGroups,
      ),
    [
      orderedRecords,
      tableGroupOrder,
      tableGroupProperty,
      tableHiddenGroupIds,
      tableCollapsedGroupIds,
      tableHideEmptyGroups,
    ],
  );
  const peekRecord = peekRecordId ? state.records[peekRecordId] : undefined;
  const peekBlocks = peekRecordId
    ? (state.recordPages[peekRecordId]?.blockIds ?? [])
        .map((id) => state.blocks[id])
        .filter(Boolean)
    : [];
  const filterCount = filters.filter((filter) => filter.propertyId).length;
  const sortCount = sort ? 1 : 0;
  const selectedVisibleCount = orderedRecords.filter((record) =>
    selectedRecordIds.includes(record.id),
  ).length;

  useEffect(() => {
    const visibleIds = new Set(orderedRecords.map((record) => record.id));
    setSelectedRecordIds((current) =>
      {
        const next = current.filter((recordId) => visibleIds.has(recordId));

        if (
          next.length === current.length &&
          next.every((recordId, index) => recordId === current[index])
        ) {
          return current;
        }

        return next;
      },
    );
  }, [orderedRecords]);

  useEffect(() => {
    const nextIds = Object.values(state.records)
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt))
      .map((record) => record.id);

    setRecordOrder((current) => {
      const kept = current.filter((id) => nextIds.includes(id));
      const missing = nextIds.filter((id) => !kept.includes(id));
      const next = [...kept, ...missing];

      if (
        next.length === current.length &&
        next.every((id, index) => id === current[index])
      ) {
        return current;
      }

      return next;
    });
  }, [state.records]);

  useEffect(() => {
    if (!pendingDeleteViewId) {
      return;
    }

    if (state.database.views[pendingDeleteViewId]) {
      return;
    }

    setPendingDeleteViewId(null);
  }, [pendingDeleteViewId, state.database.views]);

  useEffect(() => {
    if (pendingDeleteRecordIds.length === 0) {
      return;
    }

    const nextIds = pendingDeleteRecordIds.filter((recordId) => state.records[recordId]);

    if (nextIds.length === pendingDeleteRecordIds.length) {
      return;
    }

    setPendingDeleteRecordIds(nextIds);
  }, [pendingDeleteRecordIds, state.records]);

  useEffect(() => {
    if (!pendingDeletePropertyId) {
      return;
    }

    if (state.properties[pendingDeletePropertyId]) {
      return;
    }

    setPendingDeletePropertyId(null);
  }, [pendingDeletePropertyId, state.properties]);

  useEffect(() => {
    if (!activePanel && !activeColumnMenuPropertyId) {
      return;
    }

    const handleDocumentMouseDown = (event: globalThis.MouseEvent) => {
      const target = event.target;

      if (!(target instanceof Element)) {
        return;
      }

      if (
        target.closest(".database-toolbar") ||
        target.closest(".database-toolbar-popover") ||
        target.closest(".notion-select-floating-layer") ||
        target.closest(".database-column-header") ||
        target.closest(".database-column-menu") ||
        target.closest(".database-column-menu-floating-layer") ||
        target.closest(".table-confirm-overlay") ||
        target.closest(".table-confirm-dialog")
      ) {
        return;
      }

      setActivePanel(null);
      setActiveColumnMenuPropertyId(null);
    };

    document.addEventListener("mousedown", handleDocumentMouseDown);

    return () => {
      document.removeEventListener("mousedown", handleDocumentMouseDown);
    };
  }, [activeColumnMenuPropertyId, activePanel]);

  const togglePanel = (panel: TablePanel) => {
    setActivePanel((current) => (current === panel ? null : panel));
    setActiveColumnMenuPropertyId(null);
  };

  const selectView = (viewId: string) => {
    if (viewId === activeViewId) {
      return;
    }

    setActivePanel(null);
    setActiveColumnMenuPropertyId(null);
    setPeekRecordId(null);
    actions.setActiveView(viewId);
  };

  const createView = (layout: TableLayout) => {
    setActivePanel(null);
    setActiveColumnMenuPropertyId(null);
    setPeekRecordId(null);
    actions.createView(layout);
  };

  const changeLayout = (nextLayout: TableLayout) => {
    if (layout === nextLayout) {
      return;
    }

    setActiveColumnMenuPropertyId(null);
    setPeekRecordId(null);
    actions.updateActiveView({ layout: nextLayout });
  };

  const requestViewDelete = (
    viewId: string,
    options?: { preserveActivePanel?: boolean },
  ) => {
    if (!options?.preserveActivePanel) {
      setActivePanel(null);
    }
    setActiveColumnMenuPropertyId(null);
    setPendingDeleteViewId(viewId);
  };

  const confirmViewDelete = () => {
    if (!pendingDeleteViewId) {
      return;
    }

    actions.deleteView(pendingDeleteViewId);
    setPendingDeleteViewId(null);
  };

  const cancelViewDelete = () => {
    setPendingDeleteViewId(null);
  };

  const togglePropertyVisibility = (propertyId: string) => {
    const property = state.properties[propertyId];

    if (!property || property.type === "title") {
      return;
    }

    actions.updateActiveView({
      hiddenPropertyIds: hiddenPropertyIds.includes(propertyId)
        ? hiddenPropertyIds.filter((id) => id !== propertyId)
        : [...hiddenPropertyIds, propertyId],
    });
    setActiveColumnMenuPropertyId(null);
  };

  const toggleColumnMenu = (propertyId: string) => {
    setActivePanel(null);
    setActiveColumnMenuPropertyId((current) =>
      current === propertyId ? null : propertyId,
    );
  };

  const sortProperty = (propertyId: string, direction: "asc" | "desc") => {
    actions.setActiveViewSort({ propertyId, direction });
    setActiveColumnMenuPropertyId(null);
  };

  const clearPropertySort = () => {
    actions.setActiveViewSort(null);
    setActiveColumnMenuPropertyId(null);
  };

  const requestPropertyDelete = (propertyId: string) => {
    setActiveColumnMenuPropertyId(null);
    setPendingDeletePropertyId(propertyId);
  };

  const confirmPropertyDelete = () => {
    if (!pendingDeletePropertyId) {
      return;
    }

    actions.deleteProperty(pendingDeletePropertyId);
    setPendingDeletePropertyId(null);
  };

  const cancelPropertyDelete = () => {
    setPendingDeletePropertyId(null);
  };

  const toggleRecordSelection = (recordId: string) => {
    setActiveColumnMenuPropertyId(null);
    setSelectedRecordIds((current) =>
      current.includes(recordId)
        ? current.filter((id) => id !== recordId)
        : [...current, recordId],
    );
  };

  const toggleAllVisibleRows = () => {
    setActiveColumnMenuPropertyId(null);
    const visibleIds = orderedRecords.map((record) => record.id);
    const allSelected =
      visibleIds.length > 0 &&
      visibleIds.every((recordId) => selectedRecordIds.includes(recordId));

    setSelectedRecordIds(allSelected ? [] : visibleIds);
  };

  const clearSelection = () => {
    setSelectedRecordIds([]);
  };

  const requestDeleteSelectedRecords = () => {
    if (selectedRecordIds.length === 0) {
      return;
    }

    setPendingDeleteRecordIds([...selectedRecordIds]);
  };

  const reorderRecord = (recordId: string, targetRecordId: string) => {
    if (
      recordId === targetRecordId ||
      sort ||
      !recordOrder.includes(recordId) ||
      !recordOrder.includes(targetRecordId)
    ) {
      setDraggingRecordId(null);
      return;
    }

    setRecordOrder((current) => {
      const next = [...current];
      const sourceIndex = next.indexOf(recordId);
      const targetIndex = next.indexOf(targetRecordId);

      if (sourceIndex === -1 || targetIndex === -1) {
        return current;
      }

      next.splice(sourceIndex, 1);
      next.splice(targetIndex, 0, recordId);
      return next;
    });
    setDraggingRecordId(null);
  };

  const reorderProperty = (propertyId: string, targetPropertyId: string) => {
    const property = state.properties[propertyId];
    const targetProperty = state.properties[targetPropertyId];
    const propertyOrder = state.database.propertyOrder.filter((id) => state.properties[id]);

    if (
      propertyId === targetPropertyId ||
      !property ||
      !targetProperty ||
      property.type === "title" ||
      !propertyOrder.includes(propertyId) ||
      !propertyOrder.includes(targetPropertyId)
    ) {
      setDraggingPropertyId(null);
      return;
    }

    const nextPropertyOrder = [...propertyOrder];
    const sourceIndex = nextPropertyOrder.indexOf(propertyId);

    if (sourceIndex === -1) {
      setDraggingPropertyId(null);
      return;
    }

    nextPropertyOrder.splice(sourceIndex, 1);

    if (targetProperty.type === "title") {
      nextPropertyOrder.splice(1, 0, propertyId);
    } else {
      const targetIndex = nextPropertyOrder.indexOf(targetPropertyId);

      if (targetIndex === -1) {
        setDraggingPropertyId(null);
        return;
      }

      nextPropertyOrder.splice(targetIndex, 0, propertyId);
    }

    replaceState({
      ...state,
      database: {
        ...state.database,
        propertyOrder: nextPropertyOrder,
      },
    });
    setDraggingPropertyId(null);
  };

  const deleteSelectedRecords = () => {
    const idsToDelete = [...pendingDeleteRecordIds];

    if (idsToDelete.length === 0) {
      return;
    }

    idsToDelete.forEach((recordId) => actions.deleteRecord(recordId));
    if (peekRecordId && idsToDelete.includes(peekRecordId)) {
      setPeekRecordId(null);
    }
    setPendingDeleteRecordIds([]);
    setSelectedRecordIds([]);
  };

  const cancelDeleteSelectedRecords = () => {
    setPendingDeleteRecordIds([]);
  };

  const openRecordInCurrentMode = (recordId: string) => {
    if (openMode === "fullPage") {
      setPeekRecordId(null);
      navigate(`${basePath}/records/${recordId}`);
      return;
    }

    setPeekRecordId(recordId);
  };

  const openRecord = (
    event: MouseEvent<HTMLAnchorElement>,
    recordId: string,
  ) => {
    if (openMode !== "fullPage") {
      event.preventDefault();
    }

    openRecordInCurrentMode(recordId);
  };

  const openPeekAsFullPage = () => {
    if (!peekRecordId) {
      return;
    }

    const recordId = peekRecordId;
    setPeekRecordId(null);
    navigate(`${basePath}/records/${recordId}`);
  };

  const updateColumnWidth = (propertyId: string, width: number) => {
    if (columnWidths[propertyId] === width) {
      return;
    }

    actions.updateActiveView({
      columnWidths: {
        ...columnWidths,
        [propertyId]: width,
      },
    });
  };

  const resetColumnWidth = (propertyId: string) => {
    if (!(propertyId in columnWidths)) {
      return;
    }

    const next = { ...columnWidths };
    delete next[propertyId];
    actions.updateActiveView({ columnWidths: next });
  };

  const insertPropertyAdjacent = (
    propertyId: string,
    side: "left" | "right",
  ) => {
    setActivePanel(null);
    setActiveColumnMenuPropertyId(null);
    actions.addProperty("新属性", "text", {
      relativeToPropertyId: propertyId,
      side,
    });
  };

  const toggleTableGroupCollapse = (groupId: string) => {
    actions.updateActiveView({
      tableCollapsedGroupIds: tableCollapsedGroupIds.includes(groupId)
        ? tableCollapsedGroupIds.filter((currentGroupId) => currentGroupId !== groupId)
        : [...tableCollapsedGroupIds, groupId],
    });
  };

  const createRecordInTableGroup = (group: TableGroupSection) => {
    const initialValue = getInitialValueForTableGroup(tableGroupProperty, group);

    if (tableGroupProperty && initialValue !== undefined) {
      actions.createRecord({
        [tableGroupProperty.id]: initialValue,
      });
      return;
    }

    actions.createRecord();
  };

  return (
    <WorkspaceShell
      databaseName={state.database.name}
      activePage="database"
      databasePath={basePath}
      showSidebar={showSidebar}
    >
      <main className="database-page-shell">
        <section
          className={
            tableWidthMode === "fitPage"
              ? "database-page is-full-width"
              : "database-page"
          }
        >
          {showSidebar ? <div className="database-page-breadcrumb">工作区 / 数据库</div> : null}
          <header className="database-page-header">
            <div className="database-page-title-row">
              <span className="database-page-icon" aria-hidden="true" />
              <h1>{state.database.name}</h1>
            </div>
          </header>

          <div className="database-toolbar-region">
            <TableToolbar
              views={orderedViews}
              activeViewId={activeViewId}
              activeViewName={activeViewName}
              activeViewLayout={layout}
              activePanel={activePanel}
              searchQuery={searchQuery}
              filterCount={filterCount}
              sortCount={sortCount}
              onViewSelect={selectView}
              onReorderView={(viewId, targetViewId, placement) =>
                actions.moveView(viewId, targetViewId, placement)
              }
              onRenameActiveView={(name) => actions.renameView(activeViewId, name)}
              onChangeActiveViewLayout={changeLayout}
              onDuplicateActiveView={() => actions.duplicateView(activeViewId)}
              onDeleteActiveView={() => requestViewDelete(activeViewId)}
              onTogglePanel={togglePanel}
              onCreateView={createView}
              onCreateRecord={() => actions.createRecord()}
            />

            <div className="database-toolbar-floating-layer database-toolbar-floating-layer--centered">
              {activePanel === "viewOptions" ? (
                <ToolbarPopover title="视图设置">
                  <ViewOptionsMenu
                    views={orderedViews}
                    activeViewId={activeViewId}
                    openMode={openMode}
                    tableWidthMode={tableWidthMode}
                    wrapCells={wrapCells}
                    freezeFirstColumn={freezeFirstColumn}
                    properties={orderedProperties}
                    hiddenPropertyIds={hiddenPropertyIds}
                    viewName={activeViewName}
                    layout={layout}
                    tableGroupPropertyId={tableGroupPropertyId}
                    tableGroupOrder={tableGroupOrder}
                    tableHiddenGroupIds={tableHiddenGroupIds}
                    tableHideEmptyGroups={tableHideEmptyGroups}
                    boardGroupPropertyId={boardGroupPropertyId}
                    boardColumnOrder={boardColumnOrder}
                    boardHiddenColumnIds={boardHiddenColumnIds}
                    boardCardSortMode={boardCardSortMode}
                    boardShowPropertyNames={boardShowPropertyNames}
                    ganttStartPropertyId={ganttStartPropertyId}
                    ganttEndPropertyId={ganttEndPropertyId}
                    calendarDatePropertyId={calendarDatePropertyId}
                    onViewSelect={selectView}
                    onReorderView={(viewId, targetViewId) =>
                      actions.moveView(viewId, targetViewId)
                    }
                    onRenameView={actions.renameView}
                    onLayoutChange={changeLayout}
                    onTableGroupPropertyChange={(propertyId) =>
                      actions.updateActiveView({
                        tableGroupPropertyId: propertyId,
                        tableGroupOrder: [],
                        tableHiddenGroupIds: [],
                        tableCollapsedGroupIds: [],
                      })
                    }
                    onTableGroupOrderChange={(nextOrder) =>
                      actions.updateActiveView({ tableGroupOrder: nextOrder })
                    }
                    onTableHiddenGroupIdsChange={(nextIds) =>
                      actions.updateActiveView({ tableHiddenGroupIds: nextIds })
                    }
                    onTableHideEmptyGroupsChange={(nextValue) =>
                      actions.updateActiveView({
                        tableHideEmptyGroups: nextValue,
                      })
                    }
                    onBoardGroupPropertyChange={(propertyId) =>
                      actions.updateActiveView({
                        boardGroupPropertyId: propertyId,
                        boardColumnOrder: [],
                        boardHiddenColumnIds: [],
                      })
                    }
                    onBoardColumnOrderChange={(nextOrder) =>
                      actions.updateActiveView({ boardColumnOrder: nextOrder })
                    }
                    onBoardHiddenColumnIdsChange={(nextIds) =>
                      actions.updateActiveView({ boardHiddenColumnIds: nextIds })
                    }
                    onBoardCardSortModeChange={(nextMode) =>
                      actions.updateActiveView({ boardCardSortMode: nextMode })
                    }
                    onBoardShowPropertyNamesChange={(nextValue) =>
                      actions.updateActiveView({
                        boardShowPropertyNames: nextValue,
                      })
                    }
                    onGanttStartPropertyChange={(propertyId) =>
                      actions.updateActiveView({ ganttStartPropertyId: propertyId })
                    }
                    onGanttEndPropertyChange={(propertyId) =>
                      actions.updateActiveView({ ganttEndPropertyId: propertyId })
                    }
                    onCalendarDatePropertyChange={(propertyId) =>
                      actions.updateActiveView({ calendarDatePropertyId: propertyId })
                    }
                    onDuplicateView={actions.duplicateView}
                    onDeleteView={(viewId) =>
                      requestViewDelete(viewId, { preserveActivePanel: true })
                    }
                    onOpenModeChange={(mode) =>
                      actions.updateActiveView({ openMode: mode })
                    }
                    onTableWidthModeChange={(mode) =>
                      actions.updateActiveView({ tableWidthMode: mode })
                    }
                    onWrapCellsChange={(nextValue) =>
                      actions.updateActiveView({ wrapCells: nextValue })
                    }
                    onFreezeFirstColumnChange={(nextValue) =>
                      actions.updateActiveView({ freezeFirstColumn: nextValue })
                    }
                    onTogglePropertyVisibility={togglePropertyVisibility}
                    onAddProperty={() => actions.addProperty("新属性", "text")}
                    onRenameProperty={actions.renameProperty}
                    onUpdatePropertyType={actions.updatePropertyType}
                    onMoveProperty={actions.moveProperty}
                    onDeleteProperty={requestPropertyDelete}
                    onUpdatePropertyOptions={actions.updatePropertyOptions}
                    onUpdateFormulaExpression={actions.updateFormulaExpression}
                  />
                </ToolbarPopover>
              ) : null}
              {activePanel === "search" ? (
                <ToolbarPopover title={"\u641c\u7d22"}>
                  <label className="database-toolbar-search database-toolbar-search--panel">
                    <Search size={14} strokeWidth={2} aria-hidden="true" />
                    <input
                      type="search"
                      aria-label={"\u641c\u7d22\u8bb0\u5f55"}
                      placeholder={"\u641c\u7d22"}
                      value={searchQuery}
                      onChange={(event) => setSearchQuery(event.currentTarget.value)}
                    />
                  </label>
                </ToolbarPopover>
              ) : null}
              {activePanel === "sort" ? (
                <ToolbarPopover
                  title="排序"
                  bodyClassName="database-toolbar-popover-body--floating-selects"
                >
                  <SortBar
                    properties={orderedProperties}
                    value={sort}
                    onChange={actions.setActiveViewSort}
                  />
                </ToolbarPopover>
              ) : null}
              {activePanel === "filter" ? (
                <ToolbarPopover
                  title="筛选"
                  bodyClassName="database-toolbar-popover-body--floating-selects"
                >
                  <FilterBar
                    properties={orderedProperties}
                    filters={filters}
                    onChange={actions.setActiveViewFilters}
                  />
                </ToolbarPopover>
              ) : null}
            </div>
          </div>

          {loaded ? (
            layout === "table" ? (
              <DatabaseTable
              state={state}
              properties={visibleProperties}
              records={orderedRecords}
              hasAnyRecords={hasAnyRecords}
              tableWidthMode={tableWidthMode}
              wrapCells={wrapCells}
              freezeFirstColumn={freezeFirstColumn}
              columnWidths={columnWidths}
              draggingPropertyId={draggingPropertyId}
              canReorderRows={!sort && !tableGrouping}
              draggingRecordId={draggingRecordId}
              sortRule={sort}
              activeColumnMenuPropertyId={activeColumnMenuPropertyId}
              selectedRecordIds={selectedRecordIds}
              groupedSections={tableGrouping?.sections}
              hiddenGroups={tableGrouping?.hiddenSections}
              onCreateRecord={() => actions.createRecord()}
              onCreateRecordInGroup={createRecordInTableGroup}
              onAddProperty={() => {
                setActivePanel(null);
                setActiveColumnMenuPropertyId(null);
                actions.addProperty("新属性", "text");
              }}
              recordBasePath={basePath}
              onOpenRecord={openRecord}
              onToggleRecordSelection={toggleRecordSelection}
              onToggleAllVisibleRows={toggleAllVisibleRows}
              onRestoreGroup={(groupId) =>
                actions.updateActiveView({
                  tableHiddenGroupIds: tableHiddenGroupIds.filter(
                    (currentGroupId) => currentGroupId !== groupId,
                  ),
                })
              }
              onToggleGroupCollapse={toggleTableGroupCollapse}
              onToggleColumnMenu={toggleColumnMenu}
              onSortProperty={sortProperty}
              onClearPropertySort={clearPropertySort}
              onHideProperty={togglePropertyVisibility}
              onDeleteProperty={requestPropertyDelete}
              onRenameProperty={actions.renameProperty}
              onUpdatePropertyType={actions.updatePropertyType}
              onUpdatePropertyOptions={actions.updatePropertyOptions}
              onUpdateFormulaExpression={actions.updateFormulaExpression}
              onInsertProperty={insertPropertyAdjacent}
              onColumnWidthChange={updateColumnWidth}
              onResetColumnWidth={resetColumnWidth}
              onDragPropertyStart={(propertyId) => {
                setActivePanel(null);
                setActiveColumnMenuPropertyId(null);
                setDraggingPropertyId(propertyId);
              }}
              onDragPropertyEnd={() => setDraggingPropertyId(null)}
              onReorderProperty={reorderProperty}
              onDragRecordStart={setDraggingRecordId}
              onDragRecordEnd={() => setDraggingRecordId(null)}
              onReorderRecord={reorderRecord}
              onCellChange={(recordId, property, value) =>
                actions.updateRecordValue(recordId, property, value)
              }
              />
            ) : layout === "board" ? (
              <BoardView
                properties={visibleProperties}
                records={boardOrderedRecords}
                groupPropertyId={boardGroupPropertyId}
                groupOptionOrder={boardColumnOrder}
                hiddenColumnIds={boardHiddenColumnIds}
                showPropertyNames={boardShowPropertyNames}
                onRestoreHiddenColumn={(columnId) =>
                  actions.updateActiveView({
                    boardHiddenColumnIds: boardHiddenColumnIds.filter(
                      (id) => id !== columnId,
                    ),
                  })
                }
                onOpenRecord={openRecordInCurrentMode}
                onUpdateRecordValue={(recordId, property, value) =>
                  actions.updateRecordValue(recordId, property, value)
                }
                onBoardRecordOrderChange={
                  sort || boardCardSortMode !== "manual"
                    ? undefined
                    : (nextOrder) =>
                        actions.updateActiveView({ boardRecordOrder: nextOrder })
                }
              />
            ) : layout === "calendar" ? (
              <CalendarView
                properties={orderedProperties}
                records={orderedRecords}
                datePropertyId={calendarDatePropertyId}
                onOpenRecord={openRecordInCurrentMode}
                onUpdateRecordValue={(recordId, property, value) =>
                  actions.updateRecordValue(recordId, property, value)
                }
              />
            ) : (
              <GanttView
                properties={orderedProperties}
                records={orderedRecords}
                startPropertyId={ganttStartPropertyId}
                endPropertyId={ganttEndPropertyId}
                onOpenRecord={openRecordInCurrentMode}
              />
            )
          ) : (
            <p className="placeholder-copy">正在加载本地数据...</p>
          )}

          {layout === "table" && selectedVisibleCount > 0 ? (
            <SelectionActionBar
              count={selectedVisibleCount}
              onDelete={requestDeleteSelectedRecords}
              onClear={clearSelection}
            />
          ) : null}

          {peekRecord && openMode !== "fullPage" && titleProperty ? (
            <RecordPeekPanel
              state={state}
              record={peekRecord}
              metadataProperties={metadataProperties}
              blocks={peekBlocks}
              assets={state.assets}
              mode={openMode}
              onClose={() => setPeekRecordId(null)}
              onOpenFullPage={openPeekAsFullPage}
              onTitleChange={(value) =>
                actions.updateRecordValue(peekRecord.id, titleProperty, value)
              }
              onCellChange={(property, value) =>
                actions.updateRecordValue(peekRecord.id, property, value)
              }
            />
          ) : null}

          {pendingDeleteView ? (
            <ConfirmDialog
              title={`\u5220\u9664\u89c6\u56fe ${pendingDeleteView.name || "\u672a\u547d\u540d\u89c6\u56fe"}`}
              description={`\u89c6\u56fe\u201c${pendingDeleteView.name || "\u672a\u547d\u540d\u89c6\u56fe"}\u201d\u4f1a\u4ece\u5f53\u524d\u6570\u636e\u5e93\u4e2d\u79fb\u9664\u3002\u6b64\u64cd\u4f5c\u4e0d\u53ef\u64a4\u9500\u3002`}
              confirmLabel="确认删除"
              cancelLabel="取消"
              danger
              onConfirm={confirmViewDelete}
              onCancel={cancelViewDelete}
            />
          ) : null}

          {pendingDeleteProperty ? (
            <ConfirmDialog
              title={`删除字段 ${pendingDeleteProperty.name || "未命名字段"}`}
              description={`字段“${pendingDeleteProperty.name || "未命名字段"}”会从当前数据库中移除，已有这一列的数据也会一起删除。此操作不可撤销。`}
              confirmLabel="确认删除"
              cancelLabel="取消"
              danger
              onConfirm={confirmPropertyDelete}
              onCancel={cancelPropertyDelete}
            />
          ) : null}

          {pendingDeleteRecords.length > 0 ? (
            <ConfirmDialog
              title={
                pendingDeleteRecords.length === 1
                  ? `删除记录 ${pendingDeleteRecords[0].title || "未命名记录"}`
                  : `删除记录（${pendingDeleteRecords.length} 条）`
              }
              description={
                pendingDeleteRecords.length === 1
                  ? `记录“${pendingDeleteRecords[0].title || "未命名记录"}”会被永久删除，包括它的内容页。此操作不可撤销。`
                  : `选中的 ${pendingDeleteRecords.length} 条记录会被永久删除，包括它们的内容页。此操作不可撤销。`
              }
              confirmLabel="确认删除"
              cancelLabel="取消"
              danger
              onConfirm={deleteSelectedRecords}
              onCancel={cancelDeleteSelectedRecords}
            />
          ) : null}

          <SaveStatusBadge status={saveStatus} />
        </section>
      </main>
    </WorkspaceShell>
  );
}
