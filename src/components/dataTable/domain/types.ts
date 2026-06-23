export type PropertyType =
  | "title"
  | "text"
  | "number"
  | "select"
  | "multiSelect"
  | "date"
  | "checkbox"
  | "formula";

export type SortRule = {
  propertyId: string;
  direction: "asc" | "desc";
};

export type FilterOperator =
  | "is"
  | "isNot"
  | "contains"
  | "isEmpty"
  | "isTrue"
  | "isFalse"
  | "gte"
  | "lte";

export type RecordValue = string | number | boolean | string[] | null;

export type FilterRule = {
  id: string;
  propertyId: string;
  operator: FilterOperator;
  value?: RecordValue;
};

export type SelectOption = {
  id: string;
  label: string;
  color: string;
};

export type BoardCardSortMode = "manual" | "titleAsc" | "titleDesc";

export type PropertyConfig = {
  options?: SelectOption[];
  formulaExpression?: string;
  numberFormat?: string;
};

export type Property = {
  id: string;
  key: string;
  name: string;
  type: PropertyType;
  config: PropertyConfig;
  createdAt: string;
  updatedAt: string;
};

export type DatabaseRecord = {
  id: string;
  title: string;
  values: Record<string, RecordValue>;
  createdAt: string;
  updatedAt: string;
};

export type DatabaseView = {
  id: string;
  name: string;
  layout: "table" | "board" | "gantt" | "calendar";
  sort: SortRule | null;
  filters: FilterRule[];
  tableGroupPropertyId: string | null;
  tableGroupOrder: string[];
  tableHiddenGroupIds?: string[];
  tableCollapsedGroupIds?: string[];
  tableHideEmptyGroups?: boolean;
  boardGroupPropertyId: string | null;
  boardColumnOrder: string[];
  boardHiddenColumnIds?: string[];
  boardRecordOrder?: string[];
  boardCardSortMode?: BoardCardSortMode;
  boardShowPropertyNames?: boolean;
  ganttStartPropertyId: string | null;
  ganttEndPropertyId: string | null;
  calendarDatePropertyId: string | null;
  openMode: "sidePeek" | "centerPeek" | "fullPage";
  tableWidthMode: "fitPage" | "content";
  tablePageSize: number;
  wrapCells: boolean;
  freezeFirstColumn: boolean;
  hiddenPropertyIds: string[];
  columnWidths: Record<string, number>;
  createdAt: string;
  updatedAt: string;
};

export type Database = {
  id: string;
  name: string;
  propertyOrder: string[];
  activeViewId: string;
  viewOrder: string[];
  views: Record<string, DatabaseView>;
  createdAt: string;
  updatedAt: string;
};

export type BlockType =
  | "text"
  | "heading"
  | "todo"
  | "bulletedList"
  | "quote"
  | "code"
  | "image";

export type TextColor =
  | "gray"
  | "brown"
  | "orange"
  | "yellow"
  | "green"
  | "blue"
  | "purple"
  | "pink"
  | "red";
export type TextAlign = "center";
export type RichTextSegment = {
  text: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strike?: boolean;
  link?: string;
  color?: TextColor;
};

export type Block = {
  id: string;
  type: BlockType;
  recordId: string;
  content: string;
  richText?: RichTextSegment[];
  textColor?: TextColor;
  backgroundColor?: TextColor;
  textAlign?: TextAlign;
  checked?: boolean;
  imageAssetId?: string;
  order: number;
  createdAt: string;
  updatedAt: string;
};

export type RecordPage = {
  recordId: string;
  blockIds: string[];
  updatedAt: string;
};

export type Asset = {
  id: string;
  kind: "image";
  name: string;
  mimeType: string;
  dataUrl: string;
  createdAt: string;
};

export type AppState = {
  version: 1;
  database: Database;
  properties: Record<string, Property>;
  records: Record<string, DatabaseRecord>;
  recordPages: Record<string, RecordPage>;
  blocks: Record<string, Block>;
  assets: Record<string, Asset>;
};
