import { evaluateFormulaValue } from "../../domain/query";
import type { AppState, DatabaseRecord, Property, PropertyType } from "../../domain/types";
import CellEditor from "../table/CellEditor";

type RecordPropertiesProps = {
  state: AppState;
  properties: Property[];
  record: DatabaseRecord;
  onCellChange: (property: Property, value: string | boolean | string[]) => void;
  onCreateOption?: (property: Property, label: string) => void;
  onDeleteOption?: (property: Property, optionId: string) => void;
};

const PROPERTY_LABELS: Record<PropertyType, string> = {
  title: "标题",
  text: "Aa",
  number: "#",
  select: "单",
  multiSelect: "多",
  date: "日",
  checkbox: "勾",
  formula: "fx",
};

function formatMeta(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("zh-CN", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export default function RecordProperties({
  state,
  properties,
  record,
  onCellChange,
  onCreateOption,
  onDeleteOption,
}: RecordPropertiesProps) {
  return (
    <section className="record-properties">
      {properties.length > 0 ? (
        <div className="record-properties-heading">属性</div>
      ) : null}
      <div className="record-property-row record-property-row--system">
        <div className="record-property-label">
          <span className="record-property-icon" aria-hidden="true">
            时
          </span>
          <span className="record-property-name">创建时间</span>
        </div>
        <div className="record-property-value">
          <span className="record-property-static-value">
            {formatMeta(record.createdAt)}
          </span>
        </div>
      </div>
      <div className="record-property-row record-property-row--system">
        <div className="record-property-label">
          <span className="record-property-icon" aria-hidden="true">
            改
          </span>
          <span className="record-property-name">最后编辑</span>
        </div>
        <div className="record-property-value">
          <span className="record-property-static-value">
            {formatMeta(record.updatedAt)}
          </span>
        </div>
      </div>
      {properties.map((property) => (
        <div key={property.id} className="record-property-row record-property-row--editable">
          <div className="record-property-label">
            <span className="record-property-icon" aria-hidden="true">
              {PROPERTY_LABELS[property.type]}
            </span>
            <span className="record-property-name">{property.name}</span>
          </div>
          <div className="record-property-value">
            {property.type === "formula" ? (
              <span className="record-property-static-value record-property-formula-value">
                {evaluateFormulaValue(state, record.id, property)}
              </span>
            ) : (
              <CellEditor
                property={property}
                record={record}
                onChange={(value) => onCellChange(property, value)}
                onCreateOption={(label) => onCreateOption?.(property, label)}
                onDeleteOption={(optionId) => onDeleteOption?.(property, optionId)}
              />
            )}
          </div>
        </div>
      ))}
    </section>
  );
}
