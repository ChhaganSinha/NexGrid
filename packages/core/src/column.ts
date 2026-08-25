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
  /** Freeze / pin this column to the left or right of the table during horizontal scrolling. */
  pinned?: "left" | "right";
  /** Start with this column hidden (still listed in the Columns menu). */
  hidden?: boolean;
  /** Allow hiding via the Columns menu. Defaults to true (except structural columns). */
  hideable?: boolean;
  /** Include in CSV/Excel exports. Defaults to true (except structural columns). */
  exportable?: boolean;
  /** Marks the column as filterable (`filter[field]=value`). */
  filterable?: boolean;
  /** Explicit toggle for filtering on this column. */
  enableFiltering?: boolean;
  /** Marks the column as filterable on the server (`filter[field]=value`). */
  serverFilterable?: boolean;
  /** The key the API expects in `filter[<key>]` when it differs from the column id. */
  serverFilterField?: string;
  /** Filter input type: 'text' (default), 'select', 'number', 'number-range', 'date', 'date-range'. */
  filterType?: "text" | "select" | "number" | "number-range" | "date" | "date-range";
  /** Allowed values for a filterable column (renders a picker dropdown/list). */
  filterOptions?: readonly string[];
  /** Custom placeholder for the filter input. */
  filterPlaceholder?: string;
  /** Aggregation calculation to display in the summary footer row. */
  aggregation?: "sum" | "avg" | "count" | "min" | "max" | ((values: unknown[], rows: unknown[]) => string | number);
  /** Custom label prefix for aggregation in summary row (e.g. "Total", "Avg"). */
  aggregationLabel?: string;
  /** Enable double-click / inline cell editing on this column. */
  editable?: boolean;
  /** Editor type for inline cell editing. */
  editType?: "text" | "number" | "select";
  /** Options list for select editor. */
  editOptions?: readonly string[];
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
  /** Filtering can be enabled/disabled per column with boolean. */
  enableFiltering?: boolean;
  /** Alias for enableFiltering. */
  filterable?: boolean;
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

/** Is this column filterable? Defaults to true for all non-structural data columns unless explicitly disabled. */
export function isFilterable<TData, TRender>(
  col: TableXColumn<TData, TRender>,
  globalFilterable = true,
): boolean {
  if (isStructuralColumn(col) || getColumnId(col) === "") return false;
  if (col.enableFiltering === false || col.filterable === false) return false;
  if (col.meta?.filterable === false || col.meta?.enableFiltering === false) return false;
  if (col.enableFiltering === true || col.filterable === true) return true;
  if (col.meta?.serverFilterable === true || col.meta?.filterable === true || col.meta?.enableFiltering === true) {
    return true;
  }
  if (col.meta?.filterOptions && col.meta.filterOptions.length > 0) return true;
  return globalFilterable;
}

/** Check if column is pinned to left or right. */
export function isPinned<TData, TRender>(
  col: TableXColumn<TData, TRender>,
): "left" | "right" | false {
  return col.meta?.pinned || false;
}

/** Check if column has inline editing enabled. */
export function isEditable<TData, TRender>(
  col: TableXColumn<TData, TRender>,
): boolean {
  return col.meta?.editable === true;
}

/** Compute aggregation value for a column across a set of rows. */
export function computeAggregation<TData, TRender>(
  col: TableXColumn<TData, TRender>,
  rows: readonly TData[],
): string | number | null {
  const meta = col.meta;
  if (!meta?.aggregation || rows.length === 0) return null;

  const agg = meta.aggregation;
  const values = rows.map((row) => getCellValue(col, row));

  if (typeof agg === "function") {
    return agg(values, rows as unknown[]);
  }

  if (agg === "count") {
    return values.length;
  }

  const numericValues = values
    .map((v) => (typeof v === "number" ? v : Number.parseFloat(String(v ?? "").replace(/[^0-9.-]+/g, ""))))
    .filter((n) => Number.isFinite(n)) as number[];

  if (numericValues.length === 0) return null;

  if (agg === "sum") {
    const sum = numericValues.reduce((acc, n) => acc + n, 0);
    return Math.round(sum * 100) / 100;
  }

  if (agg === "avg") {
    const sum = numericValues.reduce((acc, n) => acc + n, 0);
    const avg = sum / numericValues.length;
    return Math.round(avg * 100) / 100;
  }

  if (agg === "min") {
    return Math.min(...numericValues);
  }

  if (agg === "max") {
    return Math.max(...numericValues);
  }

  return null;
}
