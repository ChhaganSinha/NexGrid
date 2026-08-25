// The column model shared by every adapter.
//
// The shape is deliberately structurally compatible with TanStack Table's
// `ColumnDef` (accessorKey / header / cell / enableSorting / meta), so column
// sets written for TanStack-based tables can be reused with TableX unchanged.
// The render type is generic: React binds it to `ReactNode`, the vanilla
// renderer to `string | Node`, and Angular ignores it in favor of templates.

/** The cell context handed to custom `cell` renderers (TanStack-compatible). */
export interface TableXCellContext<TData> {
  row: { original: TData };
  getValue: () => unknown;
}
export type NexGridCellContext<TData> = TableXCellContext<TData>;

/** Per-column layout and behavior hints. */
export interface TableXColumnMeta {
  /** Fixed pixel width. */
  width?: number;
  /** Minimum width in pixels. */
  minWidth?: number;
  /** Proportional width unit (adapters may use it when no width is given). */
  flex?: number;
  /** Cell and header alignment. Defaults to `"left"`. */
  align?: "left" | "center" | "right";
  /** Start with this column hidden (still listed in the Columns menu). */
  hidden?: boolean;
  /** Allow hiding via the Columns menu. Defaults to true (except structural columns). */
  hideable?: boolean;
  /** Include in CSV/Excel exports. Defaults to true (except structural columns). */
  exportable?: boolean;
  /** Marks the column as filterable on the server (`filter[field]=value`). */
  serverFilterable?: boolean;
  /** The key the API expects in `filter[<key>]` when it differs from the column id. */
  serverFilterField?: string;
  /** Allowed values for a server-filterable column (renders a picker, not free text). */
  filterOptions?: readonly string[];
}
export type NexGridColumnMeta = TableXColumnMeta;

/**
 * A TableX column definition.
 *
 * @typeParam TData   The row type.
 * @typeParam TRender The adapter's render output (ReactNode, string | Node, ...).
 */
export interface TableXColumn<TData, TRender = unknown> {
  /** Column id. Falls back to {@link TableXColumn.accessorKey}. */
  id?: string;
  /** The row property this column reads (TanStack-compatible alias for `id`). */
  accessorKey?: string;
  /** Header text, or a render function for custom headers. */
  header?: string | ((ctx: Record<string, never>) => TRender);
  /** Custom cell renderer. When omitted the raw row value is rendered as text. */
  cell?: (ctx: TableXCellContext<TData>) => TRender;
  /** Sorting is ON by default; structural columns opt out with `false`. */
  enableSorting?: boolean;
  /** Layout and behavior hints. */
  meta?: TableXColumnMeta;
}
export type NexGridColumn<TData, TRender = unknown> = TableXColumn<TData, TRender>;

/** Column ids treated as structural (never exported, hidden, or sorted by default). */
export const STRUCTURAL_COLUMN_IDS: readonly string[] = ["select", "actions"];

/** Resolve a column's id (`id` first, then `accessorKey`, else `""`). */
export function getColumnId<TData, TRender>(col: TableXColumn<TData, TRender>): string {
  return col.id ?? (col.accessorKey === undefined ? "" : String(col.accessorKey));
}

/** Is this a structural column (selection checkbox / row actions)? */
export function isStructuralColumn<TData, TRender>(col: TableXColumn<TData, TRender>): boolean {
  return STRUCTURAL_COLUMN_IDS.includes(getColumnId(col));
}

/**
 * Resolve a column's plain-text header title, for menus and export headers.
 * A function header has no string form, so the id is title-cased instead.
 */
export function getColumnTitle<TData, TRender>(col: TableXColumn<TData, TRender>): string {
  const header = col.header;
  if (typeof header === "string") return header;
  const id = getColumnId(col);
  return id ? id.charAt(0).toUpperCase() + id.slice(1) : "";
}

/** Read the raw value a column shows for a row (by id/accessorKey). */
export function getCellValue<TData, TRender>(
  col: TableXColumn<TData, TRender>,
  row: TData,
): unknown {
  const field = getColumnId(col);
  if (!field) return undefined;
  return (row as Record<string, unknown>)[field];
}

/**
 * Plain-text rendering of a cell value, used for default cells and exports:
 * nullish -> `""`, boolean -> yes/no labels, object -> JSON, else `String(v)`.
 */
export function getCellText(
  value: unknown,
  labels: { yes: string; no: string } = { yes: "Yes", no: "No" },
): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "boolean") return value ? labels.yes : labels.no;
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

/** Is this column sortable? (TanStack convention: on unless opted out.) */
export function isSortable<TData, TRender>(col: TableXColumn<TData, TRender>): boolean {
  return col.enableSorting !== false && getColumnId(col) !== "" && !isStructuralColumn(col);
}

/** Can this column be toggled in the Columns menu? */
export function isHideable<TData, TRender>(col: TableXColumn<TData, TRender>): boolean {
  if (isStructuralColumn(col) || getColumnId(col) === "") return false;
  return col.meta?.hideable !== false;
}

/** Should this column appear in exports? */
export function isExportable<TData, TRender>(col: TableXColumn<TData, TRender>): boolean {
  if (isStructuralColumn(col) || getColumnId(col) === "") return false;
  return col.meta?.exportable !== false;
}

/** Initial hidden-columns map derived from `meta.hidden`. */
export function initialHiddenColumns<TData, TRender>(
  columns: readonly TableXColumn<TData, TRender>[],
): Record<string, boolean> {
  const hidden: Record<string, boolean> = {};
  for (const col of columns) {
    const id = getColumnId(col);
    if (id && col.meta?.hidden) hidden[id] = true;
  }
  return hidden;
}

/** Filter a column set down to the currently visible ones. */
export function visibleColumns<TData, TRender>(
  columns: readonly TableXColumn<TData, TRender>[],
  hidden: Record<string, boolean>,
): TableXColumn<TData, TRender>[] {
  return columns.filter((col) => {
    const id = getColumnId(col);
    return !id || hidden[id] !== true;
  });
}
