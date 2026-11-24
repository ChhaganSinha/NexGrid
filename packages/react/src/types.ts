// The public prop surface of `<TableX />`.
//
// It lives in its own module so consumers can import the prop type without
// pulling the component (and its `"use client"` boundary) into a server file,
// and so the contract can be read on its own — this file IS the API.

import type { ReactNode } from "react";
import type {
  ContextMenuItem,
  Density,
  EditMode,
  ExcelBadgeRule,
  ExportFormat,
  PagedResponse,
  RowEditEvent,
  RowOrderChangeEvent,
  SavedGridView,
  TableXColumn as TableXCoreColumn,
  TableXLocale,
  QueryState,
} from "@nexgrid/core";

/** A column definition bound to React's render type. */
export type TableXReactColumn<TData> = TableXCoreColumn<TData, ReactNode>;
export type TableXColumn<TData> = TableXReactColumn<TData>;
export type NexGridReactColumn<TData> = TableXReactColumn<TData>;
export type NexGridColumn<TData> = TableXColumn<TData>;

/** Severity of a {@link TableXNotice}. */
export type TableXNoticeType = "info" | "success" | "error";
export type NexGridNoticeType = TableXNoticeType;

/**
 * A message the grid wants surfaced to the user.
 *
 * The grid never renders toasts itself — a toast belongs to the host app's
 * design system, and two competing toast stacks in one page is a worse bug
 * than no toast at all. Everything it would want to say arrives here instead.
 */
export interface TableXNotice {
  type: TableXNoticeType;
  message: string;
}
export type NexGridNotice = TableXNotice;

/** Color scheme applied to the grid root. */
export type TableXTheme = "light" | "dark" | "auto";
export type NexGridTheme = TableXTheme;

/**
 * Props for {@link TableX}.
 *
 * `data` / `total` / `query` / `onQueryChange` are **controlled**: the grid
 * renders exactly the page it is handed and reports intent back through
 * `onQueryChange`. It never fetches on its own (the one exception is the
 * export-everything path, which needs rows the current page does not have).
 */
export interface TableXProps<TData> {
  /** Column definitions, in display order. */
  columns: TableXReactColumn<TData>[];
  /** The CURRENT page of rows (server mode) or the full in-memory dataset (client-side mode). */
  data: TData[];
  /** Total filtered row count from the server; drives the pager. In client-side mode, this is computed automatically. */
  total?: number;
  /** The query the `data` answers. In client-side mode, this is managed internally if omitted. */
  query?: QueryState;
  /** Called with the next query whenever the user changes page/sort/search/size. Optional in client-side mode. */
  onQueryChange?: (next: QueryState) => void;
  /**
   * Enable client-side pagination, sorting, search, and filtering over in-memory `data`.
   * When enabled (or when `paginationMode: "client"`), the grid manages page slicing,
   * total counts, search, and sorting internally. Default is auto (true when onQueryChange is omitted).
   */
  clientSidePagination?: boolean;
  /** Explicit pagination mode: `"server"` (default with onQueryChange), `"client"`, or `"infinite"`. */
  paginationMode?: "client" | "server" | "infinite";
  /**
   * Row fields the client-side global search looks at.
   *
   * Defaults to the currently VISIBLE, non-structural columns, so every match
   * is one the user can actually see. Pass an explicit list to search fields
   * the grid does not render (or to keep a field searchable while hidden).
   * Server mode ignores this — the server owns its own search.
   */
  searchableFields?: (keyof TData & string)[];
  /** Accessible name for the table. Also the default export file name and sheet title. */
  caption: string;

  /** Initial row density. Later changes to this prop are ignored — the user owns it from then on. Default `"default"`. */
  density?: Density;
  /** Replace the rows with a spinner while the host is fetching. */
  isLoading?: boolean;
  /** Replace the WHOLE grid with an error card. */
  error?: boolean;
  /** When provided, the error card offers a retry button. */
  onRetry?: () => void;

  /** Render selection checkboxes. Default `false`. */
  enableSelection?: boolean;
  /** Selection mode: `"multi"` (default) or `"single"`. */
  selectionMode?: "multi" | "single";
  /** Enable column-level filter menus on column headers. Default `true` (or per-column). */
  enableColumnFilters?: boolean;
  /** Show quick column actions (Sort Asc/Desc, Pin Left/Right/Unpin, Hide) inside the column `⋮` popover. Default `true`. */
  enableColumnMenu?: boolean;
  /** Enable dragging column borders to resize columns. Default `true`. */
  enableColumnResize?: boolean;
  /**
   * Called with every selected row id after each change.
   * `allAcrossSelected` is `true` when the user clicks "Select all matching records"
   * in the cross-page selection banner.
   */
  onSelectionChange?: (selectedIds: string[], allAcrossSelected: boolean) => void;

  /** Show the debounced global search box. Default `true`. */
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
  /** Show the export menu. Default `true`. */
  enableExport?: boolean;
  /** Alias for enableExport. */
  showExportButton?: boolean;
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
  renderExpandedRow?: (row: TData) => ReactNode;
  /** Enable floating bulk actions bar when rows are selected. Default `true`. */
  enableBulkActions?: boolean;
  /** Custom bulk actions renderer receiving selected IDs. */
  bulkActions?: (selectedIds: string[], deselectAll: () => void) => ReactNode;
  /** Enable summary / aggregation footer row. Default auto (true if any column defines meta.aggregation). */
  enableSummaryRow?: boolean;
  /** Enable drag-and-drop column header reordering. Default `false`. */
  enableColumnReorder?: boolean;
  /** Enable DOM row virtualization for smooth 60fps scrolling over 10,000+ rows. Default `false`. */
  enableVirtualization?: boolean;
  /** Scroll viewport max-height in pixels when `enableVirtualization` is `true`. Default `520`. */
  virtualHeight?: number;
  /** Extra buffer rows rendered above and below the virtual viewport. Default `6`. */
  virtualOverscan?: number;
  /** Enable horizontal (column) DOM virtualization for wide datasets (50-500+ columns). Default `false`. */
  enableColumnVirtualization?: boolean;
  /** Extra buffer columns rendered to the left and right of the visible horizontal window. Default `2`. */
  virtualColumnOverscan?: number;
  /** Dynamically distribute surplus container width across columns to eliminate blank right gutter space. Default `false`. */
  fitContainer?: boolean;
  /** Enable Undo / Redo history stack (Ctrl+Z / Ctrl+Y) for cell edits, row edits, fill handle, and paste. Default `true`. */
  enableHistory?: boolean;
  /** Group displayed rows by one or more column ids/fields (`"dept"` or `["region", "dept"]`). */
  groupBy?: string | readonly string[];
  /** Called when the active `groupBy` column(s) change via the column quick-action menu. */
  onGroupByChange?: (columnId: string | undefined, allGroupBy: string[]) => void;
  /** Enable spreadsheet arrow-key cell focus & Enter/F2/Space shortcuts. Default `true`. */
  enableKeyboardNavigation?: boolean;
  /** Enable right-click cell/row context menu. Default `true`. */
  enableContextMenu?: boolean;
  /** Custom context menu items appended when right-clicking a cell. */
  contextMenuItems?: (ctx: { row: TData; columnId: string; value: unknown }) => readonly ContextMenuItem[];
  /** Enable hierarchical tree data (`children` or `getSubRows`). Default `false`. */
  enableTreeData?: boolean;
  /** Property name holding child rows when `enableTreeData` is `true`. Default `"children"`. */
  childrenKey?: string;
  /** Custom child-row extractor enabling hierarchical tree rows. */
  getSubRows?: (row: TData) => readonly TData[] | undefined;
  /** Initial expanded tree depth (`0` = collapsed, `1` = root expanded, `-1` = expand all). Default `0`. */
  defaultExpandedDepth?: number;
  /** Asynchronously fetch child records for a tree node when expanded for the first time. */
  loadChildren?: (row: TData) => Promise<readonly TData[] | TData[]>;
  /** Custom predicate determining whether a tree node has expandable children (useful for async trees before fetch). */
  hasChildren?: (row: TData) => boolean;
  /** Rows frozen at the top of `<tbody>`. */
  pinnedTopRows?: readonly TData[];
  /** Rows frozen at the bottom of `<tbody>`. */
  pinnedBottomRows?: readonly TData[];
  /** Editing mode: `"cell"` (default) or `"row"` (full-row editing). */
  editMode?: EditMode;
  /** Called when a full-row edit (`editMode: "row"`) is saved. */
  onRowEdit?: (event: RowEditEvent<TData>) => void;
  /** Show the Saved Views / Filter Presets menu in the toolbar. Default `false`. */
  enableSavedViews?: boolean;
  /** Initial or controlled saved view presets. */
  savedViews?: readonly SavedGridView[];
  /** Called whenever saved views are added or deleted. */
  onSavedViewsChange?: (views: SavedGridView[]) => void;
  /** Enable drag-and-drop row reordering handle column. Default `false`. */
  enableRowReorder?: boolean;
  /** Called when rows are reordered via drag-and-drop. */
  onRowOrderChange?: (event: RowOrderChangeEvent<TData>) => void;
  /** Enable infinite-scroll / Load More pagination mode. Default `false`. */
  enableInfiniteScroll?: boolean;
  /** Whether additional server records exist in infinite-scroll mode. */
  hasMore?: boolean;
  /** Whether a next-page / cursor request is currently in flight. */
  isLoadingMore?: boolean;
  /** Optional opaque cursor passed back to `onLoadMore(nextCursor)`. */
  nextCursor?: string | null;
  /** Called when scrolling near the bottom (or clicking Load More) in infinite mode. */
  onLoadMore?: (cursor: string | null) => void;
  /** Enable Excel-style rectangular cell range selection, status-bar stats, fill handle, and TSV copy/paste. Default `false`. */
  enableRangeSelection?: boolean;
  /** Called when column order changes via drag-and-drop reordering. */
  onColumnOrderChange?: (newOrder: string[]) => void;
  /** Called when a cell's value is committed via inline cell editing. */
  onCellEdit?: (edit: { row: TData; columnId: string; oldValue: unknown; newValue: unknown }) => void;
  /** Unique key to persist and restore grid state (column widths, column order, hidden columns, density) in localStorage. */
  storageKey?: string;
  /** Show the active filter pills bar beneath the toolbar when filters or search are active. Default `true`. */
  showFilterPills?: boolean;
  /** Rendered at the end of the toolbar, after the export menu. */
  toolbarActions?: ReactNode;
  /** Clicking a row (or a card) invokes this. Adds a pointer cursor. */
  onRowClick?: (row: TData) => void;
  /** Stable identity for a row. Default: `String(row.id ?? row)`. */
  getRowId?: (row: TData) => string;
  /** Extra class(es) on the grid root. */
  className?: string;
  /** Show the automatic `S.No.` column. Default `true`. */
  showSerialNumber?: boolean;
  /** File name prefix, without extension. Default: the caption, lower-cased and underscored. */
  exportFileName?: string;
  /** Full in-memory dataset, enabling whole-dataset export across all pages. */
  allData?: readonly TData[];
  /** Function returning all matching rows for export without manual file generation. */
  fetchAllData?: (query: QueryState) => Promise<readonly TData[]> | readonly TData[];
  /** Paged fetch function to walk all pages for export without requiring a REST URL. */
  fetchPage?: (page: number, pageSize: number, query: QueryState) => Promise<PagedResponse<TData>>;
  /** Maximum rows collected during a full dataset export walk. Defaults to DEFAULT_ROW_CAP (2000). Pass 0 for uncapped. */
  maxExportRows?: number;
  /** Export button presentation: "menu" (default), "excel", "csv", "pdf", or "split". */
  exportMode?: "menu" | "split" | "excel" | "csv" | "pdf";
  /** Shortcut for direct 1-click export (defaults to "excel" when true). */
  quickExport?: boolean | ExportFormat;
  /**
   * Custom export handler.
   *
   * If this function returns an array of rows (or a Promise resolving to rows),
   * TableX will use those rows to produce the chosen format (Excel, CSV, Clipboard)
   * using its built-in styling, serial column, and badge rules.
   *
   * If it returns void/undefined, TableX assumes the host handled the export externally.
   */
  onExportAll?: (format: ExportFormat) => void | Promise<void> | Promise<readonly TData[]> | readonly TData[];
  /**
   * Endpoint used to fetch the full filtered dataset for export when the current
   * page is only part of it.
   */
  fetchEndpoint?: string;
  /** Extra fetch options (headers, etc.) forwarded when calling {@link fetchEndpoint}. */
  fetchOptions?: RequestInit;
  /** Value-based badge styling rules for Excel export. */
  badgeRules?: readonly ExcelBadgeRule[];

  /** Overrides for any user-facing string in the grid. */
  locale?: Partial<TableXLocale>;
  /** Visual theme. Default `"light"`. */
  theme?: TableXTheme;
  /** Receives notices (export progress, failures). Default: no-op. */
  onNotify?: (notice: TableXNotice) => void;
  /** Imperative handle ref for grid methods like undo/redo and column auto-fitting. */
  tableRef?: React.Ref<TableXHandle<TData>>;
}
export type NexGridProps<TData> = TableXProps<TData>;

/** Imperative handle exposed via `tableRef` on `<TableX />` and `<NexGrid />`. */
export interface TableXHandle<TData = unknown> {
  /** Undo the latest cell mutation or batch edit. Returns true if an action was undone. */
  undo(): boolean;
  /** Redo the latest reverted cell mutation or batch edit. Returns true if an action was redone. */
  redo(): boolean;
  /** True when mutations exist in the undo stack. */
  canUndo(): boolean;
  /** True when mutations exist in the redo stack. */
  canRedo(): boolean;
  /** Automatically resize all visible columns to fit their longest text content. */
  autoFitAllColumns(sampleRows?: number): void;
  /** Automatically resize a single column to fit its content. */
  autoFitColumn(id: string): void;
}
export type NexGridHandle<TData = unknown> = TableXHandle<TData>;
