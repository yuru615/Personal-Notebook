import { CalendarDays, ChartNoAxesGantt, LayoutGrid, Table2 } from "lucide-react";
import type { TableLayout } from "./viewTypes";

type ViewLayoutOption = {
  value: TableLayout;
  label: string;
  shortLabel: string;
  createLabel: string;
  Icon: typeof Table2;
};

export const VIEW_LAYOUT_OPTIONS: ViewLayoutOption[] = [
  {
    value: "table",
    label: "表格布局",
    shortLabel: "表格",
    createLabel: "新建表格视图",
    Icon: Table2,
  },
  {
    value: "board",
    label: "看板布局",
    shortLabel: "看板",
    createLabel: "新建看板视图",
    Icon: LayoutGrid,
  },
  {
    value: "gantt",
    label: "甘特图布局",
    shortLabel: "甘特图",
    createLabel: "新建甘特视图",
    Icon: ChartNoAxesGantt,
  },
  {
    value: "calendar",
    label: "日历布局",
    shortLabel: "日历",
    createLabel: "新建日历视图",
    Icon: CalendarDays,
  },
];

export function getViewLayoutOption(layout: TableLayout) {
  return (
    VIEW_LAYOUT_OPTIONS.find((option) => option.value === layout) ??
    VIEW_LAYOUT_OPTIONS[0]
  );
}
