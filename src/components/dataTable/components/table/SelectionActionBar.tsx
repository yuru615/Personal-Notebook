import { Trash2, X } from "lucide-react";

type SelectionActionBarProps = {
  count: number;
  onDelete: () => void;
  onClear: () => void;
};

export default function SelectionActionBar({
  count,
  onDelete,
  onClear,
}: SelectionActionBarProps) {
  return (
    <div className="selection-action-bar" role="toolbar" aria-label="批量操作">
      <span className="selection-action-bar-count">已选择 {count} 项</span>
      <div className="selection-action-bar-actions">
        <button type="button" className="toolbar-button" onClick={onDelete}>
          <Trash2 size={14} strokeWidth={2} aria-hidden="true" />
          删除
        </button>
        <button type="button" className="toolbar-button" onClick={onClear}>
          <X size={14} strokeWidth={2} aria-hidden="true" />
          取消选择
        </button>
      </div>
    </div>
  );
}
