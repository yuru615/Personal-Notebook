import type { DatabaseView } from "../../domain/types";

export type TablePanel = "filter" | "sort" | "search" | "viewOptions";

export type TableLayout = DatabaseView["layout"];

export type TableOpenMode = DatabaseView["openMode"];

export type TableWidthMode = DatabaseView["tableWidthMode"];
