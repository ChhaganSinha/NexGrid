// The TableX icon set, built as real SVG nodes.
//
// Every adapter draws the SAME twelve icons (adapter spec §7) so a grid looks
// identical whichever framework rendered it. They are inlined rather than
// loaded from an icon font or a sprite sheet because this package has zero
// runtime dependencies and must work from a single `<script>` tag with no
// second asset request.
//
// The geometry below is deliberately data, not markup: each icon is a list of
// (tag, attributes) pairs handed to `createElementNS`. Assembling icons from an
// HTML string would mean this file is the one place in the package that talks
// to an HTML parser, and that is exactly the habit the data path must not have.

import { svgEl, type ElementChild } from "./dom.js";

/** One shape inside an icon: an SVG tag plus its attributes. */
type IconPart = readonly [keyof SVGElementTagNameMap, Readonly<Record<string, string>>];

/**
 * Shared presentation attributes. Sizing is intentionally absent — it comes
 * from the CSS classes (`.tbx-icon`, `.tbx-sort-icon`, ...) so a host can
 * re-scale icons through the stylesheet alone.
 */
const ICON_ATTRS: Readonly<Record<string, string>> = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  "stroke-width": "2",
  "stroke-linecap": "round",
  "stroke-linejoin": "round",
  "aria-hidden": "true",
  focusable: "false",
};

function icon(parts: readonly IconPart[], className?: string): SVGSVGElement {
  const children: ElementChild[] = parts.map(([tag, attrs]) => svgEl(tag, { attrs }));
  return svgEl("svg", { class: className, attrs: ICON_ATTRS }, children);
}

/** Magnifier for the search field. */
export function searchIcon(className = "tbx-search-icon"): SVGSVGElement {
  return icon(
    [
      ["circle", { cx: "11", cy: "11", r: "8" }],
      ["path", { d: "m21 21-4.3-4.3" }],
    ],
    className,
  );
}

/** Cross used by the "clear search" button. */
export function xIcon(className = "tbx-icon"): SVGSVGElement {
  return icon(
    [
      ["path", { d: "M18 6 6 18" }],
      ["path", { d: "m6 6 12 12" }],
    ],
    className,
  );
}

/** Columns icon — 3 vertical columns inside a rounded box. */
export function columnsIcon(className = "tbx-icon"): SVGSVGElement {
  return icon(
    [
      ["rect", { x: "3", y: "3", width: "18", height: "18", rx: "2" }],
      ["path", { d: "M9 3v18" }],
      ["path", { d: "M15 3v18" }],
    ],
    className,
  );
}

/** Horizontal sliders — backwards compatible alias to columnsIcon. */
export function slidersIcon(className = "tbx-icon"): SVGSVGElement {
  return columnsIcon(className);
}

/** Density icon — horizontal rows / stacked bars. */
export function densityIcon(className = "tbx-icon"): SVGSVGElement {
  return icon(
    [
      ["rect", { x: "3", y: "4.5", width: "18", height: "6", rx: "1.5" }],
      ["rect", { x: "3", y: "13.5", width: "18", height: "6", rx: "1.5" }],
    ],
    className,
  );
}

/** Funnel — backwards compatible alias to densityIcon. */
export function filterIcon(className = "tbx-icon"): SVGSVGElement {
  return densityIcon(className);
}

/** Chevron down for dropdowns. */
export function chevronDownIcon(className = "tbx-icon"): SVGSVGElement {
  return icon([["path", { d: "m6 9 6 6 6-6" }]], className);
}

/** Edit / pencil icon for actions. */
export function editIcon(className = "tbx-icon"): SVGSVGElement {
  return icon(
    [
      ["path", { d: "M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" }],
      ["path", { d: "m15 5 4 4" }],
    ],
    className,
  );
}

/** Download tray — the Export menu trigger. */
export function downloadIcon(className = "tbx-icon"): SVGSVGElement {
  return chevronDownIcon(className);
}

/** Spreadsheet document — the Excel export option. */
export function fileSpreadsheetIcon(className = "tbx-icon--excel"): SVGSVGElement {
  return icon(
    [
      ["path", { d: "M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" }],
      ["path", { d: "M14 2v4a2 2 0 0 0 2 2h4" }],
      ["path", { d: "M8 13h2" }],
      ["path", { d: "M14 13h2" }],
      ["path", { d: "M8 17h2" }],
      ["path", { d: "M14 17h2" }],
    ],
    className,
  );
}

/** Text document — the CSV export option. */
export function fileTextIcon(className = "tbx-icon--csv"): SVGSVGElement {
  return icon(
    [
      ["path", { d: "M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" }],
      ["path", { d: "M14 2v4a2 2 0 0 0 2 2h4" }],
      ["path", { d: "M10 9H8" }],
      ["path", { d: "M16 13H8" }],
      ["path", { d: "M16 17H8" }],
    ],
    className,
  );
}

/** Left chevron — previous page. */
export function chevronLeftIcon(className = "tbx-icon"): SVGSVGElement {
  return icon([["path", { d: "m15 18-6-6 6-6" }]], className);
}

/** Right chevron — next page. */
export function chevronRightIcon(className = "tbx-icon"): SVGSVGElement {
  return icon([["path", { d: "m9 18 6-6-6-6" }]], className);
}

/** Up arrow — ascending sort. */
export function arrowUpIcon(className = "tbx-sort-icon"): SVGSVGElement {
  return icon(
    [
      ["path", { d: "m5 12 7-7 7 7" }],
      ["path", { d: "M12 19V5" }],
    ],
    className,
  );
}

/** Down arrow — descending sort. */
export function arrowDownIcon(className = "tbx-sort-icon"): SVGSVGElement {
  return icon(
    [
      ["path", { d: "M12 5v14" }],
      ["path", { d: "m19 12-7 7-7-7" }],
    ],
    className,
  );
}

/** Opposed arrows — sortable but not currently sorted. */
export function arrowUpDownIcon(className = "tbx-sort-icon tbx-sort-icon--idle"): SVGSVGElement {
  return icon(
    [
      ["path", { d: "m21 16-4 4-4-4" }],
      ["path", { d: "M17 20V4" }],
      ["path", { d: "m3 8 4-4 4 4" }],
      ["path", { d: "M7 4v16" }],
    ],
    className,
  );
}

/** Tick — the checked marker in menu checkbox items. */
export function checkIcon(className = "tbx-check"): SVGSVGElement {
  return icon([["path", { d: "M20 6 9 17l-5-5" }]], className);
}

/** Funnel icon for column filter trigger. */
export function funnelIcon(className = "tbx-icon"): SVGSVGElement {
  return icon(
    [["polygon", { points: "22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" }]],
    className,
  );
}

/** Rotate counter-clockwise / reset icon. */
export function rotateCcwIcon(className = "tbx-icon"): SVGSVGElement {
  return icon(
    [
      ["path", { d: "M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" }],
      ["path", { d: "M3 3v5h5" }],
    ],
    className,
  );
}

/** Trash / delete icon for actions. */
export function trashIcon(className = "tbx-icon"): SVGSVGElement {
  return icon(
    [
      ["path", { d: "M3 6h18" }],
      ["path", { d: "M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" }],
      ["path", { d: "M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" }],
    ],
    className,
  );
}

/** Eye / view icon. */
export function eyeIcon(className = "tbx-icon"): SVGSVGElement {
  return icon(
    [
      ["path", { d: "M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" }],
      ["circle", { cx: "12", cy: "12", r: "3" }],
    ],
    className,
  );
}

/** Download tray icon. */
export function downloadTrayIcon(className = "tbx-icon"): SVGSVGElement {
  return icon(
    [
      ["path", { d: "M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" }],
      ["polyline", { points: "7 10 12 15 17 10" }],
      ["line", { x1: "12", x2: "12", y1: "15", y2: "3" }],
    ],
    className,
  );
}
