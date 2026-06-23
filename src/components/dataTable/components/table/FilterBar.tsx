import type { FilterOperator, FilterRule, Property } from "../../domain/types";
import NotionSelect from "./NotionSelect";

type FilterBarProps = {
  properties: Property[];
  filters: FilterRule[];
  onChange: (filters: FilterRule[]) => void;
};

const DEFAULT_FILTER: FilterRule = {
  id: "default-filter",
  propertyId: "",
  operator: "contains",
  value: "",
};

export default function FilterBar({
  properties,
  filters,
  onChange,
}: FilterBarProps) {
  const current = filters[0] ?? DEFAULT_FILTER;
  const propertyOptions = [
    { value: "", label: "选择字段" },
    ...properties.map((property) => ({
      value: property.id,
      label: property.name,
    })),
  ];
  const operatorOptions = [
    { value: "contains", label: "包含" },
    { value: "is", label: "等于" },
    { value: "isNot", label: "不等于" },
    { value: "isEmpty", label: "为空" },
    { value: "isTrue", label: "为真" },
    { value: "isFalse", label: "为假" },
    { value: "gte", label: "大于等于" },
    { value: "lte", label: "小于等于" },
  ];

  return (
    <div className="filter-bar">
      <div className="filter-bar-row">
        <NotionSelect
          ariaLabel="筛选字段"
          listboxLabel="筛选字段选项"
          value={current.propertyId}
          options={propertyOptions}
          placeholder="选择字段"
          onChange={(propertyId) => onChange([{ ...current, propertyId }])}
        />
        <NotionSelect
          ariaLabel="筛选方式"
          listboxLabel="筛选方式选项"
          value={current.operator}
          options={operatorOptions}
          placeholder="选择条件"
          onChange={(operator) =>
            onChange([
              {
                ...current,
                operator: operator as FilterOperator,
              },
            ])
          }
        />
        <input
          className="filter-bar-input"
          placeholder="值"
          value={String(current.value ?? "")}
          onChange={(event) =>
            onChange([{ ...current, value: event.currentTarget.value }])
          }
        />
      </div>
    </div>
  );
}
