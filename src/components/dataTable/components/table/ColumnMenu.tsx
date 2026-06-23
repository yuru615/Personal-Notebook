import {
  ArrowDownAZ,
  ArrowUpZA,
  EyeOff,
  ListFilter,
  Plus,
  GripVertical,
  Check,
  Trash2,
  X,
} from "lucide-react";
import { useState } from "react";
import { makeId } from "../../domain/factory";
import type {
  Property,
  PropertyType,
  SelectOption,
  SortRule,
} from "../../domain/types";
import ConfirmDialog from "./ConfirmDialog";
import NotionSelect from "./NotionSelect";

type ColumnMenuProps = {
  property: Property;
  currentSort: SortRule | null;
  onRename: (name: string) => void;
  onUpdateType: (type: PropertyType) => void;
  onUpdateOptions: (options: SelectOption[]) => void;
  onUpdateFormulaExpression?: (formulaExpression: string) => void;
  onInsertProperty: (side: "left" | "right") => void;
  onSort: (direction: "asc" | "desc") => void;
  onClearSort: () => void;
  onHide: () => void;
  onDelete: () => void;
};

const NON_TITLE_PROPERTY_TYPES: Exclude<PropertyType, "title">[] = [
  "text",
  "number",
  "select",
  "multiSelect",
  "date",
  "checkbox",
  "formula",
];

const TYPE_LABELS: Record<PropertyType, string> = {
  title: "标题",
  text: "文本",
  number: "数字",
  select: "单选",
  multiSelect: "多选",
  date: "日期",
  checkbox: "复选框",
  formula: "公式",
};

const OPTION_TONES = [
  { label: "紫色", color: "#7c3aed" },
  { label: "蓝色", color: "#2563eb" },
  { label: "青色", color: "#0f766e" },
  { label: "绿色", color: "#16a34a" },
  { label: "黄色", color: "#ca8a04" },
  { label: "橙色", color: "#ea580c" },
  { label: "粉色", color: "#db2777" },
  { label: "红色", color: "#dc2626" },
  { label: "灰色", color: "#475569" },
] as const;

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

export default function ColumnMenu({
  property,
  currentSort,
  onRename,
  onUpdateType,
  onUpdateOptions,
  onUpdateFormulaExpression,
  onInsertProperty,
  onSort,
  onClearSort,
  onHide,
  onDelete,
}: ColumnMenuProps) {
  const [activeColorOptionId, setActiveColorOptionId] = useState<string | null>(null);
  const [pendingDeleteOptionId, setPendingDeleteOptionId] = useState<string | null>(null);
  const isSortedColumn = currentSort?.propertyId === property.id;
  const isTitle = property.type === "title";
  const propertyLabel = property.name.trim() || "字段";
  const propertyTypes = isTitle ? (["title"] as const) : NON_TITLE_PROPERTY_TYPES;
  const propertyTypeOptions = propertyTypes.map((type) => ({
    value: type,
    label: TYPE_LABELS[type],
  }));
  const options = property.config.options ?? [];
  const pendingDeleteOption = pendingDeleteOptionId
    ? options.find((option) => option.id === pendingDeleteOptionId) ?? null
    : null;

  const updateOption = (
    optionId: string,
    recipe: (option: SelectOption) => SelectOption,
  ) => {
    onUpdateOptions(options.map((option) => (option.id === optionId ? recipe(option) : option)));
  };

  const confirmRemoveOption = (optionId: string) => {
    onUpdateOptions(options.filter((option) => option.id !== optionId));
    setActiveColorOptionId((current) => (current === optionId ? null : current));
    setPendingDeleteOptionId(null);
  };

  return (
    <div className="database-column-menu" aria-label={`${propertyLabel} 列设置`}>
      <div className="database-column-menu-section">
        <input
          className="property-name-input database-column-menu-name-input property-control-text"
          aria-label={`${propertyLabel}名称`}
          placeholder="字段名称"
          value={property.name}
          onChange={(event) => onRename(event.currentTarget.value)}
        />
      </div>

      <div className="database-column-menu-section">
        <span className="database-column-menu-caption">字段类型</span>
        <NotionSelect
          ariaLabel={`${propertyLabel}字段类型`}
          listboxLabel={`${propertyLabel}字段类型选项`}
          value={property.type}
          triggerClassName="notion-select-trigger--detail"
          optionClassName="notion-select-option--detail"
          options={propertyTypeOptions}
          placeholder="选择字段类型"
          disabled={isTitle}
          onChange={(nextType) => onUpdateType(nextType as PropertyType)}
        />
      </div>

      <div className="database-column-menu-section">
        <span className="database-column-menu-caption">插入字段</span>
        <div className="database-column-menu-action-list">
          <button
            type="button"
            className="database-column-menu-action"
            onClick={() => onInsertProperty("left")}
          >
            在左侧插入字段
          </button>
          <button
            type="button"
            className="database-column-menu-action"
            onClick={() => onInsertProperty("right")}
          >
            在右侧插入字段
          </button>
        </div>
      </div>

      {property.type === "select" || property.type === "multiSelect" ? (
        <div className="database-column-menu-section">
          <div className="database-column-menu-section-header">
            <span className="database-column-menu-caption">选项</span>
            <button
              type="button"
              className="database-column-menu-inline-button"
              onClick={() =>
                onUpdateOptions([
                  ...options,
                  {
                    id: makeId("option"),
                    label: getNextOptionLabel(options),
                    color: "#475569",
                  },
                ])
              }
            >
              <Plus size={14} strokeWidth={2} aria-hidden="true" />
              添加选项
            </button>
          </div>

          <div className="database-column-menu-option-list">
            {options.map((option, index) => {
              const optionLabel = option.label.trim() || `选项 ${index + 1}`;

              return (
                <div key={option.id} className="database-column-menu-option-row">
                  <span className="database-column-menu-option-grip" aria-hidden="true">
                    <GripVertical size={12} strokeWidth={2} />
                  </span>
                  <div className="database-column-menu-option-color">
                    <button
                      type="button"
                      className="database-column-menu-color-trigger"
                      aria-label={`${propertyLabel} ${optionLabel} 颜色`}
                      data-color={option.color}
                      onClick={() =>
                        setActiveColorOptionId((current) =>
                          current === option.id ? null : option.id,
                        )
                      }
                    >
                      <span
                        className="database-column-menu-color-swatch"
                        style={{
                          backgroundColor: option.color,
                          borderColor: option.color,
                        }}
                      />
                    </button>

                    {activeColorOptionId === option.id ? (
                      <div className="database-column-menu-color-popover">
                        {OPTION_TONES.map((tone) => {
                          const isSelected = tone.color === option.color;

                          return (
                            <button
                              key={`${option.id}-${tone.color}`}
                              type="button"
                              className={
                                isSelected
                                  ? "database-column-menu-color-option is-selected"
                                  : "database-column-menu-color-option"
                              }
                              aria-label={tone.label}
                              onClick={() => {
                                updateOption(option.id, (currentOption) => ({
                                  ...currentOption,
                                  color: tone.color,
                                }));
                                setActiveColorOptionId(null);
                              }}
                            >
                              <span
                                className="database-column-menu-color-swatch"
                                style={{
                                  backgroundColor: tone.color,
                                  borderColor: tone.color,
                                }}
                              />
                              <span>{tone.label}</span>
                              {isSelected ? (
                                <Check size={12} strokeWidth={2} aria-hidden="true" />
                              ) : null}
                            </button>
                          );
                        })}
                      </div>
                    ) : null}
                  </div>
                  <span
                    className="database-column-menu-option-pill"
                    style={{
                      color: option.color,
                      backgroundColor: resolveOptionColor(option.color, "2e"),
                      borderColor: "transparent",
                    }}
                  >
                    {optionLabel}
                  </span>
                  <input
                    className="database-column-menu-option-input property-control-text"
                    aria-label={`${propertyLabel}选项${index + 1}`}
                    value={option.label}
                    placeholder={`选项 ${index + 1}`}
                    onChange={(event) =>
                      updateOption(option.id, (currentOption) => ({
                        ...currentOption,
                        label: event.currentTarget.value,
                      }))
                    }
                  />
                  <button
                    type="button"
                    className="database-column-menu-option-remove"
                    aria-label={`删除选项 ${optionLabel}`}
                    onClick={() => setPendingDeleteOptionId(option.id)}
                  >
                    <X size={14} strokeWidth={2} aria-hidden="true" />
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}

      {property.type === "formula" ? (
        <div className="database-column-menu-section">
          <span className="database-column-menu-caption">公式</span>
            <input
              className="property-formula-input database-column-menu-formula-input property-control-text"
              aria-label={`${propertyLabel}公式`}
              placeholder='例如：if(done, "done", concat("P", priority))'
              value={property.config.formulaExpression ?? ""}
            onChange={(event) => onUpdateFormulaExpression?.(event.currentTarget.value)}
          />
        </div>
      ) : null}

      <div className="database-column-menu-section">
        <span className="database-column-menu-caption">快捷操作</span>
        <div className="database-column-menu-action-list">
          <button
            type="button"
            role="menuitem"
            className="database-column-menu-action"
            onClick={() => onSort("asc")}
          >
            <ArrowDownAZ size={14} strokeWidth={2} aria-hidden="true" />
            按升序排序
          </button>
          <button
            type="button"
            role="menuitem"
            className="database-column-menu-action"
            onClick={() => onSort("desc")}
          >
            <ArrowUpZA size={14} strokeWidth={2} aria-hidden="true" />
            按降序排序
          </button>
          {isSortedColumn ? (
            <button
              type="button"
              role="menuitem"
              className="database-column-menu-action"
              onClick={onClearSort}
            >
              <ListFilter size={14} strokeWidth={2} aria-hidden="true" />
              取消排序
            </button>
          ) : null}
          <button
            type="button"
            role="menuitem"
            className="database-column-menu-action"
            onClick={onHide}
            disabled={isTitle}
          >
            <EyeOff size={14} strokeWidth={2} aria-hidden="true" />
            在当前视图中隐藏
          </button>
          <button
            type="button"
            role="menuitem"
            className="database-column-menu-action database-column-menu-action--danger"
            onClick={onDelete}
            disabled={isTitle}
          >
            <Trash2 size={14} strokeWidth={2} aria-hidden="true" />
            删除当前字段列
          </button>
        </div>
      </div>

      {pendingDeleteOption ? (
        <ConfirmDialog
          title={`删除选项 ${pendingDeleteOption.label || "未命名选项"}`}
          description={`选项“${pendingDeleteOption.label || "未命名选项"}”会从当前字段中移除。已有记录中的对应选项也会一起清理。此操作不可撤销。`}
          confirmLabel="确认删除"
          cancelLabel="取消"
          danger
          onConfirm={() => confirmRemoveOption(pendingDeleteOption.id)}
          onCancel={() => setPendingDeleteOptionId(null)}
        />
      ) : null}
    </div>
  );
}
