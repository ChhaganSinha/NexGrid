// The public surface of @nexgrid/vanilla.
//
// These options mirror the React adapter's props one-for-one (adapter spec
// §4.3) with callbacks in place of props, so a team moving a grid between the
// two adapters is renaming things, not rethinking them. The one addition is
// `endpoint`: with no framework around it, a plain-DOM grid that cannot fetch
// its own data would need a hand-written data layer before it renders a single
// row, which is exactly the boilerplate `TableX.AspNetCore` exists to remove.

import type {
  Density,
  ExcelBadgeRule,
  TableXColumn,
  TableXLocale,
  QueryState,
  NexGridColumn,
  NexGridLocale,
} from "@nexgrid/core";

/**
 * What a vanilla `header` / `cell` renderer may return.
 *
 * A `string` is written with `textContent` and can never be interpreted as
 * markup. Returning a `Node` is the ONLY way to put elements into a cell, and
 * it is deliberate: the consumer built that node, so they own its contents.
 */
export type TableXNode = string | Node;
export type NexGridNode = TableXNode;

/** A column definition bound to the vanilla render type. */
export type TableXVanillaColumn<TData> = TableXColumn<TData, TableXNode>;
export type NexGridVanillaColumn<TData> = TableXVanillaColumn<TData>;

/** Severity of a grid notification. */
export type TableXNoticeType = "info" | "success" | "error";
export type NexGridNoticeType = TableXNoticeType;

/** A message the grid wants surfaced. The grid never renders toasts itself. */
export interface TableXNotice {
  type: TableXNoticeType;
  message: string;
}
export type NexGridNotice = TableXNotice;

/** Colour scheme applied to the grid root. */
export type TableXTheme = "light" | "dark" | "auto";
export type NexGridTheme = TableXTheme;

/** Configuration for {@link createTableX}. */
export interface TableXOptions<TData> {
  /** Column definitions, in display order. */
  columns: TableXVanillaColumn<TData>[];
  /** Accessible name for the table; also the default export file prefix. */
  caption: string;

  // ---- Controlled / Client-side mode --------------------------------------

  /** The CURRENT page of rows (in server mode) or the full in-memory dataset (in client-side mode). Default `[]`. */
  data?: TData[];
  /** Total filtered row count; drives pagination. Default `0`. */
  total?: number;
  /** Initial query state. Defaults to `defaultQuery()`. */
  query?: QueryState;
  /**
   * Enable client-side pagination, sorting, search, and filtering over in-memory `data`.
   * When enabled (or when `paginationMode: "client"`), the grid manages page slicing,
   * total counts, search, and sorting internally. Default is auto (true when no endpoint or onQueryChange).
   */
  clientSidePagination?: boolean;
  /** Explicit pagination mode: `"server"` (default with endpoint/onQueryChange) or `"client"`. */
  paginationMode?: "client" | "server";
  /**
   * Emitted whenever the user changes page, size, sort, search or a filter.
   *
   * In controlled server mode the grid does NOT move on its own: fetch the new page
   * and call `handle.update({ data, total, query })`. In client-side or endpoint mode the
   * grid has already applied the query and this is informational.
   */
  onQueryChange?: (next: QueryState) => void;

  // ---- Endpoint mode -------------------------------------------------------

  /**
   * Turns on endpoint mode: the grid fetches `buildQueryUrl(endpoint, query)`
   * itself, expects a `PagedResponse<TData>` JSON body, and manages its own
   * loading and error states.
   */
  endpoint?: string;
  /**
   * Extra `fetch` init for endpoint mode and for export's fetch-all pass
   * (headers, `credentials`, ...). `signal` is always supplied by the grid so
   * a superseded request can be aborted, and is ignored if set here.
   */
  fetchOptions?: RequestInit;

  // ---- Presentation --------------------------------------------------------

  /** Initial row density. Default `"default"`. */
  density?: Density;
  /** Show the loading state (controlled mode only). */
  isLoading?: boolean;
  /** Replace the whole grid with the error card (controlled mode only). */
  error?: boolean;
  /** Retry handler; rendering a retry button on the error card. */
  onRetry?: () => void;
  /** Extra class names appended to `.tbx-root`. */
  className?: string;
  /** Colour scheme. Default `"light"`. */
  theme?: TableXTheme;

  // ---- Features ------------------------------------------------------------

  /** Show the automatic `S.No.` column. Default `true`. */
  showSerialNumber?: boolean;
  /** Show the global search field. Default `true`. */
  enableSearch?: boolean;
  /** Overrides `locale.searchPlaceholder`. */
  searchPlaceholder?: string;
  /** Show the columns toggle dropdown menu button. Default `true`. */
  enableColumns?: boolean;
  /** Alias for enableColumns. */
  showColumnsButton?: boolean;
  /** Show the density dropdown menu button. Default `true`. */
  enableDensity?: boolean;
  /** Alias for enableDensity. */
  showDensityButton?: boolean;
  /** Show the export dropdown menu button. Default `true`. */
  enableExport?: boolean;
  /** Alias for enableExport. */
  showExportButton?: boolean;
  /** Show row selection checkboxes. Default `false`. */
  enableSelection?: boolean;
  /** Selection mode: `"multi"` (default) or `"single"`. */
  selectionMode?: "multi" | "single";
  /** Enable column-level filter menus on column headers. Default `true`. */
  enableColumnFilters?: boolean;
  /** Enable dragging column borders to resize columns. Default `true`. */
  enableColumnResize?: boolean;
  /** Enable sorting across all columns. Default `true`. */
  enableSorting?: boolean;
  /** Show the footer pagination controls. Default `true`. */
  enablePagination?: boolean;
  /** Alias for enablePagination. */
  showPagination?: boolean;
  /** Show the rows-per-page dropdown in the footer. Default `true`. */
  enableRowsPerPage?: boolean;
  /** Alias for enableRowsPerPage. */
  showRowsPerPage?: boolean;
  /** Show the jump to page input in the footer. Default `true`. */
  enableJumpToPage?: boolean;
  /** Alias for enableJumpToPage. */
  showJumpToPage?: boolean;
  /** Show the entire toolbar area. Default `true`. */
  showToolbar?: boolean;
  /** Show the entire footer area. Default `true`. */
  showFooter?: boolean;
  /** Custom renderer for expanded accordion sub-rows. */
  renderExpandedRow?: (row: TData) => TableXNode;
  /** Enable floating bulk actions bar when rows are selected. Default `true`. */
  enableBulkActions?: boolean;
  /** Custom bulk actions renderer receiving selected IDs. */
  bulkActions?: (selectedIds: string[], deselectAll: () => void) => TableXNode;
  /** Enable summary / aggregation footer row. Default auto (true if any column defines meta.aggregation). */
  enableSummaryRow?: boolean;
  /** Enable drag-and-drop column header reordering. Default `false`. */
  enableColumnReorder?: boolean;
  /** Called when column order changes via drag-and-drop reordering. */
  onColumnOrderChange?: (newOrder: string[]) => void;
  /** Called when a cell's value is committed via inline cell editing. */
  onCellEdit?: (edit: { row: TData; columnId: string; oldValue: unknown; newValue: unknown }) => void;
  /** Unique key to persist and restore grid state (column widths, column order, hidden columns, density) in localStorage. */
  storageKey?: string;
  /** Show the active filter pills bar beneath the toolbar when filters or search are active. Default `true`. */
  showFilterPills?: boolean;
  /**
   * Called with the running selection whenever it changes.
   * `allAcrossSelected` is always `false` today — the argument is reserved for
   * a future "select every matching row across all pages" affordance.
   */
  onSelectionChange?: (selectedIds: string[], allAcrossSelected: boolean) => void;
  /** Called when a row (or its mobile card) is clicked. Adds a pointer cursor. */
  onRowClick?: (row: TData) => void;
  /** Stable row identity. Defaults to `row.id`, falling back to `String(row)`. */
  getRowId?: (row: TData) => string;
  /** Rendered at the end of the toolbar. */
  toolbarActions?: Node | string;

  // ---- Export --------------------------------------------------------------

  /** File prefix; defaults to `filePrefixFromCaption(caption)`. */
  exportFileName?: string;
  /** Replaces the built-in export entirely when set. */
  onExportAll?: () => void | Promise<void>;
  /**
   * Endpoint used to collect the FULL filtered dataset for export when the
   * current page is only part of it. Defaults to {@link TableXOptions.endpoint}.
   */
  fetchEndpoint?: string;
  /** Value-based Excel badge styling. Defaults to `DEFAULT_BADGE_RULES`. */
  badgeRules?: readonly ExcelBadgeRule[];

  // ---- Localisation & messaging -------------------------------------------

  /** Overrides for any user-facing string. */
  locale?: Partial<TableXLocale>;
  /** Receives notices (export progress, failures). Default: no-op. */
  onNotify?: (notice: TableXNotice) => void;
}
export type NexGridOptions<TData> = TableXOptions<TData>;

/** The state {@link TableXHandle.update} can patch. */
export interface TableXUpdate<TData> {
  /** The current page of rows. */
  data: TData[];
  /** Total filtered row count. */
  total: number;
  /** Query state to display. In endpoint mode this triggers a refetch. */
  query: QueryState;
  /** Loading flag. */
  isLoading: boolean;
  /** Error flag; replaces the grid with the error card. */
  error: boolean;
}
export type NexGridUpdate<TData> = TableXUpdate<TData>;

/** The controller returned by {@link createTableX}. */
export interface TableXHandle<TData> {
  /** Patch grid state. Omitted keys are left untouched. */
  update(patch: Partial<TableXUpdate<TData>>): void;
  /** Endpoint mode: refetch the current query. Otherwise: re-render. */
  refresh(): void;
  /** The query currently displayed. */
  getQuery(): QueryState;
  /** Ids of the currently selected rows, in selection order. */
  getSelection(): string[];
  /** Set the dataset (updates in-memory data in client mode, or current page in server mode). */
  setData(data: TData[]): void;
  /** Tear down: detach the grid and remove every listener it registered. */
  destroy(): void;
}
export type NexGridHandle<TData> = TableXHandle<TData>;
