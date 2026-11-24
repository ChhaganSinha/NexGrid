// Public types that exist ONLY because Angular renders through templates and
// EventEmitters.
//
// Everything about the data contract itself — `QueryState`, `TableXColumn`,
// the locale, the export options — lives in `@nexgrid/core` and is re-exported
// from this package's public API. Nothing here reimplements engine behavior.

import type {
  RowEditEvent,
  RowOrderChangeEvent,
  TableXColumn,
} from "@nexgrid/core";

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
   * `true` when the user activates "Select all matching records" across all pages.
   */
  allAcrossSelected: boolean;
}

/** Theme mode: fixed light, fixed dark, or follow the OS preference. */
export type TableXTheme = "light" | "dark" | "auto";

/** Imperative handle exposed on TableXComponent / NexGridComponent. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export interface TableXHandle<TData = any> {
  undo: () => boolean;
  redo: () => boolean;
  canUndo: () => boolean;
  canRedo: () => boolean;
  autoFitAllColumns: (sampleRows?: number) => void;
  autoFitColumn: (colId: string) => void;
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type NexGridHandle<TData = any> = TableXHandle<TData>;

/** Payload of the `cellEdit` output when an inline cell edit is committed. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export interface TableXCellEditEvent<TData = any> {
  row: TData;
  columnId: string;
  oldValue: unknown;
  newValue: unknown;
}

/** Context handed to a `*nexGridExpandedRow` / `*tableXExpandedRow` template. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export interface TableXExpandedRowTemplateContext<TData = any> {
  /** The row being rendered — `let-row` picks this up. */
  $implicit: TData;
  /** Zero-based index of the row within the current page (`let-i="rowIndex"`). */
  rowIndex: number;
}

/** Context handed to a `*nexGridBulkActions` / `tableXBulkActions` template. */
export interface TableXBulkActionsTemplateContext {
  /** Selected row IDs — `let-ids` picks this up. */
  $implicit: string[];
  /** Selected row IDs (`let-selectedIds="selectedIds"`). */
  selectedIds: string[];
  /** Clears all selected rows (`let-deselectAll="deselectAll"`). */
  deselectAll: () => void;
}

/** Payload of the `rowEdit` output when a full-row edit (`editMode === 'row'`) is committed. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type TableXRowEditEvent<TData = any> = RowEditEvent<TData>;

/** Payload of the `rowOrderChange` output when rows are reordered via drag-and-drop. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type TableXRowOrderChangeEvent<TData = any> = RowOrderChangeEvent<TData>;

export type NexGridAngularColumn<TData> = TableXAngularColumn<TData>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type NexGridCellTemplateContext<TData = any> = TableXCellTemplateContext<TData>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type NexGridCellEditEvent<TData = any> = TableXCellEditEvent<TData>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type NexGridRowEditEvent<TData = any> = TableXRowEditEvent<TData>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type NexGridRowOrderChangeEvent<TData = any> = TableXRowOrderChangeEvent<TData>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type NexGridExpandedRowTemplateContext<TData = any> = TableXExpandedRowTemplateContext<TData>;
export type NexGridBulkActionsTemplateContext = TableXBulkActionsTemplateContext;
export type NexGridNotice = TableXNotice;
export type NexGridSelectionChange = TableXSelectionChange;
export type NexGridTheme = TableXTheme;
