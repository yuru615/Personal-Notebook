import { Check, ChevronRight, EyeOff, GripVertical, Plus, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { makeId } from "../../domain/factory";
import type {
  Property,
  PropertyType,
  SelectOption,
} from "../../domain/types";
import ConfirmDialog from "./ConfirmDialog";
import NotionSelect from "./NotionSelect";

type PropertyManagerProps = {
  properties: Property[];
  hiddenPropertyIds: string[];
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

const TYPE_TOKENS: Record<PropertyType, string> = {
  title: "Aa",
  text: "Aa",
  number: "#",
  select: "◎",
  multiSelect: "≡",
  date: "D",
  checkbox: "✓",
  formula: "fx",
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

function getPropertyDisplayName(property: Property, index: number) {
  return property.name.trim() || `字段 ${index + 1}`;
}

export default function PropertyManager({
  properties,
  hiddenPropertyIds,
  onTogglePropertyVisibility,
  onAddProperty,
  onRenameProperty,
  onUpdatePropertyType,
  onMoveProperty,
  onDeleteProperty,
  onUpdatePropertyOptions,
  onUpdateFormulaExpression,
}: PropertyManagerProps) {
  const [selectedPropertyId, setSelectedPropertyId] = useState<string | null>(
    properties[0]?.id ?? null,
  );
  const [activeColorOptionId, setActiveColorOptionId] = useState<string | null>(null);
  const [pendingDeleteOptionId, setPendingDeleteOptionId] = useState<string | null>(null);
  const previousPropertyIdsRef = useRef<string[]>(properties.map((property) => property.id));

  useEffect(() => {
    const currentPropertyIds = properties.map((property) => property.id);
    const previousPropertyIds = previousPropertyIdsRef.current;
    const newPropertyId =
      currentPropertyIds.find((propertyId) => !previousPropertyIds.includes(propertyId)) ?? null;

    if (newPropertyId) {
      setSelectedPropertyId(newPropertyId);
    } else if (
      selectedPropertyId === null ||
      !currentPropertyIds.includes(selectedPropertyId)
    ) {
      setSelectedPropertyId(currentPropertyIds[0] ?? null);
    }

    previousPropertyIdsRef.current = currentPropertyIds;
  }, [properties, selectedPropertyId]);

  useEffect(() => {
    setActiveColorOptionId(null);
  }, [selectedPropertyId]);

  const selectedPropertyIndex = useMemo(
    () => properties.findIndex((property) => property.id === selectedPropertyId),
    [properties, selectedPropertyId],
  );
  const selectedProperty =
    selectedPropertyIndex >= 0 ? properties[selectedPropertyIndex] : null;
  const options = useMemo(
    () => selectedProperty?.config.options ?? [],
    [selectedProperty],
  );

  useEffect(() => {
    if (!pendingDeleteOptionId) {
      return;
    }

    if (options.some((option) => option.id === pendingDeleteOptionId)) {
      return;
    }

    setPendingDeleteOptionId(null);
  }, [options, pendingDeleteOptionId]);

  if (!selectedProperty) {
    return null;
  }

  const selectedPropertyLabel = getPropertyDisplayName(
    selectedProperty,
    selectedPropertyIndex,
  );
  const isTitle = selectedProperty.type === "title";
  const isVisible =
    isTitle || !hiddenPropertyIds.includes(selectedProperty.id);
  const propertyTypes = isTitle ? (["title"] as const) : NON_TITLE_PROPERTY_TYPES;
  const propertyTypeOptions = propertyTypes.map((type) => ({
    value: type,
    label: TYPE_LABELS[type],
  }));
  const pendingDeleteOption = pendingDeleteOptionId
    ? options.find((option) => option.id === pendingDeleteOptionId) ?? null
    : null;

  const updateOption = (
    optionId: string,
    recipe: (option: SelectOption) => SelectOption,
  ) => {
    onUpdatePropertyOptions(
      selectedProperty.id,
      options.map((option) => (option.id === optionId ? recipe(option) : option)),
    );
  };

  const confirmRemoveOption = (optionId: string) => {
    onUpdatePropertyOptions(
      selectedProperty.id,
      options.filter((option) => option.id !== optionId),
    );

    setActiveColorOptionId((current) => (current === optionId ? null : current));
    setPendingDeleteOptionId(null);
  };

  return (
    <section className="property-manager">
      <div className="property-manager-sidebar">
        <div className="property-manager-header">
          <span className="property-manager-caption">所有字段</span>
          <button
            type="button"
            aria-label="新增字段"
            className="toolbar-button property-manager-add-button"
            onClick={onAddProperty}
          >
            <Plus size={14} strokeWidth={2} aria-hidden="true" />
            新增字段
          </button>
        </div>

        <div className="property-manager-list">
          {properties.map((property, index) => {
            const propertyLabel = getPropertyDisplayName(property, index);
            const isSelected = property.id === selectedPropertyId;
            const visible =
              property.type === "title" || !hiddenPropertyIds.includes(property.id);

            return (
              <button
                key={property.id}
                type="button"
                aria-label={`配置字段 ${propertyLabel}`}
                className={
                  isSelected
                    ? "property-manager-item is-active"
                    : "property-manager-item"
                }
                onClick={() => setSelectedPropertyId(property.id)}
              >
                <span className="database-column-icon property-manager-item-icon">
                  {TYPE_TOKENS[property.type]}
                </span>
                <span className="property-manager-item-body">
                  <span className="property-manager-item-name">{propertyLabel}</span>
                  <span className="property-manager-item-meta">
                    {TYPE_LABELS[property.type]}
                    {!visible ? " · 已隐藏" : ""}
                  </span>
                </span>
                {!visible ? (
                  <EyeOff size={14} strokeWidth={2} aria-hidden="true" />
                ) : (
                  <ChevronRight size={14} strokeWidth={2} aria-hidden="true" />
                )}
              </button>
            );
          })}
        </div>
      </div>

      <div className="property-manager-detail">
        <section className="property-detail-section property-detail-section--name">
          <span className="property-detail-caption">字段名称</span>
          <input
            className="property-name-input property-control-text"
            aria-label={`${selectedPropertyLabel}名称`}
            value={selectedProperty.name}
            onChange={(event) =>
              onRenameProperty(selectedProperty.id, event.currentTarget.value)
            }
          />
        </section>

        <section className="property-detail-section">
          <div className="property-detail-grid">
            <div className="property-detail-field">
              <span className="property-detail-caption">字段类型</span>
              <NotionSelect
                ariaLabel={`${selectedPropertyLabel}类型`}
                listboxLabel={`${selectedPropertyLabel}类型选项`}
                value={selectedProperty.type}
                disabled={isTitle}
                triggerClassName="notion-select-trigger--detail"
                optionClassName="notion-select-option--detail"
                options={propertyTypeOptions}
                placeholder="选择类型"
                onChange={(nextType) =>
                  onUpdatePropertyType(selectedProperty.id, nextType as PropertyType)
                }
              />
            </div>

            <label
              className={
                isVisible
                  ? "view-options-toggle property-detail-toggle is-active"
                  : "view-options-toggle property-detail-toggle"
              }
            >
              <input
                type="checkbox"
                aria-label="在当前视图中显示"
                checked={isVisible}
                disabled={isTitle}
                onChange={() => onTogglePropertyVisibility(selectedProperty.id)}
              />
              <span className="view-options-toggle-label">在当前视图中显示</span>
              <span className="view-options-toggle-switch" aria-hidden="true">
                <span className="view-options-toggle-knob" />
              </span>
            </label>
          </div>
        </section>

        {selectedProperty.type === "select" || selectedProperty.type === "multiSelect" ? (
          <section className="property-detail-section">
            <div className="property-detail-section-header">
              <span className="property-detail-caption">选项</span>
              <button
                type="button"
                className="database-column-menu-inline-button"
                onClick={() =>
                  onUpdatePropertyOptions(selectedProperty.id, [
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
                        aria-label={`${selectedPropertyLabel} ${optionLabel} 颜色`}
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
                      aria-label={`${selectedPropertyLabel}选项${index + 1}`}
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
          </section>
        ) : null}

        {selectedProperty.type === "formula" ? (
          <section className="property-detail-section">
            <span className="property-detail-caption">公式</span>
            <input
              className="property-formula-input property-control-text"
              aria-label={`${selectedPropertyLabel}公式`}
              value={selectedProperty.config.formulaExpression ?? ""}
              placeholder='例如：if(done, "done", concat("P", priority))'
              onChange={(event) =>
                onUpdateFormulaExpression(
                  selectedProperty.id,
                  event.currentTarget.value,
                )
              }
            />
          </section>
        ) : null}

        <section className="property-detail-section">
          <span className="property-detail-caption">字段操作</span>
          <div className="property-row-actions property-detail-actions">
            <button
              type="button"
              aria-label="左移"
              onClick={() => onMoveProperty(selectedProperty.id, "left")}
              disabled={isTitle || selectedPropertyIndex <= 1}
            >
              左移
            </button>
            <button
              type="button"
              aria-label="右移"
              onClick={() => onMoveProperty(selectedProperty.id, "right")}
              disabled={isTitle || selectedPropertyIndex === properties.length - 1}
            >
              右移
            </button>
            <button
              type="button"
              aria-label="删除"
              className="property-row-action--danger"
              onClick={() => onDeleteProperty(selectedProperty.id)}
              disabled={isTitle}
            >
              删除
            </button>
          </div>
        </section>
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
    </section>
  );
}
