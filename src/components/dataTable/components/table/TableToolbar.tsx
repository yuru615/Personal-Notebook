import {
  ArrowUpDown,
  ChevronDown,
  Filter,
  Plus,
  Search,
  SlidersHorizontal,
} from "lucide-react";
import { useEffect, useRef, useState, type DragEvent } from "react";
import type { DatabaseView } from "../../domain/types";
import type { TableLayout, TablePanel } from "./viewTypes";
import ViewTabMenu from "./ViewTabMenu";
import { VIEW_LAYOUT_OPTIONS, getViewLayoutOption } from "./viewLayoutOptions";

type TableToolbarProps = {
  views: DatabaseView[];
  activeViewId: string;
  activeViewName: string;
  activeViewLayout: TableLayout;
  activePanel: TablePanel | null;
  searchQuery: string;
  filterCount: number;
  sortCount: number;
  onViewSelect: (viewId: string) => void;
  onReorderView: (
    viewId: string,
    targetViewId: string,
    placement?: "before" | "after",
  ) => void;
  onRenameActiveView: (name: string) => void;
  onChangeActiveViewLayout: (layout: TableLayout) => void;
  onDuplicateActiveView: () => void;
  onDeleteActiveView: () => void;
  onTogglePanel: (panel: TablePanel) => void;
  onCreateView: (layout: TableLayout) => void;
  onCreateRecord: () => void;
};

const PANEL_BUTTONS: Array<{
  panel: Exclude<TablePanel, "search">;
  label: string;
  countKey?: "filter" | "sort";
}> = [
  { panel: "filter", label: "筛选", countKey: "filter" },
  { panel: "sort", label: "排序", countKey: "sort" },
  { panel: "viewOptions", label: "视图设置" },
];

const VIEW_DRAG_MIME_TYPE = "application/x-database-view-id";
type ViewDropPlacement = "before" | "after";
type ViewDropTarget = {
  viewId: string;
  placement: ViewDropPlacement;
};

function getViewIcon(layout: DatabaseView["layout"]) {
  return getViewLayoutOption(layout).Icon;
}

export default function TableToolbar({
  views,
  activeViewId,
  activeViewName,
  activeViewLayout,
  activePanel,
  searchQuery,
  filterCount,
  sortCount,
  onViewSelect,
  onReorderView,
  onRenameActiveView,
  onChangeActiveViewLayout,
  onDuplicateActiveView,
  onDeleteActiveView,
  onTogglePanel,
  onCreateView,
  onCreateRecord,
}: TableToolbarProps) {
  const [viewMenuOpen, setViewMenuOpen] = useState(false);
  const [activeViewMenuOpen, setActiveViewMenuOpen] = useState(false);
  const [draggingViewId, setDraggingViewId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<ViewDropTarget | null>(null);
  const viewMenuRef = useRef<HTMLDivElement | null>(null);
  const activeViewMenuRef = useRef<HTMLDivElement | null>(null);
  const searchActive = activePanel === "search" || searchQuery.length > 0;
  const panelCounts = {
    filter: filterCount,
    sort: sortCount,
  };

  const clearDragState = () => {
    setDraggingViewId(null);
    setDropTarget(null);
  };

  const getDropPlacement = (
    event: DragEvent<HTMLButtonElement>,
  ): ViewDropPlacement => {
    const rect = event.currentTarget.getBoundingClientRect();

    if (!rect.width) {
      return "before";
    }

    return event.clientX < rect.left + rect.width / 2 ? "before" : "after";
  };

  useEffect(() => {
    if (!viewMenuOpen && !activeViewMenuOpen) {
      return;
    }

    const handleDocumentMouseDown = (event: globalThis.MouseEvent) => {
      const target = event.target;
      const insideCreateMenu =
        viewMenuRef.current &&
        target instanceof Node &&
        viewMenuRef.current.contains(target);
      const insideActiveViewMenu =
        activeViewMenuRef.current &&
        target instanceof Node &&
        activeViewMenuRef.current.contains(target);

      if (!insideCreateMenu && !insideActiveViewMenu) {
        setViewMenuOpen(false);
        setActiveViewMenuOpen(false);
      }
    };

    const handleDocumentKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") {
        setViewMenuOpen(false);
        setActiveViewMenuOpen(false);
      }
    };

    document.addEventListener("mousedown", handleDocumentMouseDown);
    document.addEventListener("keydown", handleDocumentKeyDown);

    return () => {
      document.removeEventListener("mousedown", handleDocumentMouseDown);
      document.removeEventListener("keydown", handleDocumentKeyDown);
    };
  }, [activeViewMenuOpen, viewMenuOpen]);

  return (
    <div className="database-toolbar">
      <div
        className="database-view-tabs"
        role="tablist"
        aria-label="数据库视图"
      >
        {views.map((view) => {
          const Icon = getViewIcon(view.layout);
          const isActive = activeViewId === view.id;
          const isDragging = draggingViewId === view.id;
          const dropPlacement =
            dropTarget?.viewId === view.id ? dropTarget.placement : null;
          const tabClassName = [
            "database-view-tab",
            isActive ? "is-active" : "",
            isDragging ? "is-dragging" : "",
            dropPlacement ? `is-drop-target-${dropPlacement}` : "",
          ]
            .filter(Boolean)
            .join(" ");

          if (!isActive) {
            return (
              <button
                key={view.id}
                type="button"
                role="tab"
                className={tabClassName}
                aria-selected="false"
                draggable
                onClick={() => onViewSelect(view.id)}
                onDragStart={(event) => {
                  event.dataTransfer.setData(VIEW_DRAG_MIME_TYPE, view.id);
                  event.dataTransfer.effectAllowed = "move";
                  setDraggingViewId(view.id);
                  setDropTarget(null);
                  setViewMenuOpen(false);
                  setActiveViewMenuOpen(false);
                }}
                onDragOver={(event) => {
                  if (!draggingViewId || draggingViewId === view.id) {
                    return;
                  }

                  event.preventDefault();
                  event.dataTransfer.dropEffect = "move";
                  setDropTarget({
                    viewId: view.id,
                    placement: getDropPlacement(event),
                  });
                }}
                onDragLeave={(event) => {
                  if (
                    event.currentTarget.contains(event.relatedTarget as Node | null)
                  ) {
                    return;
                  }

                  setDropTarget((current) =>
                    current?.viewId === view.id ? null : current,
                  );
                }}
                onDrop={(event) => {
                  const sourceViewId =
                    event.dataTransfer.getData(VIEW_DRAG_MIME_TYPE) || draggingViewId;
                  const placement =
                    dropTarget?.viewId === view.id
                      ? dropTarget.placement
                      : getDropPlacement(event);

                  if (!sourceViewId || sourceViewId === view.id) {
                    clearDragState();
                    return;
                  }

                  event.preventDefault();
                  onReorderView(sourceViewId, view.id, placement);
                  clearDragState();
                }}
                onDragEnd={clearDragState}
              >
                <Icon size={14} strokeWidth={2} aria-hidden="true" />
                {view.name}
              </button>
            );
          }

          return (
            <div
              key={view.id}
              ref={activeViewMenuRef}
              className={
                isDragging
                  ? "database-view-tab-shell is-active is-dragging"
                  : "database-view-tab-shell is-active"
              }
            >
              <button
                type="button"
                role="tab"
                className={tabClassName}
                aria-selected="true"
                draggable
                onClick={() => onViewSelect(view.id)}
                onDragStart={(event) => {
                  event.dataTransfer.setData(VIEW_DRAG_MIME_TYPE, view.id);
                  event.dataTransfer.effectAllowed = "move";
                  setDraggingViewId(view.id);
                  setDropTarget(null);
                  setViewMenuOpen(false);
                  setActiveViewMenuOpen(false);
                }}
                onDragOver={(event) => {
                  if (!draggingViewId || draggingViewId === view.id) {
                    return;
                  }

                  event.preventDefault();
                  event.dataTransfer.dropEffect = "move";
                  setDropTarget({
                    viewId: view.id,
                    placement: getDropPlacement(event),
                  });
                }}
                onDragLeave={(event) => {
                  if (
                    event.currentTarget.contains(event.relatedTarget as Node | null)
                  ) {
                    return;
                  }

                  setDropTarget((current) =>
                    current?.viewId === view.id ? null : current,
                  );
                }}
                onDrop={(event) => {
                  const sourceViewId =
                    event.dataTransfer.getData(VIEW_DRAG_MIME_TYPE) || draggingViewId;
                  const placement =
                    dropTarget?.viewId === view.id
                      ? dropTarget.placement
                      : getDropPlacement(event);

                  if (!sourceViewId || sourceViewId === view.id) {
                    clearDragState();
                    return;
                  }

                  event.preventDefault();
                  onReorderView(sourceViewId, view.id, placement);
                  clearDragState();
                }}
                onDragEnd={clearDragState}
              >
                <Icon size={14} strokeWidth={2} aria-hidden="true" />
                {view.name}
              </button>

              <button
                type="button"
                className={
                  activeViewMenuOpen
                    ? "database-view-tab-trigger is-active"
                    : "database-view-tab-trigger"
                }
                aria-label={`视图菜单 ${view.name}`}
                aria-expanded={activeViewMenuOpen}
                aria-haspopup="dialog"
                onClick={() => {
                  setActiveViewMenuOpen((current) => !current);
                  setViewMenuOpen(false);
                }}
              >
                <ChevronDown size={13} strokeWidth={2} aria-hidden="true" />
              </button>

              {activeViewMenuOpen ? (
                <ViewTabMenu
                  dialogLabel="当前视图菜单"
                  nameLabel="当前视图名称"
                  viewName={activeViewName}
                  layout={activeViewLayout}
                  canDelete={views.length > 1}
                  duplicateLabel="复制当前视图"
                  deleteLabel="删除当前视图"
                  onViewNameChange={onRenameActiveView}
                  onLayoutChange={onChangeActiveViewLayout}
                  onDuplicateView={() => {
                    setActiveViewMenuOpen(false);
                    onDuplicateActiveView();
                  }}
                  onDeleteView={() => {
                    setActiveViewMenuOpen(false);
                    onDeleteActiveView();
                  }}
                />
              ) : null}
            </div>
          );
        })}

        <div className="database-view-add" ref={viewMenuRef}>
          <button
            type="button"
            className="database-view-add-button"
            aria-label="新增视图"
            aria-expanded={viewMenuOpen}
            aria-haspopup="menu"
            onClick={() => {
              setViewMenuOpen((current) => !current);
              setActiveViewMenuOpen(false);
            }}
          >
            <Plus size={14} strokeWidth={2} aria-hidden="true" />
            新增视图
          </button>

          {viewMenuOpen ? (
            <div className="database-view-create-menu" role="menu" aria-label="新增视图类型">
              {VIEW_LAYOUT_OPTIONS.map((option) => {
                const Icon = option.Icon;

                return (
                  <button
                    key={option.value}
                    type="button"
                    role="menuitem"
                    className="database-view-create-item"
                    onClick={() => {
                      setViewMenuOpen(false);
                      onCreateView(option.value);
                    }}
                  >
                    <Icon size={14} strokeWidth={2} aria-hidden="true" />
                    {option.createLabel}
                  </button>
                );
              })}
            </div>
          ) : null}
        </div>
      </div>

      <div className="database-toolbar-actions">
        {PANEL_BUTTONS.map(({ panel, label, countKey }) => {
          const count = countKey ? panelCounts[countKey] : 0;

          return (
            <button
              key={panel}
              type="button"
              className={
                activePanel === panel
                  ? "toolbar-button is-active"
                  : count > 0
                    ? "toolbar-button has-count"
                    : "toolbar-button"
              }
              aria-label={count > 0 ? `${label} ${count}` : label}
              aria-expanded={activePanel === panel}
              onClick={() => onTogglePanel(panel)}
            >
              {panel === "filter" ? (
                <Filter size={14} strokeWidth={2} aria-hidden="true" />
              ) : null}
              {panel === "sort" ? (
                <ArrowUpDown size={14} strokeWidth={2} aria-hidden="true" />
              ) : null}
              {panel === "viewOptions" ? (
                <SlidersHorizontal size={14} strokeWidth={2} aria-hidden="true" />
              ) : null}
              {label}
              {count > 0 ? (
                <span className="toolbar-count-badge">{count}</span>
              ) : null}
            </button>
          );
        })}

        <button
          type="button"
          className={
            searchActive
              ? "toolbar-button toolbar-icon-button is-active"
              : "toolbar-button toolbar-icon-button"
          }
          aria-label="搜索记录"
          aria-expanded={activePanel === "search"}
          onClick={() => onTogglePanel("search")}
        >
          <Search size={14} strokeWidth={2} aria-hidden="true" />
          搜索
        </button>

        <button
          type="button"
          className="toolbar-button toolbar-button-primary"
          onClick={onCreateRecord}
        >
          新建
        </button>
      </div>
    </div>
  );
}
