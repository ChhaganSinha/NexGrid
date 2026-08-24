// The render model `<nex-grid>` builds once per input change, plus the pure
// helpers that build it.
//
// WHY A VIEW MODEL AT ALL: the component is `OnPush`, but Angular still
// re-evaluates every expression in a template on each check of the view. A
// grid renders `rows x columns` cells, and calling `getCellValue()` /
// `isSortable()` / `formatMessage()` from the template would repeat that work
// on every keystroke in the search box. Building a flat view model in
// `ngOnChanges` (and after any internal state change) keeps the template to
// plain property reads, and gives every `@for` a stable `track` key.

import type { TemplateRef } from "@angular/core";
import { getCellText, getColumnId, type NexGridColumn } from "@nexgrid/core";

import type { NexGridCellTemplateContext } from "./types";

/** One rendered header cell. */
export interface NexGridHeaderView {
  /** Stable, unique `@for` track key. */
  key: string;
  /** Column id, used for sort intent. */
  id: string;
  /** Resolved header text. */
  title: string;
  sortable: boolean;
  /** Which sort icon to draw. */
  sortState: "asc" | "desc" | "none";
  /** Sort order priority number for multi-column sorting (1, 2, ...), or null. */
  sortOrder: number | null;
  /** `aria-sort` value, or `null` when the column cannot be sorted. */
  ariaSort: "ascending" | "descending" | "none" | null;
  align: "left" | "center" | "right";
  /** Fixed pixel width, or `null` for natural layout. */
  width: number | null;
  /** Minimum pixel width, or `null` when a fixed width is set. */
  minWidth: number | null;
  /** Whether the column has a server-filterable menu. */
  serverFilterable: boolean;
  /** Preset options if defined on column metadata. */
  filterOptions?: readonly string[];
  /** The current filter value applied to this column, if any. */
  activeFilter?: string;
}

/** One rendered data cell, in the table and in the mobile card list. */
export interface NexGridCellView<TData> {
  /** Stable, unique `@for` track key (shared with the header cell). */
  key: string;
  /** Header text, used as the `<dt>` label in the card list. */
  header: string;
  align: "left" | "center" | "right";
  /** Custom template for this column, or `null` to render {@link text}. */
  template: TemplateRef<NexGridCellTemplateContext<TData>> | null;
  /** Context for {@link template}; `null` when there is no template. */
  context: NexGridCellTemplateContext<TData> | null;
  /** Plain-text rendering, used when there is no template. */
  text: string;
}

/** One rendered row. */
export interface NexGridRowView<TData> {
  /** Stable, unique `@for` track key. */
  key: string;
  /** The row's identity, from `getRowId`. Drives selection. */
  id: string;
  /** The original row object, handed back to `rowClick` and cell templates. */
  data: TData;
  /** Absolute serial number within the whole result set. */
  serial: number;
  selected: boolean;
  /** Accessible name for this row's selection checkbox. */
  selectLabel: string;
  cells: NexGridCellView<TData>[];
}

/** One entry in the Columns menu. */
export interface NexGridColumnToggle {
  key: string;
  id: string;
  title: string;
  visible: boolean;
}

/** One entry in the Density menu. */
export interface NexGridDensityOption {
  value: "compact" | "default" | "comfortable";
  label: string;
  selected: boolean;
}

/** One pager control: a page button or an ellipsis gap. */
export interface NexGridPagerItem {
  key: string;
  /** True for the `…` separator, which renders as a span rather than a button. */
  gap: boolean;
  page: number;
  current: boolean;
  /** Accessible name (`Go to page 4`). */
  label: string;
}

/**
 * One fragment of the "Showing 1 to 10 of 240 entries" line. The DOM contract
 * wraps each NUMBER in a `<strong>`, so the locale string is split around its
 * placeholders and rendered as alternating text and `<strong>` nodes — which
 * keeps the sentence fully translatable without ever touching `innerHTML`.
 */
export interface NexGridRangePart {
  key: string;
  /** Render inside a `<strong>` rather than as bare text. */
  strong: boolean;
  /** Adds `.nxg-range-total` — the total gets its own accent styling. */
  total: boolean;
  value: string;
}

/**
 * Build unique `@for` track keys for a column set.
 *
 * Column ids are normally unique, but a column may legitimately have none (a
 * pure action column), and `@for` throws on duplicate track keys — so ties are
 * broken by position rather than taking the grid down.
 */
export function trackKeys(ids: readonly string[]): string[] {
  const seen = new Set<string>();
  return ids.map((id, index) => uniqueKey(id === "" ? String(index) : id, seen));
}

/** Reserve `candidate`, suffixing it until it is unique within `seen`. */
export function uniqueKey(candidate: string, seen: Set<string>): string {
  let key = candidate;
  let n = 1;
  while (seen.has(key)) key = `${candidate}#${n++}`;
  seen.add(key);
  return key;
}

/**
 * Resolve a column's displayed header text. A function header is invoked (the
 * Angular render type is `string`); everything else falls back to the id.
 */
export function headerText<TData>(column: NexGridColumn<TData, string>): string {
  const header = column.header;
  if (typeof header === "function") return header({});
  if (typeof header === "string" && header !== "") return header;
  const id = getColumnId(column);
  return id === "" ? "" : id.charAt(0).toUpperCase() + id.slice(1);
}

/**
 * Plain-text rendering of one cell: a column's own `cell` function when it has
 * one, else core's shared value formatting so booleans and objects look the
 * same here as they do in an export.
 */
export function cellText<TData>(
  column: NexGridColumn<TData, string>,
  row: TData,
  value: unknown,
  labels: { yes: string; no: string },
): string {
  const cell = column.cell;
  if (typeof cell === "function") {
    return cell({ row: { original: row }, getValue: () => value });
  }
  return getCellText(value, labels);
}

/**
 * Split a `showingRange` locale string into text and `<strong>` fragments.
 * Unknown placeholders are left untouched, exactly as `formatMessage` does.
 */
export function buildRangeParts(
  template: string,
  values: Readonly<Record<string, string>>,
): NexGridRangePart[] {
  const parts: NexGridRangePart[] = [];
  const pattern = /\{(\w+)\}/g;
  let cursor = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(template)) !== null) {
    if (match.index > cursor) {
      parts.push({
        key: `t${parts.length}`,
        strong: false,
        total: false,
        value: template.slice(cursor, match.index),
      });
    }
    const name = match[1] ?? "";
    const replacement = values[name];
    parts.push({
      key: `v${parts.length}`,
      strong: replacement !== undefined,
      total: name === "total",
      value: replacement ?? match[0],
    });
    cursor = match.index + match[0].length;
  }

  if (cursor < template.length) {
    parts.push({
      key: `t${parts.length}`,
      strong: false,
      total: false,
      value: template.slice(cursor),
    });
  }
  return parts;
}

/**
 * Default row identity: the row's `id` property when it has a usable one.
 *
 * Rows without an id all stringify to the same value, which is why row track
 * keys go through {@link uniqueKey} — selection still treats them as one
 * identity, but the grid renders instead of throwing.
 */
export function defaultRowId(row: unknown): string {
  if (row !== null && typeof row === "object" && "id" in row) {
    const id = (row as { id?: unknown }).id;
    if (id !== null && id !== undefined) return String(id);
  }
  return String(row);
}

/**
 * Read `.value` off a DOM event target. Avoids `instanceof HTMLInputElement`,
 * which throws on a server where that global does not exist.
 */
export function eventValue(event: Event): string {
  const target = event.target as { value?: unknown } | null;
  return typeof target?.value === "string" ? target.value : "";
}
