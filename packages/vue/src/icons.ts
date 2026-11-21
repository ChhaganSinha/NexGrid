import { h, type VNode } from "vue";

function svgIcon(className: string, children: VNode[]): VNode {
  return h(
    "svg",
    {
      class: className,
      viewBox: "0 0 24 24",
      fill: "none",
      stroke: "currentColor",
      "stroke-width": "2",
      "stroke-linecap": "round",
      "stroke-linejoin": "round",
      "aria-hidden": "true",
    },
    children,
  );
}

export const searchIcon = (cls = "tbx-search-icon"): VNode =>
  svgIcon(cls, [h("circle", { cx: "11", cy: "11", r: "8" }), h("path", { d: "m21 21-4.3-4.3" })]);

export const xIcon = (cls = "tbx-icon"): VNode =>
  svgIcon(cls, [h("path", { d: "M18 6 6 18" }), h("path", { d: "m6 6 12 12" })]);

export const columnsIcon = (cls = "tbx-icon"): VNode =>
  svgIcon(cls, [
    h("rect", { x: "3", y: "3", width: "18", height: "18", rx: "2" }),
    h("path", { d: "M9 3v18" }),
    h("path", { d: "M15 3v18" }),
  ]);

export const densityIcon = (cls = "tbx-icon"): VNode =>
  svgIcon(cls, [
    h("rect", { x: "3", y: "4.5", width: "18", height: "6", rx: "1.5" }),
    h("rect", { x: "3", y: "13.5", width: "18", height: "6", rx: "1.5" }),
  ]);

export const slidersIcon = (cls = "tbx-icon"): VNode =>
  svgIcon(cls, [
    h("line", { x1: "4", x2: "4", y1: "21", y2: "14" }),
    h("line", { x1: "4", x2: "4", y1: "10", y2: "3" }),
    h("line", { x1: "12", x2: "12", y1: "21", y2: "12" }),
    h("line", { x1: "12", x2: "12", y1: "8", y2: "3" }),
    h("line", { x1: "20", x2: "20", y1: "21", y2: "16" }),
    h("line", { x1: "20", x2: "20", y1: "12", y2: "3" }),
    h("line", { x1: "2", x2: "6", y1: "14", y2: "14" }),
    h("line", { x1: "10", x2: "14", y1: "8", y2: "8" }),
    h("line", { x1: "18", x2: "22", y1: "16", y2: "16" }),
  ]);

export const downloadTrayIcon = (cls = "tbx-icon"): VNode =>
  svgIcon(cls, [
    h("path", { d: "M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" }),
    h("polyline", { points: "7 10 12 15 17 10" }),
    h("line", { x1: "12", x2: "12", y1: "15", y2: "3" }),
  ]);

export const chevronDownIcon = (cls = "tbx-icon"): VNode =>
  svgIcon(cls, [h("path", { d: "m6 9 6 6 6-6" })]);

export const chevronLeftIcon = (cls = "tbx-icon"): VNode =>
  svgIcon(cls, [h("path", { d: "m15 18-6-6 6-6" })]);

export const chevronRightIcon = (cls = "tbx-icon"): VNode =>
  svgIcon(cls, [h("path", { d: "m9 18 6-6-6-6" })]);

export const arrowUpIcon = (cls = "tbx-icon"): VNode =>
  svgIcon(cls, [h("path", { d: "m5 12 7-7 7 7" }), h("path", { d: "M12 19V5" })]);

export const arrowDownIcon = (cls = "tbx-icon"): VNode =>
  svgIcon(cls, [h("path", { d: "M12 5v14" }), h("path", { d: "m19 12-7 7-7-7" })]);

export const arrowUpDownIcon = (cls = "tbx-icon"): VNode =>
  svgIcon(cls, [
    h("path", { d: "m21 16-4 4-4-4" }),
    h("path", { d: "M17 20V4" }),
    h("path", { d: "m3 8 4-4 4 4" }),
    h("path", { d: "M7 4v16" }),
  ]);

export const dotsVerticalIcon = (cls = "tbx-icon"): VNode =>
  svgIcon(cls, [
    h("circle", { cx: "12", cy: "5", r: "1.5" }),
    h("circle", { cx: "12", cy: "12", r: "1.5" }),
    h("circle", { cx: "12", cy: "19", r: "1.5" }),
  ]);

export const checkIcon = (cls = "tbx-check"): VNode =>
  svgIcon(cls, [h("path", { d: "M20 6 9 17l-5-5" })]);

export const rotateCcwIcon = (cls = "tbx-icon"): VNode =>
  svgIcon(cls, [
    h("path", { d: "M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" }),
    h("path", { d: "M3 3v5h5" }),
  ]);

export const fileSpreadsheetIcon = (cls = "tbx-icon--excel"): VNode =>
  svgIcon(cls, [
    h("path", { d: "M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" }),
    h("path", { d: "M14 2v4a2 2 0 0 0 2 2h4" }),
    h("path", { d: "M8 13h2" }),
    h("path", { d: "M14 13h2" }),
    h("path", { d: "M8 17h2" }),
    h("path", { d: "M14 17h2" }),
  ]);

export const fileTextIcon = (cls = "tbx-icon--csv"): VNode =>
  svgIcon(cls, [
    h("path", { d: "M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" }),
    h("path", { d: "M14 2v4a2 2 0 0 0 2 2h4" }),
    h("path", { d: "M10 9H8" }),
    h("path", { d: "M16 13H8" }),
    h("path", { d: "M16 17H8" }),
  ]);
