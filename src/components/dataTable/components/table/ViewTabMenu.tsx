import { Copy, Trash2 } from "lucide-react";
import { VIEW_LAYOUT_OPTIONS } from "./viewLayoutOptions";
import type { TableLayout } from "./viewTypes";

type ViewTabMenuProps = {
  dialogLabel: string;
  nameLabel: string;
  viewName: string;
  layout: TableLayout;
  canDelete: boolean;
  duplicateLabel: string;
  deleteLabel: string;
  showLayoutSection?: boolean;
  onViewNameChange: (name: string) => void;
  onLayoutChange?: (layout: TableLayout) => void;
  onDuplicateView: () => void;
  onDeleteView: () => void;
};

const LAYOUT_LABEL = "\u5e03\u5c40";
const ACTIVE_VIEW_LAYOUT_LABEL = "\u5f53\u524d\u89c6\u56fe\u5e03\u5c40";

export default function ViewTabMenu({
  dialogLabel,
  nameLabel,
  viewName,
  layout,
  canDelete,
  duplicateLabel,
  deleteLabel,
  showLayoutSection = true,
  onViewNameChange,
  onLayoutChange,
  onDuplicateView,
  onDeleteView,
}: ViewTabMenuProps) {
  return (
    <section className="view-tab-menu" role="dialog" aria-label={dialogLabel}>
      <label className="view-options-text-field">
        <span>{nameLabel}</span>
        <input
          type="text"
          aria-label={nameLabel}
          value={viewName}
          onChange={(event) => onViewNameChange(event.currentTarget.value)}
        />
      </label>

      {showLayoutSection ? (
        <div className="view-tab-menu-section">
          <span className="view-tab-menu-caption">{LAYOUT_LABEL}</span>
          <div
            className="view-options-radio-group"
            role="radiogroup"
            aria-label={ACTIVE_VIEW_LAYOUT_LABEL}
          >
            {VIEW_LAYOUT_OPTIONS.map(({ value, label, Icon }) => (
              <label
                key={value}
                className={
                  layout === value ? "view-options-radio is-active" : "view-options-radio"
                }
              >
                <input
                  type="radio"
                  name="active-view-layout"
                  checked={layout === value}
                  onChange={() => onLayoutChange?.(value)}
                />
                <span className="view-options-radio-indicator" aria-hidden="true" />
                <span className="view-layout-option-label">
                  <Icon size={14} strokeWidth={2} aria-hidden="true" />
                  <span>{label}</span>
                </span>
              </label>
            ))}
          </div>
        </div>
      ) : null}

      <div className="view-tab-menu-actions">
        <button
          type="button"
          className="view-tab-menu-action"
          onClick={onDuplicateView}
        >
          <Copy size={14} strokeWidth={2} aria-hidden="true" />
          {duplicateLabel}
        </button>

        <button
          type="button"
          className="view-tab-menu-action view-tab-menu-action--danger"
          disabled={!canDelete}
          onClick={onDeleteView}
        >
          <Trash2 size={14} strokeWidth={2} aria-hidden="true" />
          {deleteLabel}
        </button>
      </div>
    </section>
  );
}
