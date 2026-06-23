import { Parser } from "expr-eval";
import type {
  AppState,
  DatabaseRecord,
  FilterRule,
  Property,
  RecordValue,
  SortRule,
} from "./types";

function getRecordValue(record: DatabaseRecord, property: Property): RecordValue {
  return property.type === "title" ? record.title : (record.values[property.id] ?? null);
}

function toFormulaContextValue(value: RecordValue) {
  if (value == null) {
    return "";
  }

  if (typeof value === "boolean") {
    return value ? 1 : 0;
  }

  return Array.isArray(value) ? value.join(", ") : value;
}

function buildFormulaContext(state: AppState, recordId: string) {
  const record = state.records[recordId];
  if (!record) {
    return {};
  }

  return Object.fromEntries(
    Object.values(state.properties).map((property) => [
      property.key,
      toFormulaContextValue(getRecordValue(record, property)),
    ]),
  );
}

function buildParser() {
  const parser = new Parser();
  parser.functions.if = (condition: unknown, truthy: unknown, falsy: unknown) =>
    condition ? truthy : falsy;
  parser.functions.concat = (...parts: unknown[]) => parts.join("");
  parser.functions.date_diff = (left: string, right: string) =>
    Math.round(
      (new Date(left).getTime() - new Date(right).getTime()) /
        (1000 * 60 * 60 * 24),
    );

  return parser;
}

export function evaluateFormulaValue(
  state: AppState,
  recordId: string,
  property: Property,
) {
  const expression = property.config.formulaExpression?.trim();
  if (!expression) {
    return "";
  }

  try {
    return buildParser().evaluate(expression, buildFormulaContext(state, recordId));
  } catch {
    return "公式错误";
  }
}

export function applySort(state: AppState, sortRule: SortRule | null) {
  const records = Object.values(state.records);
  if (!sortRule) {
    return records;
  }

  const property = state.properties[sortRule.propertyId];
  if (!property) {
    return records;
  }

  return [...records].sort((left, right) => {
    const leftValue =
      property.type === "formula"
        ? evaluateFormulaValue(state, left.id, property)
        : getRecordValue(left, property);
    const rightValue =
      property.type === "formula"
        ? evaluateFormulaValue(state, right.id, property)
        : getRecordValue(right, property);
    const result = String(leftValue ?? "").localeCompare(
      String(rightValue ?? ""),
      "zh-CN",
      { numeric: true },
    );

    return sortRule.direction === "asc" ? result : result * -1;
  });
}

export function applyFilters(state: AppState, filters: FilterRule[]) {
  return Object.values(state.records).filter((record) =>
    filters.every((filter) => {
      const property = state.properties[filter.propertyId];
      if (!property) {
        return true;
      }

      const value =
        property.type === "formula"
          ? evaluateFormulaValue(state, record.id, property)
          : getRecordValue(record, property);

      switch (filter.operator) {
        case "isTrue":
          return value === true;
        case "isFalse":
          return value === false;
        case "isEmpty":
          return value == null || value === "" || (Array.isArray(value) && value.length === 0);
        case "contains":
          return String(value ?? "").includes(String(filter.value ?? ""));
        case "is":
          return String(value ?? "") === String(filter.value ?? "");
        case "isNot":
          return String(value ?? "") !== String(filter.value ?? "");
        case "gte":
          return Number(value ?? 0) >= Number(filter.value ?? 0);
        case "lte":
          return Number(value ?? 0) <= Number(filter.value ?? 0);
        default:
          return true;
      }
    }),
  );
}
