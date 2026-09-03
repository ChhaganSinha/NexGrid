// Pure rendering helpers shared by the table and the card list.
//
// The two layouts must never drift: a column with a custom cell (a status
// pill, a row action menu) has to look the same whether it is drawn as a `td`
// or as a card's `dd`. Routing both through these functions is what makes that
// structural rather than a thing to remember.

import * as React from "react";
import {
  getCellText,
  getCellValue,
  getColumnId,
  type TableXColumn,
  type NexGridColumn,
} from "@nexgrid/core";

/** Default width, in px, for a column that declares neither `width` nor `minWidth`. */
export const DEFAULT_MIN_WIDTH = 120;

/** Render a column's header: a custom render function, its text, or its id. */
export function renderColumnHeader<TData>(
  col: TableXColumn<TData, React.ReactNode>,
): React.ReactNode {
  const header = col.header;
  if (typeof header === "function") return header({});
  if (typeof header === "string") return header;
  return getColumnId(col);
}

/**
 * Render one cell. With no `cell` renderer the raw value is rendered as text
 * through core's `getCellText`, so booleans and objects never leak `[object
 * Object]` into the grid.
 */
export function renderCellContent<TData>(
  col: TableXColumn<TData, React.ReactNode>,
  row: TData,
  labels: { yes: string; no: string },
): React.ReactNode {
  const cell = col.cell;
  if (typeof cell === "function") {
    return cell({ row: { original: row }, getValue: () => getCellValue(col, row) });
  }
  return getCellText(getCellValue(col, row), labels);
}

/**
 * Header cell geometry. `meta.width` pins the column; otherwise it gets a floor
 * of `meta.minWidth ?? 120` and lays out naturally, which keeps a table of
 * short values from collapsing into unreadable slivers.
 */
export function headerCellStyle<TData>(
  col: TableXColumn<TData, React.ReactNode>,
): React.CSSProperties {
  const meta = col.meta;
  const style: React.CSSProperties =
    meta?.width === undefined
      ? { minWidth: `${meta?.minWidth ?? DEFAULT_MIN_WIDTH}px` }
      : { width: `${meta.width}px` };
  if (meta?.align !== undefined) style.textAlign = meta.align;
  return style;
}

/** Body cell geometry — alignment only; widths are set once, on the header. */
export function bodyCellStyle<TData>(
  col: TableXColumn<TData, React.ReactNode>,
): React.CSSProperties | undefined {
  const align = col.meta?.align;
  return align === undefined ? undefined : { textAlign: align };
}

/** Extra class for the header's inner flex wrapper, following `meta.align`. */
export function headerInnerClass<TData>(
  col: TableXColumn<TData, React.ReactNode>,
): string {
  const align = col.meta?.align;
  if (align === "center") return "tbx-th-inner tbx-th-inner--center";
  if (align === "right") return "tbx-th-inner tbx-th-inner--right";
  return "tbx-th-inner";
}

/**
 * Interpolate a locale template whose placeholders resolve to ELEMENTS rather
 * than text.
 *
 * `showingRange` needs `<strong>` around each number, but it is deliberately a
 * single translatable sentence ("Showing {start} to {end} of {total} entries")
 * rather than a pile of fragments, because word order differs by language.
 * Splitting the template on its own placeholders keeps translators in charge
 * of the sentence while the grid keeps control of the markup.
 */
export function renderTemplate(
  template: string,
  values: Readonly<Record<string, React.ReactNode>>,
): React.ReactNode {
  const parts: React.ReactNode[] = [];
  const pattern = /\{(\w+)\}/g;
  let cursor = 0;

  for (let match = pattern.exec(template); match !== null; match = pattern.exec(template)) {
    const key = match[1];
    const replacement = key === undefined ? undefined : values[key];
    if (replacement === undefined) continue;
    if (match.index > cursor) parts.push(template.slice(cursor, match.index));
    parts.push(replacement);
    cursor = match.index + match[0].length;
  }

  if (cursor < template.length) parts.push(template.slice(cursor));

  // Index keys are correct here: the parts are fixed positions in one template,
  // never a reorderable list.
  return parts.map((part, index) => <React.Fragment key={index}>{part}</React.Fragment>);
}
