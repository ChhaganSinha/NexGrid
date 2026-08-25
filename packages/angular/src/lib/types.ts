// Public types that exist ONLY because Angular renders through templates and
// EventEmitters.
//
// Everything about the data contract itself — `QueryState`, `TableXColumn`,
// the locale, the export options — lives in `@tablex/core` and is re-exported
// from this package's public API. Nothing here reimplements engine behavior.

import type { TableXColumn } from "@tablex/core";

/**
 * A NexGrid column as the Angular adapter binds it.
 *
 * The render type is `string`: `header` and `cell` functions may return text,
 * and anything richer (a badge, a button, an icon) is expressed as a
 * `*nexGridCell` template instead of a render function, because Angular cannot
 * render an arbitrary value returned from a function into the DOM.
 */
export type TableXAngularColumn<TData> = TableXColumn<TData, string>;

/**
 * The context handed to a `*nexGridCell` template.
 *
 * ```html
 * <ng-container *nexGridCell="'status'; let row; let value = value">…</ng-container>
 * ```
 *
 * `TData` defaults to `any` on purpose: a cell template is keyed by a column
 * *id* (a string), so the compiler has nothing to infer the row type from and
 * a stricter default would force every consumer to annotate the row before
 * their template compiled. Bind the type anchor
 * (`*nexGridCell="'status'; of: rows"`) to get a fully typed row.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export interface TableXCellTemplateContext<TData = any> {
  /** The row being rendered — `let-row` picks this up. */
  $implicit: TData;
  /** The raw value the column reads for this row (`let-value="value"`). */
  value: unknown;
  /** The column definition being rendered (`let-column="column"`). */
  column: NexGridAngularColumn<TData>;
  /** Zero-based index of the row WITHIN THE CURRENT PAGE (`let-i="rowIndex"`). */
  rowIndex: number;
}

/** A user-facing notice the grid wants shown. The grid never renders toasts itself. */
export interface TableXNotice {
  type: "info" | "success" | "error";
  message: string;
}

/** Payload of the `selectionChange` output. */
export interface TableXSelectionChange {
  /** Ids of every selected row, across pages, in selection order. */
  ids: string[];
  /**
   * Reserved for a future "select every row matching the query" affordance.
   * Always `false` today.
   */
  allAcrossSelected: boolean;
}

/** Theme mode: fixed light, fixed dark, or follow the OS preference. */
export type TableXTheme = "light" | "dark" | "auto";

export type NexGridAngularColumn<TData> = TableXAngularColumn<TData>;
export type NexGridCellTemplateContext<TData = any> = TableXCellTemplateContext<TData>;
export type NexGridNotice = TableXNotice;
export type NexGridSelectionChange = TableXSelectionChange;
export type NexGridTheme = TableXTheme;
