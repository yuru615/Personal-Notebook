import type { Property, SortRule } from "../../domain/types";
import NotionSelect from "./NotionSelect";

type SortBarProps = {
  properties: Property[];
  value: SortRule | null;
  onChange: (next: SortRule | null) => void;
};

export default function SortBar({ properties, value, onChange }: SortBarProps) {
  const propertyOptions = [
    { value: "", label: "选择排序字段" },
    ...properties.map((property) => ({
      value: property.id,
      label: property.name,
    })),
  ];
  const directionOptions = [
    { value: "asc", label: "升序" },
    { value: "desc", label: "降序" },
  ];

  return (
    <div className="filter-bar">
      <div className="filter-bar-row">
        <NotionSelect
          ariaLabel="排序字段"
          listboxLabel="排序字段选项"
          value={value?.propertyId ?? ""}
          options={propertyOptions}
          placeholder="选择排序字段"
          onChange={(propertyId) =>
            onChange(
              propertyId
                ? {
                    propertyId,
                    direction: value?.direction ?? "asc",
                  }
                : null,
            )
          }
        />
        <NotionSelect
          ariaLabel="排序方向"
          listboxLabel="排序方向选项"
          value={value?.direction ?? "asc"}
          options={directionOptions}
          placeholder="选择方向"
          disabled={!value}
          onChange={(direction) =>
            value
              ? onChange({
                  ...value,
                  direction: direction as "asc" | "desc",
                })
              : null
          }
        />
      </div>
    </div>
  );
}
