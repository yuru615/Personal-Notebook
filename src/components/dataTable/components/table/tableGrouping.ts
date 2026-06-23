import type { DatabaseRecord, Property, RecordValue } from "../../domain/types";

export const TABLE_UNGROUPED_ID = "ungrouped";
export const TABLE_UNGROUPED_LABEL = "未分组";
const CHECKBOX_TRUE_LABEL = "已勾选";
const CHECKBOX_FALSE_LABEL = "未勾选";

export type TableGroupSection = {
  id: string;
  label: string;
  tone?: string;
  seedValue?: RecordValue;
  isCollapsed?: boolean;
  records: DatabaseRecord[];
};

export type TableHiddenGroup = {
  id: string;
  label: string;
  tone?: string;
  count: number;
};

export type TableGroupingResult = {
  sections: TableGroupSection[];
  hiddenSections: TableHiddenGroup[];
};

type GroupDefinition = {
  id: string;
  label: string;
  tone?: string;
  seedValue?: RecordValue;
};

function sanitizeToken(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function getDynamicGroupId(label: string) {
  return `value:${sanitizeToken(label) || label}`;
}

function normalizeScalarValue(value: RecordValue) {
  if (Array.isArray(value) || value == null) {
    return "";
  }

  if (typeof value === "boolean") {
    return value ? CHECKBOX_TRUE_LABEL : CHECKBOX_FALSE_LABEL;
  }

  return String(value).trim();
}

function getSeedValueForLabel(property: Property, label: string): RecordValue | undefined {
  switch (property.type) {
    case "text":
    case "date":
    case "select":
      return label;
    case "multiSelect":
      return [label];
    case "number": {
      const numericValue = Number(label);
      return Number.isFinite(numericValue) ? numericValue : null;
    }
    case "checkbox":
      return label === CHECKBOX_TRUE_LABEL;
    default:
      return undefined;
  }
}

function normalizeValueList(value: RecordValue) {
  if (Array.isArray(value)) {
    return value.map((item) => item.trim()).filter(Boolean);
  }

  const scalar = normalizeScalarValue(value);
  return scalar ? [scalar] : [];
}

function getConfiguredDefinitions(
  property: Property,
  groupOrder: string[],
): GroupDefinition[] | null {
  if (
    (property.type !== "select" && property.type !== "multiSelect") ||
    !property.config.options?.length
  ) {
    return null;
  }

  const definitionById = new Map(
    property.config.options.map((option) => [
      option.id,
      {
        id: option.id,
        label: option.label,
        tone: option.color,
        seedValue:
          property.type === "multiSelect" ? [option.label] : option.label,
      },
    ] as const),
  );
  const seenIds = new Set<string>();
  const orderedDefinitions = groupOrder.flatMap((groupId) => {
    const definition = definitionById.get(groupId);

    if (!definition || seenIds.has(groupId)) {
      return [];
    }

    seenIds.add(groupId);
    return [definition];
  });

  for (const option of property.config.options) {
    if (!seenIds.has(option.id)) {
      orderedDefinitions.push({
        id: option.id,
        label: option.label,
        tone: option.color,
        seedValue:
          property.type === "multiSelect" ? [option.label] : option.label,
      });
    }
  }

  return orderedDefinitions;
}

function getRecordLabels(property: Property, record: DatabaseRecord) {
  if (property.type === "multiSelect") {
    return normalizeValueList(record.values[property.id]);
  }

  const label = normalizeScalarValue(record.values[property.id]);
  return label ? [label] : [];
}

function buildDynamicDefinitions(
  property: Property,
  records: DatabaseRecord[],
  groupOrder: string[],
) {
  const definitionById = new Map<string, GroupDefinition>();

  for (const record of records) {
    for (const label of getRecordLabels(property, record)) {
      const id = getDynamicGroupId(label);

      if (!definitionById.has(id)) {
        definitionById.set(id, {
          id,
          label,
          seedValue: getSeedValueForLabel(property, label),
        });
      }
    }
  }

  const seenIds = new Set<string>();
  const orderedDefinitions = groupOrder.flatMap((groupId) => {
    const definition = definitionById.get(groupId);

    if (!definition || seenIds.has(groupId)) {
      return [];
    }

    seenIds.add(groupId);
    return [definition];
  });

  for (const definition of definitionById.values()) {
    if (!seenIds.has(definition.id)) {
      orderedDefinitions.push(definition);
    }
  }

  return orderedDefinitions;
}

function getGroupDefinitions(
  property: Property,
  records: DatabaseRecord[],
  groupOrder: string[],
) {
  return (
    getConfiguredDefinitions(property, groupOrder) ??
    buildDynamicDefinitions(property, records, groupOrder)
  );
}

export function isSupportedTableGroupProperty(property: Property) {
  return (
    property.type === "text" ||
    property.type === "number" ||
    property.type === "select" ||
    property.type === "multiSelect" ||
    property.type === "date" ||
    property.type === "checkbox"
  );
}

export function buildTableGroupingResult(
  property: Property | null,
  records: DatabaseRecord[],
  groupOrder: string[],
  hiddenGroupIds: string[],
  collapsedGroupIds: string[],
  hideEmptyGroups: boolean,
): TableGroupingResult | null {
  if (!property || !isSupportedTableGroupProperty(property)) {
    return null;
  }

  const definitions = getGroupDefinitions(property, records, groupOrder);
  const definitionByLabel = new Map(
    definitions.map((definition) => [definition.label, definition] as const),
  );
  const groupedRecords = new Map<string, DatabaseRecord[]>(
    definitions.map((definition) => [definition.id, [] as DatabaseRecord[]] as const),
  );
  const ungroupedRecords: DatabaseRecord[] = [];

  for (const record of records) {
    const labels = getRecordLabels(property, record);

    if (labels.length === 0) {
      ungroupedRecords.push(record);
      continue;
    }

    const matchedIds = new Set<string>();

    for (const label of labels) {
      const configuredDefinition = definitionByLabel.get(label);
      const definitionId =
        configuredDefinition?.id ??
        (property.type === "select" || property.type === "multiSelect"
          ? null
          : getDynamicGroupId(label));

      if (!definitionId) {
        continue;
      }

      if (!groupedRecords.has(definitionId)) {
        groupedRecords.set(definitionId, []);
      }

      if (!matchedIds.has(definitionId)) {
        groupedRecords.get(definitionId)?.push(record);
        matchedIds.add(definitionId);
      }
    }

    if (matchedIds.size === 0) {
      ungroupedRecords.push(record);
    }
  }

  const baseSections = definitions.map((definition) => ({
    ...definition,
    records: groupedRecords.get(definition.id) ?? [],
  }));

  if (ungroupedRecords.length > 0) {
    baseSections.push({
      id: TABLE_UNGROUPED_ID,
      label: TABLE_UNGROUPED_LABEL,
      records: ungroupedRecords,
    });
  }

  const visibleSections: TableGroupSection[] = [];
  const hiddenSections: TableHiddenGroup[] = [];
  const hiddenIdSet = new Set(hiddenGroupIds);
  const collapsedIdSet = new Set(collapsedGroupIds);

  for (const section of baseSections) {
    if (hideEmptyGroups && section.records.length === 0) {
      continue;
    }

    if (hiddenIdSet.has(section.id)) {
      hiddenSections.push({
        id: section.id,
        label: section.label,
        tone: section.tone,
        count: section.records.length,
      });
      continue;
    }

    visibleSections.push({
      ...section,
      isCollapsed: collapsedIdSet.has(section.id),
    });
  }

  return {
    sections: visibleSections,
    hiddenSections,
  };
}
